
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

// Firebase setup
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Page elements
const $ = (id) => document.getElementById(id);
const status = $("status") ;
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

let currentUser = null;
let chatHistory = [];
let busy = false;
let persona = "female";

// Add male/female companion selection
function addPersonaSelector() {
  if ($("personaSelect")) return;

  const selector = document.createElement("div");
  selector.style.cssText =
    "padding:10px;text-align:center;color:inherit;";

  selector.innerHTML = `
    <label for="personaSelect">તમારી સાથી પસંદ કરો: </label>
    <select id="personaSelect">
      <option value="female">મહિલા મિત્ર</option>
      <option value="male">પુરુષ મિત્ર</option>
    </select>
  `;

  const target = chatPanel || greeting?.parentElement;
  if (target) target.prepend(selector);

  const select = $("personaSelect");
  if (select) {
    select.value = localStorage.getItem("swayamPersona") || "female";
    persona = select.value;

    select.addEventListener("change", () => {
      persona = select.value;
      localStorage.setItem("swayamPersona", persona);
      updateAvatar("neutral");
    });
  }
}

addPersonaSelector();

// Mood based appearance
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

function updateAvatar(mood = "neutral") {
  const data = moods[mood] || moods.neutral;

  document.body.dataset.mood = mood;
  document.documentElement.style.setProperty(
    "--swayam-mood",
    data.color
  );

  if (avatar) {
    avatar.textContent = persona === "male"
      ? (mood === "happy" ? "😄" :
         mood === "sad" ? "😔" :
         mood === "angry" ? "😌" :
         mood === "tired" ? "😴" :
         mood === "excited" ? "🤩" : "🙂")
      : data.emoji;
  }

  if (moodLine) moodLine.textContent = data.text;
  if (reaction) reaction.textContent = data.emoji;
}

// Show messages
function showMessage(text, who) {
  if (!messages) return;

  const bubble = document.createElement("div");
  bubble.className = who === "user" ? "user-message" : "ai-message";
  bubble.textContent = text;

  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
}

// Firebase chat path
function chatCollection() {
  return collection(db, "users", currentUser.uid, "messages");
}

// Load previous messages
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
          role: data.role,
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
        "Chat History હજી લોડ થઈ શકતી નથી. Firebase Rules તપાસવાની જરૂર છે.";
    }
  }
}

// Save one message
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

// Speak AI response
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  if (speakToggle && !speakToggle.checked) return;

  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "gu-IN";
  utterance.rate = 0.9;
  utterance.pitch = persona === "female" ? 1.1 : 0.9;

  speechSynthesis.speak(utterance);
}

// Send message to Gemini server
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

  await saveMessage("user", text);

  if (greeting) greeting.textContent = "હું તમને સાંભળું છું...";

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: text,
        history: chatHistory.slice(-8),
        persona
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

    await saveMessage("assistant", reply);

    updateAvatar(mood);
    speak(reply);

    if (greeting) greeting.textContent = "SWAYAM AI તમારી સાથે છે.";
  } catch (error) {
    console.error(error);
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

// Login
loginBtn?.addEventListener("click", async () => {
  try {
    await signInWithEmailAndPassword(
      auth,
      email.value.trim(),
      password.value
    );
    if (authMsg) authMsg.textContent = "";
  } catch (error) {
    if (authMsg) authMsg.textContent = "લૉગિન થઈ શક્યું નથી: " + error.message;
  }
});

// Create account
signupBtn?.addEventListener("click", async () => {
  try {
    await createUserWithEmailAndPassword(
      auth,
      email.value.trim(),
      password.value
    );
    if (authMsg) authMsg.textContent = "";
  } catch (error) {
    if (authMsg) authMsg.textContent = "એકાઉન્ટ બની શક્યું નથી: " + error.message;
  }
});

// Google login
googleBtn?.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    if (authMsg) authMsg.textContent = "Google Login સમસ્યા: " + error.message;
  }
});

// Password reset
resetBtn?.addEventListener("click", async () => {
  try {
    await sendPasswordResetEmail(auth, email.value.trim());
    if (authMsg) authMsg.textContent = "પાસવર્ડ રીસેટ લિંક મોકલી છે.";
  } catch (error) {
    if (authMsg) authMsg.textContent = "ઇમેઇલ તપાસો: " + error.message;
  }
});

// Logout
logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
});

// Send button and Enter key
sendBtn?.addEventListener("click", sendMessage);

messageInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

// Clear chat history
clearBtn?.addEventListener("click", async () => {
  if (!currentUser) return;

  if (!confirm("તમારી જૂની વાતચીત કાઢી નાખવી છે?")) return;

  try {
    const snapshot = await getDocs(chatCollection());
    const batch = writeBatch(db);

    snapshot.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    chatHistory = [];
    if (messages) messages.innerHTML = "";
    updateAvatar("neutral");
  } catch (error) {
    alert("Chat History કાઢી શકાઈ નથી. Firebase Rules તપાસો.");
    console.error(error);
  }
});

// Voice input
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

if (micBtn && SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.lang = "gu-IN";
  recognition.continuous = false;
  recognition.interimResults = false;

  micBtn.addEventListener("click", () => {
    try {
      recognition.start();
    } catch (error) {
      console.log(error);
    }
  });

  recognition.onresult = (event) => {
    const spokenText = event.results[0][0].transcript;
    if (messageInput) messageInput.value = spokenText;
  };

  recognition.onerror = () => {
    if (authMsg) authMsg.textContent =
      "માઇક્રોફોન ચાલુ ન થયો. Permission તપાસો.";
  };
} else if (micBtn) {
  micBtn.addEventListener("click", () => {
    alert("આ બ્રાઉઝરમાં Voice Input ઉપલબ્ધ નથી.");
  });
}

// Authentication state
onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (chatPanel) {
    chatPanel.style.display = user ? "" : "none";
  }

  const authPanel = document.querySelector("#authPanel");

  if (authPanel) {
    authPanel.style.display = user ? "none" : "";
  }

  if (user) {
    if (greeting) {
      greeting.textContent = "નમસ્તે! SWAYAM AIમાં તમારું સ્વાગત છે.";
    }

    await loadMessages();
    updateAvatar("neutral");
  } else {
    chatHistory = [];
    if (messages) messages.innerHTML = "";
  }
});

// Initial welcome
updateAvatar("neutral");
