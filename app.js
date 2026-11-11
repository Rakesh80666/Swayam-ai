
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const $ = (id) => document.getElementById(id);

const email = $("email");
const password = $("password");
const authMsg = $("authMsg");
const authPanel = $("authPanel");
const chatPanel = $("chatPanel");
const messages = $("messages");
const messageInput = $("message");
const sendBtn = $("sendBtn");
const micBtn = $("micBtn");
const speakToggle = $("speakToggle");
const clearBtn = $("clearBtn");
const logoutBtn = $("logoutBtn");
const avatar = $("avatar");
const greeting = $("greeting");
const moodLine = $("moodLine");
const reaction = $("reaction");

const callMicBtn = $("callMicBtn");
const callSpeakBtn = $("callSpeakBtn");
const endCallBtn = $("endCallBtn");
const callStatus = $("callStatus");
const callTranscriptText = $("callTranscriptText");
const callAvatar = $("callAvatar");

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let chatHistory = [];
let busy = false;
let persona = "female";
let selectedLanguage = "auto";
let speakEnabled = true;
let callActive = false;
let recognition = null;
let recognitionAvailable = false;
const moods = {
  happy: ["#fff0c2", "😊", "આજે તમારો ઉત્સાહ સરસ છે!"],
  sad: ["#dce8f7", "🥺", "હું અહીં છું, તમારી વાત સાંભળું છું."],
  angry: ["#f7dada", "😌", "ચાલો, શાંતિથી વાત કરીએ."],
  tired: ["#e7e1f4", "😴", "થોડો આરામ પણ જરૂરી છે."],
  excited: ["#ffe2ca", "🤩", "વાહ! તમારો વિચાર આગળ વધારીએ."],
  neutral: ["#e5edf0", "🙂", "હું તમારી સાથે છું."]
};

function detectTextLanguage(text) {
  if (selectedLanguage !== "auto") return selectedLanguage;
  if (/[\u0A80-\u0AFF]/.test(text)) return "gu-IN";
  if (/[\u0900-\u097F]/.test(text)) return "hi-IN";
  return "auto";
}

function detectReplyLanguage(text) {
  if (/[\u0A80-\u0AFF]/.test(text)) return "gu-IN";
  if (/[\u0900-\u097F]/.test(text)) return "hi-IN";
  return "en-IN";
}

function addPersonaSelector() {
  if ($("personaSelect") || !chatPanel) return;

  const div = document.createElement("div");
  div.style.cssText = "padding:10px;text-align:center";

  div.innerHTML = `
    <label>સાથી:
      <select id="personaSelect">
        <option value="female">મહિલા મિત્ર</option>
        <option value="male">પુરુષ મિત્ર</option>
      </select>
    </label>
    <br><br>
    <label>ભાષા:
      <select id="languageSelect">
        <option value="auto">ઓટો ઓળખો</option>
        <option value="gu-IN">ગુજરાતી</option>
        <option value="hi-IN">હિન્દી</option>
        <option value="en-IN">અંગ્રેજી</option>
      </select>
    </label>
  `;

  chatPanel.prepend(div);

  const p = $("personaSelect");
  const l = $("languageSelect");

  try {
    persona = localStorage.getItem("swayamPersona") || "female";
    selectedLanguage = localStorage.getItem("swayamLanguage") || "auto";
  } catch {}

  p.value = persona;
  l.value = selectedLanguage;

  p.addEventListener("change", () => {
    persona = p.value;
    try { localStorage.setItem("swayamPersona", persona); } catch {}
    updateAvatar("neutral");
  });

  l.addEventListener("change", () => {
    selectedLanguage = l.value;
    try { localStorage.setItem("swayamLanguage", selectedLanguage); } catch {}
  });
}

function updateAvatar(mood = "neutral") {
  const data = moods[mood] || moods.neutral;

  document.body.dataset.mood = mood;
  document.documentElement.style.setProperty("--swayam-mood", data[0]);

  if (avatar) {
    if (persona === "female") {
      avatar.innerHTML = '<img src="./file_00000000debc82119f61e08c4f8d90f6.png" alt="SWAYAM AI">';
    } else {
      avatar.textContent = data[1];
    }
  }

  if (moodLine) moodLine.textContent = data[2];
  if (reaction) reaction.textContent = data[1];
}

function showMessage(text, who) {
  if (!messages) return;

  const bubble = document.createElement("div");
  bubble.className = who === "user" ? "user" : "bot";
  bubble.textContent = String(text)
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/`([^`]+)`/g, "$1");

  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
}

function chatCollection() {
  return collection(db, "users", currentUser.uid, "messages");
}

async function saveMessage(role, text) {
  if (!currentUser) return;

  try {
    await addDoc(chatCollection(), {
      role,
      text,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Save error:", error);
  }
}

async function loadMessages() {
  if (!currentUser || !messages) return;

  messages.innerHTML = "";
  chatHistory = [];

  try {
    const q = query(
      chatCollection(),
      orderBy("createdAt", "asc"),
      limit(100)
    );

    const snapshot = await getDocs(q);

    snapshot.forEach((doc) => {
      const data = doc.data();

      if (!data.role || !data.text) return;

      chatHistory.push({
        role: data.role === "assistant" ? "model" : data.role,
        text: data.text
      });

      showMessage(
        data.text,
        data.role === "user" ? "user" : "ai"
      );
    });
  } catch (error) {
    console.error("History error:", error);
  }
}

function getVoice(language) {
  if (!("speechSynthesis" in window)) return null;

  const voices = speechSynthesis.getVoices();
  const prefix = language.split("-")[0].toLowerCase();

  const matching = voices.filter((v) =>
    v.lang.toLowerCase().startsWith(prefix)
  );

  return matching[0] || null;
}

function setSpeaking(active) {
  avatar?.classList.toggle("speaking", active);
  callAvatar?.classList.toggle("speaking", active);
}

function speak(text) {
  if (!speakEnabled || !("speechSynthesis" in window)) return;

  speechSynthesis.cancel();

  const clean = String(text)
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/#{1,6}\s*/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .trim();

  const language = detectReplyLanguage(clean);
  const utterance = new SpeechSynthesisUtterance(clean);
  const voice = getVoice(language);

  utterance.lang = language;
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }

  utterance.rate = 0.9;

  utterance.onstart = () => setSpeaking(true);
  utterance.onend = () => {
    setSpeaking(false);
    if (callActive && callStatus) {
      callStatus.textContent = "હવે તમે ફરી બોલી શકો છો. 🎙️";
    }
  };
  utterance.onerror = () => setSpeaking(false);

  speechSynthesis.speak(utterance);
}

function toggleSpeak() {
  speakEnabled = !speakEnabled;

  if (speakToggle) {
    speakToggle.textContent = speakEnabled ? "🔊 અવાજ ચાલુ" : "🔇 અવાજ બંધ";
  }

  if (callSpeakBtn) {
    callSpeakBtn.textContent = speakEnabled ? "🔊" : "🔇";
  }

  if (!speakEnabled) {
    speechSynthesis?.cancel?.();
    setSpeaking(false);
  }
}

speakToggle?.addEventListener("click", toggleSpeak);
callSpeakBtn?.addEventListener("click", toggleSpeak);

function updateCallTranscript(userText, aiText = "") {
  if (!callTranscriptText) return;

  callTranscriptText.textContent =
    (userText ? "તમે: " + userText : "") +
    (aiText ? "\n\nSWAYAM AI: " + aiText : "");
}

async function sendMessage(textFromCall = null) {
  if (busy || !currentUser) return;

  const text = textFromCall || messageInput?.value.trim();
  if (!text) return;

  busy = true;
  if (sendBtn) sendBtn.disabled = true;
  if (messageInput) messageInput.value = "";

  showMessage(text, "user");
  chatHistory.push({ role: "user", text });
  await saveMessage("user", text);

  if (callActive) {
    updateCallTranscript(text);
    if (callStatus) callStatus.textContent = "તમારી વાત સમજી રહી છું...";
  }

  try {
    const token = await currentUser.getIdToken();

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        message: text,
        history: chatHistory.slice(0, -1).slice(-8),
        persona,
        language: detectTextLanguage(text)
      })
    });

    const raw = await response.text();
    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error("સર્વરનો જવાબ સમજાયો નથી.");
    }

    if (!response.ok) {
      throw new Error(data.error || "AI સર્વર સાથે સમસ્યા આવી.");
    }

    if (!data.reply) {
      throw new Error("AI તરફથી જવાબ મળ્યો નથી.");
    }

    const reply = data.reply;

    showMessage(reply, "ai");
    chatHistory.push({ role: "model", text: reply });
    await saveMessage("assistant", reply);

    updateAvatar(moods[data.mood] ? data.mood : "neutral");

    if (callActive) {
      updateCallTranscript(text, reply);
    }

    if (greeting) greeting.textContent = "SWAYAM AI તમારી સાથે છે.";

    speak(reply);

  } catch (error) {
    console.error("Chat error:", error);

    const errorText = "જવાબ મેળવવામાં સમસ્યા: " + error.message;
    showMessage(errorText, "ai");

    if (callStatus && callActive) {
      callStatus.textContent = errorText;
    }

  } finally {
    busy = false;
    if (sendBtn) sendBtn.disabled = false;
  }
}

sendBtn?.addEventListener("click", () => sendMessage());

messageInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

// માઇક્રોફોન ઓળખ
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognitionAvailable = true;

  recognition.onstart = () => {
    if (callStatus && callActive) {
      callStatus.textContent = "🎙️ હું સાંભળી રહી છું...";
    }
    if (callMicBtn) callMicBtn.textContent = "🔴";
  };

  recognition.onresult = (event) => {
    const spokenText = event.results[0][0].transcript.trim();

    if (!spokenText) return;

    if (callActive) {
      updateCallTranscript(spokenText);
      sendMessage(spokenText);
    } else if (messageInput) {
      messageInput.value = spokenText;
    }
  };

  recognition.onerror = (event) => {
    console.error("Microphone error:", event.error);

    if (callStatus && callActive) {
      callStatus.textContent =
        "માઇક્રોફોન સમસ્યા: " + event.error;
    }

    if (callMicBtn) callMicBtn.textContent = "🎙️";
  };

  recognition.onend = () => {
    if (callMicBtn) callMicBtn.textContent = "🎙️";

    if (callActive && callStatus && !busy) {
      callStatus.textContent = "ફરી બોલવા માઇક્રોફોન દબાવો.";
    }
  };
}

function startListening() {
  if (!recognitionAvailable || !recognition) {
    if (callStatus) {
      callStatus.textContent =
        "તમારા બ્રાઉઝરમાં Speech Recognition ઉપલબ્ધ નથી. Chromeમાં ખોલો.";
    }
    return;
  }

  if (!currentUser) {
    if (callStatus) callStatus.textContent = "પહેલાં લોગિન કરો.";
    return;
  }

  if (busy) {
    if (callStatus) callStatus.textContent = "AIનો જવાબ આવવા દો.";
    return;
  }

  recognition.lang =
    selectedLanguage === "auto"
      ? "gu-IN"
      : selectedLanguage;

  try {
    recognition.start();
  } catch (error) {
    console.error("Recognition start:", error);
  }
}

function startCall() {
  if (!currentUser) {
    if (callStatus) callStatus.textContent = "પહેલાં લોગિન કરો.";
    return;
  }

  callActive = true;

  if (callStatus) {
    callStatus.textContent =
      "કૉલ શરૂ થયો. માઇક્રોફોન દબાવીને બોલો. 💜";
  }

  if (callTranscriptText) {
    callTranscriptText.textContent = "તમારી વાતચીત અહીં દેખાશે.";
  }
}

function endCall() {
  callActive = false;

  if (recognition) {
    try { recognition.stop(); } catch {}
  }

  if ("speechSynthesis" in window) {
    speechSynthesis.cancel();
  }

  setSpeaking(false);

  if (callStatus) callStatus.textContent = "કૉલ બંધ થયો છે.";
  if (callMicBtn) callMicBtn.textContent = "🎙️";
}

callMicBtn?.addEventListener("click", () => {
  if (!callActive) startCall();
  startListening();
});

endCallBtn?.addEventListener("click", endCall);

// સામાન્ય ચેટ માઇક્રોફોન
micBtn?.addEventListener("click", () => {
  if (!recognitionAvailable || !recognition) {
    alert("તમારા બ્રાઉઝરમાં માઇક્રોફોન ઓળખ ઉપલબ્ધ નથી.");
    return;
  }

  if (!currentUser) return;

  recognition.lang =
    selectedLanguage === "auto" ? "gu-IN" : selectedLanguage;

  try {
    recognition.start();
  } catch (error) {
    console.error(error);
  }
});

// Login
$("loginBtn")?.addEventListener("click", async () => {
  try {
    await signInWithEmailAndPassword(
      auth,
      email.value.trim(),
      password.value
    );

    if (authMsg) authMsg.textContent = "";
  } catch (error) {
    if (authMsg) authMsg.textContent = "લૉગિન સમસ્યા: " + error.message;
  }
});

// Signup
$("signupBtn")?.addEventListener("click", async () => {
  try {
    await createUserWithEmailAndPassword(
      auth,
      email.value.trim(),
      password.value
    );

    if (authMsg) authMsg.textContent = "";
  } catch (error) {
    if (authMsg) authMsg.textContent = "એકાઉન્ટ સમસ્યા: " + error.message;
  }
});

// Google Login
$("googleBtn")?.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    if (authMsg) authMsg.textContent = "Google Login સમસ્યા: " + error.message;
  }
});

// Password reset
$("resetBtn")?.addEventListener("click", async () => {
  try {
    await sendPasswordResetEmail(auth, email.value.trim());
    if (authMsg) authMsg.textContent = "રીસેટ લિંક મોકલી છે.";
  } catch (error) {
    if (authMsg) authMsg.textContent = "ઇમેઇલ તપાસો: " + error.message;
  }
});

// Logout
logoutBtn?.addEventListener("click", async () => {
  endCall();
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
  }
});

// Chat history સાફ કરવી
clearBtn?.addEventListener("click", async () => {
  if (!currentUser) return;

  if (!confirm("જૂની વાતચીત કાઢી નાખવી છે?")) return;

  try {
    const snapshot = await getDocs(chatCollection());
    const batch = writeBatch(db);

    snapshot.forEach((doc) => batch.delete(doc.ref));

    await batch.commit();

    chatHistory = [];
    if (messages) messages.innerHTML = "";

  } catch (error) {
    console.error("Clear history error:", error);
    alert("વાતચીત સાફ થઈ શકી નથી.");
  }
});

// Login state
onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (authPanel) {
    authPanel.style.display = user ? "none" : "block";
  }

  if (chatPanel) {
    chatPanel.style.display = user ? "block" : "none";
  }

  if (user) {
    addPersonaSelector();
    await loadMessages();
    updateAvatar("neutral");

    if (greeting) {
      greeting.textContent = "નમસ્તે! હું તમારી SWAYAM AI મિત્ર છું.";
    }
  } else {
    chatHistory = [];
    endCall();
  }
});
