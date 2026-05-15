export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-notion-token, x-database-id');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const notionToken = req.headers['x-notion-token'];
  const databaseId  = req.headers['x-database-id'];

  if (!notionToken || !databaseId) {
    return res.status(400).json({ error: 'Missing x-notion-token or x-database-id header' });
  }

  const body = req.body;
  const modul = body.modul || 'schlaf';

  let properties = {};

  // SCHLAF
  if (modul === 'schlaf') {
    const { datum, einschlafzeit, aufwachzeit, schlaf_quality, regularity, tz_offset } = body;

    // ISO 8601 Datetime bauen: "YYYY-MM-DDTHH:MM+02:00"
    // Einschlafzeit kann vor Mitternacht sein (= Vortag)
    const padTime = t => t ? t.split(':').map((p, i) => i === 0 ? p.padStart(2, '0') : p).join(':') : t;
    const einschlafH = parseInt((einschlafzeit || '0:00').split(':')[0]);
    const einschlafDatum = einschlafH >= 12 ? datum : datum; // immer datum, Nutzer trägt Aufwachtag ein
    const einschlafISO = `${einschlafDatum}T${padTime(einschlafzeit)}`;
    const aufwachISO   = `${datum}T${padTime(aufwachzeit)}`;

    properties = {
      Name: { title: [{ text: { content: datum } }] },
      Datum: { date: { start: datum } },
      Einschlafzeit: { date: { start: `${einschlafISO}${tz_offset}` } },
      Aufwachzeit: { date: { start: `${aufwachISO}${tz_offset}` } },
      'Schlaf Quality': { number: Number(schlaf_quality) },
      Regularity: { select: { name: regularity } },
      Settings: { relation: [{ id: '30ddded55d2180bb9ac3d1ee4f02c3c2' }] },
      'Ernährungs-Settings': { relation: [{ id: '31ddded55d2181379359d2a2dc9a0e67' }] }
    };
  }

  // FITNESS
  else if (modul === 'fitness') {
    const { datum, dauer, intensitaet, trainingstyp, trainingsqualitaet, muskelgruppen, notizen } = body;
    properties = {
      Name: { title: [{ text: { content: datum } }] },
      Datum: { date: { start: datum } },
      'Dauer (Min)': { number: Number(dauer) },
      'Intensität': { select: { name: intensitaet } },
      Trainingstyp: { select: { name: trainingstyp } },
      Trainingsqualität: { number: Number(trainingsqualitaet) }
    };
    if (muskelgruppen && muskelgruppen.length > 0) {
      properties['(Muskelgruppen)'] = { multi_select: muskelgruppen.map(m => ({ name: m })) };
    }
    if (notizen) {
      properties['(Notizen)'] = { rich_text: [{ text: { content: notizen } }] };
    }
  }

  // ERNAEHRUNG
  else if (modul === 'ernaehrung') {
    const { datum, kalorien, protein, carbs, fett, wasser } = body;
    properties = {
      Name: { title: [{ text: { content: datum } }] },
      Datum: { date: { start: datum } },
      'Kalorien (kcal)': { number: Number(kalorien) },
      'Protein (g)': { number: Number(protein) },
      'Carbs (g)': { number: Number(carbs) },
      'Fett (g)': { number: Number(fett) },
      'Wasser (L)': { number: Number(wasser) },
      'Ernährungs-Settings': { relation: [{ id: '31ddded55d2181379359d2a2dc9a0e67' }] }
    };
  }

  // PSYCHE
  else if (modul === 'psyche') {
    const { datum, bildschirmzeit, energie, stimmung, stresslevel, journaling } = body;
    properties = {
      Name: { title: [{ text: { content: datum } }] },
      Datum: { date: { start: datum } },
      'Bildschirmzeit (h)': { number: Number(bildschirmzeit) },
      Energie: { number: Number(energie) },
      Stimmung: { number: Number(stimmung) },
      Stresslevel: { number: Number(stresslevel) },
      Journaling: { checkbox: journaling === true || journaling === 'true' }
    };
  }

  else {
    return res.status(400).json({ error: `Unbekanntes Modul: ${modul}` });
  }

  // Heutiger Eintrag: bei Fitness/Ernaehrung/Psyche den Tages-Eintrag aus der
  // Schlaf-DB (BackendRechner) suchen und als Relation verlinken
  if (['fitness', 'ernaehrung', 'psyche'].includes(modul)) {
    const datum = body.datum;
    const schlafDbId = '30cdded55d2180538fe7c6dd0ab0428b';
    try {
      const queryRes = await fetch(`https://api.notion.com/v1/databases/${schlafDbId}/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${notionToken}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        },
        body: JSON.stringify({
          sorts: [{ timestamp: 'created_time', direction: 'descending' }],
          page_size: 1
        })
      });
      const queryData = await queryRes.json();
      if (queryRes.ok && queryData.results && queryData.results.length > 0) {
        properties['Heutiger Eintrag'] = {
          relation: [{ id: queryData.results[0].id }]
        };
      }
    } catch (e) {
      console.warn('Heutiger Eintrag lookup fehlgeschlagen:', e.message);
    }
  }

  // Notion Seite erstellen
  try {
    const notionRes = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties
      })
    });

    const data = await notionRes.json();

    if (!notionRes.ok) {
      console.error('Notion Error:', data);
      return res.status(notionRes.status).json({ error: data.message || 'Notion API Fehler', details: data });
    }

    return res.status(200).json({ success: true, id: data.id });
  } catch (err) {
    console.error('Server Error:', err);
    return res.status(500).json({ error: 'Interner Server-Fehler', details: err.message });
  }
}
