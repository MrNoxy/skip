import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, push, onChildAdded, onChildRemoved, onValue, set, get, child, remove, onDisconnect, query, limitToLast, update, orderByChild, startAt } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

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
let chatType = 'home'; 
let currentHomeTab = 'friends'; 
let currentUserSafeEmail = null;
let myProfile = {}; 
let myServerPerms = { admin: false, manageChannels: false, deleteMessages: false };
let myServerRoles = []; 

// Mention & Global Caching
let currentServerMembersList = [];
let currentDMOtherUser = null;
let serverRolesCache = {}; 
let globalUsersCache = {}; 
let activeFriendsData = []; 

// Listeners
let unsubscribeMessages = null; 
let unsubscribeMessagesRemoved = null; 
let unsubscribeMembers = null; 
let unsubscribeChannels = null;
let unsubscribeCategories = null;
let dmsNotifListener = null;
let serversNotifListener = null;

let replyingToMessage = null; 
let pendingAttachmentBase64 = null; 

let notificationsActive = false; 
const appStartTime = Date.now(); 
let unreadState = { dms: new Set(), channels: new Set(), servers: new Set() };

// Voice State Tracking
let myPeer = null; let myCurrentPeerId = null; let localAudioStream = null;
let activeCalls = {}; let currentVoiceChannel = null; let isMuted = false; let isDeafened = false;

const appContainer = document.getElementById('app-container');
const authSection = document.getElementById('auth-section');
const appBaseUrl = window.location.href.split('?')[0];

function sanitizeEmail(email) { return email.replace(/\./g, ','); }
function generateCode() { return Math.random().toString(36).substring(2, 10); }

// ==========================================
// --- GLOBAL MODAL CONTROLLERS ---
// ==========================================
function customAlert(desc, title = "Notice") {
    document.getElementById('alert-modal-title').innerText = title;
    document.getElementById('alert-modal-desc').innerText = desc;
    document.getElementById('alert-modal').style.display = 'flex';
}
document.getElementById('alert-modal-ok')?.addEventListener('click', () => { document.getElementById('alert-modal').style.display = 'none'; });

let confirmCallback = null;
function customConfirm(desc, title, callback) {
    document.getElementById('confirm-modal-title').innerText = title;
    document.getElementById('confirm-modal-desc').innerText = desc;
    confirmCallback = callback;
    document.getElementById('confirm-modal').style.display = 'flex';
}
document.getElementById('confirm-modal-yes')?.addEventListener('click', () => { if(confirmCallback) confirmCallback(true); document.getElementById('confirm-modal').style.display = 'none'; });
document.getElementById('confirm-modal-no')?.addEventListener('click', () => { if(confirmCallback) confirmCallback(false); document.getElementById('confirm-modal').style.display = 'none'; });

let currentInputCallback = null;
function openInputModal(title, placeholder, desc, callback, defaultValue = "") {
    document.getElementById('input-modal-title').innerText = title;
    document.getElementById('input-modal-field').placeholder = placeholder;
    document.getElementById('input-modal-field').value = defaultValue;
    const descEl = document.getElementById('input-modal-desc');
    if (desc) { descEl.innerText = desc; descEl.style.display = 'block'; } else { descEl.style.display = 'none'; }
    currentInputCallback = callback;
    document.getElementById('input-modal').style.display = 'flex';
    document.getElementById('input-modal-field').focus();
}
document.getElementById('input-modal-submit')?.addEventListener('click', () => {
    const val = document.getElementById('input-modal-field').value.trim();
    if (currentInputCallback) currentInputCallback(val);
    document.getElementById('input-modal').style.display = 'none';
});
document.getElementById('input-modal-cancel')?.addEventListener('click', () => { document.getElementById('input-modal').style.display = 'none'; });
document.getElementById('input-modal-field')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('input-modal-submit').click(); });

// ==========================================
// --- CONTEXT MENU ---
// ==========================================
let contextTarget = null;
const ctxMenu = document.getElementById('context-menu');

function showContextMenu(e, type, id) {
    e.preventDefault();
    if (type === 'channel' || type === 'category') {
        if (!myServerPerms.admin && !myServerPerms.manageChannels) return; 
        document.getElementById('ctx-delete').innerText = `🗑️ Delete ${type}`;
    } else if (type === 'dm' || type === 'friend') {
        document.getElementById('ctx-delete').innerText = type === 'dm' ? `🗑️ Close DM` : `🗑️ Remove Friend`;
    }
    
    contextTarget = { type, id };
    ctxMenu.style.display = 'block';
    
    const x = e.pageX || e.touches[0].pageX;
    const y = e.pageY || e.touches[0].pageY;
    ctxMenu.style.left = `${x}px`;
    ctxMenu.style.top = `${y}px`;
}

document.addEventListener('click', () => { if(ctxMenu) ctxMenu.style.display = 'none'; });

document.getElementById('ctx-delete')?.addEventListener('click', () => {
    if (contextTarget) {
        if(contextTarget.type === 'dm') {
            update(ref(db, `users/${currentUserSafeEmail}/friends/${contextTarget.id}`), { hidden: true });
        } else if(contextTarget.type === 'friend') {
            customConfirm("Are you sure you want to remove this friend?", "Remove Friend", (yes) => {
                if(yes) {
                    remove(ref(db, `users/${currentUserSafeEmail}/friends/${contextTarget.id}`));
                    remove(ref(db, `users/${contextTarget.id}/friends/${currentUserSafeEmail}`));
                }
            });
        } else if (currentServerId) {
            customConfirm(`Delete this ${contextTarget.type}?`, "Confirm Action", (yes) => {
                if(yes) {
                    if(contextTarget.type === 'channel') { remove(ref(db, `channels/${currentServerId}/${contextTarget.id}`)); remove(ref(db, `messages/${contextTarget.id}`)); } 
                    else if (contextTarget.type === 'category') { remove(ref(db, `categories/${currentServerId}/${contextTarget.id}`)); }
                }
            });
        }
    }
});

// ==========================================
// --- AUTH & PROFILE ---
// ==========================================
document.getElementById('register-btn')?.addEventListener('click', async () => {
    const email = document.getElementById('email').value; const pass = document.getElementById('password').value;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const safeEmail = sanitizeEmail(email); const baseName = email.split('@')[0];
        const randomTag = Math.floor(1000 + Math.random() * 9000).toString(); 
        const defaultAvatar = `https://ui-avatars.com/api/?name=${baseName.charAt(0)}&background=5865F2&color=fff&size=150`;

        await set(ref(db, `users/${safeEmail}`), { email, uid: userCredential.user.uid, username: baseName, tag: randomTag, avatar: defaultAvatar, status: 'online', saved_status: 'online' });
        await set(ref(db, `user_tags/${baseName}_${randomTag}`), safeEmail);
        customAlert("Registered successfully!", "Success");
    } catch (error) { customAlert(error.message, "Error"); }
});

document.getElementById('login-btn')?.addEventListener('click', () => {
    signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value).catch(e => customAlert(e.message, "Login Error"));
});

document.getElementById('logout-btn')?.addEventListener('click', () => {
    leaveVoiceChannel(); if (currentUserSafeEmail) set(ref(db, `users/${currentUserSafeEmail}/status`), 'offline'); signOut(auth);
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        authSection.style.display = 'none'; appContainer.style.display = 'flex'; currentUserSafeEmail = sanitizeEmail(user.email);
        
        onValue(ref(db, `users/${currentUserSafeEmail}`), (snapshot) => {
            if(snapshot.exists()) {
                myProfile = snapshot.val();
                document.getElementById('user-display').innerText = myProfile.username;
                document.getElementById('user-tag-display').innerText = `#${myProfile.tag}`;
                document.getElementById('my-avatar').src = myProfile.avatar;
                document.getElementById('my-status-indicator').className = `status-indicator status-${myProfile.status || 'online'}`;
            }
        });

        const connectedRef = ref(db, '.info/connected');
        onValue(connectedRef, (snap) => {
            if (snap.val() === true) {
                const myStatusRef = ref(db, `users/${currentUserSafeEmail}/status`);
                onDisconnect(myStatusRef).set('offline');
                get(ref(db, `users/${currentUserSafeEmail}/saved_status`)).then(sSnap => { set(myStatusRef, sSnap.val() || 'online'); });
            }
        });

        initVoiceChat(); loadMyServers(); loadFriendsList(); startNotificationListeners(); listenForFriendRequests();
        document.getElementById('home-btn').click(); // Force home view on load
        
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('invite')) { await joinServerByCode(urlParams.get('invite')); window.history.replaceState({}, document.title, appBaseUrl); }
    } else {
        authSection.style.display = 'block'; appContainer.style.display = 'none';
    }
});

// Profile Modals
const profileModal = document.getElementById('profile-modal');
let tempBase64Avatar = null;
document.getElementById('user-controls')?.addEventListener('click', (e) => {
    if(e.target.id === 'logout-btn' || e.target.id === 'my-status-indicator' || e.target.closest('#status-selector')) return; 
    document.getElementById('edit-username').value = myProfile.username; document.getElementById('edit-tag').value = myProfile.tag; document.getElementById('profile-preview').src = myProfile.avatar;
    tempBase64Avatar = myProfile.avatar; profileModal.style.display = 'flex';
});
document.getElementById('close-profile-btn')?.addEventListener('click', () => profileModal.style.display = 'none');
document.getElementById('avatar-upload')?.addEventListener('change', (e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onloadend = () => { tempBase64Avatar = reader.result; document.getElementById('profile-preview').src = tempBase64Avatar; }; reader.readAsDataURL(file); } });
document.getElementById('save-profile-btn')?.addEventListener('click', async () => {
    const newUsername = document.getElementById('edit-username').value.trim(); const newTag = document.getElementById('edit-tag').value.trim();
    if(!newUsername || !newTag) return customAlert("Fields cannot be empty", "Error");
    await remove(ref(db, `user_tags/${myProfile.username}_${myProfile.tag}`)); 
    await set(ref(db, `user_tags/${newUsername}_${newTag}`), currentUserSafeEmail); 
    await update(ref(db, `users/${currentUserSafeEmail}`), {username: newUsername, tag: newTag, avatar: tempBase64Avatar});
    profileModal.style.display = 'none';
});

// Status Dropdown
document.getElementById('my-status-indicator')?.addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('status-selector').style.display = 'block'; });
document.querySelectorAll('.status-option').forEach(opt => { opt.addEventListener('click', (e) => { const s = e.target.getAttribute('data-status'); update(ref(db, `users/${currentUserSafeEmail}`), {status: s, saved_status: s}); document.getElementById('status-selector').style.display = 'none'; }); });
document.addEventListener('click', (e) => { if (!e.target.closest('#user-controls')) { const s = document.getElementById('status-selector'); if(s) s.style.display = 'none'; } if (!e.target.closest('#sidebar-header') && !e.target.closest('#server-settings-modal')) { const sd = document.getElementById('server-dropdown'); if(sd) sd.style.display = 'none'; } });

// ==========================================
// --- NAVIGATION, HOME & FRIENDS VIEW ---
// ==========================================
function switchToHomeView() {
    document.body.classList.remove('mobile-chat-active');
    document.body.classList.add('mobile-home-active');
    
    chatType = 'home'; currentChatId = null; currentServerId = null;
    document.getElementById('server-name-display').innerText = "Friends & DMs";
    document.getElementById('server-dropdown-arrow').style.display = 'none';
    
    document.getElementById('home-sidebar-content').style.display = 'block';
    document.getElementById('channel-list').style.display = 'none';
    document.getElementById('chat-area').style.display = 'none';
    document.getElementById('home-area').style.display = 'flex';
    document.getElementById('server-dropdown').style.display = 'none';
    
    if(unsubscribeMembers) { unsubscribeMembers(); unsubscribeMembers = null; }
    if(unsubscribeChannels) { unsubscribeChannels(); unsubscribeChannels = null; }
    if(unsubscribeCategories) { unsubscribeCategories(); unsubscribeCategories = null; }
    
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
    document.getElementById('home-btn').classList.add('active');

    renderHomeContent();
}

document.getElementById('home-btn')?.addEventListener('click', switchToHomeView);

document.getElementById('mobile-back-btn')?.addEventListener('click', () => { document.body.classList.remove('mobile-chat-active'); });
document.getElementById('mobile-back-btn-home')?.addEventListener('click', () => { document.body.classList.remove('mobile-home-active'); });

document.getElementById('nav-friends-btn')?.addEventListener('click', () => { currentHomeTab = 'friends'; if(chatType !== 'home') switchToHomeView(); else renderHomeContent(); });
document.getElementById('nav-requests-btn')?.addEventListener('click', () => { currentHomeTab = 'requests'; if(chatType !== 'home') switchToHomeView(); else renderHomeContent(); });

function renderHomeContent() {
    if (chatType !== 'home') return;
    
    document.querySelectorAll('.home-nav-item').forEach(el => el.classList.remove('active'));
    
    const navF = document.getElementById('nav-friends-btn');
    const navR = document.getElementById('nav-requests-btn');
    const hF = document.getElementById('home-header-friends');
    const hR = document.getElementById('home-header-requests');
    const content = document.getElementById('home-content');
    
    if(currentHomeTab === 'friends') {
        navF.classList.add('active'); 
        hF.style.display = 'flex'; hR.style.display = 'none';
        
        content.innerHTML = '';
        if(activeFriendsData.length === 0) { content.innerHTML = '<div style="color: gray; text-align: center; margin-top: 50px;">You have no friends. Add some!</div>'; return; }
        
        activeFriendsData.forEach(fData => {
            const cachedUser = globalUsersCache[fData.email] || {};
            const displayAvatar = cachedUser.avatar || "";
            const displayName = cachedUser.username || "Loading...";
            const displayStatus = cachedUser.status || "offline";
            
            const div = document.createElement('div'); div.className = 'friend-card';
            div.innerHTML = `
                <div class="friend-card-left">
                    <div class="avatar-container"><img src="${displayAvatar}" class="avatar-small"><div class="status-indicator status-${displayStatus}"></div></div>
                    <div style="display:flex; flex-direction:column;">
                        <span style="font-weight:bold; color:white; font-size:15px;">${displayName}</span>
                        <span style="font-size:12px; color:gray;">${displayStatus}</span>
                    </div>
                </div>
                <div class="friend-card-right">
                    <div class="action-circle message-btn" title="Message">💬</div>
                    <div class="action-circle red remove-btn" title="Remove Friend">✖</div>
                </div>
            `;
            
            div.querySelector('.message-btn').addEventListener('click', () => openDM(fData.dmId, fData.email));
            div.querySelector('.remove-btn').addEventListener('click', () => {
                customConfirm(`Remove ${displayName} from your friends list?`, "Remove Friend", (yes) => {
                    if(yes) {
                        remove(ref(db, `users/${currentUserSafeEmail}/friends/${fData.email}`));
                        remove(ref(db, `users/${fData.email}/friends/${currentUserSafeEmail}`));
                    }
                });
            });
            content.appendChild(div);
        });

    } else if (currentHomeTab === 'requests') {
        navR.classList.add('active');
        hF.style.display = 'none'; hR.style.display = 'flex';
        
        content.innerHTML = '<div style="color: gray; text-align: center; margin-top: 50px;">Loading requests...</div>';
        get(ref(db, `friend_requests/${currentUserSafeEmail}`)).then(snap => {
            content.innerHTML = '';
            if(!snap.exists() || Object.keys(snap.val()).length === 0) { content.innerHTML = '<div style="color: gray; text-align: center; margin-top: 50px;">No pending requests.</div>'; return; }
            
            snap.forEach(child => {
                const senderEmail = child.key; const sData = child.val();
                const div = document.createElement('div'); div.className = 'friend-card';
                div.innerHTML = `
                    <div class="friend-card-left">
                        <img src="${sData.avatar}" class="avatar-small">
                        <span style="font-weight:bold; color:white; font-size:15px;">${sData.username}</span>
                    </div>
                    <div class="friend-card-right">
                        <div class="action-circle green accept-fr" title="Accept">✔</div>
                        <div class="action-circle red decline-fr" title="Decline">✖</div>
                    </div>
                `;
                div.querySelector('.accept-fr').addEventListener('click', async () => {
                    const dmId = [currentUserSafeEmail, senderEmail].sort().join('_');
                    await set(ref(db, `users/${currentUserSafeEmail}/friends/${senderEmail}`), { dmId: dmId, lastActivity: Date.now(), hidden: false });
                    await set(ref(db, `users/${senderEmail}/friends/${currentUserSafeEmail}`), { dmId: dmId, lastActivity: Date.now(), hidden: false });
                    await remove(ref(db, `friend_requests/${currentUserSafeEmail}/${senderEmail}`));
                    renderHomeContent();
                });
                div.querySelector('.decline-fr').addEventListener('click', async () => {
                    await remove(ref(db, `friend_requests/${currentUserSafeEmail}/${senderEmail}`));
                    renderHomeContent();
                });
                content.appendChild(div);
            });
        });
    }
}

function listenForFriendRequests() {
    onValue(ref(db, `friend_requests/${currentUserSafeEmail}`), (snap) => {
        const badge = document.getElementById('fr-badge');
        if(badge) { if(snap.exists() && Object.keys(snap.val()).length > 0) { badge.style.display = 'block'; } else { badge.style.display = 'none'; } }
        if(currentHomeTab === 'requests' && chatType === 'home') renderHomeContent();
    });
}

document.getElementById('add-friend-btn-green')?.addEventListener('click', () => {
    openInputModal("Add Friend", "e.g. noxy#6996", "Send a friend request to:", async (inputTag) => {
        if (!inputTag) return; if(inputTag.startsWith('@')) inputTag = inputTag.substring(1);
        const tagSnap = await get(child(ref(db), `user_tags/${inputTag.replace('#', '_')}`));
        if (tagSnap.exists()) {
            const friendSafeEmail = tagSnap.val();
            if(friendSafeEmail === currentUserSafeEmail) return customAlert("You can't add yourself!", "Wait a minute...");
            const fSnap = await get(ref(db, `users/${currentUserSafeEmail}/friends/${friendSafeEmail}`));
            if(fSnap.exists()) return customAlert("You are already friends!", "Notice");

            await set(ref(db, `friend_requests/${friendSafeEmail}/${currentUserSafeEmail}`), { username: myProfile.username, avatar: myProfile.avatar, timestamp: Date.now() });
            customAlert(`Friend request sent to ${inputTag}!`, "Success");
        } else { customAlert("User not found.", "Error"); }
    });
});

function loadFriendsList() {
    const channelList = document.getElementById('dm-list');
    onValue(ref(db, `users/${currentUserSafeEmail}/friends`), (snapshot) => {
        channelList.innerHTML = ''; activeFriendsData = [];
        let dmsArray = [];
        snapshot.forEach((childSnapshot) => {
            const data = childSnapshot.val(); data.email = childSnapshot.key;
            activeFriendsData.push(data);
            if(!data.hidden) dmsArray.push(data);
        });

        dmsArray.sort((a,b) => (b.lastActivity || 0) - (a.lastActivity || 0));

        dmsArray.forEach((fDataStatic) => {
            const fEmail = fDataStatic.email;
            const cachedUser = globalUsersCache[fEmail] || {};
            const displayAvatar = cachedUser.avatar || "";
            const displayName = cachedUser.username || "Loading...";
            const displayStatus = cachedUser.status || "offline";

            const div = document.createElement('div'); div.classList.add('channel-item', 'friend-item'); div.id = `dm-${fDataStatic.dmId}`;
            div.innerHTML = `<div class="avatar-container"><img src="${displayAvatar}" class="avatar-small" id="f-avatar-${fEmail}"><div class="status-indicator status-${displayStatus}" id="status-${fEmail}"></div></div><span id="f-name-${fEmail}">${displayName}</span>`;
            
            div.addEventListener('contextmenu', (e) => showContextMenu(e, 'dm', fEmail));
            let touchTimer; div.addEventListener('touchstart', (e) => { touchTimer = setTimeout(() => showContextMenu(e, 'dm', fEmail), 500); }); div.addEventListener('touchend', () => clearTimeout(touchTimer)); div.addEventListener('touchmove', () => clearTimeout(touchTimer));

            if (chatType === 'dm' && currentChatId === fDataStatic.dmId) div.classList.add('active');

            onValue(ref(db, `users/${fEmail}`), (userSnap) => {
                if(userSnap.exists()) {
                    const uData = userSnap.val();
                    globalUsersCache[fEmail] = uData; 
                    
                    const img = document.getElementById(`f-avatar-${fEmail}`); if(img) img.src = uData.avatar;
                    const name = document.getElementById(`f-name-${fEmail}`); if(name) name.innerText = uData.username;
                    const stat = document.getElementById(`status-${fEmail}`); if(stat) stat.className = `status-indicator status-${uData.status || 'offline'}`;
                    
                    div.onclick = () => openDM(fDataStatic.dmId, fEmail);
                    if(chatType === 'home' && currentHomeTab === 'friends') renderHomeContent();
                }
            });
            channelList.appendChild(div);
            if (unreadState.dms.has(fDataStatic.dmId)) updateBadge(`dm-${fDataStatic.dmId}`, true, false, false);
        });
        
        if(chatType === 'home' && currentHomeTab === 'friends') renderHomeContent();
    });
}

function openDM(dmId, friendEmail) {
    chatType = 'dm'; currentChatId = dmId; 
    const uData = globalUsersCache[friendEmail];
    currentDMOtherUser = uData;
    
    update(ref(db, `users/${currentUserSafeEmail}/friends/${friendEmail}`), { hidden: false });
    
    document.getElementById('home-area').style.display = 'none';
    document.getElementById('chat-area').style.display = 'flex';
    document.getElementById('chat-title').innerText = `@${uData.username}#${uData.tag}`;
    document.body.classList.add('mobile-chat-active');
    
    document.querySelectorAll('.home-nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    const activeDmEl = document.getElementById(`dm-${dmId}`);
    if(activeDmEl) activeDmEl.classList.add('active');

    enableChat(); loadMessages(`dms/${currentChatId}`, `@${uData.username}`);
}

// ==========================================
// --- SERVERS, CHANNELS, SETTINGS & MEMBERS ---
// ==========================================
document.getElementById('create-server-btn')?.addEventListener('click', () => {
    openInputModal("Create Server", "Server Name", "Give your server a name:", (serverName) => {
        if (serverName) {
            const serverId = generateCode();
            set(ref(db, `servers/${serverId}`), { name: serverName, owner: auth.currentUser.email });
            set(ref(db, `server_members/${serverId}/${currentUserSafeEmail}`), { role: 'owner' });
            set(ref(db, `users/${currentUserSafeEmail}/servers/${serverId}`), { order: Date.now() });
            const catId = push(ref(db, `categories/${serverId}`)).key;
            set(ref(db, `categories/${serverId}/${catId}`), { name: "Information", order: 0 });
            push(ref(db, `channels/${serverId}`), { name: "general", type: "text", categoryId: catId, order: 0 });
            push(ref(db, `channels/${serverId}`), { name: "General Voice", type: "voice", categoryId: catId, order: 1 }); 
        }
    });
});

async function joinServerByCode(codeToJoin) {
    const snapshot = await get(child(ref(db), `servers/${codeToJoin}`));
    if (snapshot.exists()) {
        await set(ref(db, `server_members/${codeToJoin}/${currentUserSafeEmail}`), { role: 'member' });
        await set(ref(db, `users/${currentUserSafeEmail}/servers/${codeToJoin}`), { order: Date.now() });
        customAlert("Joined server successfully!", "Success");
    } else { customAlert("Invalid invite link or code.", "Error"); }
}
document.getElementById('join-server-btn')?.addEventListener('click', () => { openInputModal("Join Server", "Invite Link or Code", "", async (input) => { if (!input) return; let code = input.includes('invite=') ? input.split('invite=')[1].split('&')[0] : input.split('/').pop(); await joinServerByCode(code); }); });

let dragServerEl = null;

function loadMyServers() {
    const serverList = document.getElementById('server-list');
    onValue(ref(db, `users/${currentUserSafeEmail}/servers`), async (snap) => {
        serverList.innerHTML = ''; let myServers = [];
        snap.forEach(child => { let d = typeof child.val() === 'object' ? child.val() : { order: 0 }; d.id = child.key; myServers.push(d); });
        myServers.sort((a,b) => (a.order || 0) - (b.order || 0));

        for(let i=0; i<myServers.length; i++) {
            const serverId = myServers[i].id; const sSnap = await get(child(ref(db), `servers/${serverId}`));
            if (sSnap.exists()) {
                const sData = sSnap.val();
                const div = document.createElement('div'); div.classList.add('server-icon'); div.id = `server-${serverId}`; div.draggable = true;
                if(sData.icon) { div.style.backgroundImage = `url(${sData.icon})`; } else { div.innerText = sData.name.charAt(0).toUpperCase(); }
                
                div.addEventListener('click', async () => {
                    document.body.classList.remove('mobile-chat-active'); currentServerId = serverId;
                    document.getElementById('server-name-display').innerText = sData.name;
                    document.getElementById('server-dropdown-arrow').style.display = 'inline';
                    
                    document.getElementById('home-sidebar-content').style.display = 'none';
                    document.getElementById('channel-list').style.display = 'block';
                    document.getElementById('home-area').style.display = 'none';
                    document.getElementById('chat-area').style.display = 'flex';
                    document.getElementById('messages').innerHTML = ''; 
                    
                    document.getElementById('toggle-members-btn').style.display = 'inline-block';
                    
                    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
                    div.classList.add('active');
                    document.getElementById('home-btn').classList.remove('active');

                    const myRoleSnap = await get(ref(db, `server_members/${serverId}/${currentUserSafeEmail}/role`));
                    const roleId = myRoleSnap.val();
                    myServerRoles = roleId && roleId !== 'member' ? [roleId] : [];
                    if (sData.owner === auth.currentUser.email || roleId === 'owner') { myServerPerms = { admin: true, manageChannels: true, deleteMessages: true }; myServerRoles.push('owner'); } 
                    else if (roleId && roleId !== 'member') { const pSnap = await get(ref(db, `servers/${serverId}/roles/${roleId}`)); if(pSnap.exists()) myServerPerms = pSnap.val().perms || {}; } 
                    else { myServerPerms = { admin: false, manageChannels: false, deleteMessages: false }; }

                    document.getElementById('menu-server-settings').style.display = myServerPerms.admin ? 'block' : 'none';
                    document.getElementById('menu-add-category').style.display = myServerPerms.manageChannels || myServerPerms.admin ? 'block' : 'none';
                    document.getElementById('menu-add-text').style.display = myServerPerms.manageChannels || myServerPerms.admin ? 'block' : 'none';
                    document.getElementById('menu-add-voice').style.display = myServerPerms.manageChannels || myServerPerms.admin ? 'block' : 'none';

                    initChannelSync(serverId); loadMemberList(serverId); 
                });

                div.addEventListener('dragstart', (e) => { dragServerEl = div; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/html', div.innerHTML); });
                div.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; div.classList.add('drag-over'); return false; });
                div.addEventListener('dragleave', () => div.classList.remove('drag-over'));
                div.addEventListener('drop', (e) => {
                    e.stopPropagation(); div.classList.remove('drag-over');
                    if (dragServerEl !== div) {
                        const srcId = dragServerEl.id.replace('server-', ''); const targetOrder = myServers[i].order || 0; const prevS = myServers[i-1]; const nextS = myServers[i+1]; const srcData = myServers.find(s=>s.id === srcId);
                        if((srcData.order||0) < targetOrder) update(ref(db, `users/${currentUserSafeEmail}/servers/${srcId}`), { order: nextS ? (targetOrder + nextS.order)/2 : targetOrder + 10 });
                        else update(ref(db, `users/${currentUserSafeEmail}/servers/${srcId}`), { order: prevS ? (targetOrder + prevS.order)/2 : targetOrder - 10 });
                    }
                    return false;
                });

                serverList.appendChild(div); if (unreadState.servers.has(serverId)) updateBadge(`server-${serverId}`, true, true, false);
            }
        }
    });
}

document.getElementById('server-header-clickable')?.addEventListener('click', (e) => { e.stopPropagation(); if (currentServerId) { const d = document.getElementById('server-dropdown'); d.style.display = d.style.display === 'none' ? 'block' : 'none'; } });
document.getElementById('menu-add-category')?.addEventListener('click', () => { openInputModal("Add Category", "Category Name", "", (name) => { if (name && currentServerId) { push(ref(db, `categories/${currentServerId}`), { name: name.toUpperCase(), order: Date.now() }); } }); document.getElementById('server-dropdown').style.display='none'; });
document.getElementById('menu-add-text')?.addEventListener('click', () => { openInputModal("Add Text Channel", "channel-name", "", (name) => { if (name && currentServerId) { push(ref(db, `channels/${currentServerId}`), { name: name.toLowerCase(), type: "text", order: Date.now() }); } }); document.getElementById('server-dropdown').style.display='none'; });
document.getElementById('menu-add-voice')?.addEventListener('click', () => { openInputModal("Add Voice Channel", "Lounge", "", (name) => { if (name && currentServerId) { push(ref(db, `channels/${currentServerId}`), { name: name, type: "voice", order: Date.now() }); } }); document.getElementById('server-dropdown').style.display='none'; });
document.getElementById('menu-invite')?.addEventListener('click', () => { if (currentServerId) { const link = `${appBaseUrl}?invite=${currentServerId}`; navigator.clipboard.writeText(link).then(() => { customAlert(`Link copied!\n${link}`, "Success"); }).catch(() => { openInputModal("Copy Link", "", "", ()=>{}, link); }); } document.getElementById('server-dropdown').style.display='none'; });

let tempServerIcon = null;
document.getElementById('menu-server-settings')?.addEventListener('click', async () => {
    document.getElementById('server-dropdown').style.display='none';
    const sSnap = await get(ref(db, `servers/${currentServerId}`)); const sData = sSnap.val();
    document.getElementById('ss-server-name').value = sData.name; const preview = document.getElementById('ss-icon-preview');
    if(sData.icon) { preview.style.backgroundImage = `url(${sData.icon})`; preview.innerText = ""; tempServerIcon = sData.icon; } else { preview.style.backgroundImage = 'none'; preview.innerText = sData.name.charAt(0); }
    document.getElementById('server-settings-modal').style.display = 'flex'; loadRoles();
});
document.getElementById('close-server-settings-btn')?.addEventListener('click', () => document.getElementById('server-settings-modal').style.display = 'none');
document.getElementById('ss-icon-upload')?.addEventListener('change', (e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onloadend = () => { tempServerIcon = reader.result; document.getElementById('ss-icon-preview').style.backgroundImage = `url(${tempServerIcon})`; document.getElementById('ss-icon-preview').innerText = ""; }; reader.readAsDataURL(file); } });
document.getElementById('ss-save-overview-btn')?.addEventListener('click', () => { const newName = document.getElementById('ss-server-name').value.trim(); if(newName && currentServerId) { update(ref(db, `servers/${currentServerId}`), {name: newName, icon: tempServerIcon}); customAlert("Server updated!"); } });

document.getElementById('delete-server-btn')?.addEventListener('click', async () => {
    customConfirm("Are you ABSOLUTELY sure you want to delete this server? This will wipe all channels, roles, and messages.", "Delete Server", async (yes) => {
        if(yes && currentServerId) {
            await remove(ref(db, `servers/${currentServerId}`)); await remove(ref(db, `server_members/${currentServerId}`)); await remove(ref(db, `channels/${currentServerId}`)); await remove(ref(db, `categories/${currentServerId}`)); await remove(ref(db, `users/${currentUserSafeEmail}/servers/${currentServerId}`));
            document.getElementById('server-settings-modal').style.display = 'none'; document.getElementById('home-btn').click(); customAlert("Server deleted successfully.");
        }
    });
});

document.getElementById('tab-overview')?.addEventListener('click', (e) => { e.target.style.color='white'; document.getElementById('tab-roles').style.color='gray'; document.getElementById('ss-overview').style.display='block'; document.getElementById('ss-roles').style.display='none'; });
document.getElementById('tab-roles')?.addEventListener('click', (e) => { e.target.style.color='white'; document.getElementById('tab-overview').style.color='gray'; document.getElementById('ss-roles').style.display='block'; document.getElementById('ss-overview').style.display='none'; });

let dragRoleEl = null;
function loadRoles() {
    const list = document.getElementById('ss-roles-list');
    onValue(ref(db, `servers/${currentServerId}/roles`), (snap) => {
        list.innerHTML = ''; let rolesArray = [];
        snap.forEach(c => { let data = c.val(); data.id = c.key; rolesArray.push(data); });
        rolesArray.sort((a,b) => (a.order || 0) - (b.order || 0));

        rolesArray.forEach((rData, index, arr) => {
            const roleId = rData.id; const div = document.createElement('div'); div.className = 'role-setting-item'; div.id = `role-set-${roleId}`; div.draggable = true;
            div.innerHTML = `<div style="color: ${rData.color}; font-weight: bold; pointer-events: none;">☰ ${rData.name}</div>
                <div><label style="font-size:11px; margin-right:5px;"><input type="checkbox" ${rData.perms.admin?'checked':''} class="r-perm" data-role="${roleId}" data-perm="admin"> Admin</label>
                <label style="font-size:11px; margin-right:5px;"><input type="checkbox" ${rData.perms.manageChannels?'checked':''} class="r-perm" data-role="${roleId}" data-perm="manageChannels"> Channels</label>
                <label style="font-size:11px;"><input type="checkbox" ${rData.perms.deleteMessages?'checked':''} class="r-perm" data-role="${roleId}" data-perm="deleteMessages"> Del Msg</label></div>`;
            div.addEventListener('dragstart', (e) => { dragRoleEl = div; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/html', div.innerHTML); });
            div.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; div.classList.add('drag-over'); return false; });
            div.addEventListener('dragleave', (e) => { div.classList.remove('drag-over'); });
            div.addEventListener('drop', (e) => { e.stopPropagation(); div.classList.remove('drag-over'); if (dragRoleEl !== div) { const srcId = dragRoleEl.id.replace('role-set-', ''); const targetOrder = rData.order || 0; const prevRole = arr[index - 1]; const nextRole = arr[index + 1]; const srcData = rolesArray.find(r => r.id === srcId); if ((srcData.order||0) < targetOrder) { update(ref(db, `servers/${currentServerId}/roles/${srcId}`), { order: nextRole ? (targetOrder + nextRole.order)/2 : targetOrder + 10 }); } else { update(ref(db, `servers/${currentServerId}/roles/${srcId}`), { order: prevRole ? (targetOrder + prevRole.order)/2 : targetOrder - 10 }); } } return false; });
            list.appendChild(div);
        });
        document.querySelectorAll('.r-perm').forEach(chk => { chk.addEventListener('change', (e) => { const rId = e.target.getAttribute('data-role'); const p = e.target.getAttribute('data-perm'); update(ref(db, `servers/${currentServerId}/roles/${rId}/perms`), { [p]: e.target.checked }); }); });
    });
}
document.getElementById('ss-create-role-btn')?.addEventListener('click', () => { const name = document.getElementById('ss-new-role-name').value; const color = document.getElementById('ss-new-role-color').value; if(name && currentServerId) { push(ref(db, `servers/${currentServerId}/roles`), { name, color, order: Date.now(), perms: {admin:false, manageChannels:false, deleteMessages:false} }); document.getElementById('ss-new-role-name').value = ''; } });

// Members System
let userToManageEmail = null;
document.getElementById('toggle-members-btn')?.addEventListener('click', () => { const sidebar = document.getElementById('member-sidebar'); if (sidebar.style.display === 'none') { sidebar.style.display = 'flex'; } else { sidebar.style.display = 'none'; } });
document.getElementById('close-members-mobile-btn')?.addEventListener('click', () => { document.getElementById('member-sidebar').style.display = 'none'; });
document.getElementById('close-role-modal-btn')?.addEventListener('click', () => { document.getElementById('assign-role-modal').style.display = 'none'; });
document.getElementById('save-role-btn')?.addEventListener('click', () => { const roleId = document.getElementById('assign-role-select').value; if (userToManageEmail && currentServerId) { update(ref(db, `server_members/${currentServerId}/${userToManageEmail}`), { role: roleId }); document.getElementById('assign-role-modal').style.display = 'none'; } });

function loadMemberList(serverId) {
    if(unsubscribeMembers) unsubscribeMembers();
    const listContent = document.getElementById('member-list-content');
    
    unsubscribeMembers = onValue(ref(db, `server_members/${serverId}`), async (membersSnap) => {
        const rolesSnap = await get(ref(db, `servers/${serverId}/roles`));
        let rolesData = {}; if (rolesSnap.exists()) { rolesData = rolesSnap.val(); serverRolesCache = rolesData; }
        
        let groups = { owner: { name: "Server Owner", order: -2, members: [] }, online: { name: "Online", order: 9998, members: [] }, offline: { name: "Offline", order: 9999, members: [] } };
        Object.keys(rolesData).forEach(rId => { groups[rId] = { name: rolesData[rId].name, order: rolesData[rId].order || 0, color: rolesData[rId].color, members: [] }; });
        
        const memberPromises = []; currentServerMembersList = [];
        membersSnap.forEach(mSnap => {
            const memberEmail = mSnap.key; const memberInfo = mSnap.val();
            const p = get(child(ref(db), `users/${memberEmail}`)).then(uSnap => {
                if (uSnap.exists()) {
                    const uData = uSnap.val(); const status = uData.status || 'offline'; let targetGroup = 'offline';
                    currentServerMembersList.push(uData); globalUsersCache[memberEmail] = uData;
                    if (memberInfo.role === 'owner') targetGroup = 'owner';
                    else if (memberInfo.role && memberInfo.role !== 'member' && groups[memberInfo.role]) targetGroup = memberInfo.role;
                    else if (status !== 'offline' && status !== 'invisible') targetGroup = 'online';
                    groups[targetGroup].members.push({ email: memberEmail, data: uData, status: status });
                }
            });
            memberPromises.push(p);
        });
        await Promise.all(memberPromises);

        listContent.innerHTML = '';
        const sortedGroupKeys = Object.keys(groups).sort((a,b) => groups[a].order - groups[b].order);
        sortedGroupKeys.forEach(gKey => {
            const group = groups[gKey]; if (group.members.length === 0) return;
            const catDiv = document.createElement('div'); catDiv.className = 'member-category'; catDiv.innerText = `${group.name} — ${group.members.length}`;
            listContent.appendChild(catDiv);

            group.members.forEach(m => {
                const mDiv = document.createElement('div'); mDiv.className = 'member-item';
                let nameColor = group.color || "white"; if(gKey === 'owner' || gKey === 'online' || gKey === 'offline') nameColor = "white";
                mDiv.innerHTML = `<div class="avatar-container"><img src="${m.data.avatar}" class="avatar-small"><div class="status-indicator status-${m.status}"></div></div><div class="member-username" style="color: ${nameColor};">${m.data.username}</div>`;
                mDiv.addEventListener('click', () => {
                    if (!myServerPerms.admin || m.email === auth.currentUser.email) return;
                    userToManageEmail = m.email;
                    const select = document.getElementById('assign-role-select');
                    select.innerHTML = `<option value="member">Member (Default)</option>`;
                    Object.keys(rolesData).forEach(rId => { select.innerHTML += `<option value="${rId}">${rolesData[rId].name}</option>`; });
                    select.value = membersSnap.val()[m.email].role || 'member';
                    document.getElementById('assign-role-modal').style.display = 'flex';
                });
                listContent.appendChild(mDiv);
            });
        });
    });
}

// Global Sync for Channels AND Categories
let currentChannelsData = {}; let currentCategoriesData = {};
let dragSrcEl = null; // Added to fix the Uncaught ReferenceError

function initChannelSync(serverId) {
    if(unsubscribeChannels) unsubscribeChannels(); if(unsubscribeCategories) unsubscribeCategories();
    unsubscribeChannels = onValue(ref(db, `channels/${serverId}`), (snap) => { currentChannelsData = snap.val() || {}; renderChannels(serverId); });
    unsubscribeCategories = onValue(ref(db, `categories/${serverId}`), (snap) => { currentCategoriesData = snap.val() || {}; renderChannels(serverId); });
}

function renderChannels(serverId) {
    const channelList = document.getElementById('channel-list');
    let categories = { "uncategorized": { name: "UNCATEGORIZED", order: -1 } };
    Object.keys(currentCategoriesData).forEach(k => categories[k] = currentCategoriesData[k]);
    let grouped = {}; Object.keys(categories).forEach(k => grouped[k] = []);
    Object.keys(currentChannelsData).forEach(cId => { const c = currentChannelsData[cId]; c.id = cId; const cid = c.categoryId && categories[c.categoryId] ? c.categoryId : "uncategorized"; grouped[cid].push(c); });
    const sortedCats = Object.keys(categories).sort((a,b) => categories[a].order - categories[b].order);
    
    channelList.innerHTML = '';
    sortedCats.forEach(catId => {
        if(grouped[catId].length === 0 && catId === "uncategorized") return;
        if(catId !== "uncategorized") {
            const catDiv = document.createElement('div'); catDiv.className = 'channel-category'; catDiv.innerText = `⌄ ${categories[catId].name}`; catDiv.id = `category-${catId}`;
            catDiv.addEventListener('contextmenu', (e) => showContextMenu(e, 'category', catId));
            let touchTimerCat; catDiv.addEventListener('touchstart', (e) => { touchTimerCat = setTimeout(() => showContextMenu(e, 'category', catId), 500); }); catDiv.addEventListener('touchend', () => clearTimeout(touchTimerCat)); catDiv.addEventListener('touchmove', () => clearTimeout(touchTimerCat));
            catDiv.addEventListener('dragover', (e) => { e.preventDefault(); catDiv.classList.add('drag-over'); return false; });
            catDiv.addEventListener('dragleave', () => catDiv.classList.remove('drag-over'));
            catDiv.addEventListener('drop', (e) => { e.stopPropagation(); catDiv.classList.remove('drag-over'); if(dragSrcEl) { const srcId = dragSrcEl.id.replace('channel-', ''); update(ref(db, `channels/${serverId}/${srcId}`), { categoryId: catId, order: Date.now() }); } return false; });
            channelList.appendChild(catDiv);
        }

        grouped[catId].sort((a,b) => (a.order||0) - (b.order||0)).forEach((channelData, index, arr) => {
            const div = document.createElement('div'); div.classList.add('channel-item'); div.id = `channel-${channelData.id}`; div.draggable = myServerPerms.admin || myServerPerms.manageChannels;
            div.innerHTML = channelData.type === "voice" ? `🔊 ${channelData.name}` : `# ${channelData.name}`;
            
            div.addEventListener('click', () => { 
                if(channelData.type === "voice") { joinVoiceChannel(serverId, channelData.id); } 
                else { 
                    chatType = 'server'; currentChatId = channelData.id; 
                    document.getElementById('chat-title').innerText = `# ${channelData.name}`; 
                    
                    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
                    div.classList.add('active');

                    enableChat(); loadMessages(`messages/${channelData.id}`, `# ${channelData.name}`); 
                } 
            });

            if (chatType === 'server' && currentChatId === channelData.id) div.classList.add('active');

            div.addEventListener('contextmenu', (e) => showContextMenu(e, 'channel', channelData.id));
            let touchTimer; div.addEventListener('touchstart', (e) => { touchTimer = setTimeout(() => showContextMenu(e, 'channel', channelData.id), 500); }); div.addEventListener('touchend', () => clearTimeout(touchTimer)); div.addEventListener('touchmove', () => clearTimeout(touchTimer));
            div.addEventListener('dragstart', (e) => { dragSrcEl = div; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/html', div.innerHTML); });
            div.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; div.classList.add('drag-over'); return false; });
            div.addEventListener('dragleave', () => div.classList.remove('drag-over'));
            div.addEventListener('drop', (e) => { e.stopPropagation(); div.classList.remove('drag-over'); if (dragSrcEl !== div) { const srcId = dragSrcEl.id.replace('channel-', ''); const targetOrder = channelData.order || 0; const prevChannel = arr[index - 1]; const nextChannel = arr[index + 1]; const srcData = currentChannelsData[srcId]; if(srcData.categoryId !== channelData.categoryId) { update(ref(db, `channels/${serverId}/${srcId}`), { categoryId: catId, order: targetOrder + 0.5 }); } else { if((srcData.order || 0) < targetOrder) { update(ref(db, `channels/${serverId}/${srcId}`), { order: nextChannel ? (targetOrder + nextChannel.order)/2 : targetOrder + 10 }); } else { update(ref(db, `channels/${serverId}/${srcId}`), { order: prevChannel ? (targetOrder + prevChannel.order)/2 : targetOrder - 10 }); } } } return false; });
            channelList.appendChild(div);
            if (unreadState.channels.has(channelData.id)) updateBadge(`channel-${channelData.id}`, true, false, false);
        });
    });
}

// ==========================================
// --- VOICE CHAT ENGINE ---
// ==========================================
function initVoiceChat() { myPeer = new Peer(); myPeer.on('open', id => myCurrentPeerId = id); myPeer.on('call', call => { call.answer(localAudioStream); const cEmail = call.metadata ? call.metadata.callerEmail : call.peer; call.on('stream', stream => addVoiceUserUI(cEmail, stream)); activeCalls[cEmail] = call; call.on('close', () => removeVoiceUserUI(cEmail)); }); }
async function joinVoiceChannel(serverId, channelId) { if (currentVoiceChannel === channelId) return; if (!myCurrentPeerId) return customAlert("Voice server connecting..."); leaveVoiceChannel(); try { localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true }); currentVoiceChannel = channelId; document.getElementById('voice-area').style.display = 'flex'; const vcRef = ref(db, `voice_rosters/${serverId}/${channelId}/${currentUserSafeEmail}`); await set(vcRef, myCurrentPeerId); onDisconnect(vcRef).remove(); onValue(ref(db, `voice_rosters/${serverId}/${channelId}`), (snap) => { snap.forEach((childSnapshot) => { const pEmail = childSnapshot.key; const pId = childSnapshot.val(); if (pEmail !== currentUserSafeEmail && !activeCalls[pEmail]) { const call = myPeer.call(pId, localAudioStream, { metadata: { callerEmail: currentUserSafeEmail } }); call.on('stream', stream => addVoiceUserUI(pEmail, stream)); call.on('close', () => removeVoiceUserUI(pEmail)); activeCalls[pEmail] = call; } }); }); } catch (err) { customAlert("Mic access denied.", "Error"); } }
function leaveVoiceChannel() { if (!currentVoiceChannel) return; Object.keys(activeCalls).forEach(pEmail => { activeCalls[pEmail].close(); removeVoiceUserUI(pEmail); }); activeCalls = {}; if (localAudioStream) { localAudioStream.getTracks().forEach(track => track.stop()); } remove(ref(db, `voice_rosters/${currentServerId}/${currentVoiceChannel}/${currentUserSafeEmail}`)); currentVoiceChannel = null; document.getElementById('voice-area').style.display = 'none'; document.getElementById('voice-users-list').innerHTML = ''; }
document.getElementById('disconnect-vc-btn')?.addEventListener('click', leaveVoiceChannel);
document.getElementById('mute-btn')?.addEventListener('click', (e) => { isMuted = !isMuted; if(localAudioStream) { localAudioStream.getAudioTracks()[0].enabled = !isMuted; } e.target.classList.toggle('muted-state'); });
document.getElementById('deafen-btn')?.addEventListener('click', (e) => { isDeafened = !isDeafened; e.target.classList.toggle('muted-state'); document.querySelectorAll('.vc-audio-element').forEach(audio => audio.muted = isDeafened); });
function addVoiceUserUI(peerEmail, stream) { if (document.getElementById(`vc-user-${peerEmail}`)) return; const list = document.getElementById('voice-users-list'); const div = document.createElement('div'); div.classList.add('vc-user'); div.id = `vc-user-${peerEmail}`; get(child(ref(db), `users/${peerEmail}`)).then(snap => { div.innerHTML = `<span>👤 ${snap.exists() ? snap.val().username : peerEmail}</span><input type="range" min="0" max="1" step="0.01" value="1" id="vol-${peerEmail}"><audio id="audio-${peerEmail}" class="vc-audio-element" autoplay></audio>`; list.appendChild(div); const audio = document.getElementById(`audio-${peerEmail}`); audio.srcObject = stream; if(isDeafened) { audio.muted = true; } document.getElementById(`vol-${peerEmail}`).addEventListener('input', (e) => { audio.volume = e.target.value; }); }); }
function removeVoiceUserUI(peerEmail) { const el = document.getElementById(`vc-user-${peerEmail}`); if (el) el.remove(); }

// ==========================================
// --- MESSAGES, EMBEDS & NOTIFICATIONS ---
// ==========================================
function enableChat() { document.getElementById('msg-input').disabled = false; document.getElementById('send-btn').disabled = false; document.getElementById('upload-img-btn').disabled = false; document.body.classList.add('mobile-chat-active'); }

function processMentionsAndText(text) {
    if (!text) return { html: "", isMentioned: false };
    let processed = text.replace(/</g, "&lt;").replace(/>/g, "&gt;"); 
    let isMentioned = false;
    
    if(myProfile.username && text.includes('@' + myProfile.username)) isMentioned = true;
    myServerRoles.forEach(role => { if(serverRolesCache[role] && text.includes('@' + serverRolesCache[role].name)) isMentioned = true; });
    processed = processed.replace(/@([a-zA-Z0-9_]+)/g, `<strong style="color: #faa61a; background: rgba(250, 166, 26, 0.1); padding: 0 3px; border-radius: 3px;">@$1</strong>`);
    return { html: processed, isMentioned };
}

async function buildMessageHtml(data) {
    const mentionData = processMentionsAndText(data.text);
    let contentHtml = `<div style="margin-left: 42px; word-break: break-word; color: #dcddde;">${mentionData.html}</div>`;
    
    const inviteRegex = new RegExp(`${appBaseUrl.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\?invite=([a-zA-Z0-9]+)`, 'g');
    let match; let tempEmbeds = [];
    
    while ((match = inviteRegex.exec(data.text)) !== null) {
        const iCode = match[1]; const placeholderId = 'embed-' + generateCode();
        contentHtml += `<div id="${placeholderId}" style="margin-left: 42px; margin-top: 5px;"></div>`;
        tempEmbeds.push({ code: iCode, id: placeholderId });
    }

    if (data.imageUrl) { contentHtml += `<img src="${data.imageUrl}" class="message-image" style="margin-left: 42px;">`; }
    return { html: contentHtml, isMentioned: mentionData.isMentioned, embeds: tempEmbeds };
}

let lastMsgSender = null; let lastMsgTime = 0; let scrollTimeout = null;
const scrollBtn = document.getElementById('scroll-bottom-btn');
const messagesDiv = document.getElementById('messages');

messagesDiv?.addEventListener('scroll', () => {
    if (messagesDiv.scrollHeight - messagesDiv.scrollTop > messagesDiv.clientHeight + 100) { scrollBtn.style.display = 'flex'; } 
    else { scrollBtn.style.display = 'none'; update(ref(db, `users/${currentUserSafeEmail}/lastRead`), { [currentChatId]: Date.now() }); }
});
scrollBtn?.addEventListener('click', () => { messagesDiv.scrollTop = messagesDiv.scrollHeight; update(ref(db, `users/${currentUserSafeEmail}/lastRead`), { [currentChatId]: Date.now() }); });

async function loadMessages(dbPath, chatNameLabel) {
    messagesDiv.innerHTML = `<div class="welcome-message"><h1>Welcome to ${chatNameLabel}!</h1><p>This is the start of the ${chatNameLabel} channel.</p></div>`;
    lastMsgSender = null; lastMsgTime = 0;
    
    if (unsubscribeMessages) unsubscribeMessages();
    if (unsubscribeMessagesRemoved) unsubscribeMessagesRemoved();

    const lastReadSnap = await get(ref(db, `users/${currentUserSafeEmail}/lastRead/${currentChatId}`));
    let lastReadTime = lastReadSnap.val() || 0;
    let insertedDivider = false;

    const processMessage = (msgId, data, isLive) => {
        const isConsecutive = (lastMsgSender === data.sender) && (data.timestamp - lastMsgTime < 300000) && (!data.replyTo);
        
        const msgElement = document.createElement('div');
        msgElement.classList.add('message');
        if(isConsecutive) msgElement.classList.add('consecutive');
        msgElement.id = `msg-${msgId}`;
        
        messagesDiv.appendChild(msgElement);
        lastMsgTime = data.timestamp; if(!isConsecutive) lastMsgSender = data.sender;

        if (data.timestamp > lastReadTime && !insertedDivider && data.sender !== auth.currentUser.email) {
            insertedDivider = true;
            const div = document.createElement('div'); div.className = 'new-messages-divider'; div.innerHTML = `<span>New Messages</span>`;
            messagesDiv.insertBefore(div, msgElement);
            if(!isLive) setTimeout(() => { div.scrollIntoView({behavior: "smooth", block: "center"}); }, 100);
        }

        (async () => {
            const buildRes = await buildMessageHtml(data);
            if(buildRes.isMentioned && data.sender !== auth.currentUser.email) msgElement.classList.add('mentioned');

            let canDelete = (data.sender === auth.currentUser.email || (chatType === 'server' && (myServerPerms.admin || myServerPerms.deleteMessages)));
            let nameColor = "white";
            if(chatType === 'server' && data.roleId && data.roleId !== 'member' && data.roleId !== 'owner') { const rSnap = await get(ref(db, `servers/${currentServerId}/roles/${data.roleId}`)); if(rSnap.exists()) nameColor = rSnap.val().color; }

            let actionsHtml = `<div class="msg-actions"><button class="msg-action-btn reply">↩ Reply</button>${canDelete ? `<button class="msg-action-btn del">🗑️ Delete</button>` : ''}</div>`;
            if (!isConsecutive) {
                let replyHtml = data.replyTo ? `<div class="reply-context"><strong>@${data.replyTo.username}</strong> ${data.replyTo.text}</div>` : "";
                let headerHtml = `${replyHtml}<div class="message-header"><img src="${data.avatar}" class="avatar-small"><span class="message-sender" style="color: ${nameColor};">${data.username}</span><span style="font-size: 0.8em; color: gray;">${new Date(data.timestamp).toLocaleTimeString()}</span></div>`;
                msgElement.innerHTML = `${actionsHtml}${headerHtml}<div class="msg-content-wrapper">${buildRes.html}</div>`;
            } else { msgElement.innerHTML = `${actionsHtml}<div class="msg-content-wrapper">${buildRes.html}</div>`; }

            buildRes.embeds.forEach(async (eObj) => {
                const sSnap = await get(ref(db, `servers/${eObj.code}`));
                if(sSnap.exists()) {
                    const sData = sSnap.val();
                    const iHtml = sData.icon ? `<div class="invite-embed-icon" style="background-image:url(${sData.icon})"></div>` : `<div class="invite-embed-icon">${sData.name.charAt(0)}</div>`;
                    const embedContainer = document.getElementById(eObj.id);
                    if(embedContainer) {
                        embedContainer.innerHTML = `<div class="invite-embed"><h4>You've been invited to join a server</h4><div class="invite-embed-content">${iHtml}<div class="invite-embed-info"><div class="invite-embed-name">${sData.name}</div><button onclick="window.location.href='${appBaseUrl}?invite=${eObj.code}'" style="margin:0; padding:5px 15px; background:#3ba55c;">Join</button></div></div></div>`;
                    }
                }
            });

            const delBtn = msgElement.querySelector('.msg-action-btn.del'); 
            if (delBtn) {
                delBtn.addEventListener('click', () => { 
                    customConfirm("Are you sure you want to delete this message? This action cannot be undone.", "Delete Message", async (yes) => {
                        if(yes) await remove(ref(db, `${dbPath}/${msgId}`));
                    });
                }); 
            }

            const replyBtn = msgElement.querySelector('.msg-action-btn.reply'); if (replyBtn) replyBtn.addEventListener('click', () => triggerReply(msgId, data.username, data.text || "Attachment..."));
            msgElement.addEventListener('dblclick', () => triggerReply(msgId, data.username, data.text || "Attachment..."));
            const imgEl = msgElement.querySelector('.message-image'); if (imgEl) imgEl.addEventListener('click', () => { document.getElementById('enlarged-image').src = data.imageUrl; document.getElementById('download-image-btn').href = data.imageUrl; document.getElementById('image-modal').style.display = 'flex'; });
        })();
    };

    const msgRef = query(ref(db, dbPath), orderByChild('timestamp'), limitToLast(50));
    const initialSnap = await get(msgRef);
    
    let highestTimestamp = 0;
    initialSnap.forEach(childSnap => {
        const data = childSnap.val();
        processMessage(childSnap.key, data, false);
        highestTimestamp = Math.max(highestTimestamp, data.timestamp);
    });

    if(!insertedDivider) {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        setTimeout(() => { if(!insertedDivider) messagesDiv.scrollTop = messagesDiv.scrollHeight; }, 100);
    }

    const liveRef = query(ref(db, dbPath), orderByChild('timestamp'), startAt(highestTimestamp + 1));
    unsubscribeMessages = onChildAdded(liveRef, (childSnap) => {
        const data = childSnap.val();
        if(data.timestamp > highestTimestamp) {
            processMessage(childSnap.key, data, true);
            if (!insertedDivider || (messagesDiv.scrollHeight - messagesDiv.scrollTop < messagesDiv.clientHeight + 150)) {
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }
        }
    });

    unsubscribeMessagesRemoved = onChildRemoved(ref(db, dbPath), (snapshot) => { const msgEl = document.getElementById(`msg-${snapshot.key}`); if(msgEl) msgEl.remove(); });
    if (chatType === 'dm') clearUnread('dm', currentChatId); else if (chatType === 'server') clearUnread('channel', currentChatId, currentServerId);
}

// Replier Logic
function triggerReply(msgId, username, text) {
    replyingToMessage = { id: msgId, username: username, text: text.length > 50 ? text.substring(0, 50) + '...' : text };
    document.getElementById('reply-banner-text').innerHTML = `Replying to <strong>@${username}</strong>`;
    document.getElementById('reply-banner').style.display = 'flex'; document.getElementById('msg-input').focus();
}
document.getElementById('cancel-reply-btn')?.addEventListener('click', () => { replyingToMessage = null; document.getElementById('reply-banner').style.display = 'none'; });

// Mention Autocomplete
const msgInput = document.getElementById('msg-input');
const mentionMenu = document.getElementById('mention-menu');
let mentionStartIndex = -1; let mentionSearchTerm = null;

msgInput?.addEventListener('input', () => {
    const val = msgInput.value; const cursorPos = msgInput.selectionStart;
    const textBeforeCursor = val.substring(0, cursorPos);
    const match = textBeforeCursor.match(/@(\w*)$/);
    if (match) { mentionStartIndex = match.index; mentionSearchTerm = match[1].toLowerCase(); showMentionMenu(mentionSearchTerm); } 
    else { mentionMenu.style.display = 'none'; }
});

function showMentionMenu(term) {
    mentionMenu.innerHTML = ''; let matches = [];
    if (chatType === 'server') {
        Object.values(serverRolesCache).forEach(role => { if (role.name.toLowerCase().includes(term)) matches.push({ type: 'role', name: role.name, color: role.color }); });
        currentServerMembersList.forEach(m => { if (m.username.toLowerCase().includes(term)) matches.push({ type: 'user', name: m.username, avatar: m.avatar }); });
    } else if (chatType === 'dm') {
        if(currentDMOtherUser) matches.push({ type: 'user', name: currentDMOtherUser.username, avatar: currentDMOtherUser.avatar });
        matches.push({ type: 'user', name: myProfile.username, avatar: myProfile.avatar });
        matches = matches.filter(m => m.name.toLowerCase().includes(term));
    }
    
    if (matches.length === 0) { mentionMenu.style.display = 'none'; return; }
    
    matches.forEach(m => {
        const div = document.createElement('div'); div.className = 'mention-item';
        if (m.type === 'role') { div.innerHTML = `<div style="width:24px; height:24px; border-radius:50%; background:${m.color}; display:flex; align-items:center; justify-content:center; font-size:12px; color:white;">@</div><span>${m.name}</span>`; } 
        else { div.innerHTML = `<img src="${m.avatar}" class="mention-avatar"><span>${m.name}</span>`; }
        div.addEventListener('click', () => {
            const val = msgInput.value; const before = val.substring(0, mentionStartIndex); const after = val.substring(msgInput.selectionStart);
            msgInput.value = before + '@' + m.name + ' ' + after; mentionMenu.style.display = 'none'; msgInput.focus();
        });
        mentionMenu.appendChild(div);
    });
    mentionMenu.style.display = 'flex';
}

// Image / Paste Preview Logic
document.getElementById('upload-img-btn')?.addEventListener('click', () => document.getElementById('image-upload').click());
document.getElementById('image-upload')?.addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file || !currentChatId) return;
    if (file.size > 2 * 1024 * 1024) return customAlert("File too large. Please select an image under 2MB.", "Error");
    const reader = new FileReader(); reader.onloadend = () => { pendingAttachmentBase64 = reader.result; document.getElementById('attachment-preview-img').src = pendingAttachmentBase64; document.getElementById('attachment-preview-area').style.display = 'flex'; document.getElementById('image-upload').value = ""; }; reader.readAsDataURL(file);
});
document.getElementById('remove-attachment-btn')?.addEventListener('click', () => { pendingAttachmentBase64 = null; document.getElementById('attachment-preview-area').style.display = 'none'; });
document.getElementById('msg-input')?.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const blob = item.getAsFile(); if (blob.size > 2 * 1024 * 1024) return customAlert("Pasted image is too large (max 2MB).");
            const reader = new FileReader(); reader.onloadend = () => { pendingAttachmentBase64 = reader.result; document.getElementById('attachment-preview-img').src = pendingAttachmentBase64; document.getElementById('attachment-preview-area').style.display = 'flex'; }; reader.readAsDataURL(blob);
        }
    }
});

async function sendMessage() {
    const input = document.getElementById('msg-input'); const text = input.value.trim();
    if ((text !== "" || pendingAttachmentBase64) && currentChatId) {
        const path = chatType === 'server' ? `messages/${currentChatId}` : `dms/${currentChatId}`;
        let roleId = 'member';
        if(chatType === 'server') { const mSnap = await get(ref(db, `server_members/${currentServerId}/${currentUserSafeEmail}/role`)); roleId = mSnap.val() || 'member'; }
        
        let msgPayload = { sender: auth.currentUser.email, username: myProfile.username, avatar: myProfile.avatar, text: text, timestamp: Date.now(), roleId: roleId };
        
        if (replyingToMessage) { msgPayload.replyTo = replyingToMessage; replyingToMessage = null; document.getElementById('reply-banner').style.display = 'none'; }
        if (pendingAttachmentBase64) { msgPayload.imageUrl = pendingAttachmentBase64; pendingAttachmentBase64 = null; document.getElementById('attachment-preview-area').style.display = 'none'; }

        push(ref(db, path), msgPayload);
        input.value = "";
        mentionMenu.style.display = 'none';
        
        if(chatType === 'dm') {
            const friendEmail = currentChatId.replace(currentUserSafeEmail, '').replace('_', '');
            update(ref(db, `users/${currentUserSafeEmail}/friends/${friendEmail}`), { lastActivity: Date.now(), hidden: false });
            update(ref(db, `users/${friendEmail}/friends/${currentUserSafeEmail}`), { lastActivity: Date.now(), hidden: false });
        }
        update(ref(db, `users/${currentUserSafeEmail}/lastRead`), { [currentChatId]: Date.now() });
    }
}

document.getElementById('send-btn')?.addEventListener('click', sendMessage);
document.getElementById('msg-input')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
document.getElementById('close-image-modal')?.addEventListener('click', () => document.getElementById('image-modal').style.display = 'none');

// Notifications
setTimeout(() => { notificationsActive = true; }, 2000);

function startNotificationListeners() {
    if(dmsNotifListener) dmsNotifListener();
    if(serversNotifListener) serversNotifListener();

    dmsNotifListener = onChildAdded(ref(db, `users/${currentUserSafeEmail}/friends`), (childSnapshot) => { 
        const dmId = childSnapshot.val().dmId; 
        onChildAdded(query(ref(db, `dms/${dmId}`), limitToLast(1)), (msg) => { 
            const mData = msg.val();
            if (notificationsActive && currentChatId !== dmId && mData.timestamp > appStartTime && mData.sender !== auth.currentUser.email) { 
                markUnread('dm', dmId, null, false); 
            } 
        }); 
    }); 

    serversNotifListener = onChildAdded(ref(db, `users/${currentUserSafeEmail}/servers`), (childSnapshot) => { 
        const serverId = childSnapshot.key; 
        onChildAdded(ref(db, `channels/${serverId}`), (cSnap) => { 
            if (cSnap.val().type === 'text') { 
                onChildAdded(query(ref(db, `messages/${cSnap.key}`), limitToLast(1)), (msg) => { 
                    const mData = msg.val();
                    if (notificationsActive && currentChatId !== cSnap.key && mData.timestamp > appStartTime && mData.sender !== auth.currentUser.email) { 
                        const isMention = processMentionsAndText(mData.text).isMentioned;
                        markUnread('channel', cSnap.key, serverId, isMention); 
                    } 
                }); 
            } 
        }); 
    });
}

function markUnread(type, id, serverId = null, isMention = false) { if (type === 'dm') { unreadState.dms.add(id); updateBadge(`dm-${id}`, true, false, isMention); updateBadge('home-btn', true, true, isMention); } else if (type === 'channel') { unreadState.channels.add(id); unreadState.servers.add(serverId); updateBadge(`channel-${id}`, true, false, isMention); updateBadge(`server-${serverId}`, true, true, isMention); } }
function clearUnread(type, id, serverId = null) { if (type === 'dm') { unreadState.dms.delete(id); updateBadge(`dm-${id}`, false); if (unreadState.dms.size === 0) updateBadge('home-btn', false); } else if (type === 'channel') { unreadState.channels.delete(id); updateBadge(`channel-${id}`, false); updateBadge(`server-${serverId}`, false); } }
function updateBadge(id, show, isDot = false, isMention = false) { 
    const el = document.getElementById(id); if (!el) return; 
    let badge = el.querySelector('.unread-indicator'); 
    if (show) { 
        if (!badge) { badge = document.createElement('div'); el.appendChild(badge); }
        badge.className = `unread-indicator ${isMention ? 'mention' : (isDot ? 'dot' : 'pill')}`;
    } else { if (badge) badge.remove(); } 
}