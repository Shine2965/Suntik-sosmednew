// juragan-services

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Support GET dan POST
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({
            status: false,
            msg: 'Method not allowed. Use GET or POST'
        });
    }

    try {
        // ===== AMBIL API KEY DARI ENV =====
        const apiKey = process.env.JURAGAN_API_KEY || '5a675b8b637f08969edd6322edc4dd2a';

        if (!apiKey) {
            console.error('❌ JURAGAN_API_KEY tidak ditemukan di environment');
            return res.status(500).json({
                status: false,
                msg: 'Konfigurasi API belum lengkap (JURAGAN_API_KEY missing)'
            });
        }

        // ===== FETCH BALANCE & SERVICES secara Paralel =====
        const [resBalance, resServices] = await Promise.all([
            fetch('https://djuragansosmed.com/api/v2', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ key: apiKey, action: 'balance' })
            }).catch(() => null),
            fetch('https://djuragansosmed.com/api/v2', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ key: apiKey, action: 'services' })
            }).catch(() => null)
        ]);

        // ===== PARSE BALANCE =====
        let userBalance = 0;
        if (resBalance && resBalance.ok) {
            const balanceData = await resBalance.json().catch(() => null);
            // Juragan Sosmed balance response: { balance: "100000" } atau { balance: 100000 }
            if (balanceData && balanceData.balance !== undefined) {
                userBalance = parseFloat(balanceData.balance) || 0;
            }
        }

        // ===== PARSE SERVICES =====
        if (!resServices || !resServices.ok) {
            const text = resServices ? await resServices.text().catch(() => '') : '';
            console.error('❌ Juragan Sosmed API HTTP error:', resServices?.status, text);
            return res.status(502).json({
                status: false,
                msg: 'Gagal menghubungi provider Juragan Sosmed'
            });
        }

        const data = await resServices.json();

        // ===== VALIDASI RESPONSE LAYANAN =====
        // Juragan Sosmed bisa return array langsung atau { data: [...] }
        let servicesList = null;
        if (Array.isArray(data)) {
            servicesList = data;
        } else if (data && Array.isArray(data.data)) {
            servicesList = data.data;
        } else if (data && Array.isArray(data.services)) {
            servicesList = data.services;
        }

        if (!servicesList) {
            console.error('❌ Juragan Sosmed response invalid:', data);
            return res.status(502).json({
                status: false,
                msg: 'Respon provider tidak valid'
            });
        }

        // ===== GROUP BY CATEGORY + MARKUP 25% (1.25) =====
        const grouped = {};
        const MARKUP = 1.15;

        for (const s of servicesList) {
            const category = (s.category || 'Lainnya').trim() || 'Lainnya';
            if (!grouped[category]) {
                grouped[category] = [];
            }

            const type = (s.type || 'default').toLowerCase();
            const name = (s.name || '').toLowerCase();
            const needsComment =
                type.includes('comment') ||
                type === 'custom_comment' ||
                type === 'comment_likes' ||
                type === 'comment_reply' ||
                name.includes('comment') ||
                name.includes('komentar') ||
                name.includes('custom');

            const rawPrice = Number(s.rate) || 0;
            const markedUpPrice = Math.round(rawPrice * MARKUP);

            // Juragan Sosmed pakai "id" atau "service" untuk ID layanan
            const serviceId = s.service || s.id || s.service_id;

            grouped[category].push({
                id: serviceId,
                name: s.name || `Service #${serviceId}`,
                pricePerFollower: markedUpPrice,
                rawRate: rawPrice, // Harga asli modal dari Juragan Sosmed
                diskon: null,
                min: Number(s.min) || 1,
                max: Number(s.max) || 1000000,
                average: '-',
                desc: '',
                comment: needsComment,
                type: s.type || 'default',
                refill: s.refill === true || s.refill === 1,
                rate: s.rate || 0
            });
        }

        // ===== URUTKAN KATEGORI & LAYANAN =====
        const sortedServices = {};
        Object.keys(grouped)
            .sort((a, b) => a.localeCompare(b, 'id'))
            .forEach((cat) => {
                sortedServices[cat] = grouped[cat].sort((a, b) =>
                    String(a.name).localeCompare(String(b.name), 'id')
                );
            });

        // ===== CACHE =====
        res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

        // Mengembalikan object berupa data layanan dan saldo backend saat ini
        return res.status(200).json({
            status: true,
            balance: userBalance,
            services: sortedServices
        });

    } catch (error) {
        console.error('❌ Error juragan-services:', error);
        return res.status(500).json({
            status: false,
            msg: 'Internal server error: ' + (error.message || '')
        });
    }
}
