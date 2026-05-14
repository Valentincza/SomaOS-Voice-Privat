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
  const modul = body.modul || 'schlaf'; // schlaf | fitness | ernaehrung | psyche

  let properties = {};

  // ─── SCHLAF ────────────────────────────────────────────────────────────────
  if (modul === 'schlaf') {
    const { datum, einschlafzeit, aufwachzeit, schlaf_quality, regularity, tz_offset } = body;

    properties = {
      Name: {
        title: [{ text: { content: datum } }]
      },
      Datum: {
        date: { start: datum }
      },
      Einschlafzeit: {
        date: { start: `${einschlafzeit}${tz_offset}` }
      },
      Aufwachzeit: {
        date: { start: `${aufwachzeit}${tz_offset}` }
      },
      'Schlaf Quality': {
        number: Number(schlaf_quality)
      },
      Regularity: {
        select: { name: regularity }
      },
      Settings: {
        relation: [{ id: '30ddded55d2180bb9ac3d1ee4f02c3c2' }]
      },
      'Ernährungs-Settings': {
        relation: [{ id: '31ddded55d2181379359d2a2dc9a0e67' }]
      }
    };
  }

  // ─── FITNESS ───────────────────────────────────────────────────────────────
  else if (modul === 'fitness') {
    const { datum, dauer, intensitaet, trainingstyp, trainingsqualitaet, muskelgruppen, notizen } = body;

    properties = {
      Name: {
        title: [{ text: { content: datum } }]
      },
      Datum: {
        date: { start: datum }
      },
      'Dauer (Min)': {
        number: Number(dauer)
      },
      'Intensität': {
        select: { name: intensitaet } // Leicht | Moderat | Intensiv | Max
      },
      Trainingstyp: {
        select: { name: trainingstyp } // Kraft | Cardio | Mobility | Sport | Geplanter Restday | Ungeplanter Restday | Sonstiges
      },
      Trainingsqualität: {
        number: Number(trainingsqualitaet)
      }
    };

    // Muskelgruppen als Multi-Select (Array von Strings)
    if (muskelgruppen && muskelgruppen.length > 0) {
      properties['(Muskelgruppen)'] = {
        multi_select: muskelgruppen.map(m => ({ name: m }))
      };
    }

    // Notizen als Text
    if (notizen) {
      properties['(Notizen)'] = {
        rich_text: [{ text: { content: notizen } }]
      };
    }
  }

  // ─── ERNÄHRUNG ─────────────────────────────────────────────────────────────
  else if (modul === 'ernaehrung') {
    const { datum, kalorien, protein, carbs, fett, wasser } = body;

    properties = {
      Name: {
        title: [{ text: { content: datum } }]
      },
      Datum: {
        date: { start: datum }
      },
      'Kalorien (kcal)': {
        number: Number(kalorien)
      },
      'Protein (g)': {
        number: Number(protein)
      },
      'Carbs (g)': {
        number: Number(carbs)
      },
      'Fett (g)': {
        number: Number(fett)
      },
      'Wasser (L)': {
        number: Number(wasser)
      },
      'Ernährungs-Settings': {
        relation: [{ id: '31ddded55d2181379359d2a2dc9a0e67' }]
      }
    };
  }

  // ─── PSYCHE / MINDFULNESS ──────────────────────────────────────────────────
  else if (modul === 'psyche') {
    const { datum, bildschirmzeit, energie, stimmung, stresslevel, journaling } = body;

    properties = {
      Name: {
        title: [{ text: { content: datum } }]
      },
      Datum: {
        date: { start: datum }
      },
      'Bildschirmzeit (h)': {
        number: Number(bildschirmzeit)
      },
      Energie: {
        number: Number(energie)
      },
      Stimmung: {
        number: Number(stimmung)
      },
      Stresslevel: {
        number: Number(stresslevel)
      },
      Journaling: {
        checkbox: journaling === true || journaling === 'true'
      }
    };
  }

  else {
    return res.status(400).json({ error: `Unbekanntes Modul: ${modul}` });
  }

  // ─── Notion API Call ───────────────────────────────────────────────────────
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
