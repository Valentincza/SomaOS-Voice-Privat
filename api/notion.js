export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const notion_token = req.headers['x-notion-token'];
  const database_id  = req.headers['x-database-id'];

  if (!notion_token || !database_id) {
    return res.status(400).json({ error: 'Missing headers' });
  }

  let body = {};
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(await new Promise(r => { let d=''; req.on('data',c=>d+=c); req.on('end',()=>r(d)); }));
  } catch(e) { return res.status(400).json({ error: 'Body parse error' }); }

  const { datum, einschlafzeit, aufwachzeit, schlaf_quality, regularity, tz_offset } = body;

  // tz_offset comes from client, e.g. "+02:00" or "-05:00"
  const tz = tz_offset || '+00:00';

  const today = datum || new Date().toISOString().split('T')[0];
  let wakeDate = today;
  if (einschlafzeit && aufwachzeit && aufwachzeit < einschlafzeit) {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    wakeDate = d.toISOString().split('T')[0];
  }

  const properties = {
    Name: { title: [{ text: { content: today } }] },
    Datum: { date: { start: today } },
    Settings: { relation: [{ id: '30ddded55d2180bb9ac3d1ee4f02c3c2' }] },
    'Ernährungs-Settings': { relation: [{ id: '31ddded55d2181379359d2a2dc9a0e67' }] }
  };

  if (einschlafzeit) properties['Einschlafzeit'] = { date: { start: `${today}T${einschlafzeit}:00${tz}` } };
  if (aufwachzeit)   properties['Aufwachzeit']   = { date: { start: `${wakeDate}T${aufwachzeit}:00${tz}` } };
  if (schlaf_quality != null) properties['Schlaf Quality'] = { number: Number(schlaf_quality) };
  if (regularity)    properties['Regularity']   = { select: { name: regularity } };

  try {
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${notion_token}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' },
      body: JSON.stringify({ parent: { database_id }, properties })
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.message || 'Notion error' });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
