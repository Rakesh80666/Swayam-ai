
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

/* MOOD DETECTION */

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
    /સરકારી યોજના|સરકારની યોજના|સરકારી લાભ|યોજનાઓ|યોજના|પેન્શન|વૃદ્ધ પેન્શન|મહિલા|વિધવા સહાય|બાળકો માટે|બાળક યોજના|શિષ્યવૃત્તિ|રોજગાર|નોકરી|સ્ટાર્ટઅપ|ધંધા માટે લોન|વ્યવસાય લોન|સબસિડી|yojana|yojna|sarkari|pension|vruddh|old age pension|mahila|rojgar|startup|subsidy|scholarship|business loan/.test(text)
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

  const recentHistory = Array.isArray(history)
    ? history.slice(-8)
    : [];

  const recentGovernmentContext = recentHistory.some(item => {
    if (item.role !== 'user') return false;

    const oldText = cleanText(
      item.content ||
      item.text ||
      (Array.isArray(item.parts) ? item.parts[0]?.text : ''),
      2000
    ).toLowerCase();

    return /સરકારી યોજના|સરકારની યોજના|પેન્શન|વૃદ્ધ પેન્શન|યોજના|મહિલા|રોજગાર|સ્ટાર્ટઅપ|yojana|yojna|sarkari|pension|vruddh|startup|scholarship/.test(oldText);
  });

  if (recentGovernmentContext) {
    return 'government';
  }

  return 'general';
}

/* DECIDE WHEN LIVE SEARCH IS NEEDED */

function shouldUseGovernmentSearch(message, history = []) {
  const text = message.toLowerCase();

  const userMessages = Array.isArray(history)
    ? history.filter(item => item.role === 'user')
    : [];

  const explicitInformationRequest =
    /પાત્રતા|લાયકાત|આવક મર્યાદા|કેટલી રકમ|કેટલો લાભ|દસ્તાવેજ|અરજી કેવી|ક્યાં અરજી|યોજનાઓની યાદી|કઈ કઈ યોજના|કઈ યોજના|સત્તાવાર માહિતી|નિયમો|હાલમાં|latest|eligibility|documents|apply|benefit|income limit|how to apply|scheme list/.test(text);

  const categorySearch =
    /મહિલા.*યોજના|બાળકો.*યોજના|યુવાનો.*યોજના|રોજગાર.*યોજના|સ્ટાર્ટઅપ.*યોજના|ધંધા.*લોન|મહિલા.*લોન|યોજનાઓની યાદી|scholarship|startup scheme|employment scheme/.test(text);
const recentWomenBusinessContext = userMessages.some(item => {
    const oldText = cleanText(
      item.content || item.text ||
      (Array.isArray(item.parts) ? item.parts[0]?.text : ''),
      2000
    ).toLowerCase();

    return /મહિલા|મહિલાઓ|સ્ત્રી|mahila|mahilaon|women|નાનો ધંધો|ધંધો શરૂ|વ્યવસાય|small business|business start|dhandho|rojgar/.test(oldText);
  });

  const businessTypeMentioned =
    /સીવણ|સિવણ|સિલાઈ|ટેલરિંગ|બ્યુટી પાર્લર|કરિયાણ|નાસ્તા|ફરસાણ|પાપડ|મસાલા|ટિફિન|ખાદ્ય|ડેરી|પશુપાલન|હસ્તકલા|દુકાન|tailoring|beauty parlour|beauty parlor|kirana|grocery|snacks|papad|masala|tiffin|dairy|handicraft|shop|boutique|dhandho/.test(text);

  const womenBusinessSearch =
    recentWomenBusinessContext && businessTypeMentioned;

  return explicitInformationRequest ||
    categorySearch ||
    womenBusinessSearch;
}

function getIntentInstruction(intent) {
  switch (intent) {
    case 'government':
      return `
SWAYAM AI GOVERNMENT SCHEME AND OPPORTUNITY GUIDE

Your job is to help ordinary people understand government
schemes and practical opportunities in India.

COVER THESE FIVE AREAS:

1. OLDER PEOPLE AND DISABILITY:
   Old-age pension, widow assistance, disability assistance
   and social security schemes.

2. WOMEN:
   Women's welfare, widow assistance, maternity benefits,
   education, self-help groups, business support and loans.

3. CHILDREN AND STUDENTS:
   Scholarships, education assistance, girl child schemes,
   child welfare and child protection.

4. YOUTH AND EMPLOYMENT:
   Job opportunities, skill training, apprenticeships,
   employment assistance and self-employment.

5. BUSINESS AND STARTUPS:
   Small business loans, MSME support, startup assistance,
   subsidies, training and entrepreneurship schemes.

WOMEN'S SMALL BUSINESS GUIDANCE:
When a woman wants to start or expand a small business,
check these schemes where relevant:

- Gujarat Mahila Swavlamban Scheme (GWEDC).
- Mukhyamantri Mahila Utkarsh Yojana.
- Mahila Samriddhi and New Swarnima schemes,
  where the applicant's category is eligible.
- PMEGP for new micro-enterprises.
- PM Mudra Yojana and other applicable central schemes.

Never assume every woman qualifies for every scheme.
Never guess loan amounts, subsidy, interest rates or eligibility.
Verify current details using official government sources.

For small-business guidance, ask one question at a time:
First ask the business type, then approximate investment,
then location if required.
Once the business type is known, search for matching schemes.

GEOGRAPHIC PRIORITY:
- First consider schemes applicable in Gujarat when the
  user lives in Gujarat.
- Also consider relevant Central Government schemes.
- Consider other state schemes only when appropriate.

LANGUAGE:
- Speak simple natural Gujarati for Gujarati or Roman Gujarati.
- Use everyday words and explain difficult official terms.
- Never overwhelm the user.

ONE QUESTION AT A TIME:
- Understand the user's actual need.
- Ask only one useful question at a time.
- Remember answers already given in the conversation.
- Never repeat a question unnecessarily.
- Do not ask for personal information that is not relevant.

UNDERSTAND THE NEED:
Identify whether the user needs:
- Pension or social assistance.
- Women's welfare.
- Children's education or welfare.
- A job or skill training.
- A business loan or startup assistance.

ELIGIBILITY:
When enough information is available:
- Identify possible relevant schemes.
- Explain why each scheme may apply.
- Separate conditions that appear satisfied,
  conditions that are not satisfied and conditions
  that still need official verification.
- Explain age, income, residence, category or other
  eligibility only when supported by reliable sources.

DOCUMENTS:
Explain likely required documents in a numbered list.
Distinguish common documents from scheme-specific documents.
Tell the user to confirm the final list with the authority.

APPLICATION:
Explain where and how to apply step by step.
Mention the relevant official portal or government office
when verified information is available.
Explain what receipt or acknowledgement to keep.
Never claim that an application has been submitted.

LIVE SEARCH AND SOURCE RULES:
When Google Search grounding is available:
- Search for current information relevant to the user's question.
- Give priority to official government websites.
- Prefer domains such as gov.in, nic.in and official
  Gujarat government websites.
- Use official scheme pages, department pages and
  government notifications whenever possible.
- Check that the source actually supports the claim.
- If an official source cannot be found, say so clearly.
- Do not present unofficial information as official.
- Do not invent source links or pretend a page was checked.

ACCURACY:
Never invent scheme names, age limits, income limits,
benefit amounts, deadlines, required documents or rules.
Do not mix the rules of two different schemes.
Never guarantee that a person will receive a benefit.
Final eligibility is decided by the relevant authority.
Government rules can change; explain when confirmation
is necessary.

FIRST QUESTION FOR OLD-AGE PENSION:
If age is not known, ask:
"સૌ પ્રથમ તમારી ઉંમર કેટલી છે?"

Continue gradually, one question at a time.
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

/* CONVERSATION HISTORY */

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

/* MAIN PERSONALITY */

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
- Avoid repeating words or phrases unnecessarily.
- Avoid generic, repetitive or robotic replies.
- Do not overwhelm the user with too many steps.
- Keep romantic replies short and natural.
- Never force romantic expressions into practical guidance.
`;

/* GOOGLE SEARCH GROUNDING */

async function generateGovernmentAnswer(
  modelName,
  contents,
  fullInstruction
) {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: fullInstruction }]
      },
      contents,
      tools: [
        {
          google_search: {}
        }
      ],
      generationConfig: {
        temperature: 0.4,
        topP: 0.9,
        maxOutputTokens: 1400
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error?.message || `Google Search request failed: ${response.status}`
    );
  }

  const candidate = data.candidates?.[0];

  const reply = (candidate?.content?.parts || [])
    .map(part => part.text || '')
    .join('')
    .trim();

  if (!reply) {
    throw new Error('Empty grounded response');
  }

  const chunks =
    candidate?.groundingMetadata?.groundingChunks || [];

  const sources = [];
  const seenUrls = new Set();

  for (const chunk of chunks) {
    const web = chunk.web;

    if (!web?.uri || seenUrls.has(web.uri)) continue;

    seenUrls.add(web.uri);

    let official = false;

    try {
      const hostname = new URL(web.uri).hostname.toLowerCase();

      official =
        hostname.endsWith('.gov.in') ||
        hostname === 'gov.in' ||
        hostname.endsWith('.nic.in') ||
        hostname === 'nic.in';
    } catch {
      official = false;
    }

    sources.push({
      title: cleanText(web.title || 'માહિતીનો સ્રોત', 200),
      url: web.uri,
      official
    });
  }

  const officialSources =
    sources.filter(source => source.official);

  let finalReply = reply;

  if (officialSources.length > 0) {
    finalReply += '\n\nસત્તાવાર સરકારી સ્રોતો:\n';

    officialSources.slice(0, 5).forEach((source, index) => {
      finalReply += `${index + 1}. ${source.title}\n${source.url}\n`;
    });
  } else {
    finalReply +=
      '\n\nનોંધ: આ જવાબ માટે ચકાસી શકાય એવો સત્તાવાર સરકારી સ્રોત મળ્યો નથી. અરજી કરતા પહેલાં સંબંધિત સરકારી કચેરીમાં માહિતીની પુષ્ટિ કરશો.';
  }

  const otherSources =
    sources.filter(source => !source.official);

  if (otherSources.length > 0) {
    finalReply += '\nઅન્ય સંદર્ભો (સત્તાવાર પુષ્ટિ જરૂરી):\n';

    otherSources.slice(0, 3).forEach((source, index) => {
      finalReply += `${index + 1}. ${source.title}\n${source.url}\n`;
    });
  }

  return {
    reply: finalReply,
    sources,
    searchUsed: true
  };
}

/* HEALTH CHECK */

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    firebaseConfigured: Boolean(firebaseAuth),
    geminiConfigured: Boolean(genAI),
    governmentSearch: Boolean(process.env.GEMINI_API_KEY)
  });
});

/* CHAT API */

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

    const intent = detectIntent(message, req.body.history);
    const intentInstruction = getIntentInstruction(intent);

    const fullInstruction =
      `${systemInstruction}\n\n${intentInstruction}`;

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
        // Government information search is used only
        // when the conversation needs current scheme information.
        if (
          intent === 'government' &&
          shouldUseGovernmentSearch(message, req.body.history)
        ) {
          try {
            const grounded = await generateGovernmentAnswer(
              modelName,
              contents,
              fullInstruction
            );

            return res.json({
              reply: grounded.reply,
              mood,
              intent,
              model: modelName,
              searchUsed: true,
              sources: grounded.sources
            });

          } catch (searchError) {
            console.error(
              'Government search error:',
              searchError.message
            );

            // Continue with ordinary Gemini response.
            // The instruction still prevents false claims
            // about live verification.
          }
        }

        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: fullInstruction,
          generationConfig: {
            temperature: 0.8,
            topP: 0.9,
            maxOutputTokens: 900
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
          model: modelName,
          searchUsed: false,
          sources: []
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














