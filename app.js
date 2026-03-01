import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, push, onChildAdded, onValue, set, get, child } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// !!! PASTE YOUR FIREBASE CONFIG HERE !!!
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

// State Tracking
let currentServerId = null;
let currentChatId = null; 
let chatType = null; // 'server' or 'dm'
let currentUserSafeEmail = null; // Firebase keys can't have '.', so we replace them with ','

const appContainer = document.getElementById('app-container');
const authSection = document.getElementById('auth-section');

// --- HELPER FUNCTION ---
// Firebase database paths cannot contain periods (.). So "user@email.com" becomes "user@email,com"
function sanitizeEmail(email) { return email.replace(/\./g, ','); }

// --- AUTHENTICATION & USER SETUP ---
document.getElementById('register-btn').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        // Save user profile to database on register
        const safeEmail = sanitizeEmail(email);
        await set(ref(db, `users/${safeEmail}`), { email: email, uid: userCredential.user.uid });
        alert("Registered successfully!");
    } catch (error) { alert(error.message); }
});

document.getElementById('login-btn').addEventListener('click', () => signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value).catch(e => alert(e.message)));
document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
    if (user) {
        authSection.style.display = 'none';
        appContainer.style.display = 'flex';
        currentUserSafeEmail = sanitizeEmail(user.email);
        document.getElementById('user-display').innerText = user.email.split('@')[0];
        
        loadMyServers();
        loadFriendsList(); // Default view on login
    } else {
        authSection.style.display = 'block';
        appContainer.style.display = 'none';
    }
});

// --- NAVIGATION (HOME VS SERVERS) ---
document.getElementById('home-btn').addEventListener('click', () => {
    currentServerId = null;
    document.getElementById('server-name-display').innerText = "Friends & DMs";
    document.getElementById('add-friend-btn').style.display = 'block';
    document.getElementById('create-channel-btn').style.display = 'none';
    document.getElementById('invite-code-display').innerText = "";
    loadFriendsList();
});

// --- FRIENDS & DMs ---
document.getElementById('add-friend-btn').addEventListener('click', async () => {
    const friendEmail = prompt("Enter friend's exact email:");
    if (!friendEmail || friendEmail === auth.currentUser.email) return;

    const safeFriendEmail = sanitizeEmail(friendEmail);
    
    // Check if user exists
    const snapshot = await get(child(ref(db), `users/${safeFriendEmail}`));
    if (snapshot.exists()) {
        // Create a unique DM ID based on both emails sorted alphabetically
        const dmsArray = [currentUserSafeEmail, safeFriendEmail].sort();
        const dmId = dmsArray.join('_');

        // Add to each other's friend lists
        await set(ref(db, `users/${currentUserSafeEmail}/friends/${safeFriendEmail}`), { email: friendEmail, dmId: dmId });
        await set(ref(db, `users/${safeFriendEmail}/friends/${currentUserSafeEmail}`), { email: auth.currentUser.email, dmId: dmId });
        alert("Friend added!");
    } else {
        alert("User not found.");
    }
});

function loadFriendsList() {
    const channelList = document.getElementById('channel-list');
    onValue(ref(db, `users/${currentUserSafeEmail}/friends`), (snapshot) => {
        channelList.innerHTML = '';
        snapshot.forEach((childSnapshot) => {
            const friendData = childSnapshot.val();
            const friendDiv = document.createElement('div');
            friendDiv.classList.add('channel-item');
            friendDiv.innerText = `👤 ${friendData.email.split('@')[0]}`;
            
            friendDiv.addEventListener('click', () => {
                chatType = 'dm';
                currentChatId = friendData.dmId;
                document.getElementById('chat-title').innerText = `@${friendData.email.split('@')[0]}`;
                enableChat();
                loadMessages(`dms/${currentChatId}`);
            });
            channelList.appendChild(friendDiv);
        });
    });
}

// --- SERVERS & INVITES ---
document.getElementById('create-server-btn').addEventListener('click', () => {
    const serverName = prompt("Enter Server Name:");
    if (serverName) {
        const newServerRef = push(ref(db, 'servers'));
        const serverId = newServerRef.key;
        
        // 1. Create server info
        set(newServerRef, { name: serverName, owner: auth.currentUser.email });
        // 2. Add creator to members list
        set(ref(db, `server_members/${serverId}/${currentUserSafeEmail}`), true);
        // 3. Add server to creator's server list
        set(ref(db, `users/${currentUserSafeEmail}/servers/${serverId}`), true);
        // 4. Create general channel
        push(ref(db, `channels/${serverId}`), { name: "general" });
    }
});

document.getElementById('join-server-btn').addEventListener('click', async () => {
    const inviteCode = prompt("Enter Server Invite Code:");
    if (inviteCode) {
        // Check if server exists
        const snapshot = await get(child(ref(db), `servers/${inviteCode}`));
        if (snapshot.exists()) {
            // Join server
            await set(ref(db, `server_members/${inviteCode}/${currentUserSafeEmail}`), true);
            await set(ref(db, `users/${currentUserSafeEmail}/servers/${inviteCode}`), true);
            alert("Joined server!");
        } else {
            alert("Invalid invite code.");
        }
    }
});

function loadMyServers() {
    const serverList = document.getElementById('server-list');
    // Only load servers this specific user is a part of
    onValue(ref(db, `users/${currentUserSafeEmail}/servers`), (userServersSnapshot) => {
        serverList.innerHTML = '';
        userServersSnapshot.forEach((childSnapshot) => {
            const serverId = childSnapshot.key;
            
            // Fetch actual server details
            get(child(ref(db), `servers/${serverId}`)).then((serverSnapshot) => {
                if (serverSnapshot.exists()) {
                    const serverData = serverSnapshot.val();
                    const serverDiv = document.createElement('div');
                    serverDiv.classList.add('server-icon');
                    serverDiv.innerText = serverData.name.charAt(0).toUpperCase();
                    
                    serverDiv.addEventListener('click', () => {
                        currentServerId = serverId;
                        document.getElementById('server-name-display').innerText = serverData.name;
                        document.getElementById('add-friend-btn').style.display = 'none';
                        document.getElementById('create-channel-btn').style.display = 'block';
                        document.getElementById('invite-code-display').innerText = `Invite Code: ${serverId}`;
                        loadChannels(serverId);
                    });
                    serverList.appendChild(serverDiv);
                }
            });
        });
    });
}

// --- CHANNELS ---
document.getElementById('create-channel-btn').addEventListener('click', () => {
    const channelName = prompt("Channel Name:");
    if (channelName && currentServerId) push(ref(db, `channels/${currentServerId}`), { name: channelName.toLowerCase() });
});

function loadChannels(serverId) {
    const channelList = document.getElementById('channel-list');
    onValue(ref(db, `channels/${serverId}`), (snapshot) => {
        channelList.innerHTML = ''; 
        snapshot.forEach((childSnapshot) => {
            const channelId = childSnapshot.key;
            const channelData = childSnapshot.val();
            
            const channelDiv = document.createElement('div');
            channelDiv.classList.add('channel-item');
            channelDiv.innerText = `# ${channelData.name}`;
            
            channelDiv.addEventListener('click', () => {
                chatType = 'server';
                currentChatId = channelId;
                document.getElementById('chat-title').innerText = `# ${channelData.name}`;
                enableChat();
                loadMessages(`messages/${channelId}`);
            });
            channelList.appendChild(channelDiv);
        });
    });
}

// --- MESSAGES (Handles both DMs and Server Chats) ---
function enableChat() {
    document.getElementById('msg-input').disabled = false;
    document.getElementById('send-btn').disabled = false;
}

function loadMessages(dbPath) {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.innerHTML = ''; 
    
    onChildAdded(ref(db, dbPath), (snapshot) => {
        const data = snapshot.val();
        const msgElement = document.createElement('div');
        msgElement.classList.add('message');
        msgElement.innerHTML = `<span class="message-sender">${data.sender.split('@')[0]}</span> <span style="font-size: 0.8em; color: gray;">${new Date(data.timestamp).toLocaleTimeString()}</span><br>${data.text}`;
        messagesDiv.appendChild(msgElement);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
}

// Send Message
function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (text !== "" && currentChatId) {
        // Determine path based on if we are in a DM or Server
        const path = chatType === 'server' ? `messages/${currentChatId}` : `dms/${currentChatId}`;
        push(ref(db, path), {
            sender: auth.currentUser.email,
            text: text,
            timestamp: Date.now()
        });
        input.value = "";
    }
}

document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('msg-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });