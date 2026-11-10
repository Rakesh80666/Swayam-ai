

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

let availableVoices = [];

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

// ભાષા ઓળખ
function detectTextLanguage(text) {
  if (selectedLanguage !== "auto") {
    return selectedLanguage;
  }

  if (/[\u0A80-\u0AFF]/.test(text)) return "gu-IN";
  if (/[\u0900-\u097F]/.test(text)) return "hi-IN";

  return "auto";
}

function detectReplyLanguage(text) {
  if (/[\u0A80-\u0AFF]/.test(text)) return "gu-IN";
  if (/[\u0900-\u097F]/.test(text)) return "hi-IN";

  return "en-IN";
}

// સાથી પસંદગી અને ભાષા પસંદગી
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
        <option value="en-IN">અંગ્રેજી</option>
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
      } catch {}

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
      } catch {}

      const info = $("languageInfo");

      if (info) {
        const labels = {
          auto: "લખાણની ભાષા ઓળખવાનો પ્રયાસ થશે.",
          "gu-IN": "ગુજરાતી ભાષા પસંદ કરાઈ છે.",
          "hi-IN": "હિન્દી ભાષા પસંદ કરાઈ છે.",
          "en-IN": "અંગ્રેજી ભાષા પસંદ કરાઈ છે."
        };

        info.textContent = labels[selectedLanguage] || labels.auto;
      }
    });
  }
}

// મૂડ અને અવતાર
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

  const cleanText = String(text)
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/`([^`]+)`/g, "$1");

  bubble.textContent = cleanText;

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

// ફોનના બ્રાઉઝરમાં ઉપલબ્ધ અવાજો મેળવો
function loadAvailableVoices() {
  if (!("speechSynthesis" in window)) {
    availableVoices = [];
    return [];
  }

  availableVoices = speechSynthesis.getVoices();

  return availableVoices;
}

// પસંદ કરેલી ભાષા પ્રમાણે અવાજ પસંદ કરો
function getPreferredVoice(languageCode = "gu-IN") {
  const voices = loadAvailableVoices();

  if (!voices.length) return null;

  const languagePrefix = languageCode
    .toLowerCase()
    .split("-")[0];

  const matchingVoices = voices.filter((voice) =>
    voice.lang.toLowerCase().startsWith(languagePrefix)
  );

  if (!matchingVoices.length) return null;

  // ગુજરાતી માટે ઉપલબ્ધ પ્રથમ ગુજરાતી અવાજ
  if (languagePrefix === "gu") {
    return matchingVoices[0];
  }

  // હિન્દી / અંગ્રેજી માટે નામ પરથી gender ઓળખવાનો પ્રયાસ
  const femaleNames =
    /female|woman|zira|heera|veena|kalpana|lekha|priya|aditi/i;

  const maleNames =
    /male|man|ravi|hemant|rishi|arjun|madhur/i;

  const pattern = persona === "male"
    ? maleNames
    : femaleNames;

  const genderVoice = matchingVoices.find((voice) =>
    pattern.test(voice.name + " " + voice.voiceURI)
  );

  return genderVoice || matchingVoices[0];
}

// બોલવાનો અવાજ
function speak(text) {
  if (!("speechSynthesis" in window) || !speakEnabled) return;

  // અવાજ માટે Markdown ચિહ્નો દૂર કરો
  const cleanSpeech = String(text)
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/#{1,6}\s*/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-•]\s*/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();

  if (!cleanSpeech) return;

  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(cleanSpeech);

  const languageCode = detectReplyLanguage(cleanSpeech);
  const selectedVoice = getPreferredVoice(languageCode);

  utterance.lang = languageCode;

  if (selectedVoice) {
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang;
  }

  utterance.rate = 0.9;
  utterance.pitch = 1;

  utterance.onstart = () => {
    avatar?.classList.add("speaking");
  };

  utterance.onend = () => {
    avatar?.classList.remove("speaking");
  };

  utterance.onerror = (event) => {
    console.error("Speech error:", event);
    avatar?.classList.remove("speaking");
  };

  speechSynthesis.speak(utterance);
}

// બ્રાઉઝર અવાજ લોડ કરે ત્યારે ફરી તપાસ
if ("speechSynthesis" in window) {
  loadAvailableVoices();

  speechSynthesis.onvoiceschanged = () => {
    loadAvailableVoices();
  };
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

// Chat function
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

  if (greeting) {
    greeting.textContent = "હું તમને સાંભળું છું...";
  }

  try {
    const language = detectTextLanguage(text);

    const idToken = await currentUser.getIdToken();

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`
      },
      body: JSON.stringify({
        message: text,
        history: chatHistory.slice(0, -1).slice(-8),
        persona,
        language
      })
    });

    const responseText = await response.text();

    console.log("SWAYAM AI HTTP STATUS:", response.status);
    console.log("SWAYAM AI SERVER RESPONSE:", responseText);

    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(
        "સર્વરનો જવાબ JSON સ્વરૂપમાં નથી. HTTP Status: " +
        response.status
      );
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
        "AI સર્વર Error. HTTP Status: " + response.status
      );
    }

    console.log("SWAYAM AI SERVER DATA:", data);

    if (!data || typeof data.reply !== "string" || !data.reply.trim()) {
      showMessage(
        "સર્વર સાથે જોડાણ થયું, પરંતુ AI નો જવાબ ખાલી મળ્યો. વિગતો: " +
        JSON.stringify(data),
        "ai"
      );

      if (greeting) {
        greeting.textContent = "જવાબ મળ્યો નથી.";
      }

      return;
    }

    const reply = data.reply.trim();
    const mood = moods[data.mood] ? data.mood : "neutral";

    showMessage(reply, "ai");

    chatHistory.push({
      role: "model",
      text: reply
    });

    await saveMessage("assistant", reply);

    updateAvatar(mood);
    speak(reply);

    if (greeting) {
      greeting.textContent = "SWAYAM AI તમારી સાથે છે.";
    }

  } catch (error) {
    console.error("Chat error:", error);

    showMessage(
      "જવાબ મેળવવામાં સમસ્યા: " +
      (error.message || "કનેક્શનની સમસ્યા છે."),
      "ai"
    );

    if (greeting) {
      greeting.textContent = "જવાબ મેળવવામાં સમસ્યા આવી.";
    }

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
    if (authMsg) {
      authMsg.textContent =
        "લૉગિન થઈ શક્યું નથી: " + error.message;
    }
  }
});

// Signup
signupBtn?.addEventListener("click", async () => {
  try {
    await createUserWithEmailAndPassword(
      auth,
      email.value.trim(),
      password.value
    );

    if (authMsg) authMsg.textContent = "";

  } catch (error) {
    if (authMsg) {
      authMsg.textContent =
        "એકાઉન્ટ બની શક્યું નથી: " + error.message;
    }
  }
});

// Google Login
googleBtn?.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    if (authMsg) {
      authMsg.textContent =
        "Google Login સમસ્યા: " + error.message;
    }
  }
});

// Password reset
resetBtn?.addEventListener("click", async () => {
  try {
    await sendPasswordResetEmail(auth, email.value.trim());

    if (authMsg) {
      authMsg.textContent = "પાસવર્ડ રીસેટ લિંક મોકલી છે.";
    }
  } catch (error) {
    if (authMsg) {
      authMsg.textContent = "ઇમેઇલ તપાસો: " + error.message;
    }
  }
});

// Logout
logoutBtn?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout error:", error);
  }
});

sendBtn?.addEventListener("click", sendMessage);

messageInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

// Chat history clear
clearBtn?.addEventListener("click", async () => {
  if (!currentUser) return;

  if (!confirm("તમારી જૂની વાતચીત કાઢી નાખવી છે?")) return;

  try {
    const snapshot = await getDocs(chatCollection());
    const batch = writeBatch(db);

    snapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    chatHistory = [];

    if (messages) messages.innerHTML = "";

    updateAvatar("neutral");

  } catch (error) {
    alert("Chat History કાઢી શકાઈ નથી. Firebase Rules તપાસો.");
    console.error(error);
  }
});

// Microphone / Voice Input
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

if (micBtn && SpeechRecognition) {
  const recognition = new SpeechRecognition();

  recognition.continuous = false;
  recognition.interimResults = false;

  micBtn.addEventListener("click", () => {
    try {
      if (selectedLanguage === "gu-IN") {
        recognition.lang = "gu-IN";
      } else if (selectedLanguage === "hi-IN") {
        recognition.lang = "hi-IN";
      } else if (selectedLanguage === "en-IN") {
        recognition.lang = "en-IN";
      } else {
        const deviceLanguage =
          (navigator.language || "gu-IN").toLowerCase();

        recognition.lang =
          deviceLanguage.startsWith("hi")
            ? "hi-IN"
            : deviceLanguage.startsWith("en")
              ? "en-IN"
              : "gu-IN";

        if ($("languageInfo")) {
          $("languageInfo").textContent =
            "માઇક માટે ફોનની ભાષા મુજબ પ્રયાસ થશે. જરૂર પડે તો ભાષા બદલો.";
        }
      }

      recognition.start();

      if (authMsg) {
        authMsg.textContent = "હું સાંભળું છું...";
      }

    } catch (error) {
      console.log(error);

      if (authMsg) {
        authMsg.textContent =
          "માઇક્રોફોન ફરી શરૂ કરવા થોડી વાર રાહ જુઓ.";
      }
    }
  });

  recognition.onresult = (event) => {
    const spokenText = event.results[0][0].transcript;

    if (messageInput) {
      messageInput.value = spokenText;
    }

    if (authMsg) authMsg.textContent = "તમારી વાત લખાઈ ગઈ છે.";
  };

  recognition.onerror = () => {
    if (authMsg) {
      authMsg.textContent =
        "માઇક્રોફોન ચાલુ ન થયો. Permission અને ભાષા તપાસો.";
    }
  };

  recognition.onend = () => {
    if (authMsg && authMsg.textContent === "હું સાંભળું છું...") {
      authMsg.textContent = "";
    }
  };

} else if (micBtn) {
  micBtn.addEventListener("click", () => {
    alert("આ બ્રાઉઝરમાં Voice Input ઉપલબ્ધ નથી.");
  });
}

// Firebase Authentication state
onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  const authPanel = $("authPanel");

  if (user) {
    if (authPanel) authPanel.style.display = "none";

    if (chatPanel) {
      chatPanel.classList.remove("hidden");
      chatPanel.style.display = "block";
    }

    addPersonaSelector();

    if (greeting) {
      greeting.textContent =
        "નમસ્તે! SWAYAM AIમાં તમારું સ્વાગત છે.";
    }

    await loadMessages();
    updateAvatar("neutral");

  } else {
    if (authPanel) authPanel.style.display = "";

    if (chatPanel) {
      chatPanel.classList.add("hidden");
      chatPanel.style.display = "";
    }

    chatHistory = [];

    if (messages) messages.innerHTML = "";
  }
});

