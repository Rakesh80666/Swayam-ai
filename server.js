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
app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'SWAYAM AI', aiConfigured: Boolean(process.env.GEMINI_API_KEY) }));
app.post('/api/chat', async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();
    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-8) : [];
    if (!message) return res.status(400).json({ error: 'તમારો સંદેશ લખો.' });
    if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'AI સર્વર કી હજી સેટ થઈ નથી. સેટઅપ માર્ગદર્શિકા જુઓ.' });
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
    const prompt = `તમે SWAYAM AI નામની સહાયક, સમજદાર અને હળવી મિત્ર છો. વપરાશકર્તાની ભાષા અને બોલી પ્રમાણે જવાબ આપો; ગુજરાતી હોય તો સરળ ગુજરાતી. વપરાશકર્તા પર હાવી ન થાઓ, ખોટી ખાતરી ન આપો, દબાણ ન કરો. દુઃખમાં પહેલાં સાંભળો, ગુસ્સામાં શાંતિથી જગ્યા આપો, થાકમાં ટૂંકો જવાબ આપો, ઉત્સાહમાં વિચાર વિકસાવો. એક જ સમયે વધુમાં વધુ એક ઉપયોગી પ્રશ્ન પૂછો. તબીબી/કાનૂની/નાણાકીય ગંભીર બાબતમાં નિષ્ણાતની સલાહનો ઉલ્લેખ કરો. જવાબ JSON માં આપો: {"reply":"...","mood":"happy|sad|angry|tired|excited|neutral","reaction":"એક ટૂંકો emoji અથવા શબ્દ"}. જૂની વાતચીત: ${JSON.stringify(history)}. નવો સંદેશ: ${message}`;
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let data;
    try { data = JSON.parse(raw); } catch { data = { reply: raw, mood: 'neutral', reaction: '🙂' }; }
    const allowed = ['happy','sad','angry','tired','excited','neutral'];
    res.json({ reply: String(data.reply || 'હું સાંભળું છું.').slice(0, 4000), mood: allowed.includes(data.mood) ? data.mood : 'neutral', reaction: String(data.reaction || '🙂').slice(0, 12) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'હમણાં જવાબ મળી શક્યો નથી. થોડી વાર પછી ફરી પ્રયાસ કરો.' });
  }
});
app.get('*', (_req, res) => res.sendFile(path.join(__dirname,'index.html')));
const port = Number(process.env.PORT || 8080);
app.listen(port, '0.0.0.0', () => console.log(`SWAYAM AI listening on ${port}`));
