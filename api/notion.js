export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = {};
  try {
    // Vercel sometimes needs manual parsing
    if (typeof req.body === 'object' && req.body !== null) {
      body = req.body;
    } else {
      const raw = await new Promise((resolve) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => resolve(data));
      });
      body = JSON.parse(raw);
    }
  } catch(e) {
    return res.status(400).json({ error: 'Body parse error: ' + e.message });
  }

  const { notion_token, database_id, datum, einschlafzeit, aufwachzeit, schlaf_quality, regularity } = body;

  console.log('parsed body:', JSON.stringify({ database_id, datum, einschlafzeit, aufwachzeit, schlaf_quality, regularity }));

  if (!notion_token || !database_id) return res.status(400).json({ error: 'Missing notion_token or database_id' });

  const today = datum || new Date().toISOString().split('T')[0];

  let wakeDate = today;
  if (einschlafzeit && aufwachzeit && aufwachzeit < einschlafzeit) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    wakeDate = d.toISOString().split('T')[0];
  }

  const properties = {
    Name: { title: [{ text: { content: today } }] },
    Datum: { date: { start: today } },
    Settings: { relation: [{ id: '30ddded55d2180bb9ac3d1ee4f02c3c2' }] },
    'Ernährungs-Settings': { relation: [{ id: '31ddded55d2181379359d2a2dc9a0e67' }] }
  };

  if (einschlafzeit) properties['Einschlafzeit'] = { date: { start: `${today}T${einschlafzeit}:00` } };
  if (aufwachzeit)   properties['Aufwachzeit']   = { date: { start: `${wakeDate}T${aufwachzeit}:00` } };
  if (schlaf_quality != null) properties['Schlaf Quality'] = { number: Number(schlaf_quality) };
  if (regularity)    properties['Regularity']   = { select: { name: regularity } };

  try {
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notion_token}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({ parent: { database_id }, properties })
    });

    const data = await response.json();
    console.log('notion response:', response.status, JSON.stringify(data).slice(0, 300));

    if (!response.ok) return res.status(response.status).json({ error: data.message || 'Notion error' });
    return res.status(200).json({ ok: true });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
