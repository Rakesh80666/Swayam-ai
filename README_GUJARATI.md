# SWAYAM AI — પ્રારંભિક કાર્યરત પ્રોજેક્ટ

આ એક MVP source project છે. તેમાં મોબાઇલ-ફ્રેન્ડલી ચેટ UI, Firebase Email/Password અને Google login hooks, Firestore માં user પ્રમાણે chat history, browser microphone/speech, mood પ્રમાણે રંગ બદલાતી UI અને Gemini server endpoint છે.

## હજી શું બાકી છે?

આ ZIP તૈયાર source code છે; આ પોતે live website નથી. Firebase Web config ઉમેરવી, Firestore security rules સેટ કરવી, Gemini API key server પર secret તરીકે મૂકવી અને Cloud Run પર deploy કરવું જરૂરી છે. આ પગલાં કર્યા વગર login/AI chat સંપૂર્ણ રીતે કાર્યરત નહીં થાય.

## 1. Firebase Web config ઉમેરો

Firebase Console → Project settings → General → Your apps → SWAYAM AI → SDK setup and configuration માંથી web config લો. `public/firebase-config.js` માં નીચેના placeholders બદલો:
- `PASTE_FIREBASE_WEB_API_KEY`
- `PASTE_MESSAGING_SENDER_ID`
- `PASTE_FIREBASE_APP_ID`

આ Firebase web config છે. Gemini API key અહીં ક્યારેય ન મૂકશો.

## 2. Firestore security rules

Firebase Console → Firestore Database → Rules માં આ rules મૂકો અને Publish કરો:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/messages/{messageId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

આથી દરેક signed-in user માત્ર પોતાનાં messages વાંચી/લખી શકે છે. જૂના `users` document માટે આ MVP ને તેની જરૂર નથી.

## 3. Gemini key સર્વર પર

તમારા કમ્પ્યુટર પર આ પ્રોજેક્ટ folder માં `.env.example` ની નકલ `.env` નામે બનાવો અને `GEMINI_API_KEY` માં તમારી key મૂકો. `.env` ક્યારેય કોઈને મોકલશો નહીં અને GitHub પર upload કરશો નહીં.

## 4. Local test (કમ્પ્યુટર જરૂરી)

Node.js 20+ પછી:

```bash
npm install
npm start
```

બ્રાઉઝરમાં `http://localhost:8080` ખોલો.

## 5. Cloud Run deploy

Cloud Run deployment માટે Google Cloud project, billing account અને જરૂરી APIs/permissions સેટ કરવાની જરૂર પડી શકે છે. Free quota મર્યાદિત છે; ખર્ચ થઈ શકે છે. ખર્ચની સ્પષ્ટ મંજૂરી વગર billing ચાલુ ન કરશો. Deploy વખતે `GEMINI_API_KEY` ને Cloud Run Secret તરીકે ઉમેરો; environment variable માં plain text મૂકવાને બદલે Secret Manager વાપરો.

## નોંધ

- આ avatar એક animated illustration છે, સાચો વિડિયો/AI face-call નથી.
- mood detection Gemini ના જવાબ પર આધારિત છે; તે નિદાન નથી અને ખોટું હોઈ શકે છે.
- chat history Firestore માં સાચવાય છે. આ પ્રારંભિક વર્ઝનમાં delete-account/data-export workflow નથી.
- Google login માટે Firebase Authentication માં Google provider અલગથી enable કરવો પડશે; Email/Password પૂરતું છે.
- Production પહેલાં abuse protection, rate limits, privacy policy, account deletion અને Firestore indexes/security review ઉમેરવા જરૂરી છે.
