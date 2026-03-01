import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, push, onChildAdded, onValue, set } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// REPLACE WITH YOUR CONFIG!
const firebaseConfig = {
  apiKey: "AIzaSyDkorKjbFJica8XAWMApXplIM_NFvCdPa4",
  authDomain: "skip-4bf6f.firebaseapp.com",
  databaseURL: "https://skip-4bf6f-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "skip-4bf6f",
  storageBucket: "skip-4bf6f.firebasestorage.app",
  messagingSenderId: "720098009724",
  appId: "1:720098009724:web:7d4eeed33ac67fe6385ff9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// State Variables (To track where the user is looking)
let currentServerId = null;
let currentChannelId = null;
let currentMessagesListener = null; 

// DOM Elements
const appContainer = document.getElementById('app-container');
const authSection = document.getElementById('auth-section');

// --- AUTH ---
document.getElementById('register-btn').addEventListener('click', () => createUserWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value));
document.getElementById('login-btn').addEventListener('click', () => signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value));
document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
    if (user) {
        authSection.style.display = 'none';
        appContainer.style.display = 'flex';
        document.getElementById('user-display').innerText = user.email.split('@')[0];
        loadServers();
    } else {
        authSection.style.display = 'block';
        appContainer.style.display = 'none';
    }
});

// --- SERVERS ---
document.getElementById('create-server-btn').addEventListener('click', () => {
    const serverName = prompt("Enter Server Name:");
    if (serverName) {
        const newServerRef = push(ref(db, 'servers'));
        set(newServerRef, { name: serverName, owner: auth.currentUser.email });
        
        // Auto-create a "general" channel for the new server
        const newChannelRef = push(ref(db, `channels/${newServerRef.key}`));
        set(newChannelRef, { name: "general" });
    }
});

function loadServers() {
    const serverList = document.getElementById('server-list');
    onValue(ref(db, 'servers'), (snapshot) => {
        serverList.innerHTML = ''; // Clear list
        snapshot.forEach((childSnapshot) => {
            const serverId = childSnapshot.key;
            const serverData = childSnapshot.val();
            
            const serverDiv = document.createElement('div');
            serverDiv.classList.add('server-icon');
            serverDiv.innerText = serverData.name.charAt(0).toUpperCase();
            serverDiv.title = serverData.name;
            
            // When a server is clicked
            serverDiv.addEventListener('click', () => {
                currentServerId = serverId;
                document.getElementById('server-name-display').innerText = serverData.name;
                document.getElementById('create-channel-btn').style.display = 'block';
                loadChannels(serverId);
            });
            serverList.appendChild(serverDiv);
        });
    });
}

// --- CHANNELS ---
document.getElementById('create-channel-btn').addEventListener('click', () => {
    const channelName = prompt("Enter Channel Name (e.g. memes):");
    if (channelName && currentServerId) {
        push(ref(db, `channels/${currentServerId}`), { name: channelName.toLowerCase() });
    }
});

function loadChannels(serverId) {
    const channelList = document.getElementById('channel-list');
    onValue(ref(db, `channels/${serverId}`), (snapshot) => {
        channelList.innerHTML = ''; // Clear old channels
        snapshot.forEach((childSnapshot) => {
            const channelId = childSnapshot.key;
            const channelData = childSnapshot.val();
            
            const channelDiv = document.createElement('div');
            channelDiv.classList.add('channel-item');
            channelDiv.innerText = `# ${channelData.name}`;
            
            // When a channel is clicked
            channelDiv.addEventListener('click', () => {
                currentChannelId = channelId;
                document.getElementById('chat-header').innerText = `# ${channelData.name}`;
                document.getElementById('msg-input').disabled = false;
                document.getElementById('send-btn').disabled = false;
                loadMessages(channelId);
            });
            channelList.appendChild(channelDiv);
        });
    });
}

// --- MESSAGES ---
function loadMessages(channelId) {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.innerHTML = ''; // Clear old messages
    
    // Listen for new messages in this specific channel
    onChildAdded(ref(db, `messages/${channelId}`), (snapshot) => {
        const data = snapshot.val();
        const msgElement = document.createElement('div');
        msgElement.classList.add('message');
        msgElement.innerHTML = `<span class="message-sender">${data.sender.split('@')[0]}</span> <span style="font-size: 0.8em; color: gray;">${new Date(data.timestamp).toLocaleTimeString()}</span><br>${data.text}`;
        messagesDiv.appendChild(msgElement);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
}

// Send Message
document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('msg-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (text !== "" && currentChannelId) {
        push(ref(db, `messages/${currentChannelId}`), {
            sender: auth.currentUser.email,
            text: text,
            timestamp: Date.now()
        });
        input.value = "";
    }
}