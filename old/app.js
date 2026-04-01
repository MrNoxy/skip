import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, push, onChildAdded, onChildRemoved, onValue, set, get, child, remove, onDisconnect, query, limitToLast, update, orderByChild, startAt, endAt } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

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
let currentServerId = null; let currentChatId = null; let chatType = 'home'; let currentHomeTab = 'friends'; 
let currentUserSafeEmail = null; let myProfile = {}; 
let myServerPerms = { viewChannels: true, sendMessages: true, manageChannels: false, manageServerSettings: false, manageServerProfile: false, manageServerOverview: false, manageRoles: false, manageMessages: false, kickMembers: false, banMembers: false, timeoutMembers: false };
let myServerRoles = []; let myServerMemberData = {};

let currentServerMembersList = []; let currentDMOtherUser = null; let serverRolesCache = {}; 
let globalUsersCache = {}; let activeFriendsData = []; let globalEmojisCache = {};

let unsubscribeMessages = null; let unsubscribeMessagesRemoved = null; let unsubscribeMembers = null; 
let unsubscribeChannels = null; let unsubscribeCategories = null; let unsubscribeVoiceRosters = null;
let unsubscribeMyMemberData = null; let dmsNotifListener = null; let serversNotifListener = null;

let replyingToMessage = null; let pendingAttachmentBase64 = null; let pendingAttachmentOriginal = null;
let notificationsActive = true; const appStartTime = Date.now(); 
let unreadState = { dms: new Set(), channels: new Set(), servers: new Set() };

let myPeer = null; let myCurrentPeerId = null; let localAudioStream = null;
let activeCalls = {}; let currentVoiceChannel = null; let isMuted = false; let isDeafened = false;
let currentServerVoiceRosters = {}; let currentChannelsData = {}; let currentCategoriesData = {}; let dragSrcEl = null;

const appContainer = document.getElementById('app-container');
const authSection = document.getElementById('auth-section');
const appBaseUrl = window.location.href.split('?')[0];

function sanitizeEmail(email) { return email.replace(/\./g, ','); }
function generateCode() { return Math.random().toString(36).substring(2, 10); }

// Safe iOS 10 Event Binder (Removes the need for ?.)
function bindEvt(id, eventType, callback) {
    var el = document.getElementById(id);
    if (el) { el.addEventListener(eventType, callback); }
}

const icons = {
    textChannel: `#`, voiceChannel: `🔊`, trash: `🗑`, gear: `⚙`,
    addFriend: `+`, removeFriend: `-`, closeDM: `✖`, message: `💬`,
    reply: `↩`, leave: `🚪`, smile: `☺`, addReaction: `+`, download: `↓`, ban: `⛔`, kick: `👢`, timeout: `⏱`
};

function compressImage(file, maxWidth, maxHeight, quality) {
    return new Promise(function(resolve) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const originalDataUrl = e.target.result;
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > maxWidth || h > maxHeight) {
                    const ratio = Math.min(maxWidth / w, maxHeight / h);
                    w *= ratio; h *= ratio;
                }
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                const compressedDataUrl = canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', quality);
                resolve({ compressed: compressedDataUrl, original: originalDataUrl });
            };
            img.src = originalDataUrl;
        };
        reader.readAsDataURL(file);
    });
}

function getCategoryPerm(categoryId, permName) {
    if (myServerPerms.manageServerSettings || myServerRoles.indexOf('owner') !== -1) return true;
    let result = !!myServerPerms[permName];
    const catData = currentCategoriesData[categoryId];
    if (!catData) return result;
    const ows = catData.overwrites ? catData.overwrites : {};
    
    let oResult = null;
    if (ows['everyone'] && ows['everyone'][permName] !== undefined && ows['everyone'][permName] !== "inherit") {
        oResult = ows['everyone'][permName] === "allow";
    }
    let roleAllowed = false; let roleDenied = false; let roleSet = false;
    myServerRoles.forEach(function(rId) {
        if (ows[rId] && ows[rId][permName] !== undefined && ows[rId][permName] !== "inherit") {
            roleSet = true;
            if (ows[rId][permName] === "allow") roleAllowed = true;
            if (ows[rId][permName] === "deny") roleDenied = true;
        }
    });
    if (roleAllowed) return true;
    if (roleDenied) return false;
    if (oResult !== null && !roleSet) return oResult;
    return result;
}

function getChannelPerm(channelId, permName) {
    if (myServerPerms.manageServerSettings || myServerRoles.indexOf('owner') !== -1) return true;
    let result = !!myServerPerms[permName]; 
    const channelData = currentChannelsData[channelId];
    if(!channelData) return result;

    const catId = channelData.categoryId;
    const catOverwrites = (currentCategoriesData[catId] && currentCategoriesData[catId].overwrites) ? currentCategoriesData[catId].overwrites : {};
    const overwrites = channelData.overwrites ? channelData.overwrites : {};
    
    let evalOverwrites = function(ows) {
        let oResult = null;
        if (ows['everyone'] && ows['everyone'][permName] !== undefined && ows['everyone'][permName] !== "inherit") {
            oResult = ows['everyone'][permName] === "allow";
        }
        let roleAllowed = false; let roleDenied = false; let roleSet = false;
        myServerRoles.forEach(function(rId) {
            if (ows[rId] && ows[rId][permName] !== undefined && ows[rId][permName] !== "inherit") {
                roleSet = true;
                if (ows[rId][permName] === "allow") roleAllowed = true;
                if (ows[rId][permName] === "deny") roleDenied = true;
            }
        });
        if (roleAllowed) return true;
        if (roleDenied) return false;
        if (oResult !== null && !roleSet) return oResult;
        return null;
    };
    
    let catRes = evalOverwrites(catOverwrites);
    if (catRes !== null) result = catRes;
    
    let chanRes = evalOverwrites(overwrites);
    if (chanRes !== null) result = chanRes;

    return result;
}

function customAlert(desc, title) {
    document.getElementById('alert-modal-title').innerText = title || "Notice";
    document.getElementById('alert-modal-desc').innerText = desc;
    document.getElementById('alert-modal').style.display = 'flex';
}
bindEvt('alert-modal-ok', 'click', function() { document.getElementById('alert-modal').style.display = 'none'; });

let confirmCallback = null;
function customConfirm(desc, title, callback) {
    document.getElementById('confirm-modal-title').innerText = title;
    document.getElementById('confirm-modal-desc').innerText = desc;
    confirmCallback = callback;
    document.getElementById('confirm-modal').style.display = 'flex';
}
bindEvt('confirm-modal-yes', 'click', function() { if(confirmCallback) confirmCallback(true); document.getElementById('confirm-modal').style.display = 'none'; });
bindEvt('confirm-modal-no', 'click', function() { if(confirmCallback) confirmCallback(false); document.getElementById('confirm-modal').style.display = 'none'; });

let currentInputCallback = null;
function openInputModal(title, placeholder, desc, callback, defaultValue) {
    document.getElementById('input-modal-title').innerText = title;
    document.getElementById('input-modal-field').placeholder = placeholder;
    document.getElementById('input-modal-field').value = defaultValue || "";
    const descEl = document.getElementById('input-modal-desc');
    if (desc) { descEl.innerText = desc; descEl.style.display = 'block'; } else { descEl.style.display = 'none'; }
    currentInputCallback = callback;
    document.getElementById('input-modal').style.display = 'flex';
    document.getElementById('input-modal-field').focus();
}
bindEvt('input-modal-submit', 'click', function() {
    const val = document.getElementById('input-modal-field').value.trim();
    if (currentInputCallback) currentInputCallback(val);
    document.getElementById('input-modal').style.display = 'none';
});
bindEvt('input-modal-cancel', 'click', function() { document.getElementById('input-modal').style.display = 'none'; });
bindEvt('input-modal-field', 'keypress', function(e) { if (e.key === 'Enter') document.getElementById('input-modal-submit').click(); });

bindEvt('image-modal', 'click', function(e) {
    if (e.target.id === 'image-modal' || e.target.id === 'close-image-modal') {
        document.getElementById('image-modal').style.display = 'none';
    }
});

function bindImageClick(imgEl) {
    if (!imgEl) return;
    imgEl.addEventListener('click', function() { 
        document.getElementById('enlarged-image').src = imgEl.getAttribute('data-original'); 
        document.getElementById('download-image-btn').href = imgEl.getAttribute('data-original'); 
        document.getElementById('image-modal').style.display = 'flex'; 
    });
}

window.showGlobalUserProfile = async function(email, event) {
    if (event) event.stopPropagation();
    const safeEmail = sanitizeEmail(email); 
    const modal = document.getElementById('global-user-profile-modal');
    const nameEl = document.getElementById('gup-username');
    const tagEl = document.getElementById('gup-tag');
    const avatarEl = document.getElementById('gup-avatar');
    
    nameEl.innerText = "Loading..."; tagEl.innerText = "";
    document.getElementById('gup-add-friend').style.display = 'none';
    document.getElementById('gup-remove-friend').style.display = 'none';
    document.getElementById('gup-send-message').style.display = 'none';
    modal.style.display = 'flex'; 
    
    const uSnap = await get(child(ref(db), `users/${safeEmail}`));
    if(uSnap.exists()) {
        const uData = uSnap.val();
        nameEl.innerText = uData.username;
        tagEl.innerText = `#${uData.tag}`;
        avatarEl.src = uData.avatar;
        
        if(safeEmail !== currentUserSafeEmail) {
            const friendSnap = await get(ref(db, `users/${currentUserSafeEmail}/friends/${safeEmail}`));
            const sendMsgBtn = document.getElementById('gup-send-message');
            sendMsgBtn.style.display = 'block';
            sendMsgBtn.onclick = async function() {
                modal.style.display = 'none';
                const dmId = [currentUserSafeEmail, safeEmail].sort().join('_');
                await update(ref(db, `users/${currentUserSafeEmail}/friends/${safeEmail}`), { dmId: dmId, hidden: false, lastActivity: Date.now() });
                if(!globalUsersCache[safeEmail]) globalUsersCache[safeEmail] = uData;
                switchToHomeView(); openDM(dmId, safeEmail);
            };

            if(!friendSnap.exists()) {
                const addFriendBtn = document.getElementById('gup-add-friend');
                addFriendBtn.style.display = 'block';
                addFriendBtn.onclick = async function() {
                    await set(ref(db, `friend_requests/${safeEmail}/${currentUserSafeEmail}`), { username: myProfile.username, avatar: myProfile.avatar, timestamp: Date.now() });
                    customAlert(`Friend request sent!`); modal.style.display = 'none';
                };
            } else {
                const removeFriendBtn = document.getElementById('gup-remove-friend');
                removeFriendBtn.style.display = 'block';
                removeFriendBtn.onclick = async function() {
                    await remove(ref(db, `users/${currentUserSafeEmail}/friends/${safeEmail}`));
                    await remove(ref(db, `users/${safeEmail}/friends/${currentUserSafeEmail}`));
                    modal.style.display = 'none';
                };
            }
        }
    }
};

window.handleMentionClick = function(username, event) {
    event.stopPropagation();
    let foundEmail = null;
    Object.keys(globalUsersCache).forEach(function(email) { if(globalUsersCache[email].username === username) foundEmail = email; });
    if (foundEmail) showGlobalUserProfile(foundEmail, event);
};

bindEvt('global-user-profile-modal', 'click', function(e) { 
    if(e.target.id === 'global-user-profile-modal') e.target.style.display = 'none'; 
});

let contextTarget = null;
const ctxMenu = document.getElementById('context-menu');

function showContextMenu(e, type, id) {
    e.preventDefault();
    let html = '';
    if (type === 'channel') {
        if (!myServerPerms.manageChannels && !myServerPerms.manageServerSettings && myServerRoles.indexOf('owner') === -1) return; 
        html += `<div class="context-item" id="ctx-edit">Edit Channel</div><div class="context-item" id="ctx-delete" style="color:red;">Delete Channel</div>`;
    } else if (type === 'dm') {
        html = `<div class="context-item" id="ctx-delete" style="color:red;">Close DM</div>`;
    }
    if(html === '') return;
    ctxMenu.innerHTML = html;
    contextTarget = { type: type, id: id };
    ctxMenu.style.display = 'flex';
    ctxMenu.style.left = (e.pageX || e.touches[0].pageX) + 'px';
    ctxMenu.style.top = (e.pageY || e.touches[0].pageY) + 'px';
}

document.addEventListener('click', function(e) { 
    const ctxDel = e.target.closest('#ctx-delete');
    const ctxEdit = e.target.closest('#ctx-edit');

    if(ctxDel && contextTarget) {
        if(contextTarget.type === 'dm') {
            update(ref(db, `users/${currentUserSafeEmail}/friends/${contextTarget.id}`), { hidden: true });
        } else if (currentServerId && contextTarget.type === 'channel') {
            remove(ref(db, `channels/${currentServerId}/${contextTarget.id}`)); remove(ref(db, `messages/${contextTarget.id}`));
        }
        ctxMenu.style.display = 'none';
    } else if (ctxEdit && contextTarget) {
        if (contextTarget.type === 'channel') openChannelSettings(contextTarget.id, 'channel');
        ctxMenu.style.display = 'none';
    }
    if(ctxMenu && !e.target.closest('#context-menu')) ctxMenu.style.display = 'none';
});

bindEvt('register-btn', 'click', async function() {
    const email = document.getElementById('email').value; const pass = document.getElementById('password').value;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const safeEmail = sanitizeEmail(email); const baseName = email.split('@')[0];
        const randomTag = Math.floor(1000 + Math.random() * 9000).toString(); 
        const defaultAvatar = `https://ui-avatars.com/api/?name=${baseName.charAt(0)}&background=007AFF&color=fff&size=256`;
        await set(ref(db, `users/${safeEmail}`), { email: email, uid: userCredential.user.uid, username: baseName, tag: randomTag, avatar: defaultAvatar, status: 'online', saved_status: 'online' });
        await set(ref(db, `user_tags/${baseName}_${randomTag}`), safeEmail);
    } catch (error) { customAlert(error.message, "Error"); }
});

bindEvt('login-btn', 'click', function() {
    signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value).catch(function(e) { customAlert(e.message, "Login Error"); });
});

onAuthStateChanged(auth, async function(user) {
    if (user) {
        authSection.style.display = 'none'; appContainer.style.display = 'flex'; currentUserSafeEmail = sanitizeEmail(user.email);
        onValue(ref(db, `users/${currentUserSafeEmail}`), function(snapshot) {
            if(snapshot.exists()) {
                myProfile = snapshot.val();
                document.getElementById('user-display').innerText = myProfile.username;
                document.getElementById('my-avatar').src = myProfile.avatar;
            }
        });
        initVoiceChat(); loadMyServers(); loadFriendsList(); startNotificationListeners(); listenForFriendRequests();
        document.getElementById('home-btn').click(); 
    } else {
        authSection.style.display = 'block'; appContainer.style.display = 'none';
    }
});

let tempBase64Avatar = null;
function setupUserSettingsTabs() {
    document.querySelectorAll('#user-settings-modal .fs-tab').forEach(function(tab) {
        tab.addEventListener('click', function(e) {
            const tabName = e.target.getAttribute('data-tab');
            if(!tabName) return;
            document.querySelectorAll('#user-settings-modal .fs-tab').forEach(function(t) { t.classList.remove('active'); });
            e.target.classList.add('active');
            document.querySelectorAll('#user-settings-modal .ss-pane').forEach(function(p) { p.style.display = 'none'; });
            document.getElementById(`pane-us-${tabName}`).style.display = 'block';
            document.querySelector('#user-settings-modal .fs-modal-layout').classList.add('mobile-viewing-content');
        });
    });
}
setupUserSettingsTabs();

bindEvt('us-mobile-back', 'click', function() { document.querySelector('#user-settings-modal .fs-modal-layout').classList.remove('mobile-viewing-content'); });
bindEvt('close-user-settings-btn', 'click', function() { document.getElementById('user-settings-modal').style.display = 'none'; });
bindEvt('close-user-settings-btn-desktop', 'click', function() { document.getElementById('user-settings-modal').style.display = 'none'; });

bindEvt('user-controls', 'click', function(e) {
    if(e.target.id === 'my-status-indicator' || e.target.closest('#status-selector')) return; 
    document.getElementById('edit-username').value = myProfile.username; 
    document.getElementById('profile-preview').src = myProfile.avatar;
    tempBase64Avatar = myProfile.avatar; 
    document.getElementById('user-settings-modal').style.display = 'flex';
    document.querySelector('#user-settings-modal .fs-tab[data-tab="account"]').click();
});

bindEvt('us-logout-btn', 'click', function() {
    leaveVoiceChannel(); if (currentUserSafeEmail) set(ref(db, `users/${currentUserSafeEmail}/status`), 'offline'); signOut(auth);
});

bindEvt('avatar-upload', 'change', async function(e) { 
    const file = e.target.files[0]; 
    if (file) { 
        const result = await compressImage(file, 256, 256, 0.85);
        tempBase64Avatar = result.compressed; document.getElementById('profile-preview').src = tempBase64Avatar; 
    } 
});

bindEvt('save-profile-btn', 'click', async function() {
    const newUsername = document.getElementById('edit-username').value.trim(); const newTag = document.getElementById('edit-tag').value.trim();
    if(!newUsername) return;
    await update(ref(db, `users/${currentUserSafeEmail}`), {username: newUsername, avatar: tempBase64Avatar});
    document.getElementById('user-settings-modal').style.display = 'none';
});

bindEvt('my-status-indicator', 'click', function(e) { e.stopPropagation(); document.getElementById('status-selector').style.display = 'block'; });
document.querySelectorAll('.status-option').forEach(function(opt) { opt.addEventListener('click', function(e) { const s = e.target.getAttribute('data-status'); update(ref(db, `users/${currentUserSafeEmail}`), {status: s, saved_status: s}); document.getElementById('status-selector').style.display = 'none'; }); });
document.addEventListener('click', function(e) { if (!e.target.closest('#user-controls')) { const s = document.getElementById('status-selector'); if(s) s.style.display = 'none'; } });

function switchToHomeView() {
    document.body.classList.remove('mobile-chat-active');
    document.body.classList.remove('mobile-home-active');
    chatType = 'home'; currentChatId = null; currentServerId = null;
    document.getElementById('server-name-display').innerText = "Friends & DMs";
    document.getElementById('home-sidebar-content').style.display = 'block';
    document.getElementById('channel-list').style.display = 'none';
    document.getElementById('chat-area').style.display = 'none';
    document.getElementById('home-area').style.display = 'flex';
    document.getElementById('server-dropdown').style.display = 'none';
    document.querySelectorAll('.server-icon').forEach(function(el) { el.classList.remove('active'); });
    document.getElementById('home-btn').classList.add('active');
    renderHomeContent();
}

bindEvt('home-btn', 'click', switchToHomeView);
bindEvt('mobile-back-btn', 'click', function() { document.body.classList.remove('mobile-chat-active'); document.body.classList.remove('mobile-home-active'); });
bindEvt('mobile-back-btn-home', 'click', function() { document.body.classList.remove('mobile-chat-active'); document.body.classList.remove('mobile-home-active'); });

bindEvt('nav-friends-btn', 'click', function() { currentHomeTab = 'friends'; if(chatType !== 'home') switchToHomeView(); document.body.classList.add('mobile-home-active'); renderHomeContent(); });
bindEvt('nav-requests-btn', 'click', function() { currentHomeTab = 'requests'; if(chatType !== 'home') switchToHomeView(); document.body.classList.add('mobile-home-active'); renderHomeContent(); });

function renderHomeContent() {
    if (chatType !== 'home') return;
    document.querySelectorAll('.home-nav-item').forEach(function(el) { el.classList.remove('active'); });
    const content = document.getElementById('home-content');
    
    if(currentHomeTab === 'friends') {
        document.getElementById('nav-friends-btn').classList.add('active'); 
        document.getElementById('home-header-friends').style.display = 'flex'; document.getElementById('home-header-requests').style.display = 'none';
        content.innerHTML = '';
        if(activeFriendsData.length === 0) return;
        activeFriendsData.forEach(function(fData) {
            const cachedUser = globalUsersCache[fData.email] || {};
            const div = document.createElement('div'); div.className = 'friend-card';
            div.innerHTML = `<div style="display:flex; align-items:center;"><img src="${cachedUser.avatar||''}" class="avatar-small"><span>${cachedUser.username||'User'}</span></div>`;
            div.onclick = function() { openDM(fData.dmId, fData.email); };
            content.appendChild(div);
        });
    } else if (currentHomeTab === 'requests') {
        document.getElementById('nav-requests-btn').classList.add('active');
        document.getElementById('home-header-friends').style.display = 'none'; document.getElementById('home-header-requests').style.display = 'flex';
        content.innerHTML = '';
        get(ref(db, `friend_requests/${currentUserSafeEmail}`)).then(function(snap) {
            if(!snap.exists()) return;
            snap.forEach(function(child) {
                const sData = child.val();
                const div = document.createElement('div'); div.className = 'friend-card';
                div.innerHTML = `<div><img src="${sData.avatar}" class="avatar-small"><span>${sData.username}</span></div><button class="accept-fr" style="width: auto;">Accept</button>`;
                div.querySelector('.accept-fr').onclick = async function() {
                    const dmId = [currentUserSafeEmail, child.key].sort().join('_');
                    await set(ref(db, `users/${currentUserSafeEmail}/friends/${child.key}`), { dmId: dmId, hidden: false });
                    await set(ref(db, `users/${child.key}/friends/${currentUserSafeEmail}`), { dmId: dmId, hidden: false });
                    await remove(ref(db, `friend_requests/${currentUserSafeEmail}/${child.key}`));
                    renderHomeContent();
                };
                content.appendChild(div);
            });
        });
    }
}

function listenForFriendRequests() {
    onValue(ref(db, `friend_requests/${currentUserSafeEmail}`), function(snap) {
        const badge = document.getElementById('fr-badge');
        if(badge) { if(snap.exists()) badge.style.display = 'block'; else badge.style.display = 'none'; }
        if(currentHomeTab === 'requests' && chatType === 'home') renderHomeContent();
    });
}

bindEvt('add-friend-btn-green', 'click', function() {
    openInputModal("Add Friend", "username_tag", "Enter exactly:", async function(inputTag) {
        if (!inputTag) return;
        const tagSnap = await get(child(ref(db), `user_tags/${inputTag}`));
        if (tagSnap.exists()) {
            await set(ref(db, `friend_requests/${tagSnap.val()}/${currentUserSafeEmail}`), { username: myProfile.username, avatar: myProfile.avatar, timestamp: Date.now() });
            customAlert(`Request sent!`);
        } else { customAlert("User not found."); }
    });
});

function loadFriendsList() {
    const channelList = document.getElementById('dm-list');
    onValue(ref(db, `users/${currentUserSafeEmail}/friends`), function(snapshot) {
        channelList.innerHTML = ''; activeFriendsData = [];
        snapshot.forEach(function(childSnapshot) {
            const data = childSnapshot.val(); data.email = childSnapshot.key;
            activeFriendsData.push(data);
            if(!data.hidden) {
                const div = document.createElement('div'); div.className = 'channel-item';
                div.innerHTML = `<span class="c-name">${data.email.split(',')[0]}</span>`;
                div.onclick = function() { openDM(data.dmId, data.email); };
                channelList.appendChild(div);
                onValue(ref(db, `users/${data.email}`), function(userSnap) { if(userSnap.exists()) { globalUsersCache[data.email] = userSnap.val(); div.innerHTML = `<img src="${userSnap.val().avatar}" class="avatar-small"><span class="c-name">${userSnap.val().username}</span>`; } });
            }
        });
        if(chatType === 'home' && currentHomeTab === 'friends') renderHomeContent();
    });
}

function openDM(dmId, friendEmail) {
    chatType = 'dm'; currentChatId = dmId; 
    document.getElementById('home-area').style.display = 'none';
    document.getElementById('chat-area').style.display = 'flex';
    document.getElementById('chat-title').innerText = "DM";
    document.body.classList.remove('mobile-home-active');
    document.body.classList.add('mobile-chat-active');
    enableChat(); loadMessages(`dms/${currentChatId}`, "DM");
}

bindEvt('server-header-clickable', 'click', function(e) { e.stopPropagation(); if (currentServerId) { const d = document.getElementById('server-dropdown'); d.style.display = d.style.display === 'none' ? 'flex' : 'none'; } });
bindEvt('menu-add-category', 'click', function() { openInputModal("Add Category", "Category Name", "", function(name) { if (name && currentServerId) { push(ref(db, `categories/${currentServerId}`), { name: name.toUpperCase(), order: Date.now() }); } }); document.getElementById('server-dropdown').style.display='none'; });
bindEvt('menu-add-text', 'click', function() { openInputModal("Add Text Channel", "channel-name", "", function(name) { if (name && currentServerId) { push(ref(db, `channels/${currentServerId}`), { name: name.toLowerCase(), type: "text", order: Date.now() }); } }); document.getElementById('server-dropdown').style.display='none'; });

bindEvt('create-server-btn', 'click', function() {
    openInputModal("Create Server", "Server Name", "", function(serverName) {
        if (serverName) {
            const serverId = generateCode();
            set(ref(db, `servers/${serverId}`), { name: serverName, owner: auth.currentUser.email });
            set(ref(db, `server_members/${serverId}/${currentUserSafeEmail}`), { role: 'owner' });
            set(ref(db, `users/${currentUserSafeEmail}/servers/${serverId}`), { order: Date.now() });
            const catId = push(ref(db, `categories/${serverId}`)).key;
            set(ref(db, `categories/${serverId}/${catId}`), { name: "Information", order: 0 });
            push(ref(db, `channels/${serverId}`), { name: "general", type: "text", categoryId: catId, order: 0 });
        }
    });
});

function loadMyServers() {
    const serverList = document.getElementById('server-list');
    onValue(ref(db, `users/${currentUserSafeEmail}/servers`), async function(snap) {
        serverList.innerHTML = '';
        snap.forEach(function(child) {
            const serverId = child.key; 
            get(child(ref(db), `servers/${serverId}`)).then(function(sSnap) {
                if (sSnap.exists()) {
                    const sData = sSnap.val();
                    const div = document.createElement('div'); div.className = 'server-icon'; div.id = `server-${serverId}`;
                    if(sData.icon) { div.style.backgroundImage = `url(${sData.icon})`; } else { div.innerText = sData.name.charAt(0).toUpperCase(); }
                    div.addEventListener('click', function() {
                        document.body.classList.remove('mobile-chat-active'); document.body.classList.remove('mobile-home-active');
                        currentServerId = serverId;
                        document.getElementById('server-name-display').innerText = sData.name;
                        document.getElementById('home-sidebar-content').style.display = 'none';
                        document.getElementById('channel-list').style.display = 'block';
                        document.getElementById('home-area').style.display = 'none';
                        document.getElementById('chat-area').style.display = 'flex';
                        document.querySelectorAll('.server-icon').forEach(function(el) { el.classList.remove('active'); });
                        div.classList.add('active');
                        
                        // Fallback permissions check
                        get(ref(db, `servers/${serverId}/roles`)).then(function(rolesSnap) {
                            serverRolesCache = rolesSnap.val() || {};
                            let resolvedPerms = Object.assign({}, (serverRolesCache['everyone'] && serverRolesCache['everyone'].perms) ? serverRolesCache['everyone'].perms : { viewChannels: true, sendMessages: true });
                            if (sData.owner === auth.currentUser.email) { resolvedPerms = { viewChannels: true, sendMessages: true, manageChannels: true, manageServerSettings: true, manageRoles: true, manageMessages: true, kickMembers: true, banMembers: true, timeoutMembers: true }; } 
                            myServerPerms = resolvedPerms;
                            document.getElementById('menu-server-settings').style.display = myServerPerms.manageServerSettings ? 'flex' : 'none';
                            document.getElementById('menu-add-category').style.display = myServerPerms.manageChannels ? 'flex' : 'none';
                            document.getElementById('menu-add-text').style.display = myServerPerms.manageChannels ? 'flex' : 'none';
                        });

                        initChannelSync(serverId);
                    });
                    serverList.appendChild(div);
                }
            });
        });
    });
}

function initChannelSync(serverId) {
    if(unsubscribeChannels) unsubscribeChannels(); 
    if(unsubscribeCategories) unsubscribeCategories();
    unsubscribeChannels = onValue(ref(db, `channels/${serverId}`), function(snap) { currentChannelsData = snap.val() || {}; renderChannels(serverId); });
    unsubscribeCategories = onValue(ref(db, `categories/${serverId}`), function(snap) { currentCategoriesData = snap.val() || {}; renderChannels(serverId); });
}

function renderChannels(serverId) {
    const channelList = document.getElementById('channel-list');
    let categories = { "uncategorized": { name: "UNCATEGORIZED", order: -1 } };
    Object.keys(currentCategoriesData).forEach(function(k) { categories[k] = currentCategoriesData[k]; });
    let grouped = {}; Object.keys(categories).forEach(function(k) { grouped[k] = []; });
    
    Object.keys(currentChannelsData).forEach(function(cId) { 
        const c = currentChannelsData[cId]; c.id = cId; 
        const cid = c.categoryId && categories[c.categoryId] ? c.categoryId : "uncategorized"; 
        grouped[cid].push(c); 
    });
    
    channelList.innerHTML = '';
    Object.keys(categories).forEach(function(catId) {
        if(grouped[catId].length === 0 && catId === "uncategorized") return;
        if(catId !== "uncategorized") {
            const catDiv = document.createElement('div'); catDiv.className = 'channel-category'; catDiv.innerText = categories[catId].name;
            channelList.appendChild(catDiv);
        }
        grouped[catId].forEach(function(channelData) {
            const div = document.createElement('div'); div.className = 'channel-item'; 
            div.innerHTML = `<span class="c-name"># ${channelData.name}</span>`;
            div.addEventListener('click', function() { 
                chatType = 'server'; currentChatId = channelData.id; 
                document.getElementById('chat-title').innerText = channelData.name; 
                document.body.classList.remove('mobile-home-active'); document.body.classList.add('mobile-chat-active');
                enableChat(); loadMessages(`messages/${channelData.id}`, `# ${channelData.name}`); 
            });
            channelList.appendChild(div);
        });
    });
}

function enableChat() { 
    let canSend = true;
    document.getElementById('msg-input').disabled = !canSend; 
    document.getElementById('send-btn').disabled = !canSend; 
}

async function createMessageDOM(msgId, data) {
    const msgElement = document.createElement('div'); msgElement.className = 'message';
    let contentHtml = `<div class="msg-content-wrapper">${data.text}</div>`;
    if (data.imageUrl) { contentHtml += `<img src="${data.imageUrl}" class="message-image">`; }
    let headerHtml = `<div class="message-header"><span class="message-sender">${data.username}</span></div>`;
    msgElement.innerHTML = `${headerHtml}${contentHtml}`;
    return msgElement;
}

async function loadMessages(dbPath) {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.innerHTML = '';
    if (unsubscribeMessages) unsubscribeMessages();
    document.getElementById('chat-loading-spinner').style.display = 'block';
    
    const msgRef = query(ref(db, dbPath), limitToLast(50));
    get(msgRef).then(async function(initialSnap) {
        document.getElementById('chat-loading-spinner').style.display = 'none';
        const initialMessages = initialSnap.val() || {};
        for (let key in initialMessages) {
            const el = await createMessageDOM(key, initialMessages[key]);
            messagesDiv.appendChild(el);
        }
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        
        let highestTimestamp = Date.now();
        const liveRef = query(ref(db, dbPath), orderByChild('timestamp'), startAt(highestTimestamp));
        unsubscribeMessages = onChildAdded(liveRef, async function(childSnap) {
            const el = await createMessageDOM(childSnap.key, childSnap.val());
            messagesDiv.appendChild(el);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        });
    });
}

bindEvt('upload-img-btn', 'click', function() { document.getElementById('image-upload').click(); });
bindEvt('image-upload', 'change', async function(e) {
    const file = e.target.files[0]; if (!file || !currentChatId) return;
    const result = await compressImage(file, 800, 800, 0.85); 
    pendingAttachmentBase64 = result.compressed; 
    document.getElementById('attachment-preview-img').src = pendingAttachmentBase64; 
    document.getElementById('attachment-preview-area').style.display = 'flex'; 
    document.getElementById('image-upload').value = "";
});
bindEvt('remove-attachment-btn', 'click', function() { pendingAttachmentBase64 = null; document.getElementById('attachment-preview-area').style.display = 'none'; });

function sendMessage() {
    const input = document.getElementById('msg-input'); const text = input.value.trim();
    if ((text !== "" || pendingAttachmentBase64) && currentChatId) {
        const path = chatType === 'server' ? `messages/${currentChatId}` : `dms/${currentChatId}`;
        let msgPayload = { sender: auth.currentUser.email, username: myProfile.username, text: text, timestamp: Date.now() };
        if (pendingAttachmentBase64) { msgPayload.imageUrl = pendingAttachmentBase64; pendingAttachmentBase64 = null; document.getElementById('attachment-preview-area').style.display = 'none'; }
        push(ref(db, path), msgPayload);
        input.value = "";
    }
}
bindEvt('send-btn', 'click', sendMessage);

// Settings Modals Hooks
function setupServerSettingsTabs() {
    document.querySelectorAll('#server-settings-modal .fs-tab').forEach(function(tab) {
        tab.addEventListener('click', function(e) {
            const tabName = e.target.getAttribute('data-tab');
            document.querySelectorAll('#server-settings-modal .fs-tab').forEach(function(t) { t.classList.remove('active'); });
            e.target.classList.add('active');
            document.querySelectorAll('#server-settings-modal .ss-pane').forEach(function(p) { p.style.display = 'none'; });
            document.getElementById(`pane-ss-${tabName}`).style.display = 'block';
            document.querySelector('#server-settings-modal .fs-modal-layout').classList.add('mobile-viewing-content');
        });
    });
}
setupServerSettingsTabs();

bindEvt('menu-server-settings', 'click', function() {
    document.getElementById('server-dropdown').style.display='none';
    document.getElementById('server-settings-modal').style.display = 'flex'; 
    document.querySelector('#server-settings-modal .fs-tab[data-tab="profile"]').click();
});
bindEvt('ss-mobile-back', 'click', function() { document.querySelector('#server-settings-modal .fs-modal-layout').classList.remove('mobile-viewing-content'); });