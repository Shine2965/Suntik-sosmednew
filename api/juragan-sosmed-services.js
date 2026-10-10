// juragan-sosmed-order
// Proxy endpoint untuk menempatkan order ke Djuragan Sosmed
// Hindari CORS + sembunyikan API key di client

export default async function handler(req, res) {
    // ===== CORS =====
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Hanya terima POST
    if (req.method !== 'POST') {
        return res.status(405).json({
            status: false,
            error: 'Method not allowed. Use POST'
        });
    }

    try {
        // ===== API KEY DARI ENV =====
        const apiKey = process.env.JURAGAN_API_KEY || '5a675b8b637f08969edd6322edc4dd2a';

        if (!apiKey) {
            console.error('❌ JURAGAN_API_KEY tidak ditemukan di environment');
            return res.status(500).json({
                status: false,
                error: 'Konfigurasi API belum lengkap (JURAGAN_API_KEY missing)'
            });
        }

        // ===== AMBIL BODY =====
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

        const {
            service,      // Service ID (wajib)
            link,         // Target link (wajib)
            quantity,     // Jumlah (wajib)
            comments,     // Komentar (opsional) - string dipisah \r\n
            runs,         // Drip-feed runs (opsional)
            interval      // Drip-feed interval menit (opsional)
        } = body;

        // ===== VALIDASI =====
        if (!service || !link || !quantity) {
            return res.status(400).json({
                status: false,
                error: 'Parameter wajib: service, link, quantity'
            });
        }

        const serviceId = parseInt(service);
        const qty = parseInt(quantity);

        if (isNaN(serviceId) || serviceId <= 0) {
            return res.status(400).json({
                status: false,
                error: 'Service ID tidak valid'
            });
        }

        if (isNaN(qty) || qty <= 0) {
            return res.status(400).json({
                status: false,
                error: 'Quantity tidak valid'
            });
        }

        if (typeof link !== 'string' || link.trim().length < 5) {
            return res.status(400).json({
                status: false,
                error: 'Link tidak valid'
            });
        }

        // ===== BUILD PAYLOAD SESUAI DOKUMENTASI JURAGAN =====
        const payload = {
            key: apiKey,
            action: 'add',
            service: serviceId,
            link: link.trim(),
            quantity: qty
        };

        // Comments (opsional)
        if (comments && typeof comments === 'string' && comments.trim() !== '') {
            payload.comments = comments
                .trim()
                .split(/\r?\n/)
                .filter(l => l.trim())
                .join('\r\n');
        }

        // Drip-feed (opsional)
        if (runs !== undefined && runs !== null && runs !== '') {
            const r = parseInt(runs);
            if (!isNaN(r) && r > 0) payload.runs = r;
        }
        if (interval !== undefined && interval !== null && interval !== '') {
            const i = parseInt(interval);
            if (!isNaN(i) && i > 0) payload.interval = i;
        }

        console.log('📦 Mengirim order ke Juragan Sosmed:', {
            service: payload.service,
            link: payload.link,
            quantity: payload.quantity,
            hasComments: !!payload.comments,
            runs: payload.runs || null,
            interval: payload.interval || null
        });

        // ===== KIRIM KE JURAGAN SOSMED =====
        const response = await fetch('https://djuragansosmed.com/api/v2', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json().catch(() => null);

        console.log('📦 Response Juragan:', result);

        // ===== HANDLE RESPONSE =====
        // Sukses: { "order": 23501 }
        if (result && result.order) {
            return res.status(200).json({
                status: true,
                order: result.order,
                message: 'Order berhasil dibuat'
            });
        }

        // Gagal: { "error": "..." } atau { "msg": "..." }
        const errorMsg =
            (result && (result.error || result.msg || result.message || result.error_message)) ||
            `Gagal membuat order (HTTP ${response.status})`;

        return res.status(400).json({
            status: false,
            error: errorMsg,
            raw: result || null
        });

    } catch (error) {
        console.error('❌ Error juragan-sosmed-order:', error);
        return res.status(500).json({
            status: false,
            error: 'Internal server error: ' + (error.message || '')
        });
    }
}
