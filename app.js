import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, push, onChildAdded, onValue, set, get, child, remove } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

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
let chatType = null; 
let currentUserSafeEmail = null;
let myProfile = {}; 

const appContainer = document.getElementById('app-container');
const authSection = document.getElementById('auth-section');

// Helper to handle Firebase's dislike for periods in database keys
function sanitizeEmail(email) { return email.replace(/\./g, ','); }

// --- AUTH & PROFILE CREATION ---
document.getElementById('register-btn').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const safeEmail = sanitizeEmail(email);
        
        // Generate default Discord-like tag
        const baseName = email.split('@')[0];
        const randomTag = Math.floor(1000 + Math.random() * 9000).toString(); 
        
        // Using UI Avatars instead of placeholder.com
        const defaultAvatar = `https://ui-avatars.com/api/?name=${baseName.charAt(0)}&background=5865F2&color=fff&size=150`;

        const profileData = { 
            email: email, 
            uid: userCredential.user.uid, 
            username: baseName, 
            tag: randomTag, 
            avatar: defaultAvatar 
        };

        // Save profile data
        await set(ref(db, `users/${safeEmail}`), profileData);
        
        // Save to lookup table (Replacing # with _ so Firebase doesn't crash)
        await set(ref(db, `user_tags/${baseName}_${randomTag}`), safeEmail);
        
        alert("Registered successfully!");
    } catch (error) { alert(error.message); }
});

document.getElementById('login-btn').addEventListener('click', () => {
    signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value)
        .catch(e => alert(e.message));
});

document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
    if (user) {
        authSection.style.display = 'none';
        appContainer.style.display = 'flex';
        currentUserSafeEmail = sanitizeEmail(user.email);
        
        // Load my profile data
        onValue(ref(db, `users/${currentUserSafeEmail}`), (snapshot) => {
            if(snapshot.exists()) {
                myProfile = snapshot.val();
                document.getElementById('user-display').innerText = myProfile.username;
                document.getElementById('user-tag-display').innerText = `#${myProfile.tag}`;
                document.getElementById('my-avatar').src = myProfile.avatar;
            }
        });

        loadMyServers();
        loadFriendsList();
    } else {
        authSection.style.display = 'block';
        appContainer.style.display = 'none';
    }
});

// --- PROFILE SETTINGS (AVATAR & TAG) ---
const profileModal = document.getElementById('profile-modal');
let tempBase64Avatar = null;

// Open modal
document.getElementById('user-controls').addEventListener('click', (e) => {
    if(e.target.id === 'logout-btn') return; 
    document.getElementById('edit-username').value = myProfile.username;
    document.getElementById('edit-tag').value = myProfile.tag;
    document.getElementById('profile-preview').src = myProfile.avatar;
    tempBase64Avatar = myProfile.avatar;
    profileModal.style.display = 'flex';
});

// Close modal
document.getElementById('close-profile-btn').addEventListener('click', () => profileModal.style.display = 'none');

// Convert Image to Base64 String
document.getElementById('avatar-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
            tempBase64Avatar = reader.result; 
            document.getElementById('profile-preview').src = tempBase64Avatar;
        };
        reader.readAsDataURL(file); 
    }
});

// Save Profile
document.getElementById('save-profile-btn').addEventListener('click', async () => {
    const newUsername = document.getElementById('edit-username').value.trim();
    const newTag = document.getElementById('edit-tag').value.trim();
    
    if(!newUsername || !newTag) return alert("Fields cannot be empty");

    // Use underscores instead of # for database paths
    const oldDbTag = `${myProfile.username}_${myProfile.tag}`;
    const newDbTag = `${newUsername}_${newTag}`;

    // Update Database lookup
    await remove(ref(db, `user_tags/${oldDbTag}`)); 
    await set(ref(db, `user_tags/${newDbTag}`), currentUserSafeEmail); 
    
    // Update Profile
    await set(ref(db, `users/${currentUserSafeEmail}/username`), newUsername);
    await set(ref(db, `users/${currentUserSafeEmail}/tag`), newTag);
    await set(ref(db, `users/${currentUserSafeEmail}/avatar`), tempBase64Avatar);

    profileModal.style.display = 'none';
    alert("Profile updated!");
});

// --- NAVIGATION ---
document.getElementById('home-btn').addEventListener('click', () => {
    currentServerId = null;
    document.getElementById('server-name-display').innerText = "Friends & DMs";
    document.getElementById('add-friend-btn').style.display = 'block';
    document.getElementById('create-channel-btn').style.display = 'none';
    document.getElementById('invite-code-display').innerText = "";
    loadFriendsList();
});

// --- ADD FRIENDS BY TAG ---
document.getElementById('add-friend-btn').addEventListener('click', async () => {
    let inputTag = prompt("Enter friend's tag (e.g. @noxy#6996 or noxy#6996):");
    if (!inputTag) return;

    if(inputTag.startsWith('@')) inputTag = inputTag.substring(1);

    // Convert the # to _ for the database search
    const dbSearchTag = inputTag.replace('#', '_');
    
    // Look up the safeEmail associated with this tag
    const tagSnapshot = await get(child(ref(db), `user_tags/${dbSearchTag}`));
    
    if (tagSnapshot.exists()) {
        const friendSafeEmail = tagSnapshot.val();
        if(friendSafeEmail === currentUserSafeEmail) return alert("You can't add yourself!");

        const friendProfileSnap = await get(child(ref(db), `users/${friendSafeEmail}`));
        const friendProfile = friendProfileSnap.val();

        const dmsArray = [currentUserSafeEmail, friendSafeEmail].sort();
        const dmId = dmsArray.join('_');

        // Add to each other's friend lists
        await set(ref(db, `users/${currentUserSafeEmail}/friends/${friendSafeEmail}`), { 
            username: friendProfile.username, tag: friendProfile.tag, avatar: friendProfile.avatar, dmId: dmId 
        });
        await set(ref(db, `users/${friendSafeEmail}/friends/${currentUserSafeEmail}`), { 
            username: myProfile.username, tag: myProfile.tag, avatar: myProfile.avatar, dmId: dmId 
        });
        alert(`Added ${inputTag} to friends!`);
    } else {
        alert("User not found. Make sure the tag and capitalization are exact.");
    }
});

function loadFriendsList() {
    const channelList = document.getElementById('channel-list');
    onValue(ref(db, `users/${currentUserSafeEmail}/friends`), (snapshot) => {
        channelList.innerHTML = '';
        snapshot.forEach((childSnapshot) => {
            const friendData = childSnapshot.val();
            const friendDiv = document.createElement('div');
            friendDiv.classList.add('channel-item', 'friend-item');
            
            friendDiv.innerHTML = `
                <img src="${friendData.avatar}" class="avatar-small">
                <span>${friendData.username}</span>
            `;
            
            friendDiv.addEventListener('click', () => {
                chatType = 'dm';
                currentChatId = friendData.dmId;
                document.getElementById('chat-title').innerText = `@${friendData.username}#${friendData.tag}`;
                enableChat();
                loadMessages(`dms/${currentChatId}`);
            });
            channelList.appendChild(friendDiv);
        });
    });
}

// --- SERVERS & CHANNELS ---
document.getElementById('create-server-btn').addEventListener('click', () => {
    const serverName = prompt("Enter Server Name:");
    if (serverName) {
        const newServerRef = push(ref(db, 'servers'));
        const serverId = newServerRef.key;
        set(newServerRef, { name: serverName, owner: auth.currentUser.email });
        set(ref(db, `server_members/${serverId}/${currentUserSafeEmail}`), true);
        set(ref(db, `users/${currentUserSafeEmail}/servers/${serverId}`), true);
        push(ref(db, `channels/${serverId}`), { name: "general" });
    }
});

document.getElementById('join-server-btn').addEventListener('click', async () => {
    const inviteCode = prompt("Enter Server Invite Code:");
    if (inviteCode) {
        const snapshot = await get(child(ref(db), `servers/${inviteCode}`));
        if (snapshot.exists()) {
            await set(ref(db, `server_members/${inviteCode}/${currentUserSafeEmail}`), true);
            await set(ref(db, `users/${currentUserSafeEmail}/servers/${inviteCode}`), true);
            alert("Joined server!");
        } else { alert("Invalid invite code."); }
    }
});

function loadMyServers() {
    const serverList = document.getElementById('server-list');
    onValue(ref(db, `users/${currentUserSafeEmail}/servers`), (userServersSnapshot) => {
        serverList.innerHTML = '';
        userServersSnapshot.forEach((childSnapshot) => {
            const serverId = childSnapshot.key;
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

// --- MESSAGES ---
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
        
        msgElement.innerHTML = `
            <div class="message-header">
                <img src="${data.avatar}" class="avatar-small">
                <span class="message-sender">${data.username}</span>
                <span style="font-size: 0.8em; color: gray;">${new Date(data.timestamp).toLocaleTimeString()}</span>
            </div>
            <div style="margin-left: 42px; word-break: break-word;">${data.text}</div>
        `;
        messagesDiv.appendChild(msgElement);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
}

function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (text !== "" && currentChatId) {
        const path = chatType === 'server' ? `messages/${currentChatId}` : `dms/${currentChatId}`;
        push(ref(db, path), {
            sender: auth.currentUser.email,
            username: myProfile.username, 
            avatar: myProfile.avatar,
            text: text,
            timestamp: Date.now()
        });
        input.value = "";
    }
}

document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('msg-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });