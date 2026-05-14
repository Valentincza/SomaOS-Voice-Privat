export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { notion_token, database_id, datum, einschlafzeit, aufwachzeit, schlaf_quality, regularity } = req.body;

  if (!notion_token || !database_id) return res.status(400).json({ error: 'Missing fields' });

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
    // Always link to the Settings page so scores calculate correctly
    Settings: { relation: [{ id: '30ddded5-5d21-80bb-9ac3-d1ee4f02c3c2' }] }
  };

  if (einschlafzeit) properties['Einschlafzeit'] = { date: { start: `${today}T${einschlafzeit}:00` } };
  if (aufwachzeit)   properties['Aufwachzeit']   = { date: { start: `${wakeDate}T${aufwachzeit}:00` } };
  if (schlaf_quality !== undefined) properties['Schlaf Quality'] = { number: Number(schlaf_quality) };
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
    if (!response.ok) return res.status(response.status).json({ error: data.message || 'Notion error' });
    return res.status(200).json({ ok: true });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
