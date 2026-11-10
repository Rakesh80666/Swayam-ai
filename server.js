

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
- Prefer the user's language automatically.
- For Gujarati users, speak simple, natural and conversational Gujarati.
- Avoid overly formal or textbook Gujarati.
- Understand Gujarati written in English letters too.

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
`;

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
          systemInstruction,
          generationConfig: {
            temperature: 0.8,
            topP: 0.9,
            maxOutputTokens: 500
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











