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

const status = $("status");
const email = $("email");
const password = $("password");
const loginBtn = $("loginBtn");
const signupBtn = $("signupBtn");
const googleBtn = $("googleBtn");
const resetBtn = $("resetBtn");
const authMsg = $("authMsg");

const chatPanel = $("chatPanel");
const logoutBtn = $("logoutBtn");
const messages = $("messages");
const messageInput = $("message");
const sendBtn = $("sendBtn");
const micBtn = $("micBtn");
const speakToggle = $("speakToggle");
const clearBtn = $("clearBtn");

const avatar = $("avatar");
const greeting = $("greeting");
const moodLine = $("moodLine");
const reaction = $("reaction");

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

if (status) status.textContent = "SWAYAM AI તૈયાર છે.";

let currentUser = null;
let chatHistory = [];
let busy = false;
let persona = "female";
let speakEnabled = true;
let selectedLanguage = "auto";

const moods = {
  happy: {
    color: "#fff0c2",
    emoji: "😊",
    text: "આજે તમારો ઉત્સાહ સરસ છે!"
  },
  sad: {
    color: "#dce8f7",
    emoji: "🥺",
    text: "હું અહીં છું, તમારી વાત સાંભળું છું."
  },
  angry: {
    color: "#f7dada",
    emoji: "😌",
    text: "ચાલો, શાંતિથી વાત કરીએ."
  },
  tired: {
    color: "#e7e1f4",
    emoji: "😴",
    text: "થોડો આરામ પણ જરૂરી છે."
  },
  excited: {
    color: "#ffe2ca",
    emoji: "🤩",
    text: "વાહ! તમારો વિચાર આગળ વધારીએ."
  },
  neutral: {
    color: "#e5edf0",
    emoji: "🙂",
    text: "હું તમારી સાથે છું."
  }
};

function detectTextLanguage(text) {
  if (selectedLanguage !== "auto") {
    return selectedLanguage;
  }

  if (/[\u0A80-\u0AFF]/.test(text)) {
    return "gu-IN";
  }

  if (/[\u0900-\u097F]/.test(text)) {
    return "hi-IN";
  }

  return "auto";
}

function detectReplyLanguage(text) {
  if (/[\u0A80-\u0AFF]/.test(text)) {
    return "gu-IN";
  }

  if (/[\u0900-\u097F]/.test(text)) {
    return "hi-IN";
  }

  return "en-IN";
}

function addPersonaSelector() {
  if ($("personaSelect")) return;

  const selector = document.createElement("div");

  selector.style.cssText =
    "padding:10px;text-align:center;color:inherit;";

  selector.innerHTML = `
    <div style="margin-bottom:10px;">
      <label for="personaSelect">તમારી સાથી પસંદ કરો: </label>
      <select id="personaSelect">
        <option value="female">મહિલા મિત્ર</option>
        <option value="male">પુરુષ મિત્ર</option>
      </select>
    </div>

    <div>
      <label for="languageSelect">ભાષા પસંદ કરો: </label>
      <select id="languageSelect">
        <option value="auto">ઓટો ઓળખો</option>
        <option value="gu-IN">ગુજરાતી</option>
        <option value="hi-IN">હિન્દી</option>
      </select>
    </div>

    <p id="languageInfo" style="font-size:12px;margin:6px 0;">
      લખાણની ભાષા ઓળખવાનો પ્રયાસ થશે.
    </p>
  `;

  chatPanel?.prepend(selector);

  const personaSelect = $("personaSelect");
  const languageSelect = $("languageSelect");

  try {
    persona = localStorage.getItem("swayamPersona") || "female";
    selectedLanguage =
      localStorage.getItem("swayamLanguage") || "auto";
  } catch {
    persona = "female";
    selectedLanguage = "auto";
  }

  if (personaSelect) {
    personaSelect.value = persona;

    personaSelect.addEventListener("change", () => {
      persona = personaSelect.value;

      try {
        localStorage.setItem("swayamPersona", persona);
      } catch (error) {
        console.log("Preference could not be saved.");
      }

      updateAvatar("neutral");

      if ("speechSynthesis" in window) {
        speechSynthesis.cancel();
      }
    });
  }

  if (languageSelect) {
    languageSelect.value = selectedLanguage;

    languageSelect.addEventListener("change", () => {
      selectedLanguage = languageSelect.value;

      try {
        localStorage.setItem("swayamLanguage", selectedLanguage);
      } catch (error) {
        console.log("Language preference could not be saved.");
      }

      const info = $("languageInfo");

      if (info) {
        info.textContent =
          selectedLanguage === "auto"
            ? "લખાણની ભાષા ઓળખવાનો પ્રયાસ થશે."
            : selectedLanguage === "gu-IN"
              ? "ગુજરાતી ભાષા પસંદ કરાઈ છે."
              : "હિન્દી ભાષા પસંદ કરાઈ છે.";
      }
    });
  }
}

function updateAvatar(mood = "neutral") {
  const data = moods[mood] || moods.neutral;

  document.body.dataset.mood = mood;

  document.documentElement.style.setProperty(
    "--swayam-mood",
    data.color
  );

  const maleFaces = {
    happy: "😄",
    sad: "😔",
    angry: "😌",
    tired: "😴",
    excited: "🤩",
    neutral: "🙂"
  };

  const face = persona === "male"
    ? maleFaces[mood] || "🙂"
    : data.emoji;

  if (avatar) {
    avatar.innerHTML = `<span>${face}</span>`;
    avatar.dataset.persona = persona;
    avatar.dataset.mood = mood;
  }

  if (moodLine) moodLine.textContent = data.text;
  if (reaction) reaction.textContent = data.emoji;
}

function showMessage(text, who) {
  if (!messages) return;

  const bubble = document.createElement("div");

  bubble.className = who === "user" ? "user" : "bot";
  bubble.textContent = text;

  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
}

function chatCollection() {
  return collection(db, "users", currentUser.uid, "messages");
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

      if (data.role && data.text) {
        chatHistory.push({
          role: data.role === "assistant" ? "model" : data.role,
          text: data.text
        });

        showMessage(
          data.text,
          data.role === "user" ? "user" : "ai"
        );
      }
    });
  } catch (error) {
    console.error("History error:", error);

    if (authMsg) {
      authMsg.textContent =
        "જૂની વાતચીત લોડ થઈ શકી નથી. Firebase Rules તપાસો.";
    }
  }
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
