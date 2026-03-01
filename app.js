// Import Firebase functions
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, push, onChildAdded } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// REPLACE THIS WITH YOUR FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyDkorKjbFJica8XAWMApXplIM_NFvCdPa4",
  authDomain: "skip-4bf6f.firebaseapp.com",
  databaseURL: "https://skip-4bf6f-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "skip-4bf6f",
  storageBucket: "skip-4bf6f.firebasestorage.app",
  messagingSenderId: "720098009724",
  appId: "1:720098009724:web:7d4eeed33ac67fe6385ff9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// DOM Elements
const authSection = document.getElementById('auth-section');
const chatSection = document.getElementById('chat-section');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const userDisplay = document.getElementById('user-display');
const messagesDiv = document.getElementById('messages');
const msgInput = document.getElementById('msg-input');

// --- AUTHENTICATION ---
document.getElementById('register-btn').addEventListener('click', () => {
    createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value)
        .then(() => alert("Registered!"))
        .catch(error => alert(error.message));
});

document.getElementById('login-btn').addEventListener('click', () => {
    signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value)
        .catch(error => alert(error.message));
});

document.getElementById('logout-btn').addEventListener('click', () => {
    signOut(auth);
});

// Watch for login/logout
onAuthStateChanged(auth, (user) => {
    if (user) {
        authSection.style.display = 'none';
        chatSection.style.display = 'block';
        userDisplay.innerText = "Logged in as: " + user.email;
    } else {
        authSection.style.display = 'block';
        chatSection.style.display = 'none';
    }
});

// --- CHAT SYSTEM ---
const messagesRef = ref(db, 'global-chat');

// Send Message
document.getElementById('send-btn').addEventListener('click', () => {
    const text = msgInput.value;
    if (text.trim() !== "") {
        push(messagesRef, {
            sender: auth.currentUser.email,
            text: text,
            timestamp: Date.now()
        });
        msgInput.value = ""; // clear input
    }
});

// Receive Messages in Real Time
onChildAdded(messagesRef, (snapshot) => {
    const data = snapshot.val();
    const msgElement = document.createElement('div');
    msgElement.classList.add('message');
    msgElement.innerHTML = `<span class="message-sender">${data.sender.split('@')[0]}:</span> ${data.text}`;
    messagesDiv.appendChild(msgElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight; // Auto-scroll to bottom
});