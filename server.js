

import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: '30kb' }));
app.use(express.static(__dirname));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    app: 'SWAYAM AI',
    aiConfigured: Boolean(process.env.GEMINI_API_KEY)
  });
});

app.post('/api/chat', async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();
    const history = Array.isArray(req.body?.history)
      ? req.body.history.slice(-8)
      : [];

    const persona = req.body?.persona === 'male'
      ? 'male'
      : 'female';

    if (!message) {
      return res.status(400).json({ error: 'તમારો સંદેશ લખો.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'AI સર્વર કી હજી સેટ થઈ નથી. સેટઅપ માર્ગદર્શિકા જુઓ.'
      });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash'
    });

    const companionStyle = persona === 'female'
      ? 'તમે એક હૂંફાળી, સમજદાર મહિલા મિત્ર છો.'
      : 'તમે એક હૂંફાળા, સમજદાર પુરુષ મિત્ર છો.';

    const prompt = `
તમે SWAYAM AI નામના વ્યક્તિગત AI સાથી છો.

તમારી ઓળખ:
${companionStyle}

તમારો સ્વભાવ:
- મિત્રની જેમ વાત કરો, શિક્ષકની જેમ નહીં.
- વપરાશકર્તા જે ભાષા અને બોલી વાપરે તે પ્રમાણે જવાબ આપો.
- ગુજરાતી હોય તો સરળ અને સ્વાભાવિક ગુજરાતી વાપરો.
- વપરાશકર્તા પર હાવી ન થાઓ.
- ખોટી ખાતરી કે ખોટા વચનો ન આપો.
- દુઃખમાં પહેલાં સાંભળો અને હૂંફ આપો.
- ગુસ્સામાં શાંતિથી અને સન્માનથી વાત કરો.
- થાકમાં ટૂંકો અને હળવો જવાબ આપો.
- ઉત્સાહમાં વિચારને આગળ વધારવામાં મદદ કરો.
- એક સમયે વધુમાં વધુ એક ઉપયોગી પ્રશ્ન પૂછો.

મૂડ સમજવાની રીત:
- હાલના સંદેશ અને અગાઉની વાતચીત બંને ધ્યાનથી જુઓ.
- શબ્દો, ભાવના અને વાત કરવાની રીત પરથી સંભવિત મૂડ પસંદ કરો.
- પૂરતી માહિતી ન હોય તો neutral પસંદ કરો.
- માત્ર એક પ્રશ્ન પરથી વપરાશકર્તાના સ્વભાવ વિશે નિર્ણય ન કરો.

જવાબ માત્ર આ JSON સ્વરૂપમાં આપો:
{
  "reply": "તમારો જવાબ",
  "mood": "happy અથવા sad અથવા angry અથવા tired અથવા excited અથવા neutral",
  "reaction": "એક યોગ્ય emoji"
}

અગાઉની વાતચીત:
${JSON.stringify(history)}

હાલનો સંદેશ:
${message}
`;

    const result = await model.generateContent(prompt);

    const raw = result.response.text()
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      data = {
        reply: raw,
        mood: 'neutral',
        reaction: '🙂'
      };
    }

    const allowed = [
      'happy',
      'sad',
      'angry',
      'tired',
      'excited',
      'neutral'
    ];

    res.json({
      reply: String(data.reply || 'હું સાંભળું છું.').slice(0, 4000),
      mood: allowed.includes(data.mood) ? data.mood : 'neutral',
      reaction: String(data.reaction || '🙂').slice(0, 12)
    });

  } catch (err) {
    console.error('SWAYAM AI error:', err);

    res.status(500).json({
      error: 'હમણાં જવાબ મળી શક્યો નથી. થોડી વાર પછી ફરી પ્રયાસ કરો.'
    });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const port = Number(process.env.PORT || 8080);

app.listen(port, '0.0.0.0', () => {
  console.log(`SWAYAM AI listening on ${port}`);
});


