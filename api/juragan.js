// /api/juragan.js

export default async function handler(req, res) {
  // Izinkan request dari frontend (CORS Header)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request dari browser
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Hanya terima method POST
  if (req.method !== 'POST') {
    return res.status(405).json({ status: false, message: 'Method Not Allowed' });
  }

  try {
    const { action, service, link, quantity, comments } = req.body;

    // Ambil API Key dari Environment Variables Vercel
    const apiKey = process.env.JURAGAN_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ status: false, message: 'JURAGAN_API_KEY belum diatur di Vercel' });
    }

    // ===== SUSUN PAYLOAD UNTUK JURAGAN SOSMED =====
    // Juragan Sosmed format: JSON body { key, action, service, link, quantity, comments }
    const payload = {
      key: apiKey,
      action: action || 'add',
      service: service,
      link: link,
      quantity: quantity
    };

    // Comments opsional (dipisah \r\n sesuai dokumentasi Juragan Sosmed)
    if (comments) {
      payload.comments = String(comments)
        .trim()
        .split(/\r?\n/)
        .filter(l => l.trim())
        .join('\r\n');
    }

    // Request ke API Juragan Sosmed dari server Vercel (Bebas CORS)
    const response = await fetch('https://djuragansosmed.com/api/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
}
