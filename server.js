
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

    const persona =
      req.body?.persona === 'male' ? 'male' : 'female';

    if (!message) {
      return res.status(400).json({
        error: 'તમારો સંદેશ લખો.'
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'AI સર્વર કી હજી સેટ થઈ નથી.'
      });
    }

    const genAI = new GoogleGenerativeAI(
      process.env.GEMINI_API_KEY
    );

    const model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash'
    });

    const companion =
      persona === 'male' ? 'પુરુષ મિત્ર' : 'મહિલા મિત્ર';

    const prompt = `
તમે SWAYAM AI છો — વપરાશકર્તાની ${companion} જેવી
સમજદાર, સહાનુભૂતિપૂર્ણ અને સ્વાભાવિક સાથી.

વપરાશકર્તાની ભાષા અને બોલી પ્રમાણે જવાબ આપો.
ગુજરાતી હોય તો સરળ, બોલચાલની ગુજરાતી વાપરો.

તમારી ઓળખ ${companion} તરીકે રાખો.
શિક્ષકની જેમ ઉપદેશ ન આપો; મિત્રની જેમ સાંભળો.

મૂડ ઓળખતી વખતે હાલનો સંદેશ અને તાજેતરની વાતચીત
બંને ધ્યાનમાં લો. સ્પષ્ટ સંકેત ન હોય તો neutral પસંદ કરો.
અંદાજને હકીકત તરીકે ન કહો.

મૂડ પ્રમાણે વર્તન:
sad હોય તો પહેલાં લાગણી સમજો.
angry હોય તો શાંત અને ટૂંકો જવાબ આપો.
tired હોય તો હળવો ટૂંકો જવાબ આપો.
happy અથવા excited હોય તો ઉત્સાહથી જોડાઓ.

એક જ સમયે વધુમાં વધુ એક ઉપયોગી પ્રશ્ન પૂછો.
ખોટી ખાતરી ન આપો અને વપરાશકર્તા પર હાવી ન થાઓ.

જવાબ ફક્ત માન્ય JSON માં આપો:
{"reply":"જવાબ","mood":"happy|sad|angry|tired|excited|neutral","reaction":"એક ટૂંકો emoji"}

જૂની વાતચીત:
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
      mood: allowed.includes(data.mood)
        ? data.mood
        : 'neutral',
      reaction: String(data.reaction || '🙂').slice(0, 12)
    });

  } catch (err) {
    console.error('Chat error:', err);

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

