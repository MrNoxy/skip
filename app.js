import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, push, onChildAdded, onChildRemoved, onValue, set, get, child, remove, onDisconnect, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

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
let unsubscribeMessages = null; 
let unsubscribeMessagesRemoved = null; 
let messageToDeletePath = null; 
const appStartTime = Date.now(); 
let unreadState = { dms: new Set(), channels: new Set(), servers: new Set() };

// Voice State Tracking
let myPeer = null;
let myCurrentPeerId = null; 
let localAudioStream = null;
let activeCalls = {}; 
let currentVoiceChannel = null;
let isMuted = false;
let isDeafened = false;

const appContainer = document.getElementById('app-container');
const authSection = document.getElementById('auth-section');

// Safely generate base URL for invites
const appBaseUrl = window.location.href.split('?')[0];

function sanitizeEmail(email) { return email.replace(/\./g, ','); }

// ==========================================
// --- GLOBAL MODAL CONTROLLERS ---
// ==========================================

// 1. Custom Alert System
function customAlert(desc, title = "Notice") {
    document.getElementById('alert-modal-title').innerText = title;
    document.getElementById('alert-modal-desc').innerText = desc;
    document.getElementById('alert-modal').style.display = 'flex';
}
document.getElementById('alert-modal-ok').addEventListener('click', () => {
    document.getElementById('alert-modal').style.display = 'none';
});

// 2. Custom Input System
let currentInputCallback = null;

function openInputModal(title, placeholder, desc, callback, defaultValue = "") {
    document.getElementById('input-modal-title').innerText = title;
    document.getElementById('input-modal-field').placeholder = placeholder;
    document.getElementById('input-modal-field').value = defaultValue;
    
    const descEl = document.getElementById('input-modal-desc');
    if (desc) { descEl.innerText = desc; descEl.style.display = 'block'; }
    else { descEl.style.display = 'none'; }
    
    currentInputCallback = callback;
    document.getElementById('input-modal').style.display = 'flex';
    document.getElementById('input-modal-field').focus();
}

document.getElementById('input-modal-submit').addEventListener('click', () => {
    const val = document.getElementById('input-modal-field').value.trim();
    if (currentInputCallback) currentInputCallback(val);
    document.getElementById('input-modal').style.display = 'none';
});

document.getElementById('input-modal-cancel').addEventListener('click', () => {
    document.getElementById('input-modal').style.display = 'none';
});

document.getElementById('input-modal-field').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('input-modal-submit').click();
});


// --- AUTH & PROFILE ---
document.getElementById('register-btn').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const safeEmail = sanitizeEmail(email);
        const baseName = email.split('@')[0];
        const randomTag = Math.floor(1000 + Math.random() * 9000).toString(); 
        const defaultAvatar = `https://ui-avatars.com/api/?name=${baseName.charAt(0)}&background=5865F2&color=fff&size=150`;

        const profileData = { email: email, uid: userCredential.user.uid, username: baseName, tag: randomTag, avatar: defaultAvatar, status: 'online', saved_status: 'online' };

        await set(ref(db, `users/${safeEmail}`), profileData);
        await set(ref(db, `user_tags/${baseName}_${randomTag}`), safeEmail);
        customAlert("Registered successfully!", "Success");
    } catch (error) { customAlert(error.message, "Error"); }
});

document.getElementById('login-btn').addEventListener('click', () => {
    signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value)
        .catch(e => customAlert(e.message, "Login Error"));
});

document.getElementById('logout-btn').addEventListener('click', () => {
    leaveVoiceChannel();
    if (currentUserSafeEmail) set(ref(db, `users/${currentUserSafeEmail}/status`), 'offline');
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
                
                const currentStatus = myProfile.status || 'online';
                document.getElementById('my-status-indicator').className = `status-indicator status-${currentStatus}`;
            }
        });

        // Smart Online Status Tracking
        const connectedRef = ref(db, '.info/connected');
        onValue(connectedRef, (snap) => {
            if (snap.val() === true) {
                const myStatusRef = ref(db, `users/${currentUserSafeEmail}/status`);
                const mySavedStatusRef = ref(db, `users/${currentUserSafeEmail}/saved_status`);
                
                onDisconnect(myStatusRef).set('offline');
                
                get(mySavedStatusRef).then(sSnap => {
                    const savedState = sSnap.val() || 'online';
                    set(myStatusRef, savedState);
                });
            }
        });

        initVoiceChat(); 
        loadMyServers();
        loadFriendsList();
        startNotificationListeners(); 

        // Check if joined via Link
        const urlParams = new URLSearchParams(window.location.search);
        const inviteParam = urlParams.get('invite');
        if (inviteParam) {
            await joinServerByCode(inviteParam);
            window.history.replaceState({}, document.title, appBaseUrl); // Clean URL
        }

    } else {
        authSection.style.display = 'block';
        appContainer.style.display = 'none';
    }
});

// --- PROFILE & STATUS MODALS ---
const profileModal = document.getElementById('profile-modal');
let tempBase64Avatar = null;

document.getElementById('user-controls').addEventListener('click', (e) => {
    if(e.target.id === 'logout-btn' || e.target.id === 'my-status-indicator' || e.target.closest('#status-selector')) return; 
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
    if(!newUsername || !newTag) return customAlert("Fields cannot be empty", "Error");

    const oldDbTag = `${myProfile.username}_${myProfile.tag}`;
    const newDbTag = `${newUsername}_${newTag}`;

    await remove(ref(db, `user_tags/${oldDbTag}`)); 
    await set(ref(db, `user_tags/${newDbTag}`), currentUserSafeEmail); 
    await set(ref(db, `users/${currentUserSafeEmail}/username`), newUsername);
    await set(ref(db, `users/${currentUserSafeEmail}/tag`), newTag);
    await set(ref(db, `users/${currentUserSafeEmail}/avatar`), tempBase64Avatar);

    profileModal.style.display = 'none';
});

// Status Dropdown Logic
document.getElementById('my-status-indicator').addEventListener('click', (e) => {
    e.stopPropagation();
    const selector = document.getElementById('status-selector');
    selector.style.display = selector.style.display === 'none' ? 'block' : 'none';
});

document.querySelectorAll('.status-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
        const newStatus = e.target.getAttribute('data-status');
        set(ref(db, `users/${currentUserSafeEmail}/status`), newStatus);
        set(ref(db, `users/${currentUserSafeEmail}/saved_status`), newStatus); 
        document.getElementById('status-selector').style.display = 'none';
    });
});

document.addEventListener('click', (e) => {
    const statusSelector = document.getElementById('status-selector');
    if (statusSelector && !e.target.closest('#user-controls')) statusSelector.style.display = 'none';
    const serverDropdown = document.getElementById('server-dropdown');
    if (serverDropdown && !e.target.closest('#sidebar-header')) serverDropdown.style.display = 'none';
});

// --- NAVIGATION & FRIENDS ---
document.getElementById('home-btn').addEventListener('click', () => {
    document.body.classList.remove('mobile-chat-active'); 
    currentServerId = null;
    document.getElementById('server-name-display').innerText = "Friends & DMs";
    document.getElementById('server-dropdown-arrow').style.display = 'none';
    document.getElementById('add-friend-btn').style.display = 'block';
    document.getElementById('server-dropdown').style.display = 'none';
    loadFriendsList();
});

document.getElementById('mobile-back-btn').addEventListener('click', () => {
    document.body.classList.remove('mobile-chat-active');
});

document.getElementById('add-friend-btn').addEventListener('click', () => {
    openInputModal("Add Friend", "e.g. noxy#6996", "Enter your friend's tag below to add them:", async (inputTag) => {
        if (!inputTag) return;
        if(inputTag.startsWith('@')) inputTag = inputTag.substring(1);
        const dbSearchTag = inputTag.replace('#', '_');
        
        const tagSnapshot = await get(child(ref(db), `user_tags/${dbSearchTag}`));
        if (tagSnapshot.exists()) {
            const friendSafeEmail = tagSnapshot.val();
            if(friendSafeEmail === currentUserSafeEmail) return customAlert("You can't add yourself!", "Wait a minute...");

            const friendProfileSnap = await get(child(ref(db), `users/${friendSafeEmail}`));
            const friendProfile = friendProfileSnap.val();
            const dmsArray = [currentUserSafeEmail, friendSafeEmail].sort();
            const dmId = dmsArray.join('_');

            await set(ref(db, `users/${currentUserSafeEmail}/friends/${friendSafeEmail}`), { username: friendProfile.username, tag: friendProfile.tag, avatar: friendProfile.avatar, dmId: dmId });
            await set(ref(db, `users/${friendSafeEmail}/friends/${currentUserSafeEmail}`), { username: myProfile.username, tag: myProfile.tag, avatar: myProfile.avatar, dmId: dmId });
            customAlert(`Added ${inputTag} to friends!`, "Success");
        } else { customAlert("User not found. Check the tag and try again.", "Error"); }
    });
});

function loadFriendsList() {
    const channelList = document.getElementById('channel-list');
    onValue(ref(db, `users/${currentUserSafeEmail}/friends`), (snapshot) => {
        channelList.innerHTML = '';
        snapshot.forEach((childSnapshot) => {
            const friendSafeEmail = childSnapshot.key;
            const friendData = childSnapshot.val();
            const friendDiv = document.createElement('div');
            friendDiv.classList.add('channel-item', 'friend-item');
            friendDiv.id = `dm-${friendData.dmId}`;
            
            friendDiv.innerHTML = `
                <div class="avatar-container">
                    <img src="${friendData.avatar}" class="avatar-small">
                    <div class="status-indicator status-offline" id="status-${friendSafeEmail}"></div>
                </div>
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

            onValue(ref(db, `users/${friendSafeEmail}/status`), (statusSnap) => {
                const status = statusSnap.val() || 'offline';
                const statusIndicator = document.getElementById(`status-${friendSafeEmail}`);
                if(statusIndicator) {
                    statusIndicator.className = `status-indicator status-${status}`;
                }
            });

            if (unreadState.dms.has(friendData.dmId)) updateBadge(`dm-${friendData.dmId}`, true, false);
        });
    });
}

// --- SERVERS & CHANNELS ---
document.getElementById('create-server-btn').addEventListener('click', () => {
    openInputModal("Create Server", "Server Name", "Give your new server a personality and a name:", (serverName) => {
        if (serverName) {
            const newServerRef = push(ref(db, 'servers'));
            const serverId = newServerRef.key;
            set(newServerRef, { name: serverName, owner: auth.currentUser.email });
            set(ref(db, `server_members/${serverId}/${currentUserSafeEmail}`), true);
            set(ref(db, `users/${currentUserSafeEmail}/servers/${serverId}`), true);
            push(ref(db, `channels/${serverId}`), { name: "general", type: "text" });
            push(ref(db, `channels/${serverId}`), { name: "General Voice", type: "voice" }); 
        }
    });
});

async function joinServerByCode(codeToJoin) {
    const snapshot = await get(child(ref(db), `servers/${codeToJoin}`));
    if (snapshot.exists()) {
        await set(ref(db, `server_members/${codeToJoin}/${currentUserSafeEmail}`), true);
        await set(ref(db, `users/${currentUserSafeEmail}/servers/${codeToJoin}`), true);
        customAlert("Joined server successfully!", "Success");
    } else { customAlert("Invalid invite link or code.", "Error"); }
}

document.getElementById('join-server-btn').addEventListener('click', () => {
    openInputModal("Join Server", "Invite Link or Code", "Enter an invite link or code to join a server:", async (input) => {
        if (!input) return;
        let inviteCode = input;
        if (input.includes('invite=')) {
            inviteCode = input.split('invite=')[1].split('&')[0];
        } else if (input.includes('/')) {
            inviteCode = input.split('/').pop();
        }
        await joinServerByCode(inviteCode);
    });
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
                    serverDiv.id = `server-${serverId}`;
                    serverDiv.innerText = serverData.name.charAt(0).toUpperCase();
                    
                    serverDiv.addEventListener('click', () => {
                        document.body.classList.remove('mobile-chat-active');
                        currentServerId = serverId;
                        document.getElementById('server-name-display').innerText = serverData.name;
                        document.getElementById('server-dropdown-arrow').style.display = 'inline';
                        document.getElementById('add-friend-btn').style.display = 'none';
                        loadChannels(serverId);
                    });
                    serverList.appendChild(serverDiv);
                    
                    if (unreadState.servers.has(serverId)) updateBadge(`server-${serverId}`, true, true);
                }
            });
        });
    });
}

// Server Header Menu Logic
document.getElementById('server-header-clickable').addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentServerId) {
        const dropdown = document.getElementById('server-dropdown');
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    }
});

document.getElementById('menu-server-settings').addEventListener('click', () => { 
    customAlert("Server Settings module coming soon!"); 
    document.getElementById('server-dropdown').style.display='none';
});

document.getElementById('menu-add-text').addEventListener('click', () => {
    openInputModal("Add Text Channel", "new-channel", "Create a new text channel:", (channelName) => {
        if (channelName && currentServerId) push(ref(db, `channels/${currentServerId}`), { name: channelName.toLowerCase(), type: "text" });
    });
    document.getElementById('server-dropdown').style.display='none';
});

document.getElementById('menu-add-voice').addEventListener('click', () => {
    openInputModal("Add Voice Channel", "Lounge", "Create a new voice channel:", (channelName) => {
        if (channelName && currentServerId) push(ref(db, `channels/${currentServerId}`), { name: channelName, type: "voice" });
    });
    document.getElementById('server-dropdown').style.display='none';
});

document.getElementById('menu-invite').addEventListener('click', () => {
    if (currentServerId) {
        const inviteLink = `${appBaseUrl}?invite=${currentServerId}`;
        navigator.clipboard.writeText(inviteLink).then(() => {
            customAlert(`Invite link copied to clipboard!\n\n${inviteLink}`, "Success");
        }).catch(err => {
            openInputModal("Copy Link", "Link...", "Copy this link manually:", (val) => {}, inviteLink);
        });
    }
    document.getElementById('server-dropdown').style.display='none';
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
            channelDiv.id = `channel-${channelId}`;
            
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

            if (unreadState.channels.has(channelId)) updateBadge(`channel-${channelId}`, true, false);
        });
    });
}

// --- VOICE CHAT ENGINE ---
function initVoiceChat() {
    myPeer = new Peer(); 

    myPeer.on('open', id => {
        myCurrentPeerId = id;
    });

    myPeer.on('error', err => console.error('PeerJS Error:', err));

    myPeer.on('call', call => {
        call.answer(localAudioStream);
        const callerEmail = call.metadata ? call.metadata.callerEmail : call.peer;
        call.on('stream', userAudioStream => { addVoiceUserUI(callerEmail, userAudioStream); });
        activeCalls[callerEmail] = call;
        call.on('close', () => removeVoiceUserUI(callerEmail));
    });
}

async function joinVoiceChannel(serverId, channelId) {
    if (currentVoiceChannel === channelId) return; 
    if (!myCurrentPeerId) return customAlert("Voice server connecting. Give it a sec!");

    leaveVoiceChannel(); 

    try {
        localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        currentVoiceChannel = channelId;
        document.getElementById('voice-area').style.display = 'flex';

        const vcRef = ref(db, `voice_rosters/${serverId}/${channelId}/${currentUserSafeEmail}`);
        await set(vcRef, myCurrentPeerId); 
        onDisconnect(vcRef).remove();

        onValue(ref(db, `voice_rosters/${serverId}/${channelId}`), (snapshot) => {
            snapshot.forEach((child) => {
                const peerEmail = child.key; 
                const peerJsId = child.val(); 
                if (peerEmail !== currentUserSafeEmail && !activeCalls[peerEmail]) {
                    connectToNewUser(peerEmail, peerJsId, localAudioStream);
                }
            });
        });
    } catch (err) { customAlert("Microphone access denied. Check your browser permissions.", "Error"); }
}

function connectToNewUser(peerEmail, peerJsId, stream) {
    if (!myPeer || !myCurrentPeerId) return;
    const call = myPeer.call(peerJsId, stream, { metadata: { callerEmail: currentUserSafeEmail } });
    if (!call) return; 
    
    call.on('stream', userAudioStream => { addVoiceUserUI(peerEmail, userAudioStream); });
    call.on('close', () => removeVoiceUserUI(peerEmail));
    activeCalls[peerEmail] = call;
}

function leaveVoiceChannel() {
    if (!currentVoiceChannel) return;

    Object.keys(activeCalls).forEach(peerEmail => {
        activeCalls[peerEmail].close();
        removeVoiceUserUI(peerEmail);
    });
    activeCalls = {};

    if (localAudioStream) localAudioStream.getTracks().forEach(track => track.stop());

    remove(ref(db, `voice_rosters/${currentServerId}/${currentVoiceChannel}/${currentUserSafeEmail}`));

    currentVoiceChannel = null;
    document.getElementById('voice-area').style.display = 'none';
    document.getElementById('voice-users-list').innerHTML = ''; 
}

document.getElementById('disconnect-vc-btn').addEventListener('click', leaveVoiceChannel);

document.getElementById('mute-btn').addEventListener('click', (e) => {
    isMuted = !isMuted;
    if(localAudioStream) localAudioStream.getAudioTracks()[0].enabled = !isMuted;
    e.target.classList.toggle('muted-state');
});

document.getElementById('deafen-btn').addEventListener('click', (e) => {
    isDeafened = !isDeafened;
    e.target.classList.toggle('muted-state');
    document.querySelectorAll('.vc-audio-element').forEach(audio => audio.muted = isDeafened);
});

function addVoiceUserUI(peerEmail, stream) {
    if (document.getElementById(`vc-user-${peerEmail}`)) return; 
    const userList = document.getElementById('voice-users-list');
    const div = document.createElement('div');
    div.classList.add('vc-user');
    div.id = `vc-user-${peerEmail}`;

    get(child(ref(db), `users/${peerEmail}`)).then(snapshot => {
        const username = snapshot.exists() ? snapshot.val().username : peerEmail;
        div.innerHTML = `
            <span>👤 ${username}</span>
            <input type="range" min="0" max="1" step="0.01" value="1" id="vol-${peerEmail}">
            <audio id="audio-${peerEmail}" class="vc-audio-element" autoplay></audio>
        `;
        userList.appendChild(div);

        const audioElement = document.getElementById(`audio-${peerEmail}`);
        audioElement.srcObject = stream;
        if(isDeafened) audioElement.muted = true;
        document.getElementById(`vol-${peerEmail}`).addEventListener('input', (e) => {
            audioElement.volume = e.target.value;
        });
    });
}

function removeVoiceUserUI(peerEmail) {
    const el = document.getElementById(`vc-user-${peerEmail}`);
    if (el) el.remove();
}

// --- MESSAGES & NOTIFICATIONS ---
function enableChat() {
    document.getElementById('msg-input').disabled = false;
    document.getElementById('send-btn').disabled = false;
    document.getElementById('upload-img-btn').disabled = false; 
    document.body.classList.add('mobile-chat-active'); 
}

function loadMessages(dbPath) {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.innerHTML = ''; 
    
    if (unsubscribeMessages) unsubscribeMessages();
    if (unsubscribeMessagesRemoved) unsubscribeMessagesRemoved();

    unsubscribeMessages = onChildAdded(ref(db, dbPath), (snapshot) => {
        const data = snapshot.val();
        const msgElement = document.createElement('div');
        msgElement.classList.add('message');
        msgElement.id = `msg-${snapshot.key}`;
        
        let contentHtml = `<div style="margin-left: 42px; word-break: break-word;">${data.text || ''}</div>`;
        if (data.imageUrl) {
            contentHtml += `<img src="${data.imageUrl}" class="message-image" style="margin-left: 42px;">`;
        }
        
        let deleteBtnHtml = '';
        if (data.sender === auth.currentUser.email) {
            deleteBtnHtml = `<button class="msg-delete-btn">🗑️ Delete</button>`;
        }

        msgElement.innerHTML = `
            <div class="message-header">
                <img src="${data.avatar}" class="avatar-small">
                <span class="message-sender">${data.username}</span>
                <span style="font-size: 0.8em; color: gray;">${new Date(data.timestamp).toLocaleTimeString()}</span>
                ${deleteBtnHtml}
            </div>
            ${contentHtml}
        `;
        messagesDiv.appendChild(msgElement);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        const delBtn = msgElement.querySelector('.msg-delete-btn');
        if (delBtn) {
            delBtn.addEventListener('click', () => {
                messageToDeletePath = `${dbPath}/${snapshot.key}`;
                document.getElementById('delete-modal').style.display = 'flex';
            });
        }

        const imgEl = msgElement.querySelector('.message-image');
        if (imgEl) {
            imgEl.addEventListener('click', () => {
                document.getElementById('enlarged-image').src = data.imageUrl;
                document.getElementById('download-image-btn').href = data.imageUrl;
                document.getElementById('image-modal').style.display = 'flex';
            });
        }
    });

    unsubscribeMessagesRemoved = onChildRemoved(ref(db, dbPath), (snapshot) => {
        const msgEl = document.getElementById(`msg-${snapshot.key}`);
        if(msgEl) msgEl.remove();
    });

    if (chatType === 'dm') clearUnread('dm', currentChatId);
    else if (chatType === 'server') clearUnread('channel', currentChatId, currentServerId);
}

document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
    if (messageToDeletePath) {
        await remove(ref(db, messageToDeletePath));
        messageToDeletePath = null;
        document.getElementById('delete-modal').style.display = 'none';
    }
});

document.getElementById('cancel-delete-btn').addEventListener('click', () => {
    messageToDeletePath = null;
    document.getElementById('delete-modal').style.display = 'none';
});


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

// --- IMAGE UPLOAD LOGIC ---
document.getElementById('upload-img-btn').addEventListener('click', () => {
    document.getElementById('image-upload').click();
});

document.getElementById('image-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file || !currentChatId) return;

    if (file.size > 2 * 1024 * 1024) {
        customAlert("File too large. Please select an image under 2MB.", "Error");
        return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
        const base64Image = reader.result;
        const path = chatType === 'server' ? `messages/${currentChatId}` : `dms/${currentChatId}`;
        
        push(ref(db, path), {
            sender: auth.currentUser.email,
            username: myProfile.username,
            avatar: myProfile.avatar,
            text: "", 
            imageUrl: base64Image,
            timestamp: Date.now()
        });

        document.getElementById('image-upload').value = "";
    };
    reader.readAsDataURL(file);
});

document.getElementById('close-image-modal').addEventListener('click', () => {
    document.getElementById('image-modal').style.display = 'none';
});

// --- NOTIFICATION ENGINE ---
function startNotificationListeners() {
    onValue(ref(db, `users/${currentUserSafeEmail}/friends`), (snap) => {
        snap.forEach(childSnap => {
            const friend = childSnap.val();
            const dmRef = query(ref(db, `dms/${friend.dmId}`), limitToLast(1));
            onChildAdded(dmRef, (msgSnap) => {
                const msg = msgSnap.val();
                if (currentChatId !== friend.dmId && msg.timestamp > appStartTime) markUnread('dm', friend.dmId);
            });
        });
    });

    onValue(ref(db, `users/${currentUserSafeEmail}/servers`), (snap) => {
        snap.forEach(childSnap => {
            const serverId = childSnap.key;
            onValue(ref(db, `channels/${serverId}`), (chSnap) => {
                chSnap.forEach(chChild => {
                    const channelId = chChild.key;
                    if (chChild.val().type === 'text') {
                        const chRef = query(ref(db, `messages/${channelId}`), limitToLast(1));
                        onChildAdded(chRef, (msgSnap) => {
                            const msg = msgSnap.val();
                            if (currentChatId !== channelId && msg.timestamp > appStartTime) markUnread('channel', channelId, serverId);
                        });
                    }
                });
            });
        });
    });
}

function markUnread(type, id, serverId = null) {
    if (type === 'dm') {
        unreadState.dms.add(id);
        updateBadge(`dm-${id}`, true, false);
        updateBadge('home-btn', true, true);
    } else if (type === 'channel') {
        unreadState.channels.add(id);
        unreadState.servers.add(serverId);
        updateBadge(`channel-${id}`, true, false);
        updateBadge(`server-${serverId}`, true, true);
    }
}

function clearUnread(type, id, serverId = null) {
    if (type === 'dm') {
        unreadState.dms.delete(id);
        updateBadge(`dm-${id}`, false);
        if (unreadState.dms.size === 0) updateBadge('home-btn', false);
    } else if (type === 'channel') {
        unreadState.channels.delete(id);
        updateBadge(`channel-${id}`, false);
        updateBadge(`server-${serverId}`, false); 
    }
}

function updateBadge(elementId, show, isDot = false) {
    const el = document.getElementById(elementId);
    if (!el) return;
    let badge = el.querySelector('.unread-indicator');
    if (show) {
        if (!badge) {
            badge = document.createElement('div');
            badge.className = `unread-indicator ${isDot ? 'dot' : 'pill'}`;
            el.appendChild(badge);
        }
    } else {
        if (badge) badge.remove();
    }
}