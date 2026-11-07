
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

function addPersonaSelector() {
  if ($("personaSelect")) return;

  const selector = document.createElement("div");
  selector.style.cssText = "padding:10px;text-align:center;color:inherit;";

  selector.innerHTML = `
    <label for="personaSelect">તમારી સાથી પસંદ કરો: </label>
    <select id="personaSelect">
      <option value="female">મહિલા મિત્ર</option>
      <option value="male">પુરુષ મિત્ર</option>
    </select>
  `;

  chatPanel?.prepend(selector);

  const select = $("personaSelect");

  try {
    persona = localStorage.getItem("swayamPersona") || "female";
  } catch {
    persona = "female";
  }

  if (select) {
    select.value = persona;

    select.addEventListener("change", () => {
      persona = select.value;

      try {
        localStorage.setItem("swayamPersona", persona);
      } catch (error) {
        console.log("Preference could not be saved.");
      }

      updateAvatar("neutral");
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

function speak(text) {
  if (!("speechSynthesis" in window) || !speakEnabled) return;

  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);

  utterance.lang = "gu-IN";
  utterance.rate = 0.9;
  utterance.pitch = persona === "female" ? 1.1 : 0.9;

  utterance.onstart = () => {
    avatar?.classList.add("speaking");
  };

  utterance.onend = () => {
    avatar?.classList.remove("speaking");
  };

  utterance.onerror = () => {
    avatar?.classList.remove("speaking");
  };

  speechSynthesis.speak(utterance);
}

speakToggle?.addEventListener("click", () => {
  speakEnabled = !speakEnabled;

  speakToggle.textContent = speakEnabled
    ? "🔊 અવાજ ચાલુ"
    : "🔇 અવાજ બંધ";

  if (!speakEnabled && "speechSynthesis" in window) {
    speechSynthesis.cancel();
    avatar?.classList.remove("speaking");
  }
});

async function sendMessage() {
  if (busy || !currentUser) return;

  const text = messageInput?.value.trim();
  if (!text) return;

  busy = true;
  if (sendBtn) sendBtn.disabled = true;

  messageInput.value = "";
  showMessage(text, "user");

  chatHistory.push({
    role: "user",
    text
  });

  // Firebase save in background - do not wait
  saveMessage("user", text);

  if (greeting) {
    greeting.textContent = "હું તમને સાંભળું છું...";
  }

  try {
    const language = detectTextLanguage(text);

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: text,
        history: chatHistory.slice(-8),
        persona,
        language
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "AI જવાબ આપી શક્યું નથી.");
    }

    const reply = data.reply || "હું સાંભળું છું.";
    const mood = moods[data.mood] ? data.mood : "neutral";

    showMessage(reply, "ai");

    chatHistory.push({
      role: "model",
      text: reply
    });

    // Update mood and start voice immediately
    updateAvatar(mood);
    speak(reply);

    // Firebase save in background
    saveMessage("assistant", reply);

    if (greeting) {
      greeting.textContent = "SWAYAM AI તમારી સાથે છે.";
    }

  } catch (error) {
    console.error("Chat error:", error);

    showMessage(
      error.message || "કનેક્શનની સમસ્યા છે. ફરી પ્રયાસ કરો.",
      "ai"
    );

  } finally {
    busy = false;

    if (sendBtn) sendBtn.disabled = false;
    messageInput?.focus();
  }
}
