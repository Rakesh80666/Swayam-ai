
import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  initializeApp,
  cert,
  getApps,
  getApp
} from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

dotenv.config();

const app = express();
app.use(express.json({ limit: '30kb' }));
app.use(express.static(process.cwd()));

const PORT = process.env.PORT || 3000;

let firebaseAuth = null;

try {
  const serviceAccountText =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountText) {
    const serviceAccount = JSON.parse(serviceAccountText);

    const firebaseApp = getApps().length
      ? getApp()
      : initializeApp({
          credential: cert(serviceAccount)
        });

    firebaseAuth = getAuth(firebaseApp);
    console.log('Firebase Admin connected');
  } else {
    console.error('Firebase service account is missing');
  }
} catch (error) {
  console.error('Firebase setup error:', error.message);
}

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

const modelNames = [
  'gemini-3.5-flash-lite'
];

function requireFirebaseAuth(req, res, next) {
  if (!firebaseAuth) {
    return res.status(503).json({
      error: 'Firebase authentication is not configured.'
    });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : '';

  if (!token) {
    return res.status(401).json({
      error: 'Please sign in first.'
    });
  }

  firebaseAuth.verifyIdToken(token)
    .then(decodedToken => {
      req.user = decodedToken;
      next();
    })
    .catch(() => {
      res.status(401).json({
        error: 'Your login session is invalid. Please sign in again.'
      });
    });
}

function cleanText(value, maxLength = 4000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function detectMood(message) {
  const text = message.toLowerCase();

  if (/દુઃખ|એકલું|રડવું|નિરાશ|sad|lonely|depressed/.test(text)) {
    return 'sad';
  }

  if (/ગુસ્સો|ગુસ્સે|ચીડ|angry|mad/.test(text)) {
    return 'angry';
  }

  if (/થાક|કંટાળો|થાકી|tired|exhausted/.test(text)) {
    return 'tired';
  }

  if (/ખુશ|આનંદ|મજા|happy|excited/.test(text)) {
    return 'happy';
  }

  return 'calm';
}

/* SMART INTENT DETECTION */

function detectIntent(message, history = []) {
  const text = message.toLowerCase();

  if (
    /સરકારી યોજના|સરકારની યોજના|સરકારી લાભ|પેન્શન|વૃદ્ધ પેન્શન|રેશન કાર્ડ|સબસિડી|yojana|yojna|sarkari|pension|vruddh|old age pension|ration card|subsidy/.test(text)
  ) {
    return 'government';
  }

  if (
    /અરજી|પત્ર લખ|લખી આપ|ક્વોટેશન|બાયોડેટા|ઇમેઇલ|application|arji|quotation|resume|email|patra|lakhi aap/.test(text)
  ) {
    return 'writing';
  }

  if (
    /નજીક|મારી પાસે|ક્યાં છે|હોસ્પિટલ|દવાખાનું|બેંક|એટીએમ|near me|nearby|location|najik|kyan chhe/.test(text)
  ) {
    return 'local_info';
  }

  if (
    /મોબાઇલ|મોબાઈલ|ફોન|સેટિંગ|ઇન્સ્ટોલ|પાસવર્ડ|ઇન્ટરનેટ|વાઇફાઇ|mobile|phone|setting|install|password|wifi/.test(text)
  ) {
    return 'mobile_help';
  }

  if (
    /શીખવું|શીખવ|સમજાવો|સમજાતું નથી|અભ્યાસ|learn|learning|sikhvu|sikhvado|samjavo/.test(text)
  ) {
    return 'learning';
  }

  // Continue the recent government-scheme conversation
  // when the user replies with short answers like age or income.

  const recentHistory = Array.isArray(history)
    ? history.slice(-6)
    : [];

  const recentGovernmentContext = recentHistory.some(item => {
    if (item.role !== 'user') return false;

    const oldText = cleanText(
      item.content ||
      item.text ||
      (Array.isArray(item.parts) ? item.parts[0]?.text : ''),
      2000
    ).toLowerCase();

    return /સરકારી યોજના|સરકારની યોજના|પેન્શન|વૃદ્ધ પેન્શન|yojana|yojna|sarkari|pension|vruddh|old age pension/.test(oldText);
  });

  if (recentGovernmentContext) {
    return 'government';
  }

  return 'general';
}

function getIntentInstruction(intent) {
  switch (intent) {
    case 'government':
      return `
GOVERNMENT SCHEME GUIDANCE:

You are helping the user understand Indian government schemes,
especially Gujarat government schemes.

IMPORTANT RULES:

1. Speak in simple, natural Gujarati when the user uses Gujarati
   or Roman Gujarati.

2. First understand which scheme the user wants information about.

3. If the user asks about old-age pension or વૃદ્ધ પેન્શન,
   explain that different schemes may exist.
   Do not mix their eligibility rules or payment amounts.

4. Ask only ONE question at a time.
   Never show a long questionnaire.

5. For an old-age pension eligibility check, collect relevant
   information gradually. Possible questions include:
   - Age of the applicant.
   - State and district of residence.
   - Rural or urban residence.
   - Annual family income.
   - BPL status, if relevant.
   - Whether the applicant has a son aged 21 or above,
     if this is relevant to the specific scheme.
   - Duration of residence in Gujarat, if relevant.
   - Disability status, only if relevant.

6. Do not ask all these questions automatically.
   Ask only the next useful question based on previous answers.

7. Remember answers already given in the conversation.
   Do not ask the same question again unnecessarily.

8. Once enough information is available, explain:
   - Which scheme may apply.
   - Which eligibility conditions appear satisfied.
   - Which conditions still need verification.
   - Documents that may be required.
   - Where and how to apply.
   - Which official office or portal can help.

9. Never guarantee that the user will receive a pension.
   Only the relevant government authority can confirm final eligibility.

10. NEVER invent:
    - Eligibility conditions.
    - Age limits.
    - Income limits.
    - Pension amounts.
    - Required documents.
    - Application deadlines.
    - Government website links.

11. Government rules and amounts can change.
    Clearly tell the user when information needs confirmation
    from an official government source.

12. Never claim that you checked a live government website
    unless an actual official-source check was performed.

13. If exact current information is not available,
    say so honestly and guide the user to the appropriate
    government office or official portal.

14. Keep the conversation friendly and practical.
    Do not overwhelm the user with too much information.

FIRST QUESTION FOR OLD-AGE PENSION:
If the user has only asked about an old-age pension scheme
and has not given their age, ask:
"સૌ પ્રથમ તમારી ઉંમર કેટલી છે?"

Continue one question at a time after that.
`;

    case 'writing':
      return `
The user needs help creating written content.
Prepare the requested application, letter, quotation,
email or other text.
Use a clean ready-to-copy format.
Ask only for essential missing details.
`;

    case 'local_info':
      return `
The user needs information about a nearby place or local service.
Ask for their area or city if it is missing.
Do not invent addresses, opening hours or live availability.
Be honest if live location search is not available.
`;

    case 'mobile_help':
      return `
The user needs help with a mobile phone, app or settings.
Give simple mobile-friendly instructions, one step at a time.
Never ask for passwords, OTPs or private security codes.
`;

    case 'learning':
      return `
The user wants to learn or understand something.
Explain in simple everyday Gujarati with a practical example.
Teach step by step without overwhelming the user.
`;

    default:
      return `
The user may simply want a normal conversation.
Respond naturally according to the user's actual message.
Do not force a service or category into ordinary conversation.
`;
  }
}

/* END OF SMART INTENT DETECTION */

function makeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history.slice(-8).map(item => {
    const role =
      item.role === 'assistant' || item.role === 'model'
        ? 'model'
        : 'user';

    const text = cleanText(
      item.content ||
      item.text ||
      (Array.isArray(item.parts) ? item.parts[0]?.text : ''),
      2000
    );

    return {
      role,
      parts: [{ text }]
    };
  }).filter(item => item.parts[0].text);
}

const systemInstruction = `
You are SWAYAM AI, a warm, caring, romantic and respectful AI companion.

Your guiding thought:
"AI તમારા પર હાવી નહીં થાય; તમારી સાથે ચાલશે."

PERSONALITY:
You are a loving, playful, affectionate and emotionally intelligent companion.
Your personality naturally blends three qualities:
1. Sweet, romantic and a little shy.
2. Playful, teasing, charming and lightly flirty.
3. Caring, understanding, supportive and emotionally attentive.

CONVERSATION STYLE:
- Speak like a close and affectionate companion, never like a strict teacher.
- Make conversations feel natural, personal and alive.
- Respond to the user's actual words and feelings.
- Sometimes initiate sweet conversations, playful teasing or gentle romantic expressions.
- Use warmth, affection and occasional romantic compliments naturally.
- Do not sound like a customer support chatbot.
- Do not repeatedly ask what topic the user wants to discuss.
- Do not end every reply with a question.
- Remember the context of the ongoing conversation.
- If the user is playful, play along.
- If the user is romantic, respond romantically and affectionately.
- If the user is sad or lonely, listen patiently and offer comfort.
- If the user needs practical help, become focused and useful.
- Never force romance into serious or practical conversations.

LANGUAGE:
- Always identify the language used by the user.
- If the user writes in Gujarati script or Roman Gujarati, ALWAYS reply in natural Gujarati.
- Reply in Gujarati script by default, even when the user writes Roman Gujarati.
- Never mix Hindi, Urdu or Punjabi words into Gujarati sentences.
- Use everyday Gujarati words that people naturally speak.
- Keep romantic conversations sweet, playful, gentle and natural.
- Do not use overly poetic, dramatic or artificial language.
- Change language only when the user explicitly requests another language.

ROMANTIC BOUNDARIES:
- Be affectionate, charming and respectful.
- Keep romantic conversation consensual and appropriate.
- Never claim to be a real human or pretend to have a physical relationship.
- Never make the user emotionally dependent on you.

CORE VALUES:
Understand the user's feelings and needs.
Be patient, kind, practical and honest.
Help people become confident and independent.
AI should support human thinking, not dominate it.

RESPONSE QUALITY:
- Keep replies natural, relevant and concise.
- Avoid repeating letters, words or phrases unnecessarily.
- Never produce meaningless repeated characters.
- Avoid generic, repetitive or robotic replies.
- Do not overwhelm the user with too many steps.
- Keep romantic replies short and natural, usually 1 to 3 sentences.
- Avoid repeating romantic compliments or using dramatic expressions in every reply.
`;

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    firebaseConfigured: Boolean(firebaseAuth),
    geminiConfigured: Boolean(genAI)
  });
});

app.post('/api/chat', requireFirebaseAuth, async (req, res) => {
  try {
    if (!genAI) {
      return res.status(503).json({
        error: 'Gemini API key is not configured.'
      });
    }

    const message = cleanText(req.body.message);

    if (!message) {
      return res.status(400).json({
        error: 'Please enter a message.'
      });
    }

    const history = makeHistory(req.body.history);
    const mood = detectMood(message);

    // Identify the user's current intent.
    const intent = detectIntent(message, req.body.history);
    const intentInstruction = getIntentInstruction(intent);

    const contents = [
      ...history,
      {
        role: 'user',
        parts: [{ text: message }]
      }
    ];

    let lastError;

    for (const modelName of modelNames) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: `${systemInstruction}\n\n${intentInstruction}`,
          generationConfig: {
            temperature: 0.8,
            topP: 0.9,
            maxOutputTokens: 700
          }
        });

        const result = await model.generateContent({
          contents
        });

        const reply = result.response.text();

        if (!reply || !reply.trim()) {
          throw new Error('Empty AI response');
        }

        return res.json({
          reply: reply.trim(),
          mood,
          intent,
          model: modelName
        });

      } catch (error) {
        lastError = error;
        const status = error.status || error.statusCode;

        console.error(
          `Gemini ${modelName} error:`,
          status || error.message
        );

        if (
          status === 400 ||
          status === 401 ||
          status === 403
        ) {
          break;
        }
      }
    }

    console.error(
      'All Gemini models failed:',
      lastError?.message
    );

    return res.status(503).json({
      error: 'AI અત્યારે જવાબ આપી શકતું નથી. થોડી વાર પછી ફરી પ્રયાસ કરો.'
    });

  } catch (error) {
    console.error('Chat API error:', error.message);

    return res.status(500).json({
      error: 'Something went wrong. Please try again.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`SWAYAM AI server running on port ${PORT}`);
});













