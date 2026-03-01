import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, push, onChildAdded, onValue, set, get, child, remove, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

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

// Voice State Tracking
let myPeer = null;
let localAudioStream = null;
let activeCalls = {}; // Stores Call objects to manage peers
let currentVoiceChannel = null;
let isMuted = false;
let isDeafened = false;

const appContainer = document.getElementById('app-container');
const authSection = document.getElementById('auth-section');

function sanitizeEmail(email) { return email.replace(/\./g, ','); }

// --- AUTH & PROFILE CREATION ---
document.getElementById('register-btn').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const safeEmail = sanitizeEmail(email);
        const baseName = email.split('@')[0];
        const randomTag = Math.floor(1000 + Math.random() * 9000).toString(); 
        const defaultAvatar = `https://ui-avatars.com/api/?name=${baseName.charAt(0)}&background=5865F2&color=fff&size=150`;

        const profileData = { email: email, uid: userCredential.user.uid, username: baseName, tag: randomTag, avatar: defaultAvatar };

        await set(ref(db, `users/${safeEmail}`), profileData);
        await set(ref(db, `user_tags/${baseName}_${randomTag}`), safeEmail);
        alert("Registered successfully!");
    } catch (error) { alert(error.message); }
});

document.getElementById('login-btn').addEventListener('click', () => {
    signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value)
        .catch(e => alert(e.message));
});

document.getElementById('logout-btn').addEventListener('click', () => {
    leaveVoiceChannel();
    signOut(auth);
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        authSection.style.display = 'none';
        appContainer.style.display = 'flex';
        currentUserSafeEmail = sanitizeEmail(user.email);
        
        onValue(ref(db, `users/${currentUserSafeEmail}`), (snapshot) => {
            if(snapshot.exists()) {
                myProfile = snapshot.val();
                document.getElementById('user-display').innerText = myProfile.username;
                document.getElementById('user-tag-display').innerText = `#${myProfile.tag}`;
                document.getElementById('my-avatar').src = myProfile.avatar;
            }
        });

        initVoiceChat(); // Initialize PeerJS

        loadMyServers();
        loadFriendsList();
    } else {
        authSection.style.display = 'block';
        appContainer.style.display = 'none';
    }
});

// --- PROFILE SETTINGS (Same as before) ---
const profileModal = document.getElementById('profile-modal');
let tempBase64Avatar = null;

document.getElementById('user-controls').addEventListener('click', (e) => {
    if(e.target.id === 'logout-btn') return; 
    document.getElementById('edit-username').value = myProfile.username;
    document.getElementById('edit-tag').value = myProfile.tag;
    document.getElementById('profile-preview').src = myProfile.avatar;
    tempBase64Avatar = myProfile.avatar;
    profileModal.style.display = 'flex';
});

document.getElementById('close-profile-btn').addEventListener('click', () => profileModal.style.display = 'none');

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

document.getElementById('save-profile-btn').addEventListener('click', async () => {
    const newUsername = document.getElementById('edit-username').value.trim();
    const newTag = document.getElementById('edit-tag').value.trim();
    if(!newUsername || !newTag) return alert("Fields cannot be empty");

    const oldDbTag = `${myProfile.username}_${myProfile.tag}`;
    const newDbTag = `${newUsername}_${newTag}`;

    await remove(ref(db, `user_tags/${oldDbTag}`)); 
    await set(ref(db, `user_tags/${newDbTag}`), currentUserSafeEmail); 
    await set(ref(db, `users/${currentUserSafeEmail}/username`), newUsername);
    await set(ref(db, `users/${currentUserSafeEmail}/tag`), newTag);
    await set(ref(db, `users/${currentUserSafeEmail}/avatar`), tempBase64Avatar);

    profileModal.style.display = 'none';
    alert("Profile updated!");
});

// --- NAVIGATION & FRIENDS (Same as before) ---
document.getElementById('home-btn').addEventListener('click', () => {
    currentServerId = null;
    document.getElementById('server-name-display').innerText = "Friends & DMs";
    document.getElementById('add-friend-btn').style.display = 'block';
    document.getElementById('create-channel-btn').style.display = 'none';
    document.getElementById('create-voice-btn').style.display = 'none';
    document.getElementById('invite-code-display').innerText = "";
    loadFriendsList();
});

document.getElementById('add-friend-btn').addEventListener('click', async () => {
    let inputTag = prompt("Enter friend's tag (e.g. noxy#6996):");
    if (!inputTag) return;
    if(inputTag.startsWith('@')) inputTag = inputTag.substring(1);
    const dbSearchTag = inputTag.replace('#', '_');
    
    const tagSnapshot = await get(child(ref(db), `user_tags/${dbSearchTag}`));
    if (tagSnapshot.exists()) {
        const friendSafeEmail = tagSnapshot.val();
        if(friendSafeEmail === currentUserSafeEmail) return alert("You can't add yourself!");

        const friendProfileSnap = await get(child(ref(db), `users/${friendSafeEmail}`));
        const friendProfile = friendProfileSnap.val();
        const dmsArray = [currentUserSafeEmail, friendSafeEmail].sort();
        const dmId = dmsArray.join('_');

        await set(ref(db, `users/${currentUserSafeEmail}/friends/${friendSafeEmail}`), { username: friendProfile.username, tag: friendProfile.tag, avatar: friendProfile.avatar, dmId: dmId });
        await set(ref(db, `users/${friendSafeEmail}/friends/${currentUserSafeEmail}`), { username: myProfile.username, tag: myProfile.tag, avatar: myProfile.avatar, dmId: dmId });
        alert(`Added ${inputTag} to friends!`);
    } else { alert("User not found."); }
});

function loadFriendsList() {
    const channelList = document.getElementById('channel-list');
    onValue(ref(db, `users/${currentUserSafeEmail}/friends`), (snapshot) => {
        channelList.innerHTML = '';
        snapshot.forEach((childSnapshot) => {
            const friendData = childSnapshot.val();
            const friendDiv = document.createElement('div');
            friendDiv.classList.add('channel-item', 'friend-item');
            friendDiv.innerHTML = `<img src="${friendData.avatar}" class="avatar-small"><span>${friendData.username}</span>`;
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
        push(ref(db, `channels/${serverId}`), { name: "general", type: "text" });
        push(ref(db, `channels/${serverId}`), { name: "General Voice", type: "voice" }); // Auto voice channel
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
                        document.getElementById('create-channel-btn').style.display = 'inline-block';
                        document.getElementById('create-voice-btn').style.display = 'inline-block';
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
    const channelName = prompt("Text Channel Name:");
    if (channelName && currentServerId) push(ref(db, `channels/${currentServerId}`), { name: channelName.toLowerCase(), type: "text" });
});

document.getElementById('create-voice-btn').addEventListener('click', () => {
    const channelName = prompt("Voice Channel Name:");
    if (channelName && currentServerId) push(ref(db, `channels/${currentServerId}`), { name: channelName, type: "voice" });
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
            
            if(channelData.type === "voice") {
                channelDiv.innerText = `🔊 ${channelData.name}`;
                channelDiv.addEventListener('click', () => joinVoiceChannel(serverId, channelId));
            } else {
                channelDiv.innerText = `# ${channelData.name}`;
                channelDiv.addEventListener('click', () => {
                    chatType = 'server';
                    currentChatId = channelId;
                    document.getElementById('chat-title').innerText = `# ${channelData.name}`;
                    enableChat();
                    loadMessages(`messages/${channelId}`);
                });
            }
            channelList.appendChild(channelDiv);
        });
    });
}

// --- VOICE CHAT & WEBRTC ENGINE ---

function initVoiceChat() {
    // We use our safe email as our exact Peer ID so others can call us by name
    myPeer = new Peer(currentUserSafeEmail);

    myPeer.on('open', id => console.log('My Peer ID is: ' + id));

    // When someone else calls us
    myPeer.on('call', call => {
        // Answer the call and send them our audio
        call.answer(localAudioStream);
        
        call.on('stream', userAudioStream => {
            addVoiceUserUI(call.peer, userAudioStream);
        });

        activeCalls[call.peer] = call;
        
        call.on('close', () => {
            removeVoiceUserUI(call.peer);
        });
    });
}

async function joinVoiceChannel(serverId, channelId) {
    if (currentVoiceChannel === channelId) return; // Already in it
    leaveVoiceChannel(); // Leave current VC if in one

    try {
        // Ask for Microphone access
        localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        currentVoiceChannel = channelId;
        document.getElementById('voice-area').style.display = 'flex';

        // Add ourselves to the Firebase VC roster
        const vcRef = ref(db, `voice_rosters/${serverId}/${channelId}/${currentUserSafeEmail}`);
        await set(vcRef, true);
        
        // Auto-remove if we close the tab
        onDisconnect(vcRef).remove();

        // Listen for who is in the channel to call them
        onValue(ref(db, `voice_rosters/${serverId}/${channelId}`), (snapshot) => {
            snapshot.forEach((child) => {
                const peerId = child.key;
                // If they are not us, and we haven't called them yet, call them!
                if (peerId !== currentUserSafeEmail && !activeCalls[peerId]) {
                    connectToNewUser(peerId, localAudioStream);
                }
            });
        });

    } catch (err) {
        alert("Microphone access denied or not found.");
        console.error(err);
    }
}

function connectToNewUser(peerId, stream) {
    // 1. Safety Check: Make sure our own Peer connection is actually active
    if (!myPeer || myPeer.disconnected) {
        console.warn("PeerJS isn't ready yet. Waiting...");
        return;
    }

    const call = myPeer.call(peerId, stream);
    
    // 2. Safety Check: If PeerJS couldn't establish the call, stop here so it doesn't crash
    if (!call) {
        console.warn(`Could not connect to ${peerId}. They might still be loading.`);
        return;
    }
    
    // If the call succeeds, attach the audio streams
    call.on('stream', userAudioStream => {
        addVoiceUserUI(peerId, userAudioStream);
    });
    
    call.on('close', () => {
        removeVoiceUserUI(peerId);
    });

    activeCalls[peerId] = call;
}

function leaveVoiceChannel() {
    if (!currentVoiceChannel) return;

    // Disconnect all calls
    Object.keys(activeCalls).forEach(peerId => {
        activeCalls[peerId].close();
        removeVoiceUserUI(peerId);
    });
    activeCalls = {};

    // Stop our microphone
    if (localAudioStream) {
        localAudioStream.getTracks().forEach(track => track.stop());
    }

    // Remove ourselves from Firebase roster
    remove(ref(db, `voice_rosters/${currentServerId}/${currentVoiceChannel}/${currentUserSafeEmail}`));

    currentVoiceChannel = null;
    document.getElementById('voice-area').style.display = 'none';
    document.getElementById('voice-users-list').innerHTML = ''; // Clear UI
}

// UI Controls for Voice
document.getElementById('disconnect-vc-btn').addEventListener('click', leaveVoiceChannel);

document.getElementById('mute-btn').addEventListener('click', (e) => {
    isMuted = !isMuted;
    localAudioStream.getAudioTracks()[0].enabled = !isMuted;
    e.target.classList.toggle('muted-state');
});

document.getElementById('deafen-btn').addEventListener('click', (e) => {
    isDeafened = !isDeafened;
    e.target.classList.toggle('muted-state');
    
    // Mute/unmute all incoming HTML audio elements
    const audioTags = document.querySelectorAll('.vc-audio-element');
    audioTags.forEach(audio => audio.muted = isDeafened);
});

function addVoiceUserUI(peerId, stream) {
    if (document.getElementById(`vc-user-${peerId}`)) return; // Prevent duplicates

    const userList = document.getElementById('voice-users-list');
    const div = document.createElement('div');
    div.classList.add('vc-user');
    div.id = `vc-user-${peerId}`;

    // Get their username from DB to display nicely
    get(child(ref(db), `users/${peerId}`)).then(snapshot => {
        const username = snapshot.exists() ? snapshot.val().username : peerId;
        
        div.innerHTML = `
            <span>👤 ${username}</span>
            <input type="range" min="0" max="1" step="0.01" value="1" id="vol-${peerId}">
            <audio id="audio-${peerId}" class="vc-audio-element" autoplay></audio>
        `;
        
        userList.appendChild(div);

        // Attach WebRTC stream to the <audio> tag
        const audioElement = document.getElementById(`audio-${peerId}`);
        audioElement.srcObject = stream;
        if(isDeafened) audioElement.muted = true;

        // Bind volume slider
        document.getElementById(`vol-${peerId}`).addEventListener('input', (e) => {
            audioElement.volume = e.target.value;
        });
    });
}

function removeVoiceUserUI(peerId) {
    const el = document.getElementById(`vc-user-${peerId}`);
    if (el) el.remove();
}


// --- MESSAGES (Same as before) ---
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