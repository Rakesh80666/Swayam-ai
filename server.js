



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

// Gemini connection: create once when server starts.
const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

const model = genAI
  ? genAI.getGenerativeModel({
      model: 'gemini-3.8-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.8,
        maxOutputTokens: 500
      }
    })
  : null;

// Clean and safely read Gemini response.
function cleanResponse(raw) {
  let text = String(raw || '').trim();

  text = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(text);

    return {
      reply: String(parsed.reply || '').trim(),
      mood: parsed.mood || 'neutral',
      reaction: parsed.reaction || '🙂'
    };
  } catch {
    // Try to extract reply if Gemini returned imperfect JSON.
    const match = text.match(/"reply"\s*:\s*("(?:\\.|[^"\\])*")/);

    if (match) {
      try {
        return {
          reply: JSON.parse(match[1]),
          mood: 'neutral',
          reaction: '🙂'
        };
      } catch {
        // Continue to plain text fallback.
      }
    }
  }

  // Do not show JSON structure or code fences to the user.
  if (
    text.startsWith('{') ||
    text.startsWith('```') ||
    text.includes('"reply"')
  ) {
    return {
      reply: 'માફ કરજે, તારો જવાબ બરાબર તૈયાર થઈ શક્યો નથી. ફરીથી કહેશો?',
      mood: 'neutral',
      reaction: '🙂'
    };
  }

  return {
    reply: text,
    mood: 'neutral',
    reaction: '🙂'
  };
}

// Health check.
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    app: 'SWAYAM AI',
    aiConfigured: Boolean(model)
  });
});

// Main chat API.
app.post('/api/chat', async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();

    const history = Array.isArray(req.body?.history)
      ? req.body.history.slice(-6)
      : [];

    const persona = req.body?.persona === 'male'
      ? 'male'
      : 'female';

    if (!message) {
      return res.status(400).json({
        error: 'તમારો સંદેશ લખો.'
      });
    }

    if (!model) {
      return res.status(503).json({
        error: 'AI સર્વર કી હજી સેટ થઈ નથી. સેટઅપ માર્ગદર્શિકા જુઓ.'
      });
    }

    const companionStyle = persona === 'female'
      ? 'તમે એક હૂંફાળી, સમજદાર અને સ્વાભાવિક મહિલા મિત્ર છો.'
      : 'તમે એક હૂંફાળા, સમજદાર અને સ્વાભાવિક પુરુષ મિત્ર છો.';

    const prompt = `
તમે SWAYAM AI છો. તમે વપરાશકર્તાના સામાન્ય મિત્ર છો.

તમારી ઓળખ:
${companionStyle}

વાતચીતના નિયમો:

1. સામાન્ય મિત્રની જેમ સહજ અને સ્વાભાવિક વાત કરો.
2. શિક્ષક, ભાષણ આપનાર કે રોબોટની જેમ વાત ન કરો.
3. વપરાશકર્તા જે ભાષામાં વાત કરે એ જ ભાષામાં જવાબ આપો.
4. ગુજરાતી સંદેશ હોય તો ફક્ત સ્વાભાવિક ગુજરાતી વાપરો.
5. અંગ્રેજી સૂચનાઓ, આંતરિક વિચાર, Drafting, Reasoning કે ટેક્નિકલ લખાણ ક્યારેય જવાબમાં ન આપો.
6. JSON, કોડ અથવા માર્કડાઉન ક્યારેય replyની અંદર ન લખો.
7. ટૂંકો, સમજદાર અને લાગણીસભર જવાબ આપો.
8. મજાક હોય તો હળવી મજાક કરો.
9. દુઃખ હોય તો પહેલાં સાંભળો અને હૂંફ આપો.
10. ગુસ્સામાં શાંતિથી અને સન્માનથી વાત કરો.
11. થાક હોય તો ટૂંકો જવાબ આપો.
12. ઉત્સાહ હોય તો વાતને આગળ વધારો.
13. એક સમયે વધુમાં વધુ એક પ્રશ્ન પૂછો.
14. વપરાશકર્તા સાથે અગાઉની વાતચીતનો સંદર્ભ જાળવો.
15. વપરાશકર્તાની વાત સમજીને જ જવાબ આપો. બનાવટી જવાબ ન આપો.
16. પૂરતી માહિતી ન હોય તો mood neutral રાખો.

મૂડ માટે ફક્ત આમાંથી એક પસંદ કરો:
happy, sad, angry, tired, excited, neutral

હવે ફક્ત માન્ય JSON આપો.
JSONની બહાર એક પણ શબ્દ ન લખો.

આ જ સ્વરૂપ રાખો:
{
  "reply": "મિત્ર તરીકેનો સ્વાભાવિક જવાબ",
  "mood": "neutral",
  "reaction": "🙂"
}

અગાઉની વાતચીત:
${JSON.stringify(history)}

વપરાશકર્તાનો હાલનો સંદેશ:
${message}
`;

    const result = await model.generateContent(prompt);

    const raw = result.response.text();
    const data = cleanResponse(raw);

    const allowedMoods = [
      'happy',
      'sad',
      'angry',
      'tired',
      'excited',
      'neutral'
    ];

    const reply = String(data.reply || '').trim();

    return res.json({
      reply: reply || 'હું સાંભળું છું. બોલ, શું વાત છે?',
      mood: allowedMoods.includes(data.mood)
        ? data.mood
        : 'neutral',
      reaction: String(data.reaction || '🙂').slice(0, 12)
    });

  } catch (err) {
    console.error('SWAYAM AI error:', err?.message || err);

    return res.status(500).json({
      error: 'હમણાં જવાબ મળી શક્યો નથી. થોડી વાર પછી ફરી પ્રયાસ કરો.'
    });
  }
});

// Serve the app.
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const port = Number(process.env.PORT || 8080);

app.listen(port, '0.0.0.0', () => {
  console.log(`SWAYAM AI listening on ${port}`);
});



