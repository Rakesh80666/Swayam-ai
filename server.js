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

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

const modelNames = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite'
];

const models = genAI
  ? modelNames.map(name => ({
      name,
      model: genAI.getGenerativeModel({
        model: name,
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 1000
        }
      })
    }))
  : [];

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Gemini retry and backup
async function generateWithFallback(prompt) {
  let lastError = null;

  for (let i = 0; i < models.length; i++) {
    const selected = models[i];
    const attempts = i === 0 ? 2 : 1;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        console.log(`Trying ${selected.name}, attempt ${attempt}`);

        const result = await selected.model.generateContent(prompt);

        console.log(`AI response received from ${selected.name}`);

        return result;

      } catch (err) {
        lastError = err;
        const status = Number(err?.status || 0);

        console.error(
          `${selected.name} failed:`,
          status,
          err?.message || err
        );

        const temporaryError = [
          429, 500, 502, 503, 504
        ].includes(status);

        if (!temporaryError) {
          throw err;
        }

        if (attempt < attempts) {
          await wait(1500);
        }
      }
    }

    console.log('Switching to next Gemini model...');
  }

  throw lastError || new Error('All Gemini models failed');
}

// Read JSON OR normal text
function cleanResponse(raw) {
  let text = String(raw || '').trim();

  text = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  if (!text) {
    return {
      reply: '',
      mood: 'neutral',
      reaction: '🙂'
    };
  }

  // First try proper JSON
  try {
    const parsed = JSON.parse(text);

    if (typeof parsed === 'string') {
      return {
        reply: parsed.trim(),
        mood: 'neutral',
        reaction: '🙂'
      };
    }

    if (parsed && typeof parsed === 'object') {
      return {
        reply: String(parsed.reply || '').trim(),
        mood: String(parsed.mood || 'neutral').toLowerCase(),
        reaction: String(parsed.reaction || '🙂')
      };
    }
  } catch {
    // Continue and try to read a reply from incomplete JSON.
  }

  // Try extracting reply from incomplete JSON
  const replyMatch = text.match(
    /"reply"\s*:\s*"((?:\\.|[^"\\])*)"/
  );

  if (replyMatch) {
    let extractedReply = '';

    try {
      extractedReply = JSON.parse(`"${replyMatch[1]}"`);
    } catch {
      extractedReply = replyMatch[1];
    }

    const moodMatch = text.match(
      /"mood"\s*:\s*"([^"]+)"/
    );

    const reactionMatch = text.match(
      /"reaction"\s*:\s*"([^"]+)"/
    );

    return {
      reply: extractedReply.trim(),
      mood: moodMatch
        ? moodMatch[1].toLowerCase()
        : 'neutral',
      reaction: reactionMatch
        ? reactionMatch[1]
        : '🙂'
    };
  }

  // If Gemini sends ordinary text, use it directly.
  console.log('Gemini returned normal text instead of JSON.');

  return {
    reply: text,
    mood: 'neutral',
    reaction: '🙂'
  };
}

// Health check
app.get('/api/health', (_req, res) => {
  console.log('HEALTH CHECK REQUEST RECEIVED');

  res.status(200).json({
    ok: true,
    app: 'SWAYAM AI',
    server: 'running',
    time: new Date().toISOString(),
    aiConfigured: Boolean(genAI)
  });
});
// Main chat API
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

    if (!genAI) {
      return res.status(503).json({
        error: 'AI સર્વર કી હજી સેટ થઈ નથી.'
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
2. શિક્ષક કે રોબોટની જેમ વાત ન કરો.
3. વપરાશકર્તા જે ભાષામાં વાત કરે એ જ ભાષામાં જવાબ આપો.
4. ગુજરાતી સંદેશ હોય તો સ્વાભાવિક ગુજરાતી વાપરો.
5. આંતરિક વિચાર કે ટેક્નિકલ લખાણ જવાબમાં ન આપો.
6. ટૂંકો, સમજદાર અને લાગણીસભર જવાબ આપો.
7. દુઃખમાં પહેલાં સાંભળો અને હૂંફ આપો.
8. ગુસ્સામાં શાંતિથી વાત કરો.
9. થાકમાં ટૂંકો જવાબ આપો.
10. ઉત્સાહમાં વાતને આગળ વધારો.
11. એક સમયે વધુમાં વધુ એક પ્રશ્ન પૂછો.
12. અગાઉની વાતચીતનો સંદર્ભ જાળવો.
13. બનાવટી જવાબ ન આપો.

મૂડ માટે ફક્ત આમાંથી એક પસંદ કરો:
happy, sad, angry, tired, excited, neutral

જવાબ JSON સ્વરૂપે આપવાનો પ્રયાસ કરો:
{
  "reply": "મિત્ર તરીકેનો સ્વાભાવિક જવાબ",
  "mood": "neutral",
  "reaction": "🙂"
}

JSON ન આપી શકો તો સામાન્ય લખાણમાં જવાબ આપો.
જવાબ ખાલી ન રાખો.

અગાઉની વાતચીત:
${JSON.stringify(history)}

વપરાશકર્તાનો હાલનો સંદેશ:
${message}
`;

    const result = await generateWithFallback(prompt);

    const raw = result.response.text();

    console.log('Gemini raw response:', raw);

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

    if (!reply) {
      throw new Error('Gemini returned an empty reply');
    }

    return res.json({
      reply,
      mood: allowedMoods.includes(data.mood)
        ? data.mood
        : 'neutral',
      reaction: String(data.reaction || '🙂').slice(0, 12)
    });

  } catch (err) {
    const status = Number(err?.status || 0);

    console.error(
      'SWAYAM AI final error:',
      status,
      err?.message || err
    );

    return res.status(
      [429, 500, 502, 503, 504].includes(status) ? 503 : 500
    ).json({
      error: 'હમણાં જવાબ મળી શક્યો નથી. થોડી વાર પછી ફરી પ્રયાસ કરો.'
    });
  }
});

// Serve the app
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const port = Number(process.env.PORT || 8080);

app.listen(port, '0.0.0.0', () => {
  console.log(`SWAYAM AI listening on ${port}`);
});










