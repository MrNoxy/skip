import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, push, onChildAdded, onChildRemoved, onValue, set, get, child, remove, onDisconnect, query, limitToLast, update, orderByChild, startAt, endAt } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

// ==========================================
// --- FIREBASE CONFIG ---
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyDkorKjbFJica8XAWMApXplIM_NFvCdPa4",
  authDomain: "skip-4bf6f.firebaseapp.com",
  databaseURL: "https://skip-4bf6f-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "skip-4bf6f",
  storageBucket: "skip-4bf6f.firebasestorage.app",
  messagingSenderId: "720098009724",
  appId: "1:720098009724:web:7d4eeed33ac67fe6385ff9"
};

// 🔑 Get your free KLIPY API key at https://partner.klipy.com
const KLIPY_API_KEY = "OXYWv0P0xGF52QET15zDaps3NWiweV7JRQCFBvKuy8s1EBdmgaBZSWuKiRSqbanr"; // Your test key

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const storage = getStorage(app);

// ==========================================
// --- STATE ---
// ==========================================
let currentServerId = null;
let currentChatId = null;
let chatType = 'home';
let currentHomeTab = 'friends';
let currentUserSafeEmail = null;
let myProfile = {};
let myServerPerms = { viewChannels: true, sendMessages: true, manageChannels: false, manageServerSettings: false, manageServerProfile: false, manageServerOverview: false, manageRoles: false, manageMessages: false, kickMembers: false, banMembers: false, timeoutMembers: false };
let myServerRoles = [];
let myServerMemberData = {};

let currentServerMembersList = [];
let currentDMOtherUser = null;
let serverRolesCache = {};
let globalUsersCache = {};
let activeFriendsData = [];
let globalEmojisCache = {};
let globalDecorationsCache = {};

let unsubscribeMessages = null;
let unsubscribeMessagesRemoved = null;
let unsubscribeMembers = null;
let unsubscribeChannels = null;
let unsubscribeCategories = null;
let unsubscribeVoiceRosters = null;
let unsubscribeMyMemberData = null;
let dmsNotifListener = null;
let serversNotifListener = null;

let replyingToMessage = null;
let pendingAttachment = null; // { url, type, name, size, mimeType }
let notificationsActive = true;
const appStartTime = Date.now();
let unreadState = { dms: new Set(), channels: new Set(), servers: new Set() };

let myPeer = null; let myCurrentPeerId = null; let localAudioStream = null;
let activeCalls = {}; let currentVoiceChannel = null; let isMuted = false; let isDeafened = false;
let currentServerVoiceRosters = {};

let currentChannelsData = {};
let currentCategoriesData = {};
let dragSrcEl = null;

const appContainer = document.getElementById('app-container');
const authSection = document.getElementById('auth-section');
const appBaseUrl = window.location.href.split('?')[0];

function sanitizeEmail(e) { return e.replace(/\./g, ','); }
function generateCode() { return Math.random().toString(36).substring(2, 10); }
function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

// SVG Icons
const icons = {
    textChannel: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>`,
    voiceChannel: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`,
    trash: `<svg class="svg-icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
    gear: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`,
    addFriend: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>`,
    removeFriend: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></svg>`,
    closeDM: `<svg class="svg-icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    reply: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>`,
    leave: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
    smile: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
    addReaction: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
    download: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    ban: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
    kick: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
    timeout: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    file: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`,
    video: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`,
    music: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
};

// Image Compressor
function compressImage(file, maxWidth, maxHeight, quality) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const originalDataUrl = e.target.result;
            const img = new Image();
            img.onload = () => {
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

// ==========================================
// --- TOAST SYSTEM ---
// ==========================================
function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons_map = { success: '✔', error: '✖', warning: '⚠', info: 'ℹ' };
    toast.innerHTML = `<span style="font-size:15px; flex-shrink:0;">${icons_map[type] || 'ℹ'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, duration);
    return toast;
}

// ==========================================
// --- PERMISSIONS ---
// ==========================================
function getCategoryPerm(categoryId, permName) {
    if (myServerPerms.manageServerSettings || myServerRoles.includes('owner')) return true;
    let result = !!myServerPerms[permName];
    const catData = currentCategoriesData[categoryId];
    if (!catData) return result;
    const ows = catData.overwrites || {};
    let oResult = null;
    if (ows['everyone'] && ows['everyone'][permName] !== undefined && ows['everyone'][permName] !== "inherit") {
        oResult = ows['everyone'][permName] === "allow";
    }
    let roleAllowed = false; let roleDenied = false; let roleSet = false;
    myServerRoles.forEach(rId => {
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
    if (myServerPerms.manageServerSettings || myServerRoles.includes('owner')) return true;
    let result = !!myServerPerms[permName];
    const channelData = currentChannelsData[channelId];
    if (!channelData) return result;
    const catId = channelData.categoryId;
    const catOverwrites = currentCategoriesData[catId]?.overwrites || {};
    const overwrites = channelData.overwrites || {};
    let evalOverwrites = (ows) => {
        let oResult = null;
        if (ows['everyone'] && ows['everyone'][permName] !== undefined && ows['everyone'][permName] !== "inherit") {
            oResult = ows['everyone'][permName] === "allow";
        }
        let roleAllowed = false; let roleDenied = false; let roleSet = false;
        myServerRoles.forEach(rId => {
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

// ==========================================
// --- MODAL CONTROLLERS ---
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
document.getElementById('confirm-modal-yes')?.addEventListener('click', () => { if (confirmCallback) confirmCallback(true); document.getElementById('confirm-modal').style.display = 'none'; });
document.getElementById('confirm-modal-no')?.addEventListener('click', () => { if (confirmCallback) confirmCallback(false); document.getElementById('confirm-modal').style.display = 'none'; });

let currentInputCallback = null;
function openInputModal(title, placeholder, desc, callback, defaultValue = "") {
    document.getElementById('input-modal-title').innerText = title;
    document.getElementById('input-modal-field').placeholder = placeholder;
    document.getElementById('input-modal-field').value = defaultValue;
    const descEl = document.getElementById('input-modal-desc');
    if (desc) { descEl.innerText = desc; descEl.style.display = 'block'; } else { descEl.style.display = 'none'; }
    currentInputCallback = callback;
    document.getElementById('input-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('input-modal-field').focus(), 50);
}
document.getElementById('input-modal-submit')?.addEventListener('click', () => {
    const val = document.getElementById('input-modal-field').value.trim();
    if (currentInputCallback) currentInputCallback(val);
    document.getElementById('input-modal').style.display = 'none';
});
document.getElementById('input-modal-cancel')?.addEventListener('click', () => { document.getElementById('input-modal').style.display = 'none'; });
document.getElementById('input-modal-field')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('input-modal-submit').click(); });

// Image Fullscreen
document.getElementById('image-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'image-modal' || e.target.id === 'close-image-modal') {
        document.getElementById('image-modal').style.display = 'none';
    }
});

function bindImageClick(imgEl) {
    if (!imgEl) return;
    imgEl.addEventListener('click', () => {
        const src = imgEl.getAttribute('data-original') || imgEl.src;
        document.getElementById('enlarged-image').src = src;
        document.getElementById('download-image-btn').href = src;
        document.getElementById('image-modal').style.display = 'flex';
    });
}

// ==========================================
// --- USER PROFILES & MODERATION ---
// ==========================================
window.showGlobalUserProfile = async function (email, event) {
    if (event) event.stopPropagation();
    const safeEmail = sanitizeEmail(email);
    const modal = document.getElementById('global-user-profile-modal');
    const content = modal.querySelector('.modal-content');

    const nameEl = document.getElementById('gup-username');
    const tagEl = document.getElementById('gup-tag');
    const avatarEl = document.getElementById('gup-avatar');
    const bannerEl = document.getElementById('gup-banner');
    const rolesContainer = document.getElementById('gup-roles-container');
    const sendMsgBtn = document.getElementById('gup-send-message');
    const addFriendBtn = document.getElementById('gup-add-friend');
    const removeFriendBtn = document.getElementById('gup-remove-friend');

    sendMsgBtn.style.display = 'none';
    addFriendBtn.style.display = 'none';
    removeFriendBtn.style.display = 'none';

    let modContainer = document.getElementById('gup-mod-actions');
    if (!modContainer) {
        modContainer = document.createElement('div');
        modContainer.id = 'gup-mod-actions';
        modContainer.style.cssText = 'display:none; margin-top:15px; padding-top:10px; border-top:1px solid var(--border-color); flex-direction:column; gap:5px;';
        document.getElementById('gup-username').closest('div[style]').appendChild(modContainer);
    }
    modContainer.style.display = 'none';
    modContainer.innerHTML = '';
    rolesContainer.style.display = 'none';
    rolesContainer.innerHTML = '';

    // Position popout near click
    if (event) {
        const x = Math.min(event.clientX, window.innerWidth - 360);
        const y = Math.min(event.clientY, window.innerHeight - 400);
        content.style.left = x + 'px';
        content.style.top = y + 'px';
    } else {
        content.style.left = '50%';
        content.style.top = '50%';
        content.style.transform = 'translate(-50%,-50%)';
    }

    modal.style.display = 'block';

    const uSnap = await get(child(ref(db), `users/${safeEmail}`));
    if (uSnap.exists()) {
        const uData = uSnap.val();
        globalUsersCache[safeEmail] = uData;

        nameEl.innerText = uData.username;
        tagEl.innerText = `#${uData.tag}`;
        
        // --- NEW DECORATION CODE ---
        // Instead of just setting the image source, we inject the whole avatar container
        const avatarContainerWrapper = avatarEl.parentElement;
        // Make sure the wrapper isn't creating duplicate containers
        avatarContainerWrapper.innerHTML = getAvatarHTML(uData, 'avatar-large');
        
        // We need to re-apply the specific positioning that the popout uses
        const newAvatarContainer = avatarContainerWrapper.querySelector('.avatar-container');
        if(newAvatarContainer) {
            newAvatarContainer.style.position = 'absolute';
            newAvatarContainer.style.top = '-50px';
            newAvatarContainer.style.left = '15px';
            newAvatarContainer.style.border = '5px solid var(--bg-secondary)';
            newAvatarContainer.style.borderRadius = '50%';
            newAvatarContainer.style.background = 'var(--bg-secondary)';
        }
        // ---------------------------
        
        bannerEl.style.backgroundImage = 'none';

        if (currentServerId) {
            const memSnap = await get(ref(db, `server_members/${currentServerId}/${safeEmail}`));
            if (memSnap.exists()) {
                const memInfo = memSnap.val();
                const userRoles = memInfo.roles ? Object.keys(memInfo.roles) : (memInfo.role && memInfo.role !== 'member' ? [memInfo.role] : []);

                rolesContainer.style.display = 'block';
                const rolesTitle = document.createElement('div');
                rolesTitle.style.cssText = 'font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:700; letter-spacing:0.05em; margin-bottom:8px;';
                rolesTitle.innerText = 'Roles';
                rolesContainer.appendChild(rolesTitle);

                const roleFlex = document.createElement('div');
                roleFlex.style.cssText = 'display:flex; flex-wrap:wrap; gap:5px;';

                userRoles.forEach(rId => {
                    if (serverRolesCache[rId]) {
                        const badge = document.createElement('span');
                        badge.className = 'role-badge';
                        badge.innerHTML = `<span style="color:${serverRolesCache[rId].color};">●</span> ${serverRolesCache[rId].name}`;
                        if ((myServerPerms.manageRoles || myServerRoles.includes('owner')) && safeEmail !== currentUserSafeEmail) {
                            badge.style.cursor = 'pointer';
                            badge.title = 'Click to remove role';
                            badge.onclick = async () => {
                                let newRoles = {};
                                userRoles.forEach(r => { if (r !== rId) newRoles[r] = true; });
                                await update(ref(db, `server_members/${currentServerId}/${safeEmail}`), { roles: Object.keys(newRoles).length ? newRoles : null });
                                showGlobalUserProfile(email);
                            };
                        }
                        roleFlex.appendChild(badge);
                    }
                });

                if ((myServerPerms.manageRoles || myServerRoles.includes('owner')) && safeEmail !== currentUserSafeEmail) {
                    const addRoleBtn = document.createElement('button');
                    addRoleBtn.style.cssText = 'background:var(--bg-hover); border:1px dashed var(--border-color); color:var(--text-muted); padding:2px 8px; font-size:11px; margin:0; border-radius:4px;';
                    addRoleBtn.innerText = '+ Add Role';
                    addRoleBtn.onclick = (e) => openQuickRoleDropdown(safeEmail, userRoles, e.currentTarget);
                    roleFlex.appendChild(addRoleBtn);
                }
                if (roleFlex.children.length > 0) rolesContainer.appendChild(roleFlex);
                else rolesContainer.style.display = 'none';

                if (safeEmail !== currentUserSafeEmail && (myServerRoles.includes('owner') || myServerPerms.kickMembers || myServerPerms.banMembers || myServerPerms.timeoutMembers)) {
                    modContainer.style.display = 'flex';
                    if (myServerRoles.includes('owner') || myServerPerms.timeoutMembers) {
                        const isTimedOut = memInfo.timeoutUntil && memInfo.timeoutUntil > Date.now();
                        const timeoutBtn = document.createElement('button');
                        timeoutBtn.innerHTML = isTimedOut ? `${icons.timeout} Remove Timeout` : `${icons.timeout} Timeout Member`;
                        timeoutBtn.style.cssText = 'background:transparent; border:1px solid var(--border-color); color:var(--text-bright); margin:0; display:flex; gap:8px; align-items:center;';
                        timeoutBtn.onclick = () => {
                            if (isTimedOut) {
                                update(ref(db, `server_members/${currentServerId}/${safeEmail}`), { timeoutUntil: null });
                                showToast(`${uData.username}'s timeout removed.`, 'success'); modal.style.display = 'none';
                            } else {
                                openInputModal("Timeout User", "Minutes (e.g. 10)", "How many minutes?", async (mins) => {
                                    const m = parseInt(mins);
                                    if (m && m > 0) { await update(ref(db, `server_members/${currentServerId}/${safeEmail}`), { timeoutUntil: Date.now() + m * 60000 }); showToast(`${uData.username} timed out for ${m} min.`, 'warning'); modal.style.display = 'none'; }
                                });
                            }
                        };
                        modContainer.appendChild(timeoutBtn);
                    }
                    if (myServerRoles.includes('owner') || myServerPerms.kickMembers) {
                        const kickBtn = document.createElement('button');
                        kickBtn.innerHTML = `${icons.kick} Kick Member`;
                        kickBtn.style.cssText = 'background:transparent; border:1px solid var(--accent-warning); color:var(--accent-warning); margin:0; display:flex; gap:8px; align-items:center;';
                        kickBtn.onclick = () => { customConfirm(`Kick ${uData.username}?`, "Kick Member", async (yes) => { if (yes) { await remove(ref(db, `server_members/${currentServerId}/${safeEmail}`)); await remove(ref(db, `users/${safeEmail}/servers/${currentServerId}`)); modal.style.display = 'none'; showToast(`${uData.username} was kicked.`, 'success'); } }); };
                        modContainer.appendChild(kickBtn);
                    }
                    if (myServerRoles.includes('owner') || myServerPerms.banMembers) {
                        const banBtn = document.createElement('button');
                        banBtn.innerHTML = `${icons.ban} Ban Member`;
                        banBtn.style.cssText = 'background:transparent; border:1px solid var(--accent-danger); color:var(--accent-danger); margin:0; display:flex; gap:8px; align-items:center;';
                        banBtn.onclick = () => { customConfirm(`Permanently ban ${uData.username}?`, "Ban Member", async (yes) => { if (yes) { await set(ref(db, `servers/${currentServerId}/bans/${safeEmail}`), { timestamp: Date.now(), by: currentUserSafeEmail }); await remove(ref(db, `server_members/${currentServerId}/${safeEmail}`)); await remove(ref(db, `users/${safeEmail}/servers/${currentServerId}`)); modal.style.display = 'none'; showToast(`${uData.username} was banned.`, 'success'); } }); };
                        modContainer.appendChild(banBtn);
                    }
                }
            }
        }

        if (safeEmail !== currentUserSafeEmail) {
            const friendSnap = await get(ref(db, `users/${currentUserSafeEmail}/friends/${safeEmail}`));
            sendMsgBtn.style.display = 'flex';
            sendMsgBtn.onclick = async () => {
                modal.style.display = 'none';
                const dmId = [currentUserSafeEmail, safeEmail].sort().join('_');
                await update(ref(db, `users/${currentUserSafeEmail}/friends/${safeEmail}`), { dmId, hidden: false, lastActivity: Date.now() });
                if (!globalUsersCache[safeEmail]) globalUsersCache[safeEmail] = uData;
                switchToHomeView(); openDM(dmId, safeEmail);
            };
            if (!friendSnap.exists()) {
                addFriendBtn.style.display = 'flex';
                addFriendBtn.onclick = async () => { await set(ref(db, `friend_requests/${safeEmail}/${currentUserSafeEmail}`), { username: myProfile.username, avatar: myProfile.avatar, timestamp: Date.now() }); showToast(`Friend request sent to ${uData.username}!`, 'success'); modal.style.display = 'none'; };
            } else {
                removeFriendBtn.style.display = 'flex';
                removeFriendBtn.onclick = () => { customConfirm(`Remove ${uData.username} from friends?`, "Remove Friend", async (yes) => { if (yes) { await remove(ref(db, `users/${currentUserSafeEmail}/friends/${safeEmail}`)); await remove(ref(db, `users/${safeEmail}/friends/${currentUserSafeEmail}`)); modal.style.display = 'none'; } }); };
            }
        }
    }
};

window.handleMentionClick = function (username, event) {
    event.stopPropagation();
    let foundEmail = null;
    currentServerMembersList.forEach(m => { if (m.username === username) foundEmail = m.email; });
    if (!foundEmail) Object.keys(globalUsersCache).forEach(email => { if (globalUsersCache[email].username === username) foundEmail = email; });
    if (foundEmail) showGlobalUserProfile(foundEmail, event);
};

document.getElementById('global-user-profile-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'global-user-profile-modal') {
        e.target.style.display = 'none';
        const drp = document.getElementById('role-quick-dropdown');
        if (drp) drp.remove();
    }
});

function openQuickRoleDropdown(targetEmail, currentRolesArray, anchorEl) {
    let existing = document.getElementById('role-quick-dropdown');
    if (existing) existing.remove();
    const dropdown = document.createElement('div');
    dropdown.id = 'role-quick-dropdown';
    dropdown.style.cssText = 'position:fixed; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:6px; padding:5px; box-shadow:0 8px 24px rgba(0,0,0,0.6); z-index:9999; max-height:200px; overflow-y:auto; animation:slideUp 0.15s ease;';
    let hasOpts = false;
    Object.keys(serverRolesCache).forEach(rId => {
        if (rId === 'everyone' || currentRolesArray.includes(rId)) return;
        hasOpts = true;
        const opt = document.createElement('div');
        opt.style.cssText = 'padding:7px 12px; cursor:pointer; border-radius:4px; color:var(--text-bright); font-size:13px; transition:background 0.1s;';
        opt.innerText = serverRolesCache[rId].name;
        opt.onmouseover = () => opt.style.background = 'var(--accent-primary)';
        opt.onmouseout = () => opt.style.background = 'transparent';
        opt.onclick = async (e) => {
            e.stopPropagation();
            let newRoles = {};
            currentRolesArray.forEach(r => newRoles[r] = true);
            newRoles[rId] = true;
            await update(ref(db, `server_members/${currentServerId}/${targetEmail}`), { roles: newRoles });
            dropdown.remove();
            showGlobalUserProfile(targetEmail);
        };
        dropdown.appendChild(opt);
    });
    if (!hasOpts) dropdown.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px 12px;">No roles available</div>';
    document.body.appendChild(dropdown);
    const rect = anchorEl.getBoundingClientRect();
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 5}px`;
    setTimeout(() => {
        document.addEventListener('click', function closeDrp(e) {
            if (!dropdown.contains(e.target)) { dropdown.remove(); document.removeEventListener('click', closeDrp); }
        });
    }, 10);
}

// ==========================================
// --- CONTEXT MENU ---
// ==========================================
let contextTarget = null;
const ctxMenu = document.getElementById('context-menu');

function showContextMenu(e, type, id) {
    e.preventDefault();
    let html = '';
    if (type === 'channel') {
        if (!myServerPerms.manageChannels && !myServerPerms.manageServerSettings && !myServerRoles.includes('owner')) return;
        html += `<div class="context-item" id="ctx-edit">${icons.gear} Edit Channel</div>`;
        html += `<div class="context-item" id="ctx-delete" style="color:var(--accent-danger);">${icons.trash} Delete Channel</div>`;
    } else if (type === 'category') {
        if (!myServerPerms.manageChannels && !myServerPerms.manageServerSettings && !myServerRoles.includes('owner')) return;
        html += `<div class="context-item" id="ctx-cat-add-text">${icons.textChannel} Add Text Channel</div>`;
        html += `<div class="context-item" id="ctx-cat-add-voice">${icons.voiceChannel} Add Voice Channel</div>`;
        html += `<div style="height:1px;background:var(--border-color);margin:4px 0;"></div>`;
        html += `<div class="context-item" id="ctx-edit">${icons.gear} Edit Category</div>`;
        html += `<div class="context-item" id="ctx-delete" style="color:var(--accent-danger);">${icons.trash} Delete Category</div>`;
    } else if (type === 'dm') {
        html = `<div class="context-item" id="ctx-delete" style="color:var(--accent-danger);">${icons.closeDM} Close DM</div>`;
    } else if (type === 'friend') {
        html = `<div class="context-item" id="ctx-delete" style="color:var(--accent-danger);">${icons.removeFriend} Remove Friend</div>`;
    } else if (type === 'emoji') {
        html = `<div class="context-item" id="ctx-save-emoji">${icons.addFriend} Save Emoji</div>`;
    }
    if (html === '') return;
    ctxMenu.innerHTML = html;
    contextTarget = { type, id };
    ctxMenu.style.display = 'flex';
    const x = Math.min(e.pageX || (e.touches?.[0]?.pageX) || 0, window.innerWidth - 200);
    const y = Math.min(e.pageY || (e.touches?.[0]?.pageY) || 0, window.innerHeight - 200);
    ctxMenu.style.left = `${x}px`;
    ctxMenu.style.top = `${y}px`;
}

document.addEventListener('contextmenu', (e) => {
    if (e.target.classList.contains('custom-emoji')) {
        const eid = e.target.getAttribute('data-id');
        if (eid) showContextMenu(e, 'emoji', eid);
    }
});

document.addEventListener('click', (e) => {
    const ctxDel = e.target.closest('#ctx-delete');
    const ctxEdit = e.target.closest('#ctx-edit');
    const ctxSaveEmoji = e.target.closest('#ctx-save-emoji');
    const ctxAddText = e.target.closest('#ctx-cat-add-text');
    const ctxAddVoice = e.target.closest('#ctx-cat-add-voice');

    if (ctxDel && contextTarget) {
        if (contextTarget.type === 'dm') {
            update(ref(db, `users/${currentUserSafeEmail}/friends/${contextTarget.id}`), { hidden: true });
        } else if (contextTarget.type === 'friend') {
            customConfirm("Remove this friend?", "Remove Friend", (yes) => {
                if (yes) { remove(ref(db, `users/${currentUserSafeEmail}/friends/${contextTarget.id}`)); remove(ref(db, `users/${contextTarget.id}/friends/${currentUserSafeEmail}`)); }
            });
        } else if (currentServerId) {
            customConfirm(`Delete this ${contextTarget.type}?`, "Confirm", (yes) => {
                if (yes) {
                    if (contextTarget.type === 'channel') { remove(ref(db, `channels/${currentServerId}/${contextTarget.id}`)); remove(ref(db, `messages/${contextTarget.id}`)); }
                    else if (contextTarget.type === 'category') { remove(ref(db, `categories/${currentServerId}/${contextTarget.id}`)); }
                }
            });
        }
        ctxMenu.style.display = 'none';
    } else if (ctxEdit && contextTarget) {
        if (contextTarget.type === 'channel') openChannelSettings(contextTarget.id, 'channel');
        else if (contextTarget.type === 'category') openChannelSettings(contextTarget.id, 'category');
        ctxMenu.style.display = 'none';
    } else if (ctxAddText && contextTarget) {
        openInputModal("Add Text Channel", "channel-name", "", (name) => { if (name && currentServerId) push(ref(db, `channels/${currentServerId}`), { name: name.toLowerCase(), type: "text", categoryId: contextTarget.id, order: Date.now() }); });
        ctxMenu.style.display = 'none';
    } else if (ctxAddVoice && contextTarget) {
        openInputModal("Add Voice Channel", "Lounge", "", (name) => { if (name && currentServerId) push(ref(db, `channels/${currentServerId}`), { name, type: "voice", categoryId: contextTarget.id, order: Date.now() }); });
        ctxMenu.style.display = 'none';
    } else if (ctxSaveEmoji && contextTarget) {
        const targetEmoji = globalEmojisCache[contextTarget.id];
        if (targetEmoji) { set(ref(db, `users/${currentUserSafeEmail}/emojis/${contextTarget.id}`), true); showToast('Emoji saved to your collection!', 'success'); }
        ctxMenu.style.display = 'none';
    }
    if (ctxMenu && !e.target.closest('#context-menu')) ctxMenu.style.display = 'none';
});

// ==========================================
// --- AUTH & PROFILE ---
// ==========================================
document.getElementById('register-btn')?.addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const safeEmail = sanitizeEmail(email);
        const baseName = email.split('@')[0];
        const randomTag = Math.floor(1000 + Math.random() * 9000).toString();
        const defaultAvatar = `https://ui-avatars.com/api/?name=${baseName.charAt(0)}&background=4d78cc&color=fff&size=256`;
        await set(ref(db, `users/${safeEmail}`), { email, uid: userCredential.user.uid, username: baseName, tag: randomTag, avatar: defaultAvatar, status: 'online', saved_status: 'online' });
        await set(ref(db, `user_tags/${baseName}_${randomTag}`), safeEmail);
        showToast('Account created! Welcome to Skip 🎉', 'success');
    } catch (error) { customAlert(error.message, "Registration Error"); }
});

document.getElementById('login-btn')?.addEventListener('click', () => {
    signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value)
        .catch(e => customAlert(e.message, "Login Error"));
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        authSection.style.display = 'none';
        appContainer.style.display = 'flex';
        currentUserSafeEmail = sanitizeEmail(user.email);

        onValue(ref(db, `users/${currentUserSafeEmail}`), (snapshot) => {
            if (snapshot.exists()) {
                myProfile = snapshot.val();
                
                // 1. ADD YOURSELF TO THE CACHE (Fixes the "when I send a message" bug!)
                globalUsersCache[currentUserSafeEmail] = myProfile;

                // 2. Update the text
                document.getElementById('user-display').innerText = myProfile.username;
                document.getElementById('user-tag-display').innerText = `#${myProfile.tag}`;
                
                // 3. Update the bottom-left avatar panel to use the decoration helper
                const userControls = document.getElementById('user-controls');
                const oldAvatar = userControls.querySelector('.avatar-container');
                if (oldAvatar) {
                    oldAvatar.outerHTML = getAvatarHTML(myProfile, 'avatar-small');
                    // Re-bind the click event for the status popup since we replaced the HTML
                    userControls.querySelector('.status-indicator').addEventListener('click', (e) => { 
                        e.stopPropagation(); document.getElementById('status-selector').style.display = 'block'; 
                    });
                }
            }
        });

        // --- NEW: DYNAMIC CSS INJECTOR ---
        onValue(ref(db, 'decorations'), snap => { 
            globalDecorationsCache = snap.val() || {}; 
            
            // 1. Create a <style> tag if it doesn't exist
            let styleTag = document.getElementById('dynamic-decorations-css');
            if (!styleTag) {
                styleTag = document.createElement('style');
                styleTag.id = 'dynamic-decorations-css';
                document.head.appendChild(styleTag);
            }
            
            // 2. Combine all the CSS from Firebase and inject it!
            let fullCSS = '';
            Object.values(globalDecorationsCache).forEach(dec => {
                if (dec.css) fullCSS += dec.css + '\n';
            });
            styleTag.innerHTML = fullCSS;

            // 3. Update the UI
            loadDecorationsUI(); 
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
        document.getElementById('home-btn').click();
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('invite')) { await joinServerByCode(urlParams.get('invite')); window.history.replaceState({}, document.title, appBaseUrl); }
    } else {
        authSection.style.display = 'block'; appContainer.style.display = 'none';
    }
});

// ==========================================
// --- USER SETTINGS ---
// ==========================================
let tempBase64Avatar = null;

function setupUserSettingsTabs() {
    document.querySelectorAll('#user-settings-modal .fs-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabName = e.target.getAttribute('data-tab');
            if (!tabName) return;
            document.querySelectorAll('#user-settings-modal .fs-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            document.querySelectorAll('#user-settings-modal .ss-pane').forEach(p => p.style.display = 'none');
            document.getElementById(`pane-us-${tabName}`).style.display = 'block';
            if (window.innerWidth <= 768) document.querySelector('#user-settings-modal .fs-modal-layout').classList.add('mobile-viewing-content');
            if (tabName === 'emojis') loadPersonalEmojis();
            if (tabName === 'security') {
                document.getElementById('security-email-display').innerText = auth.currentUser?.email || '';
            }
        });
    });
}
setupUserSettingsTabs();

document.getElementById('us-mobile-back')?.addEventListener('click', () => { document.querySelector('#user-settings-modal .fs-modal-layout').classList.remove('mobile-viewing-content'); });
document.getElementById('close-user-settings-btn')?.addEventListener('click', () => document.getElementById('user-settings-modal').style.display = 'none');

document.getElementById('user-controls')?.addEventListener('click', (e) => {
    if (e.target.id === 'my-status-indicator' || e.target.closest('#status-selector')) return;
    document.getElementById('edit-username').value = myProfile.username;
    document.getElementById('edit-tag').value = myProfile.tag;
    document.getElementById('profile-preview').src = myProfile.avatar;
    tempBase64Avatar = myProfile.avatar;
    document.getElementById('user-settings-modal').style.display = 'flex';
    document.querySelector('#user-settings-modal .fs-modal-layout').classList.remove('mobile-viewing-content');
    document.querySelector('#user-settings-modal .fs-tab[data-tab="account"]').click();
    loadPersonalEmojis();
});

document.getElementById('us-logout-btn')?.addEventListener('click', () => {
    leaveVoiceChannel();
    if (currentUserSafeEmail) set(ref(db, `users/${currentUserSafeEmail}/status`), 'offline');
    signOut(auth);
});

// Avatar upload - supports GIFs!
document.getElementById('avatar-upload')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type === 'image/gif') {
        // Keep GIF as-is for animation
        const reader = new FileReader();
        reader.onload = (ev) => {
            tempBase64Avatar = ev.target.result;
            document.getElementById('profile-preview').src = tempBase64Avatar;
        };
        reader.readAsDataURL(file);
    } else {
        const result = await compressImage(file, 256, 256, 0.85);
        tempBase64Avatar = result.compressed;
        document.getElementById('profile-preview').src = tempBase64Avatar;
    }
});

document.getElementById('save-profile-btn')?.addEventListener('click', async () => {
    const newUsername = document.getElementById('edit-username').value.trim();
    const newTag = document.getElementById('edit-tag').value.trim();
    if (!newUsername || !newTag) return customAlert("Fields cannot be empty", "Error");
    await remove(ref(db, `user_tags/${myProfile.username}_${myProfile.tag}`));
    await set(ref(db, `user_tags/${newUsername}_${newTag}`), currentUserSafeEmail);
    await update(ref(db, `users/${currentUserSafeEmail}`), { username: newUsername, tag: newTag, avatar: tempBase64Avatar });
    showToast('Profile saved!', 'success');
});

// --- SECURITY: Change Password ---
document.getElementById('change-password-btn')?.addEventListener('click', async () => {
    const currentPass = document.getElementById('current-password').value;
    const newPass = document.getElementById('new-password').value;
    const confirmPass = document.getElementById('confirm-new-password').value;
    if (!currentPass || !newPass || !confirmPass) return customAlert("Please fill in all fields.", "Error");
    if (newPass !== confirmPass) return customAlert("New passwords don't match.", "Error");
    if (newPass.length < 6) return customAlert("New password must be at least 6 characters.", "Error");
    try {
        const user = auth.currentUser;
        const credential = EmailAuthProvider.credential(user.email, currentPass);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, newPass);
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-new-password').value = '';
        showToast('Password updated successfully!', 'success');
    } catch (err) {
        if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
            customAlert("Current password is incorrect.", "Error");
        } else {
            customAlert(err.message, "Error");
        }
    }
});

// Personal Emojis
function loadPersonalEmojis() {
    const list = document.getElementById('us-emojis-list');
    onValue(ref(db, `users/${currentUserSafeEmail}/emojis`), async (snap) => {
        list.innerHTML = '';
        if (!snap.exists()) { list.innerHTML = '<p style="color:var(--text-muted); font-size:13px;">No personal emojis yet. Save some from server emojis!</p>'; return; }
        for (let eId of Object.keys(snap.val())) {
            const eData = globalEmojisCache[eId];
            if (eData) {
                const d = document.createElement('div');
                d.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:8px; border-radius:6px; background:var(--bg-main); margin-bottom:4px;';
                d.innerHTML = `<div style="display:flex;align-items:center;gap:10px;"><img src="${eData.url}" class="custom-emoji"> <span style="color:var(--text-bright);">:${eData.name}:</span></div><button class="small-btn" style="background:transparent;border:1px solid var(--accent-danger);color:var(--accent-danger);margin:0;">Remove</button>`;
                d.querySelector('button').onclick = () => remove(ref(db, `users/${currentUserSafeEmail}/emojis/${eId}`));
                list.appendChild(d);
            }
        }
    });
}


document.getElementById('us-emoji-file')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) document.getElementById('us-emoji-filename').innerText = `Selected: ${file.name}`;
});

document.getElementById('us-upload-emoji-btn')?.addEventListener('click', async () => {
    const file = document.getElementById('us-emoji-file').files[0];
    const name = document.getElementById('us-emoji-name').value.trim().replace(/[^a-zA-Z0-9_]/g, '');
    if (!file || !name) return customAlert("Please select an image and enter a valid name.");
    const result = await compressImage(file, 128, 128, 0.9);
    const emojiId = push(ref(db, 'emojis')).key;
    await set(ref(db, `emojis/${emojiId}`), { name, url: result.compressed });
    await set(ref(db, `users/${currentUserSafeEmail}/emojis/${emojiId}`), true);
    document.getElementById('us-emoji-file').value = "";
    document.getElementById('us-emoji-filename').innerText = '';
    document.getElementById('us-emoji-name').value = "";
    showToast(`Emoji :${name}: uploaded!`, 'success');
});

// Status Dropdown
document.getElementById('my-status-indicator')?.addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('status-selector').style.display = 'block'; });
document.querySelectorAll('.status-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
        const s = e.target.getAttribute('data-status');
        update(ref(db, `users/${currentUserSafeEmail}`), { status: s, saved_status: s });
        document.getElementById('status-selector').style.display = 'none';
    });
});
document.addEventListener('click', (e) => {
    if (!e.target.closest('#user-controls')) { const s = document.getElementById('status-selector'); if (s) s.style.display = 'none'; }
    if (!e.target.closest('#sidebar-header') && !e.target.closest('#server-settings-modal') && !e.target.closest('#channel-settings-modal')) { const sd = document.getElementById('server-dropdown'); if (sd) sd.style.display = 'none'; }
});

// ==========================================
// --- NAVIGATION ---
// ==========================================
function switchToHomeView() {
    document.body.classList.remove('mobile-chat-active', 'mobile-home-active');
    chatType = 'home'; currentChatId = null; currentServerId = null;
    document.getElementById('server-name-display').innerText = "Friends & DMs";
    document.getElementById('server-dropdown-arrow').style.display = 'none';
    document.getElementById('sidebar-header').classList.remove('server-header-banner');
    document.getElementById('sidebar-header').style.backgroundImage = 'none';
    document.getElementById('server-stats-display').style.display = 'none';
    document.getElementById('home-sidebar-content').style.display = 'block';
    document.getElementById('channel-list').style.display = 'none';
    document.getElementById('chat-area').style.display = 'none';
    document.getElementById('home-area').style.display = 'flex';
    document.getElementById('server-dropdown').style.display = 'none';
    document.getElementById('toggle-members-btn').style.display = 'none';
    document.getElementById('member-sidebar').style.display = 'none';
    if (unsubscribeMembers) { unsubscribeMembers(); unsubscribeMembers = null; }
    if (unsubscribeChannels) { unsubscribeChannels(); unsubscribeChannels = null; }
    if (unsubscribeCategories) { unsubscribeCategories(); unsubscribeCategories = null; }
    if (unsubscribeVoiceRosters) { unsubscribeVoiceRosters(); unsubscribeVoiceRosters = null; }
    if (unsubscribeMyMemberData) { unsubscribeMyMemberData(); unsubscribeMyMemberData = null; }
    document.getElementById('voice-controls-area').style.display = currentVoiceChannel ? 'flex' : 'none';
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
    document.getElementById('home-btn').classList.add('active');
    renderHomeContent();
}

document.getElementById('home-btn')?.addEventListener('click', switchToHomeView);
document.getElementById('mobile-back-btn')?.addEventListener('click', () => { document.body.classList.remove('mobile-chat-active', 'mobile-home-active'); });
document.getElementById('mobile-back-btn-home')?.addEventListener('click', () => { document.body.classList.remove('mobile-chat-active', 'mobile-home-active'); });
document.getElementById('nav-friends-btn')?.addEventListener('click', () => { currentHomeTab = 'friends'; if (chatType !== 'home') switchToHomeView(); document.body.classList.add('mobile-home-active'); renderHomeContent(); });
document.getElementById('nav-requests-btn')?.addEventListener('click', () => { currentHomeTab = 'requests'; if (chatType !== 'home') switchToHomeView(); document.body.classList.add('mobile-home-active'); renderHomeContent(); });

function renderHomeContent() {
    if (chatType !== 'home') return;
    const content = document.getElementById('home-content');
    const hFriends = document.getElementById('home-header-friends');
    const hRequests = document.getElementById('home-header-requests');
    document.getElementById('nav-friends-btn').classList.toggle('active', currentHomeTab === 'friends');
    document.getElementById('nav-requests-btn').classList.toggle('active', currentHomeTab === 'requests');

    if (currentHomeTab === 'friends') {
        hFriends.style.display = 'flex'; hRequests.style.display = 'none';
        content.innerHTML = '';
        if (activeFriendsData.length === 0) { content.innerHTML = '<p style="color:var(--text-muted);margin-top:20px;">No friends yet. Add someone by their Username#Tag!</p>'; return; }
        const hdr = document.createElement('div');
        hdr.style.cssText = 'font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:12px; letter-spacing:0.05em;';
        hdr.innerText = `All Friends — ${activeFriendsData.filter(f => !f.hidden).length}`;
        content.appendChild(hdr);
        activeFriendsData.filter(f => !f.hidden).forEach(fData => {
            const fEmail = fData.email;
            const u = globalUsersCache[fEmail] || {};
            const div = document.createElement('div'); div.className = 'friend-card';
            
            // Replaced the hardcoded avatar container with getAvatarHTML()
            div.innerHTML = `<div class="friend-card-left">${getAvatarHTML(u, 'avatar-small')}<div><div style="font-weight:600;color:var(--text-bright);">${u.username || '...'}</div><div style="font-size:12px;color:var(--text-muted);">${u.status || 'offline'}</div></div></div>
            <div class="friend-card-right"><div class="action-circle" title="Message" onclick="(async()=>{ const dmId='${[currentUserSafeEmail, fEmail].sort().join('_')}'; await update(ref(db,'users/${currentUserSafeEmail}/friends/${fEmail}'),{dmId,hidden:false,lastActivity:Date.now()}); openDM(dmId,'${fEmail}'); })()"><svg width='18' height='18' viewBox='0 0 24 24' fill='currentColor'><path d='M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z'/></svg></div><div class="action-circle red" title="Remove Friend" onclick="customConfirm('Remove this friend?','Remove Friend',(yes)=>{if(yes){remove(ref(db,'users/${currentUserSafeEmail}/friends/${fEmail}'));remove(ref(db,'users/${fEmail}/friends/${currentUserSafeEmail}'));}})"><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'/><circle cx='8.5' cy='7' r='4'/><line x1='18' y1='8' x2='23' y2='13'/><line x1='23' y1='8' x2='18' y2='13'/></svg></div></div>`;
            
            div.addEventListener('contextmenu', (e) => showContextMenu(e, 'friend', fEmail));
            content.appendChild(div);
        });
    } else {
        hFriends.style.display = 'none'; hRequests.style.display = 'flex';
        content.innerHTML = '';
        get(ref(db, `friend_requests/${currentUserSafeEmail}`)).then(snap => {
            if (!snap.exists() || Object.keys(snap.val()).length === 0) { content.innerHTML = '<p style="color:var(--text-muted);margin-top:20px;">No pending friend requests.</p>'; return; }
            const hdr = document.createElement('div');
            hdr.style.cssText = 'font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:12px;';
            hdr.innerText = `Pending — ${Object.keys(snap.val()).length}`;
            content.appendChild(hdr);
            snap.forEach(reqSnap => {
                const senderEmail = reqSnap.key; const reqData = reqSnap.val();
                const div = document.createElement('div'); div.className = 'friend-card';
                div.innerHTML = `<div class="friend-card-left"><div class="avatar-container"><img src="${reqData.avatar || ''}" class="avatar-small" style="background:var(--bg-tertiary);"></div><div><div style="font-weight:600;color:var(--text-bright);">${reqData.username || senderEmail}</div><div style="font-size:12px;color:var(--text-muted);">Incoming Friend Request</div></div></div>
                <div class="friend-card-right"><button class="accept-fr" style="background:var(--accent-success);color:#0d1117;margin:0;padding:6px 14px;font-size:12px;">Accept</button><button class="decline-fr" style="background:transparent;border:1px solid var(--accent-danger);color:var(--accent-danger);margin:0;margin-left:8px;padding:6px 14px;font-size:12px;">Decline</button></div>`;
                div.querySelector('.accept-fr').addEventListener('click', async () => {
                    await remove(ref(db, `friend_requests/${currentUserSafeEmail}/${senderEmail}`));
                    const dmId = [currentUserSafeEmail, senderEmail].sort().join('_');
                    await update(ref(db, `users/${currentUserSafeEmail}/friends/${senderEmail}`), { dmId, hidden: false, lastActivity: Date.now() });
                    await update(ref(db, `users/${senderEmail}/friends/${currentUserSafeEmail}`), { dmId, hidden: false, lastActivity: Date.now() });
                    showToast(`You and ${reqData.username} are now friends!`, 'success');
                    renderHomeContent();
                });
                div.querySelector('.decline-fr').addEventListener('click', async () => { await remove(ref(db, `friend_requests/${currentUserSafeEmail}/${senderEmail}`)); renderHomeContent(); });
                content.appendChild(div);
            });
        });
    }
}

function listenForFriendRequests() {
    onValue(ref(db, `friend_requests/${currentUserSafeEmail}`), (snap) => {
        const badge = document.getElementById('fr-badge');
        const count = snap.exists() ? Object.keys(snap.val()).length : 0;
        if (badge) { badge.style.display = count > 0 ? 'block' : 'none'; badge.innerText = count > 0 ? count : ''; }
        if (currentHomeTab === 'requests' && chatType === 'home') renderHomeContent();
    });
}

document.getElementById('add-friend-btn-green')?.addEventListener('click', () => {
    openInputModal("Add Friend", "e.g. noxy#6996", "Send a friend request (Username#Tag):", async (inputTag) => {
        if (!inputTag) return;
        if (inputTag.startsWith('@')) inputTag = inputTag.substring(1);
        const tagSnap = await get(child(ref(db), `user_tags/${inputTag.replace('#', '_')}`));
        if (tagSnap.exists()) {
            const friendSafeEmail = tagSnap.val();
            if (friendSafeEmail === currentUserSafeEmail) return customAlert("You can't add yourself!", "Wait...");
            const fSnap = await get(ref(db, `users/${currentUserSafeEmail}/friends/${friendSafeEmail}`));
            if (fSnap.exists()) return customAlert("Already friends!", "Notice");
            await set(ref(db, `friend_requests/${friendSafeEmail}/${currentUserSafeEmail}`), { username: myProfile.username, avatar: myProfile.avatar, timestamp: Date.now() });
            showToast(`Friend request sent to ${inputTag}!`, 'success');
        } else { customAlert("User not found.", "Error"); }
    });
});

function getAvatarHTML(user, sizeClass = 'avatar-small') {
    if (!user) return '';
    let decHtml = '';
    
    // Check if user has a decoration and it exists in our cache
    if (user.decorationId && globalDecorationsCache[user.decorationId]) {
        const dec = globalDecorationsCache[user.decorationId];
        if (dec.layers) {
            // Loop through the new Studio Pro layers
            dec.layers.forEach((layer, index) => {
                const animName = `anim_${user.decorationId}_layer_${index}`;
                decHtml += `
                <div class="avatar-decoration-wrapper">
                    <img src="${layer.url}" class="avatar-decoration" style="animation: ${animName} ${layer.duration}s infinite linear;">
                </div>`;
            });
        }
    }
    
    const status = user.status || 'offline';
    const avatarUrl = user.avatar || 'https://ui-avatars.com/api/?name=U';
    
    return `
    <div class="avatar-container" style="position:relative; width: ${sizeClass === 'avatar-large' ? '64px' : '32px'}; height: ${sizeClass === 'avatar-large' ? '64px' : '32px'};">
        <img src="${avatarUrl}" class="${sizeClass}" style="object-fit:cover; width:100%; height:100%;">
        ${decHtml}
        <div class="status-indicator status-${status}" style="z-index: 3;"></div>
    </div>`;
}

function loadDecorationsUI() {
    const grid = document.getElementById('us-decorations-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    // Add a "None" option
    const noneDiv = document.createElement('div');
    noneDiv.style.cssText = `padding: 10px; border-radius: 8px; border: 2px solid ${!myProfile.decorationId ? 'var(--accent-primary)' : 'var(--border-color)'}; background: var(--bg-main); cursor: pointer; text-align: center; width: 100px;`;
    noneDiv.innerHTML = `<div style="width: 64px; height: 64px; margin: 0 auto 10px; border-radius: 50%; background: var(--bg-tertiary);"></div><div style="font-size: 12px; color: var(--text-bright);">None</div>`;
    noneDiv.onclick = () => {
        update(ref(db, `users/${currentUserSafeEmail}`), { decorationId: null });
        showToast('Decoration removed.', 'info');
    };
    grid.appendChild(noneDiv);

    // Loop through database decorations
    Object.entries(globalDecorationsCache).forEach(([decId, decData]) => {
        const isActive = myProfile.decorationId === decId;
        const div = document.createElement('div');
        div.style.cssText = `padding: 10px; border-radius: 8px; border: 2px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-color)'}; background: var(--bg-main); cursor: pointer; text-align: center; width: 100px; transition: 0.2s;`;
        
        // Use our helper to render a preview using the user's current avatar
        div.innerHTML = `
            <div style="display:flex; justify-content:center; margin-bottom: 10px;">
                ${getAvatarHTML({ ...myProfile, decorationId: decId, status: 'offline' }, 'avatar-large')}
            </div>
            <div style="font-size: 12px; color: var(--text-bright);">${decData.name || 'Decoration'}</div>
        `;
        
        div.onclick = () => {
            update(ref(db, `users/${currentUserSafeEmail}`), { decorationId: decId });
            showToast('Decoration equipped!', 'success');
        };
        grid.appendChild(div);
    });
}

// Make sure to call loadDecorationsUI when the user clicks the decorations tab
document.querySelector('.fs-tab[data-tab="decorations"]')?.addEventListener('click', () => {
    loadDecorationsUI();
});

function loadFriendsList() {
    const channelList = document.getElementById('dm-list');
    onValue(ref(db, `users/${currentUserSafeEmail}/friends`), (snapshot) => {
        channelList.innerHTML = ''; activeFriendsData = [];
        let dmsArray = [];
        snapshot.forEach((childSnapshot) => {
            const data = childSnapshot.val(); data.email = childSnapshot.key;
            activeFriendsData.push(data);
            if (!data.hidden) dmsArray.push(data);
        });
        dmsArray.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
        dmsArray.forEach((fDataStatic) => {
            const fEmail = fDataStatic.email;
            const cachedUser = globalUsersCache[fEmail] || {};
            const div = document.createElement('div');
            div.classList.add('channel-item', 'friend-item'); div.id = `dm-${fDataStatic.dmId}`;
            // Use the helper to render the initial DM item
            div.innerHTML = `${getAvatarHTML(cachedUser, 'avatar-small')}<span id="f-name-${fEmail}" class="c-name">${cachedUser.username || '...'}</span>`;
            
            div.addEventListener('contextmenu', (e) => showContextMenu(e, 'dm', fEmail));
            let touchTimer;
            div.addEventListener('touchstart', (e) => { touchTimer = setTimeout(() => showContextMenu(e, 'dm', fEmail), 500); });
            div.addEventListener('touchend', () => clearTimeout(touchTimer));
            div.addEventListener('touchmove', () => clearTimeout(touchTimer));
            if (chatType === 'dm' && currentChatId === fDataStatic.dmId) div.classList.add('active');
            
            onValue(ref(db, `users/${fEmail}`), (userSnap) => {
                if (userSnap.exists()) {
                    const uData = userSnap.val(); globalUsersCache[fEmail] = uData;
                    
                    // Update live! Replace the whole avatar container so decorations update instantly
                    const avatarWrapper = div.querySelector('.avatar-container');
                    if (avatarWrapper) avatarWrapper.outerHTML = getAvatarHTML(uData, 'avatar-small');
                    
                    const name = document.getElementById(`f-name-${fEmail}`); if (name) name.innerText = uData.username;
                    div.onclick = () => openDM(fDataStatic.dmId, fEmail);
                    if (chatType === 'home' && currentHomeTab === 'friends') renderHomeContent();
                }
            });
            channelList.appendChild(div);
            if (unreadState.dms.has(fDataStatic.dmId)) updateBadge(`dm-${fDataStatic.dmId}`, true, false, false);
        });
        if (chatType === 'home' && currentHomeTab === 'friends') renderHomeContent();
    });
}

function openDM(dmId, friendEmail) {
    chatType = 'dm'; currentChatId = dmId;
    const uData = globalUsersCache[friendEmail]; currentDMOtherUser = uData;
    myServerPerms = { viewChannels: true, sendMessages: true, manageMessages: false };
    myServerMemberData = {};
    update(ref(db, `users/${currentUserSafeEmail}/friends/${friendEmail}`), { hidden: false });
    document.getElementById('home-area').style.display = 'none';
    document.getElementById('chat-area').style.display = 'flex';
    document.getElementById('chat-title').innerText = `@${uData.username}#${uData.tag}`;
    document.getElementById('chat-title').style.cursor = "pointer";
    document.getElementById('chat-title').onclick = (e) => showGlobalUserProfile(friendEmail, e);
    document.getElementById('toggle-members-btn').style.display = 'inline-block';
    document.body.classList.remove('mobile-home-active');
    document.body.classList.add('mobile-chat-active');
    document.querySelectorAll('.home-nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    const activeDmEl = document.getElementById(`dm-${dmId}`);
    if (activeDmEl) activeDmEl.classList.add('active');
    enableChat(); loadMessages(`dms/${currentChatId}`, `@${uData.username}`);
    loadDMMemberList(friendEmail);
}

function loadDMMemberList(friendEmail) {
    const listContent = document.getElementById('member-list-content');
    listContent.innerHTML = '';
    const catDiv = document.createElement('div'); catDiv.className = 'member-category'; catDiv.innerText = `In this DM — 2`;
    listContent.appendChild(catDiv);
    const users = [myProfile, globalUsersCache[friendEmail]];
    users.forEach(u => {
        if (!u) return;
        const mDiv = document.createElement('div'); mDiv.className = 'member-item';
        mDiv.innerHTML = `<div class="avatar-container"><img src="${u.avatar}" class="avatar-small" style="object-fit:cover;"><div class="status-indicator status-${u.status || 'offline'}"></div></div><div class="member-username" style="color:var(--text-main);">${u.username}</div>`;
        const safeE = (u.username === myProfile.username && u.tag === myProfile.tag) ? currentUserSafeEmail : friendEmail;
        mDiv.addEventListener('click', (e) => showGlobalUserProfile(safeE, e));
        listContent.appendChild(mDiv);
    });
}

// ==========================================
// --- SERVERS ---
// ==========================================
document.getElementById('toggle-members-btn')?.addEventListener('click', () => {
    const sidebar = document.getElementById('member-sidebar');
    sidebar.style.display = sidebar.style.display === 'none' || sidebar.style.display === '' ? 'flex' : 'none';
});
document.getElementById('close-members-mobile-btn')?.addEventListener('click', () => { document.getElementById('member-sidebar').style.display = 'none'; });

document.getElementById('create-server-btn')?.addEventListener('click', () => {
    openInputModal("Create Server", "Server Name", "Give your server a name:", (serverName) => {
        if (serverName) {
            const serverId = generateCode();
            const everyonePerms = { viewChannels: true, sendMessages: true, manageChannels: false, manageServerSettings: false, manageServerProfile: false, manageServerOverview: false, manageRoles: false, manageMessages: false, kickMembers: false, banMembers: false, timeoutMembers: false };
            set(ref(db, `servers/${serverId}`), { name: serverName, owner: auth.currentUser.email });
            set(ref(db, `servers/${serverId}/roles/everyone`), { name: '@everyone', color: '#abb2bf', order: -1, hoist: false, mentionable: true, perms: everyonePerms });
            set(ref(db, `server_members/${serverId}/${currentUserSafeEmail}`), { role: 'owner' });
            set(ref(db, `users/${currentUserSafeEmail}/servers/${serverId}`), { order: Date.now() });
            const catId = push(ref(db, `categories/${serverId}`)).key;
            set(ref(db, `categories/${serverId}/${catId}`), { name: "General", order: 0 });
            push(ref(db, `channels/${serverId}`), { name: "general", type: "text", categoryId: catId, order: 0 });
            push(ref(db, `channels/${serverId}`), { name: "General Voice", type: "voice", categoryId: catId, order: 1 });
            showToast(`Server "${serverName}" created!`, 'success');
        }
    });
});

async function joinServerByCode(codeToJoin) {
    const banSnap = await get(ref(db, `servers/${codeToJoin}/bans/${currentUserSafeEmail}`));
    if (banSnap.exists()) return customAlert("You are banned from this server.", "Access Denied");
    const snapshot = await get(child(ref(db), `servers/${codeToJoin}`));
    if (snapshot.exists()) {
        const sData = snapshot.val();
        await set(ref(db, `server_members/${codeToJoin}/${currentUserSafeEmail}`), { role: 'member' });
        await set(ref(db, `users/${currentUserSafeEmail}/servers/${codeToJoin}`), { order: Date.now() });
        if (sData.engagement?.joinChannel) {
            push(ref(db, `messages/${sData.engagement.joinChannel}`), { sender: 'system', username: 'System', avatar: 'https://cdn.pixabay.com/photo/2023/02/18/11/00/icon-7797704_640.png', text: `Welcome to the server, **@${myProfile.username}**!`, timestamp: Date.now(), roleId: 'system' });
        }
        showToast("Joined server successfully!", 'success');
    } else { customAlert("Invalid invite link or code.", "Error"); }
}
document.getElementById('join-server-btn')?.addEventListener('click', () => { openInputModal("Join Server", "Invite Link or Code", "", async (input) => { if (!input) return; let code = input.includes('invite=') ? input.split('invite=')[1].split('&')[0] : input.split('/').pop(); await joinServerByCode(code); }); });

let dragServerEl = null;

function loadMyServers() {
    const serverList = document.getElementById('server-list');
    onValue(ref(db, `users/${currentUserSafeEmail}/servers`), async (snap) => {
        serverList.innerHTML = ''; let myServers = [];
        snap.forEach(child => { let d = typeof child.val() === 'object' ? child.val() : { order: 0 }; d.id = child.key; myServers.push(d); });
        myServers.sort((a, b) => (a.order || 0) - (b.order || 0));
        for (let i = 0; i < myServers.length; i++) {
            const serverId = myServers[i].id;
            const sSnap = await get(child(ref(db), `servers/${serverId}`));
            if (sSnap.exists()) {
                const sData = sSnap.val();
                const div = document.createElement('div'); div.classList.add('server-icon'); div.id = `server-${serverId}`; div.draggable = true;
                div.title = sData.name;
                if (sData.icon) { div.style.backgroundImage = `url(${sData.icon})`; } else { div.innerText = sData.name.charAt(0).toUpperCase(); }
                div.addEventListener('click', async () => {
                    document.body.classList.remove('mobile-chat-active', 'mobile-home-active');
                    currentServerId = serverId;
                    document.getElementById('server-name-display').innerText = sData.name;
                    document.getElementById('server-dropdown-arrow').style.display = 'inline';
                    const header = document.getElementById('sidebar-header');
                    if (sData.banner) { header.classList.add('server-header-banner'); header.style.backgroundImage = `linear-gradient(to bottom, rgba(13, 17, 23, 0.3), var(--bg-secondary)), url(${sData.banner})`; }
                    else { header.classList.remove('server-header-banner'); header.style.backgroundImage = 'none'; }
                    document.getElementById('home-sidebar-content').style.display = 'none';
                    document.getElementById('channel-list').style.display = 'block';
                    document.getElementById('home-area').style.display = 'none';
                    document.getElementById('chat-area').style.display = 'flex';
                    document.getElementById('messages').innerHTML = '';
                    document.getElementById('voice-controls-area').style.display = currentVoiceChannel ? 'flex' : 'none';
                    document.getElementById('toggle-members-btn').style.display = 'inline-block';
                    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
                    div.classList.add('active');
                    document.getElementById('home-btn').classList.remove('active');

                    if (unsubscribeMyMemberData) unsubscribeMyMemberData();
                    unsubscribeMyMemberData = onValue(ref(db, `server_members/${serverId}/${currentUserSafeEmail}`), (memLiveSnap) => {
                        myServerMemberData = memLiveSnap.val() || {};
                        enableChat();
                    });

                    const memberInfo = myServerMemberData;
                    let userRoles = memberInfo.roles ? Object.keys(memberInfo.roles) : (memberInfo.role && memberInfo.role !== 'member' ? [memberInfo.role] : []);
                    myServerRoles = ['everyone', ...userRoles];
                    const rolesSnap = await get(ref(db, `servers/${serverId}/roles`));
                    serverRolesCache = rolesSnap.val() || {};
                    let resolvedPerms = { ...(serverRolesCache['everyone']?.perms || { viewChannels: true, sendMessages: true }) };
                    myServerRoles.forEach(roleId => {
                        if (roleId !== 'everyone' && roleId !== 'owner' && serverRolesCache[roleId]) {
                            const rPerms = serverRolesCache[roleId].perms;
                            if (rPerms) for (let p in rPerms) { if (rPerms[p]) resolvedPerms[p] = true; }
                        }
                    });
                    if (sData.owner === auth.currentUser.email || myServerRoles.includes('owner') || resolvedPerms.manageServerSettings) {
                        if (!myServerRoles.includes('owner')) myServerRoles.push('owner');
                        resolvedPerms = { viewChannels: true, sendMessages: true, manageChannels: true, manageServerSettings: true, manageServerProfile: true, manageServerOverview: true, manageRoles: true, manageMessages: true, kickMembers: true, banMembers: true, timeoutMembers: true };
                    }
                    myServerPerms = resolvedPerms;

                    const anySettings = myServerPerms.manageServerSettings || myServerPerms.manageServerProfile || myServerPerms.manageServerOverview || myServerPerms.manageRoles;
                    document.getElementById('menu-server-settings').style.display = anySettings ? 'flex' : 'none';
                    document.getElementById('menu-add-category').style.display = myServerPerms.manageChannels ? 'flex' : 'none';
                    document.getElementById('menu-add-text').style.display = myServerPerms.manageChannels ? 'flex' : 'none';
                    document.getElementById('menu-add-voice').style.display = myServerPerms.manageChannels ? 'flex' : 'none';
                    document.getElementById('menu-leave-server').style.display = sData.owner === auth.currentUser.email ? 'none' : 'flex';
                    document.getElementById('server-stats-display').style.display = 'none';

                    initChannelSync(serverId);
                    loadMemberList(serverId);
                });
                // Drag reorder
                div.addEventListener('dragstart', (e) => { dragServerEl = div; e.dataTransfer.effectAllowed = 'move'; });
                div.addEventListener('dragover', (e) => { e.preventDefault(); div.style.opacity = '0.5'; });
                div.addEventListener('dragleave', () => { div.style.opacity = '1'; });
                div.addEventListener('drop', (e) => {
                    e.stopPropagation(); div.style.opacity = '1';
                    if (dragServerEl && dragServerEl !== div) {
                        const srcId = dragServerEl.id.replace('server-', '');
                        const tgtId = div.id.replace('server-', '');
                        const srcOrd = myServers.find(s => s.id === srcId)?.order || 0;
                        const tgtOrd = myServers.find(s => s.id === tgtId)?.order || 0;
                        update(ref(db, `users/${currentUserSafeEmail}/servers/${srcId}`), { order: (srcOrd + tgtOrd) / 2 });
                    }
                });
                serverList.appendChild(div);
                if (unreadState.servers.has(serverId)) updateBadge(`server-${serverId}`, true, true, false);
            }
        }
    });
}

// ==========================================
// --- SERVER DROPDOWN ---
// ==========================================
document.getElementById('server-header-clickable')?.addEventListener('click', () => {
    const dd = document.getElementById('server-dropdown');
    if (!currentServerId) return;
    dd.style.display = dd.style.display === 'flex' ? 'none' : 'flex';
});

document.getElementById('menu-invite')?.addEventListener('click', () => {
    document.getElementById('server-dropdown').style.display = 'none';
    if (!currentServerId) return;
    const link = `${appBaseUrl}?invite=${currentServerId}`;
    navigator.clipboard?.writeText(link).then(() => showToast('Invite link copied!', 'success')).catch(() => openInputModal("Invite Link", "Copy this:", "", null, link));
});

document.getElementById('menu-add-category')?.addEventListener('click', () => {
    document.getElementById('server-dropdown').style.display = 'none';
    openInputModal("Add Category", "CATEGORY NAME", "", (name) => { if (name && currentServerId) { const id = push(ref(db, `categories/${currentServerId}`)).key; set(ref(db, `categories/${currentServerId}/${id}`), { name: name.toUpperCase(), order: Date.now() }); } });
});
document.getElementById('menu-add-text')?.addEventListener('click', () => {
    document.getElementById('server-dropdown').style.display = 'none';
    openInputModal("Add Text Channel", "channel-name", "", (name) => { if (name && currentServerId) push(ref(db, `channels/${currentServerId}`), { name: name.toLowerCase(), type: "text", order: Date.now() }); });
});
document.getElementById('menu-add-voice')?.addEventListener('click', () => {
    document.getElementById('server-dropdown').style.display = 'none';
    openInputModal("Add Voice Channel", "Lounge", "", (name) => { if (name && currentServerId) push(ref(db, `channels/${currentServerId}`), { name, type: "voice", order: Date.now() }); });
});

document.getElementById('menu-leave-server')?.addEventListener('click', () => {
    document.getElementById('server-dropdown').style.display = 'none';
    customConfirm("Are you sure you want to leave this server?", "Leave Server", async (yes) => {
        if (yes && currentServerId) {
            const sData = (await get(ref(db, `servers/${currentServerId}`))).val();
            if (sData?.engagement?.leaveChannel) {
                push(ref(db, `messages/${sData.engagement.leaveChannel}`), { sender: 'system', username: 'System', avatar: 'https://cdn.pixabay.com/photo/2023/02/18/11/00/icon-7797704_640.png', text: `**@${myProfile.username}** has left the server.`, timestamp: Date.now(), roleId: 'system' });
            }
            await remove(ref(db, `server_members/${currentServerId}/${currentUserSafeEmail}`));
            await remove(ref(db, `users/${currentUserSafeEmail}/servers/${currentServerId}`));
            switchToHomeView();
        }
    });
});

function loadServerBans() {
    const list = document.getElementById('ss-bans-list');
    onValue(ref(db, `servers/${currentServerId}/bans`), async (snap) => {
        if (!list) return; list.innerHTML = '';
        if (!snap.exists()) { list.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">No banned users.</p>'; return; }
        for (let email of Object.keys(snap.val())) {
            const uSnap = await get(child(ref(db), `users/${email}`));
            const uData = uSnap.exists() ? uSnap.val() : { username: "Unknown User", avatar: "" };
            const d = document.createElement('div');
            d.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px; border-radius:6px; background:var(--bg-main); margin-bottom:4px;';
            d.innerHTML = `<div style="display:flex;align-items:center;gap:10px;"><img src="${uData.avatar}" class="avatar-small" style="background:var(--bg-tertiary);"> <span style="color:var(--text-bright);">${uData.username}</span></div><button class="small-btn" style="background:transparent;border:1px solid var(--accent-success);color:var(--accent-success);margin:0;">Unban</button>`;
            d.querySelector('button').onclick = () => { remove(ref(db, `servers/${currentServerId}/bans/${email}`)); showToast(`${uData.username} unbanned.`, 'success'); };
            list.appendChild(d);
        }
    });
}

// ==========================================
// --- SERVER SETTINGS ---
// ==========================================
let tempServerIcon = null; let tempServerBanner = null;

function setupServerSettingsTabs() {
    document.querySelectorAll('#server-settings-modal .fs-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabName = e.target.getAttribute('data-tab');
            if (!tabName) return;
            document.querySelectorAll('#server-settings-modal .fs-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            document.querySelectorAll('#server-settings-modal .ss-pane').forEach(p => p.style.display = 'none');
            const tp = document.getElementById(`pane-ss-${tabName}`);
            if (tp) tp.style.display = 'block';
            if (window.innerWidth <= 768) document.querySelector('#server-settings-modal .fs-modal-layout').classList.add('mobile-viewing-content');
        });
    });
}
setupServerSettingsTabs();

document.getElementById('ss-mobile-back')?.addEventListener('click', () => { document.querySelector('#server-settings-modal .fs-modal-layout').classList.remove('mobile-viewing-content'); });

document.getElementById('menu-server-settings')?.addEventListener('click', async () => {
    document.getElementById('server-dropdown').style.display = 'none';
    const sSnap = await get(ref(db, `servers/${currentServerId}`)); const sData = sSnap.val();
    document.getElementById('tab-ss-profile').style.display = (myServerPerms.manageServerSettings || myServerPerms.manageServerProfile) ? 'block' : 'none';
    document.getElementById('tab-ss-engagement').style.display = (myServerPerms.manageServerSettings || myServerPerms.manageServerOverview) ? 'block' : 'none';
    document.getElementById('tab-ss-roles').style.display = (myServerPerms.manageServerSettings || myServerPerms.manageRoles) ? 'block' : 'none';
    document.getElementById('tab-ss-emojis').style.display = (myServerPerms.manageServerSettings || myServerPerms.manageServerOverview) ? 'block' : 'none';
    const tabBans = document.getElementById('tab-ss-bans');
    if (tabBans) tabBans.style.display = (myServerPerms.manageServerSettings || myServerPerms.banMembers || sData.owner === auth.currentUser.email) ? 'block' : 'none';
    document.getElementById('tab-ss-delete').style.display = (myServerPerms.manageServerSettings || sData.owner === auth.currentUser.email) ? 'block' : 'none';
    document.getElementById('ss-header-name').innerText = sData.name;
    document.getElementById('ss-server-name').value = sData.name;
    const preview = document.getElementById('ss-icon-preview');
    if (sData.icon) { preview.style.backgroundImage = `url(${sData.icon})`; preview.innerText = ""; tempServerIcon = sData.icon; } else { preview.style.backgroundImage = 'none'; preview.innerText = sData.name.charAt(0); }
    const bannerPreview = document.getElementById('ss-banner-preview');
    if (sData.banner) { bannerPreview.style.backgroundImage = `url(${sData.banner})`; tempServerBanner = sData.banner; } else { bannerPreview.style.backgroundImage = 'none'; }
    const joinSel = document.getElementById('ss-join-channel'); const leaveSel = document.getElementById('ss-leave-channel');
    joinSel.innerHTML = '<option value="">No Messages</option>'; leaveSel.innerHTML = '<option value="">No Messages</option>';
    Object.keys(currentChannelsData).forEach(cId => {
        if (currentChannelsData[cId].type === 'text') { joinSel.innerHTML += `<option value="${cId}"># ${currentChannelsData[cId].name}</option>`; leaveSel.innerHTML += `<option value="${cId}"># ${currentChannelsData[cId].name}</option>`; }
    });
    if (sData.engagement) { if (sData.engagement.joinChannel) joinSel.value = sData.engagement.joinChannel; if (sData.engagement.leaveChannel) leaveSel.value = sData.engagement.leaveChannel; }
    document.getElementById('server-settings-modal').style.display = 'flex';
    document.querySelector('#server-settings-modal .fs-modal-layout').classList.remove('mobile-viewing-content');
    const firstTab = document.querySelector('#server-settings-modal .fs-tab[style*="block"]') || document.querySelector('#server-settings-modal .fs-tab');
    if (firstTab) firstTab.click();
    loadRolesAdvanced(); loadServerEmojis(); loadServerBans();
});

document.getElementById('close-server-settings-btn')?.addEventListener('click', () => document.getElementById('server-settings-modal').style.display = 'none');

document.getElementById('ss-icon-upload')?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const result = await compressImage(file, 256, 256, 0.85);
    tempServerIcon = result.compressed;
    document.getElementById('ss-icon-preview').style.backgroundImage = `url(${tempServerIcon})`; document.getElementById('ss-icon-preview').innerText = "";
});
document.getElementById('ss-banner-upload')?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const result = await compressImage(file, 960, 540, 0.85);
    tempServerBanner = result.compressed;
    document.getElementById('ss-banner-preview').style.backgroundImage = `url(${tempServerBanner})`;
});
document.getElementById('ss-save-profile-btn')?.addEventListener('click', () => {
    const newName = document.getElementById('ss-server-name').value.trim();
    if (newName && currentServerId) { update(ref(db, `servers/${currentServerId}`), { name: newName, icon: tempServerIcon, banner: tempServerBanner }); showToast("Server profile updated!", 'success'); }
});
document.getElementById('ss-save-engagement-btn')?.addEventListener('click', () => {
    if (currentServerId) { update(ref(db, `servers/${currentServerId}/engagement`), { joinChannel: document.getElementById('ss-join-channel').value || null, leaveChannel: document.getElementById('ss-leave-channel').value || null }); showToast("Engagement settings saved!", 'success'); }
});
document.getElementById('delete-server-btn')?.addEventListener('click', async () => {
    customConfirm("Delete this server? This cannot be undone.", "Delete Server", async (yes) => {
        if (yes && currentServerId) {
            await remove(ref(db, `servers/${currentServerId}`)); await remove(ref(db, `server_members/${currentServerId}`)); await remove(ref(db, `channels/${currentServerId}`)); await remove(ref(db, `categories/${currentServerId}`)); await remove(ref(db, `users/${currentUserSafeEmail}/servers/${currentServerId}`));
            document.getElementById('server-settings-modal').style.display = 'none'; document.getElementById('home-btn').click(); showToast("Server deleted.", 'info');
        }
    });
});

// Roles Advanced
let dragRoleEl = null; let currentEditingRoleId = null; let rolesArrayCache = [];

function loadRolesAdvanced() {
    const list = document.getElementById('ss-roles-list'); if (!list) return;
    onValue(ref(db, `servers/${currentServerId}/roles`), (snap) => {
        list.innerHTML = ''; rolesArrayCache = [];
        let rolesData = snap.val() || {};
        if (!rolesData['everyone']) rolesData['everyone'] = { name: '@everyone', color: '#abb2bf', order: -999, hoist: false, mentionable: true, perms: { viewChannels: true, sendMessages: true } };
        Object.keys(rolesData).forEach(k => { let data = rolesData[k]; data.id = k; rolesArrayCache.push(data); });
        rolesArrayCache.sort((a, b) => (b.order || 0) - (a.order || 0));
        rolesArrayCache.forEach((rData, index, arr) => {
            const roleId = rData.id;
            const div = document.createElement('div'); div.className = 'role-list-item'; div.id = `role-set-${roleId}`;
            if (roleId !== 'everyone') {
                div.draggable = true;
                div.addEventListener('dragstart', (e) => { dragRoleEl = div; e.dataTransfer.effectAllowed = 'move'; });
                div.addEventListener('dragover', (e) => { e.preventDefault(); div.classList.add('drag-over'); });
                div.addEventListener('dragleave', () => div.classList.remove('drag-over'));
                div.addEventListener('drop', (e) => {
                    e.stopPropagation(); div.classList.remove('drag-over');
                    if (dragRoleEl !== div) {
                        const srcId = dragRoleEl.id.replace('role-set-', '');
                        const targetOrder = rData.order || 0; const prevRole = arr[index - 1]; const nextRole = arr[index + 1]; const srcData = rolesArrayCache.find(r => r.id === srcId);
                        if ((srcData.order || 0) > targetOrder) update(ref(db, `servers/${currentServerId}/roles/${srcId}`), { order: nextRole && nextRole.id !== 'everyone' ? (targetOrder + nextRole.order) / 2 : targetOrder - 10 });
                        else update(ref(db, `servers/${currentServerId}/roles/${srcId}`), { order: prevRole ? (targetOrder + prevRole.order) / 2 : targetOrder + 10 });
                    }
                });
            }
            div.innerHTML = `<span style="color:${rData.color};">●</span> ${rData.name}`;
            div.addEventListener('click', () => editRole(roleId));
            list.appendChild(div);
        });
        if (!currentEditingRoleId && rolesArrayCache.length > 0) editRole('everyone');
        else if (currentEditingRoleId) editRole(currentEditingRoleId, true);
    });
}

function editRole(roleId, noSwitch = false) {
    currentEditingRoleId = roleId;
    document.querySelectorAll('.role-list-item').forEach(el => el.classList.remove('active'));
    const activeEl = document.getElementById(`role-set-${roleId}`); if (activeEl) activeEl.classList.add('active');
    document.getElementById('ss-role-edit-area').style.display = 'block';
    const rData = rolesArrayCache.find(r => r.id === roleId); if (!rData) return;
    document.getElementById('er-name').value = rData.name;
    document.getElementById('er-name').disabled = roleId === 'everyone';
    document.getElementById('er-color').value = rData.color || '#abb2bf';
    document.getElementById('er-hoist').checked = !!rData.hoist;
    document.getElementById('er-mentionable').checked = !!rData.mentionable;
    const p = rData.perms || {};
    ['viewChannels', 'sendMessages', 'manageChannels', 'manageServerSettings', 'manageServerProfile', 'manageServerOverview', 'manageRoles', 'manageMessages', 'kickMembers', 'banMembers', 'timeoutMembers'].forEach(perm => {
        const el = document.getElementById(`p-${perm}`); if (el) el.checked = !!p[perm];
    });
    document.getElementById('delete-role-btn').style.display = roleId === 'everyone' ? 'none' : 'block';
    if (!noSwitch && window.innerWidth <= 768) {
        document.getElementById('ss-roles-list-left').style.display = 'none';
        document.getElementById('ss-roles-pane-mobile-back').style.display = 'block';
    }
}

document.getElementById('ss-roles-pane-mobile-back')?.addEventListener('click', () => {
    document.getElementById('ss-roles-list-left').style.display = 'flex';
    document.getElementById('ss-roles-pane-mobile-back').style.display = 'none';
    document.getElementById('ss-role-edit-area').style.display = 'none';
});

document.getElementById('ss-create-role-btn')?.addEventListener('click', () => {
    if (currentServerId) push(ref(db, `servers/${currentServerId}/roles`), { name: 'New Role', color: '#abb2bf', order: Date.now(), hoist: false, mentionable: false, perms: { viewChannels: true, sendMessages: true } });
});

document.getElementById('save-role-settings-btn')?.addEventListener('click', () => {
    if (currentServerId && currentEditingRoleId) {
        const perms = {};
        ['viewChannels', 'sendMessages', 'manageChannels', 'manageServerSettings', 'manageServerProfile', 'manageServerOverview', 'manageRoles', 'manageMessages', 'kickMembers', 'banMembers', 'timeoutMembers'].forEach(perm => {
            const el = document.getElementById(`p-${perm}`); if (el) perms[perm] = el.checked;
        });
        update(ref(db, `servers/${currentServerId}/roles/${currentEditingRoleId}`), { name: document.getElementById('er-name').value, color: document.getElementById('er-color').value, hoist: document.getElementById('er-hoist').checked, mentionable: document.getElementById('er-mentionable').checked, perms });
        showToast('Role saved!', 'success');
    }
});

document.getElementById('delete-role-btn')?.addEventListener('click', () => {
    if (currentServerId && currentEditingRoleId && currentEditingRoleId !== 'everyone') {
        customConfirm(`Delete the role "${rolesArrayCache.find(r => r.id === currentEditingRoleId)?.name}"?`, "Delete Role", (yes) => {
            if (yes) { remove(ref(db, `servers/${currentServerId}/roles/${currentEditingRoleId}`)); currentEditingRoleId = null; document.getElementById('ss-role-edit-area').style.display = 'none'; }
        });
    }
});

// Server Emojis
function loadServerEmojis() {
    const list = document.getElementById('ss-emojis-list'); if (!list) return;
    onValue(ref(db, `servers/${currentServerId}/emojis`), async (snap) => {
        list.innerHTML = '';
        if (!snap.exists()) { list.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">No server emojis yet.</p>'; return; }
        for (let eid of Object.keys(snap.val())) {
            const eData = globalEmojisCache[eid];
            if (eData) {
                const d = document.createElement('div');
                d.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px; border-radius:6px; background:var(--bg-main); margin-bottom:4px;';
                d.innerHTML = `<div style="display:flex;align-items:center;gap:10px;"><img src="${eData.url}" class="custom-emoji"> <span style="color:var(--text-bright);">:${eData.name}:</span></div><button class="small-btn" style="background:transparent;border:1px solid var(--accent-danger);color:var(--accent-danger);margin:0;">Delete</button>`;
                d.querySelector('button').onclick = () => { remove(ref(db, `servers/${currentServerId}/emojis/${eid}`)); };
                list.appendChild(d);
            }
        }
    });
}

document.getElementById('ss-emoji-file')?.addEventListener('change', (e) => { const file = e.target.files[0]; if (file) { const fileNameEl = document.getElementById('ss-emoji-file'); fileNameEl.nextSibling && (fileNameEl.nextSibling.innerText = file.name); } });
document.getElementById('ss-upload-emoji-btn')?.addEventListener('click', async () => {
    const file = document.getElementById('ss-emoji-file').files[0];
    const name = document.getElementById('ss-emoji-name').value.trim().replace(/[^a-zA-Z0-9_]/g, '');
    if (!file || !name) return customAlert("Please select an image and enter a valid name.");
    const result = await compressImage(file, 128, 128, 0.9);
    const emojiId = push(ref(db, 'emojis')).key;
    await set(ref(db, `emojis/${emojiId}`), { name, url: result.compressed });
    await set(ref(db, `servers/${currentServerId}/emojis/${emojiId}`), true);
    document.getElementById('ss-emoji-file').value = ""; document.getElementById('ss-emoji-name').value = "";
    showToast(`Emoji :${name}: added to server!`, 'success');
});

// ==========================================
// --- CHANNEL SETTINGS ---
// ==========================================
let currentEditingChannelId = null; let currentEditingChannelType = 'channel';

function openChannelSettings(channelId, type) {
    currentEditingChannelId = channelId; currentEditingChannelType = type;
    const data = type === 'channel' ? currentChannelsData[channelId] : currentCategoriesData[channelId];
    if (!data) return;
    const nameDisplay = type === 'channel' ? `# ${data.name}` : `Category: ${data.name}`;
    document.getElementById('cs-header-name').innerText = nameDisplay;
    document.getElementById('cs-channel-name').value = data.name;
    document.getElementById('channel-settings-modal').style.display = 'flex';
    document.querySelector('#channel-settings-modal .fs-modal-layout').classList.remove('mobile-viewing-content');
    document.querySelector('#channel-settings-modal .fs-tab[data-tab="overview"]').click();
    loadChannelPerms(channelId, type);
}

function loadChannelPerms(channelId, type) {
    const list = document.getElementById('cs-roles-list-left'); list.innerHTML = '';
    document.getElementById('cs-role-edit-area').style.display = 'none';
    Object.keys(serverRolesCache).forEach(roleId => {
        const rData = serverRolesCache[roleId]; if (!rData) return;
        const item = document.createElement('div'); item.className = 'role-list-item';
        item.innerHTML = `<span style="color:${rData.color};">●</span> ${rData.name}`;
        item.onclick = () => editChannelPerm(channelId, roleId, type);
        list.appendChild(item);
    });
}

function editChannelPerm(channelId, roleId, type) {
    document.querySelectorAll('#cs-roles-list-left .role-list-item').forEach(el => el.classList.remove('active'));
    const activeItem = Array.from(document.querySelectorAll('#cs-roles-list-left .role-list-item')).find(el => el.innerText.includes(serverRolesCache[roleId]?.name));
    if (activeItem) activeItem.classList.add('active');
    document.getElementById('cs-role-edit-area').style.display = 'block';
    const rData = serverRolesCache[roleId];
    document.getElementById('cs-editing-role-name').innerText = `Role: ${rData.name}`;
    let targetData = type === 'channel' ? currentChannelsData[channelId] : currentCategoriesData[channelId];
    const overwrites = targetData?.overwrites?.[roleId] || {};
    document.getElementById('cp-viewChannels').value = overwrites.viewChannels || "inherit";
    document.getElementById('cp-sendMessages').value = overwrites.sendMessages || "inherit";
    document.getElementById('cs-save-perms-btn').onclick = () => {
        const dbPath = type === 'channel' ? `channels/${currentServerId}/${channelId}/overwrites/${roleId}` : `categories/${currentServerId}/${channelId}/overwrites/${roleId}`;
        update(ref(db, dbPath), { viewChannels: document.getElementById('cp-viewChannels').value, sendMessages: document.getElementById('cp-sendMessages').value });
        showToast("Permissions saved.", 'success');
    };
    if (window.innerWidth <= 768) { document.getElementById('cs-roles-list-left').style.display = 'none'; document.getElementById('cs-roles-pane-mobile-back').style.display = 'block'; }
}

document.querySelectorAll('#channel-settings-modal .fs-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        const tabName = e.target.getAttribute('data-tab');
        if (!tabName) return;
        document.querySelectorAll('#channel-settings-modal .fs-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        document.querySelectorAll('#channel-settings-modal .ss-pane').forEach(p => p.style.display = 'none');
        document.getElementById(`pane-cs-${tabName}`).style.display = 'block';
        if (window.innerWidth <= 768) document.querySelector('#channel-settings-modal .fs-modal-layout').classList.add('mobile-viewing-content');
    });
});
document.getElementById('cs-roles-pane-mobile-back')?.addEventListener('click', () => { document.getElementById('cs-roles-list-left').style.display = 'flex'; document.getElementById('cs-roles-pane-mobile-back').style.display = 'none'; document.getElementById('cs-role-edit-area').style.display = 'none'; });
document.getElementById('cs-mobile-back')?.addEventListener('click', () => { document.querySelector('#channel-settings-modal .fs-modal-layout').classList.remove('mobile-viewing-content'); });
document.getElementById('close-channel-settings-btn')?.addEventListener('click', () => { document.getElementById('channel-settings-modal').style.display = 'none'; });
document.getElementById('cs-save-overview-btn')?.addEventListener('click', () => {
    const newName = document.getElementById('cs-channel-name').value.trim();
    if (newName && currentServerId && currentEditingChannelId) {
        const dbPath = currentEditingChannelType === 'channel' ? `channels/${currentServerId}/${currentEditingChannelId}` : `categories/${currentServerId}/${currentEditingChannelId}`;
        update(ref(db, dbPath), { name: currentEditingChannelType === 'channel' ? newName.toLowerCase() : newName.toUpperCase() });
        showToast("Channel updated!", 'success');
        document.getElementById('cs-header-name').innerText = currentEditingChannelType === 'channel' ? `# ${newName.toLowerCase()}` : `Category: ${newName.toUpperCase()}`;
    }
});
document.getElementById('tab-cs-delete')?.addEventListener('click', () => {
    if (currentServerId && currentEditingChannelId) {
        customConfirm("Delete this channel forever?", "Confirm Delete", async (yes) => {
            if (yes) {
                if (currentEditingChannelType === 'channel') { await remove(ref(db, `channels/${currentServerId}/${currentEditingChannelId}`)); await remove(ref(db, `messages/${currentEditingChannelId}`)); }
                else { await remove(ref(db, `categories/${currentServerId}/${currentEditingChannelId}`)); }
                document.getElementById('channel-settings-modal').style.display = 'none';
            }
        });
    }
});

// ==========================================
// --- MEMBER LIST ---
// ==========================================
function loadMemberList(serverId) {
    if (unsubscribeMembers) unsubscribeMembers();
    const listContent = document.getElementById('member-list-content');
    unsubscribeMembers = onValue(ref(db, `server_members/${serverId}`), async (membersSnap) => {
        let groups = { online: { name: "Online", order: 9998, members: [] }, offline: { name: "Offline", order: 9999, members: [] } };
        Object.keys(serverRolesCache).forEach(rId => {
            if (serverRolesCache[rId].hoist) groups[rId] = { name: serverRolesCache[rId].name, order: serverRolesCache[rId].order || 0, color: serverRolesCache[rId].color, members: [] };
        });
        const memberPromises = []; currentServerMembersList = [];
        let onlineCount = 0; let totalCount = 0;
        membersSnap.forEach(mSnap => {
            const memberEmail = mSnap.key; const memberInfo = mSnap.val(); totalCount++;
            const p = get(child(ref(db), `users/${memberEmail}`)).then(uSnap => {
                if (uSnap.exists()) {
                    const uData = uSnap.val(); const status = uData.status || 'offline';
                    uData.email = memberEmail; currentServerMembersList.push(uData); globalUsersCache[memberEmail] = uData;
                    if (status !== 'offline' && status !== 'invisible') onlineCount++;
                    let highestHoistRole = null; let highestHoistOrder = 9999;
                    let userRoles = memberInfo.roles ? Object.keys(memberInfo.roles) : (memberInfo.role && memberInfo.role !== 'member' ? [memberInfo.role] : []);
                    userRoles.forEach(rId => { if (serverRolesCache[rId]?.hoist && serverRolesCache[rId].order < highestHoistOrder) { highestHoistOrder = serverRolesCache[rId].order; highestHoistRole = rId; } });
                    let targetGroup = 'offline';
                    if (status !== 'offline' && status !== 'invisible') targetGroup = (highestHoistRole && highestHoistRole !== 'everyone') ? highestHoistRole : 'online';
                    let nameColor = "var(--text-main)"; let colorOrder = 9999;
                    userRoles.forEach(rId => { if (serverRolesCache[rId]?.color !== '#abb2bf' && serverRolesCache[rId]?.order < colorOrder) { colorOrder = serverRolesCache[rId].order; nameColor = serverRolesCache[rId].color; } });
                    if (groups[targetGroup]) groups[targetGroup].members.push({ email: memberEmail, data: uData, status, nameColor });
                }
            });
            memberPromises.push(p);
        });
        await Promise.all(memberPromises);
        document.getElementById('server-stats-display').innerText = `${onlineCount} Online • ${totalCount} Members`;
        document.getElementById('server-stats-display').style.display = 'block';
        listContent.innerHTML = '';
        const sortedGroupKeys = Object.keys(groups).sort((a, b) => groups[a].order - groups[b].order);
        sortedGroupKeys.forEach(gKey => {
            const group = groups[gKey]; if (group.members.length === 0) return;
            group.members.sort((a, b) => a.data.username.localeCompare(b.data.username));
            const catDiv = document.createElement('div'); catDiv.className = 'member-category'; catDiv.innerText = `${group.name} — ${group.members.length}`;
            listContent.appendChild(catDiv);
            group.members.forEach(m => {
                const mDiv = document.createElement('div'); mDiv.className = 'member-item';
                
                // --- NEW DECORATION CODE ---
                // We merge m.data and m.status so the helper function gets everything it needs
                const userObjForAvatar = { ...m.data, status: m.status };
                
                mDiv.innerHTML = `${getAvatarHTML(userObjForAvatar, 'avatar-small')}<div class="member-username" style="color:${m.nameColor};">${m.data.username}</div>`;
                // ---------------------------

                mDiv.addEventListener('click', (e) => showGlobalUserProfile(m.email, e));
                listContent.appendChild(mDiv);
            });
        });
    });
}

// ==========================================
// --- CHANNELS ---
// ==========================================
function initChannelSync(serverId) {
    if (unsubscribeChannels) unsubscribeChannels();
    if (unsubscribeCategories) unsubscribeCategories();
    if (unsubscribeVoiceRosters) unsubscribeVoiceRosters();
    unsubscribeVoiceRosters = onValue(ref(db, `voice_rosters/${serverId}`), (snap) => { currentServerVoiceRosters = snap.val() || {}; renderChannels(serverId); });
    unsubscribeChannels = onValue(ref(db, `channels/${serverId}`), (snap) => { currentChannelsData = snap.val() || {}; renderChannels(serverId); });
    unsubscribeCategories = onValue(ref(db, `categories/${serverId}`), (snap) => { currentCategoriesData = snap.val() || {}; renderChannels(serverId); });
}

function renderChannels(serverId) {
    const channelList = document.getElementById('channel-list');
    let categories = { "uncategorized": { name: "UNCATEGORIZED", order: -1 } };
    Object.keys(currentCategoriesData).forEach(k => categories[k] = currentCategoriesData[k]);
    let grouped = {}; Object.keys(categories).forEach(k => grouped[k] = []);
    Object.keys(currentChannelsData).forEach(cId => {
        const c = currentChannelsData[cId]; c.id = cId;
        const cid = c.categoryId && categories[c.categoryId] ? c.categoryId : "uncategorized";
        if (getChannelPerm(cId, 'viewChannels')) grouped[cid].push(c);
    });
    const sortedCats = Object.keys(categories).sort((a, b) => (categories[a].order || 0) - (categories[b].order || 0));
    channelList.innerHTML = '';
    sortedCats.forEach(catId => {
        if (!getCategoryPerm(catId, 'viewChannels') && catId !== "uncategorized") return;
        if (grouped[catId].length === 0 && catId === "uncategorized") return;
        if (catId !== "uncategorized") {
            const catDiv = document.createElement('div'); catDiv.className = 'channel-category'; catDiv.innerText = `⌄ ${categories[catId].name}`; catDiv.id = `category-${catId}`;
            catDiv.addEventListener('contextmenu', (e) => showContextMenu(e, 'category', catId));
            let touchTimerCat;
            catDiv.addEventListener('touchstart', (e) => { touchTimerCat = setTimeout(() => showContextMenu(e, 'category', catId), 500); });
            catDiv.addEventListener('touchend', () => clearTimeout(touchTimerCat));
            catDiv.addEventListener('touchmove', () => clearTimeout(touchTimerCat));
            catDiv.addEventListener('dragover', (e) => { e.preventDefault(); catDiv.classList.add('drag-over'); });
            catDiv.addEventListener('dragleave', () => catDiv.classList.remove('drag-over'));
            catDiv.addEventListener('drop', (e) => { e.stopPropagation(); catDiv.classList.remove('drag-over'); if (dragSrcEl) { const srcId = dragSrcEl.id.replace('channel-', ''); update(ref(db, `channels/${serverId}/${srcId}`), { categoryId: catId, order: Date.now() }); } });
            channelList.appendChild(catDiv);
        }
        grouped[catId].sort((a, b) => (a.order || 0) - (b.order || 0)).forEach((channelData, index, arr) => {
            const div = document.createElement('div'); div.classList.add('channel-item'); div.id = `channel-${channelData.id}`; div.draggable = myServerPerms.manageChannels;
            div.innerHTML = channelData.type === "voice" ? `<span class="c-icon">${icons.voiceChannel}</span><span class="c-name">${channelData.name}</span>` : `<span class="c-icon">${icons.textChannel}</span><span class="c-name">${channelData.name}</span>`;
            div.addEventListener('click', () => {
                if (channelData.type === "voice") joinVoiceChannel(serverId, channelData.id);
                else {
                    chatType = 'server'; currentChatId = channelData.id;
                    document.getElementById('chat-title').innerText = `# ${channelData.name}`;
                    document.getElementById('chat-title').style.cursor = "default";
                    document.getElementById('chat-title').onclick = null;
                    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
                    div.classList.add('active');
                    document.body.classList.remove('mobile-home-active');
                    document.body.classList.add('mobile-chat-active');
                    enableChat(); loadMessages(`messages/${channelData.id}`, `# ${channelData.name}`);
                }
            });
            if (chatType === 'server' && currentChatId === channelData.id) div.classList.add('active');
            div.addEventListener('contextmenu', (e) => showContextMenu(e, 'channel', channelData.id));
            let touchTimer;
            div.addEventListener('touchstart', (e) => { touchTimer = setTimeout(() => showContextMenu(e, 'channel', channelData.id), 500); });
            div.addEventListener('touchend', () => clearTimeout(touchTimer));
            div.addEventListener('touchmove', () => clearTimeout(touchTimer));
            div.addEventListener('dragstart', (e) => { dragSrcEl = div; e.dataTransfer.effectAllowed = 'move'; });
            div.addEventListener('dragover', (e) => { e.preventDefault(); div.classList.add('drag-over'); });
            div.addEventListener('dragleave', () => div.classList.remove('drag-over'));
            div.addEventListener('drop', (e) => {
                e.stopPropagation(); div.classList.remove('drag-over');
                if (dragSrcEl !== div) {
                    const srcId = dragSrcEl.id.replace('channel-', ''); const targetOrder = channelData.order || 0; const prevChannel = arr[index - 1]; const nextChannel = arr[index + 1]; const srcData = currentChannelsData[srcId];
                    if (srcData.categoryId !== channelData.categoryId) update(ref(db, `channels/${serverId}/${srcId}`), { categoryId: catId, order: targetOrder + 0.5 });
                    else if ((srcData.order || 0) < targetOrder) update(ref(db, `channels/${serverId}/${srcId}`), { order: nextChannel ? (targetOrder + nextChannel.order) / 2 : targetOrder + 10 });
                    else update(ref(db, `channels/${serverId}/${srcId}`), { order: prevChannel ? (targetOrder + prevChannel.order) / 2 : targetOrder - 10 });
                }
            });
            channelList.appendChild(div);
            if (unreadState.channels.has(channelData.id)) updateBadge(`channel-${channelData.id}`, true, false, false);
            if (channelData.type === "voice" && currentServerVoiceRosters[channelData.id]) {
                const roster = currentServerVoiceRosters[channelData.id];
                Object.keys(roster).forEach(peerEmail => {
                    const uData = globalUsersCache[peerEmail] || { username: peerEmail, avatar: "" };
                    const vcUserDiv = document.createElement('div'); vcUserDiv.className = 'vc-sidebar-user';
                    vcUserDiv.innerHTML = `<img src="${uData.avatar}" class="avatar-small"><span>${uData.username}</span>`;
                    vcUserDiv.onclick = (e) => { e.stopPropagation(); showGlobalUserProfile(peerEmail, e); };
                    channelList.appendChild(vcUserDiv);
                    if (!globalUsersCache[peerEmail]) get(child(ref(db), `users/${peerEmail}`)).then(s => { if (s.exists()) { globalUsersCache[peerEmail] = s.val(); renderChannels(serverId); } });
                });
            }
        });
    });
}

// ==========================================
// --- VOICE CHAT ---
// ==========================================
function initVoiceChat() {
    myPeer = new Peer();
    myPeer.on('open', id => myCurrentPeerId = id);
    myPeer.on('call', call => {
        call.answer(localAudioStream);
        const cEmail = call.metadata ? call.metadata.callerEmail : call.peer;
        call.on('stream', stream => setupHiddenAudio(cEmail, stream));
        activeCalls[cEmail] = call;
    });
}

async function joinVoiceChannel(serverId, channelId) {
    if (currentVoiceChannel === channelId) return;
    if (!getChannelPerm(channelId, 'sendMessages')) return customAlert("No permission to connect here.", "Access Denied");
    if (!myCurrentPeerId) return customAlert("Voice server connecting, try again.");
    leaveVoiceChannel();
    try {
        localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        currentVoiceChannel = channelId;
        document.getElementById('voice-controls-area').style.display = 'flex';
        const vcRef = ref(db, `voice_rosters/${serverId}/${channelId}/${currentUserSafeEmail}`);
        await set(vcRef, myCurrentPeerId); onDisconnect(vcRef).remove();
        onValue(ref(db, `voice_rosters/${serverId}/${channelId}`), (snap) => {
            snap.forEach((childSnapshot) => {
                const pEmail = childSnapshot.key; const pId = childSnapshot.val();
                if (pEmail !== currentUserSafeEmail && !activeCalls[pEmail]) {
                    const call = myPeer.call(pId, localAudioStream, { metadata: { callerEmail: currentUserSafeEmail } });
                    call.on('stream', stream => setupHiddenAudio(pEmail, stream));
                    activeCalls[pEmail] = call;
                }
            });
        });
    } catch (err) { customAlert("Microphone access denied.", "Error"); }
}

function leaveVoiceChannel() {
    if (!currentVoiceChannel) return;
    Object.keys(activeCalls).forEach(pEmail => { activeCalls[pEmail].close(); removeHiddenAudio(pEmail); });
    activeCalls = {};
    if (localAudioStream) localAudioStream.getTracks().forEach(track => track.stop());
    remove(ref(db, `voice_rosters/${currentServerId}/${currentVoiceChannel}/${currentUserSafeEmail}`));
    currentVoiceChannel = null;
    document.getElementById('voice-controls-area').style.display = 'none';
}

document.getElementById('disconnect-vc-btn')?.addEventListener('click', leaveVoiceChannel);
document.getElementById('mute-btn')?.addEventListener('click', (e) => {
    isMuted = !isMuted;
    if (localAudioStream) localAudioStream.getAudioTracks()[0].enabled = !isMuted;
    e.currentTarget.classList.toggle('muted-state');
});
document.getElementById('deafen-btn')?.addEventListener('click', (e) => {
    isDeafened = !isDeafened;
    e.currentTarget.classList.toggle('muted-state');
    document.querySelectorAll('.vc-audio-element').forEach(audio => audio.muted = isDeafened);
});

function setupHiddenAudio(peerEmail, stream) {
    if (document.getElementById(`audio-${peerEmail}`)) return;
    const container = document.getElementById('hidden-audio-container');
    const audio = document.createElement('audio'); audio.id = `audio-${peerEmail}`; audio.className = 'vc-audio-element'; audio.autoplay = true; audio.srcObject = stream;
    if (isDeafened) audio.muted = true;
    container.appendChild(audio);
}
function removeHiddenAudio(peerEmail) { const el = document.getElementById(`audio-${peerEmail}`); if (el) el.remove(); }

// ==========================================
// --- CHAT ENABLE / DISABLE ---
// ==========================================
function enableChat() {
    let canSend = chatType === 'dm' ? true : getChannelPerm(currentChatId, 'sendMessages');
    if (chatType === 'server' && myServerMemberData?.timeoutUntil && myServerMemberData.timeoutUntil > Date.now()) {
        canSend = false;
        const remaining = Math.ceil((myServerMemberData.timeoutUntil - Date.now()) / 60000);
        document.getElementById('msg-input').placeholder = `You are timed out (${remaining} min remaining).`;
    } else {
        document.getElementById('msg-input').placeholder = canSend ? "Message..." : "You cannot send messages here.";
    }
    document.getElementById('msg-input').disabled = !canSend;
    document.getElementById('send-btn').disabled = !canSend;
    document.getElementById('upload-file-btn').disabled = !canSend;
    document.getElementById('emoji-picker-btn').disabled = !canSend;
    document.getElementById('gif-picker-btn').disabled = !canSend;
}

// ==========================================
// --- MESSAGE PROCESSING ---
// ==========================================
function processMentionsAndText(text) {
    if (!text) return { html: "", isMentioned: false };
    let processed = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    let isMentioned = false;
    if (myProfile.username && text.includes('@' + myProfile.username)) isMentioned = true;
    myServerRoles.forEach(role => { if (serverRolesCache[role] && text.includes('@' + serverRolesCache[role].name)) isMentioned = true; });

    // Markdown
    processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    processed = processed.replace(/\*(.*?)\*/g, '<em>$1</em>');
    processed = processed.replace(/~~(.*?)~~/g, '<del>$1</del>');
    processed = processed.replace(/__(.*?)__/g, '<u>$1</u>');
    processed = processed.replace(/`(.*?)`/g, '<code class="markdown-code">$1</code>');
    processed = processed.replace(/\n/g, '<br>');

    // Mentions
    processed = processed.replace(/@([a-zA-Z0-9_]+)/g, `<strong class="mention-link" style="color:var(--accent-warning);background:rgba(227,179,65,0.12);padding:0 3px;border-radius:3px;cursor:pointer;" onclick="handleMentionClick('$1',event)">@$1</strong>`);

    // Custom emojis
    processed = processed.replace(/\[:([^:]+):([^\]]+)\]/g, (match, name, id) => {
        if (globalEmojisCache[id]) return `<img src="${globalEmojisCache[id].url}" class="custom-emoji" data-id="${id}" alt="${name}" title=":${name}:">`;
        return `:${name}:`;
    });

    return { html: processed, isMentioned };
}

async function buildMessageHtml(data) {
    const mentionData = processMentionsAndText(data.text);
    const editedHtml = data.edited ? `<span style="font-size:10px;color:var(--text-muted);margin-left:5px;">(edited)</span>` : '';
    let contentHtml = `<div style="margin-left:42px;word-break:break-word;color:var(--text-main);">${mentionData.html}${editedHtml}</div>`;

    const inviteRegex = new RegExp(`${appBaseUrl.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\?invite=([a-zA-Z0-9]+)`, 'g');
    let match; let tempEmbeds = [];
    while ((match = inviteRegex.exec(data.text)) !== null) {
        const iCode = match[1]; const placeholderId = 'embed-' + generateCode();
        contentHtml += `<div id="${placeholderId}" style="margin-left:42px;margin-top:5px;"></div>`;
        tempEmbeds.push({ code: iCode, id: placeholderId });
    }

    // Image
    if (data.imageUrl) {
        const isGif = data.imageUrl.includes('tenor.com') || data.imageUrl.includes('giphy') || data.gifUrl;
        const imgClass = isGif ? 'message-gif' : 'message-image';
        contentHtml += `<img src="${data.imageUrl}" data-original="${data.originalImageUrl || data.imageUrl}" class="${imgClass}" style="margin-left:42px;">`;
    }

    // Video
    if (data.videoUrl) {
        contentHtml += `<video src="${data.videoUrl}" class="message-video" controls style="margin-left:42px;" playsinline></video>`;
    }

    // Audio
    if (data.audioUrl) {
        contentHtml += `<audio src="${data.audioUrl}" class="message-audio" controls style="margin-left:42px;"></audio>`;
    }

    // File
    if (data.fileUrl) {
        const ext = (data.fileName || '').split('.').pop().toLowerCase();
        const icon = ['mp4', 'mov', 'avi', 'webm'].includes(ext) ? icons.video : (['mp3', 'wav', 'ogg', 'm4a'].includes(ext) ? icons.music : icons.file);
        contentHtml += `<a href="${data.fileUrl}" target="_blank" download="${data.fileName || 'file'}" class="message-file-embed" style="margin-left:42px;" onclick="event.stopPropagation()">
            <div class="message-file-icon">${icon}</div>
            <div class="message-file-info">
                <div class="message-file-name">${data.fileName || 'File'}</div>
                <div class="message-file-size">${data.fileSize ? formatBytes(data.fileSize) : ''} · Click to download</div>
            </div>
            <div style="margin-left:auto;color:var(--text-muted);">${icons.download}</div>
        </a>`;
    }

    return { html: contentHtml, isMentioned: mentionData.isMentioned, embeds: tempEmbeds };
}

let lastMsgSender = null; let lastMsgTime = 0;
const scrollBtn = document.getElementById('scroll-bottom-btn');
const messagesDiv = document.getElementById('messages');
let oldestMsgTimestamp = null; let isFetchingMore = false; let currentChatLabelText = "";

messagesDiv?.addEventListener('scroll', () => {
    if (messagesDiv.scrollHeight - messagesDiv.scrollTop > messagesDiv.clientHeight + 100) scrollBtn.style.display = 'flex';
    else { scrollBtn.style.display = 'none'; update(ref(db, `users/${currentUserSafeEmail}/lastRead`), { [currentChatId]: Date.now() }); }
    if (messagesDiv.scrollTop < 50 && !isFetchingMore && oldestMsgTimestamp) fetchOlderMessages();
});
scrollBtn?.addEventListener('click', () => { messagesDiv.scrollTop = messagesDiv.scrollHeight; update(ref(db, `users/${currentUserSafeEmail}/lastRead`), { [currentChatId]: Date.now() }); });

function insertWelcomeMessage() {
    let w = document.getElementById('chat-welcome-msg');
    if (!w) { w = document.createElement('div'); w.id = 'chat-welcome-msg'; w.className = 'welcome-message'; w.innerHTML = `<h1>Welcome to ${currentChatLabelText}!</h1><p>This is the beginning of the ${currentChatLabelText} channel.</p>`; }
    messagesDiv.insertBefore(w, messagesDiv.firstChild);
}

async function fetchOlderMessages() {
    isFetchingMore = true;
    const oldScrollHeight = messagesDiv.scrollHeight;
    document.getElementById('chat-loading-spinner').style.display = 'block';
    const msgRef = query(ref(db, chatType === 'server' ? `messages/${currentChatId}` : `dms/${currentChatId}`), orderByChild('timestamp'), endAt(oldestMsgTimestamp - 1), limitToLast(50));
    const snap = await get(msgRef);
    if (snap.exists()) {
        const msgs = [];
        snap.forEach(c => msgs.push({ id: c.key, data: c.val() }));
        if (msgs.length > 0) oldestMsgTimestamp = msgs[0].data.timestamp; else oldestMsgTimestamp = null;
        const fragment = document.createDocumentFragment();
        let tempLastSender = null; let tempLastTime = 0;
        for (const m of msgs) { const el = await createMessageDOM(m.id, m.data, tempLastSender, tempLastTime); fragment.appendChild(el); tempLastSender = m.data.sender; tempLastTime = m.data.timestamp; }
        messagesDiv.insertBefore(fragment, messagesDiv.firstChild);
        messagesDiv.scrollTop = messagesDiv.scrollHeight - oldScrollHeight;
        if (msgs.length < 50) { oldestMsgTimestamp = null; insertWelcomeMessage(); }
    } else { oldestMsgTimestamp = null; insertWelcomeMessage(); }
    document.getElementById('chat-loading-spinner').style.display = 'none';
    isFetchingMore = false;
}

async function createMessageDOM(msgId, data, prevSender, prevTime) {
    const isConsecutive = (prevSender === data.sender) && (data.timestamp - prevTime < 300000) && !data.replyTo;
    const msgElement = document.createElement('div');
    msgElement.classList.add('message');
    if (isConsecutive) msgElement.classList.add('consecutive'); else msgElement.classList.add('message-group-start');
    msgElement.id = `msg-${msgId}`;

    const buildRes = await buildMessageHtml(data);
    if (buildRes.isMentioned && data.sender !== auth.currentUser.email) msgElement.classList.add('mentioned');

    let canEdit = data.sender === auth.currentUser.email;
    let canDelete = canEdit || (chatType === 'server' && (myServerPerms.manageServerSettings || myServerPerms.manageMessages));
    let nameColor = "var(--text-bright)";
    if (chatType === 'server' && data.roleId && data.roleId !== 'member' && data.roleId !== 'owner') { const rSnap = await get(ref(db, `servers/${currentServerId}/roles/${data.roleId}`)); if (rSnap.exists()) nameColor = rSnap.val().color; }
    if (data.roleId === 'system') nameColor = "var(--accent-primary)";

    const actionsHtml = `<div class="msg-actions">
        <button class="msg-action-btn react" onclick="openEmojiPickerForReaction('${msgId}',event)">${icons.addReaction} React</button>
        <button class="msg-action-btn reply">${icons.reply} Reply</button>
        ${canEdit ? `<button class="msg-action-btn edit-msg">${icons.gear} Edit</button>` : ''}
        ${canDelete ? `<button class="msg-action-btn del">${icons.trash} Delete</button>` : ''}
    </div>`;

    const timeStr = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = new Date(data.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
    const fullTime = `${dateStr} at ${timeStr}`;

    if (!isConsecutive) {
        const replyHtml = data.replyTo ? `<div class="reply-context"><strong>@${data.replyTo.username}</strong> ${data.replyTo.text}</div>` : "";
        
        // --- NEW DECORATION CODE ---
        // We fetch the user's data from the cache to see if they have a decoration equipped
        const userCacheObj = globalUsersCache[data.sender] || { avatar: data.avatar, status: 'offline' };
        const avatarWithDec = getAvatarHTML(userCacheObj, 'avatar-small');
        
        // We wrap the new avatar in a div that keeps the click event to open the profile
        const headerHtml = `${replyHtml}<div class="message-header">
            <div style="cursor:pointer;" onclick="showGlobalUserProfile('${data.sender}',event)">${avatarWithDec}</div>
            <span class="message-sender" style="color:${nameColor};cursor:pointer;" onclick="showGlobalUserProfile('${data.sender}',event)">${data.username}</span>
            <span class="message-time" title="${fullTime}">${timeStr}</span>
        </div>`;
        // ---------------------------

        msgElement.innerHTML = `${actionsHtml}${headerHtml}<div class="msg-content-wrapper">${buildRes.html}</div>`;
    } else {        msgElement.innerHTML = `${actionsHtml}<div class="msg-content-wrapper">${buildRes.html}</div>`;
    }

    const reactionsDiv = document.createElement('div'); reactionsDiv.className = 'reactions-container'; reactionsDiv.id = `reactions-${msgId}`;
    msgElement.appendChild(reactionsDiv);
    if (data.reactions) renderReactions(msgId, data.reactions);

    buildRes.embeds.forEach(async (eObj) => {
        const sSnap = await get(ref(db, `servers/${eObj.code}`));
        if (sSnap.exists()) {
            const sData = sSnap.val();
            const iHtml = sData.icon ? `<div class="invite-embed-icon" style="background-image:url(${sData.icon})"></div>` : `<div class="invite-embed-icon">${sData.name.charAt(0)}</div>`;
            const embedContainer = msgElement.querySelector('#' + eObj.id);
            if (embedContainer) embedContainer.innerHTML = `<div class="invite-embed"><h4>You've been invited to join a server</h4><div class="invite-embed-content">${iHtml}<div class="invite-embed-info"><div class="invite-embed-name">${sData.name}</div><button onclick="window.location.href='${appBaseUrl}?invite=${eObj.code}'" style="margin:0;padding:5px 15px;">Join</button></div></div></div>`;
        }
    });

    // Message action listeners
    const delBtn = msgElement.querySelector('.msg-action-btn.del');
    if (delBtn) {
        delBtn.addEventListener('click', (e) => {
            const path = `${chatType === 'server' ? 'messages' : 'dms'}/${currentChatId}/${msgId}`;
            if (e.shiftKey) remove(ref(db, path));
            else customConfirm("Delete this message?", "Delete Message", async (yes) => { if (yes) await remove(ref(db, path)); });
        });
    }

    const editBtn = msgElement.querySelector('.msg-action-btn.edit-msg');
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            const contentWrapper = msgElement.querySelector('.msg-content-wrapper');
            const originalHtml = contentWrapper.innerHTML;
            const rawText = data.text || '';
            contentWrapper.innerHTML = `<div style="margin-left:42px;"><textarea class="edit-msg-input" style="width:100%;background:var(--bg-tertiary);color:var(--text-bright);border:1px solid var(--border-color);border-radius:6px;padding:10px;margin-top:5px;resize:vertical;font-family:inherit;font-size:14px;">${rawText.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</textarea><div style="display:flex;gap:10px;margin-top:5px;font-size:12px;"><button class="save-edit-btn small-btn">Save</button><button class="cancel-edit-btn small-btn" style="background:transparent;border:1px solid var(--text-muted);color:var(--text-muted);">Cancel</button><span style="color:var(--text-muted);margin-left:auto;align-self:center;font-size:11px;">Enter to save · Shift+Enter for new line</span></div></div>`;
            const ta = contentWrapper.querySelector('.edit-msg-input');
            ta.style.height = ta.scrollHeight + 'px';
            ta.addEventListener('input', function () { this.style.height = 'auto'; this.style.height = this.scrollHeight + 'px'; });
            ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); contentWrapper.querySelector('.save-edit-btn').click(); } });
            ta.focus();
            contentWrapper.querySelector('.cancel-edit-btn').onclick = () => { contentWrapper.innerHTML = originalHtml; bindImageClick(contentWrapper.querySelector('.message-image, .message-gif')); };
            contentWrapper.querySelector('.save-edit-btn').onclick = () => {
                const newText = ta.value.trim();
                if (newText && newText !== rawText) {
                    data.text = newText; data.edited = true;
                    buildMessageHtml(data).then(res => { contentWrapper.innerHTML = res.html; bindImageClick(contentWrapper.querySelector('.message-image, .message-gif')); });
                    update(ref(db, `${chatType === 'server' ? 'messages' : 'dms'}/${currentChatId}/${msgId}`), { text: newText, edited: true });
                } else { contentWrapper.innerHTML = originalHtml; bindImageClick(contentWrapper.querySelector('.message-image, .message-gif')); }
            };
        });
    }

    const replyBtn = msgElement.querySelector('.msg-action-btn.reply');
    if (replyBtn) replyBtn.addEventListener('click', () => triggerReply(msgId, data.username, data.text || "Attachment..."));

    bindImageClick(msgElement.querySelector('.message-image'));
    bindImageClick(msgElement.querySelector('.message-gif'));

    return msgElement;
}

function renderReactions(msgId, reactionsObj) {
    const container = document.getElementById(`reactions-${msgId}`);
    if (!container) return;
    container.innerHTML = '';
    if (!reactionsObj) return;
    Object.keys(reactionsObj).forEach(emojiKey => {
        const users = reactionsObj[emojiKey].users || {};
        const count = Object.keys(users).length;
        if (count === 0) return;
        const hasMyVote = !!users[currentUserSafeEmail];
        const rDiv = document.createElement('div');
        rDiv.className = `msg-reaction ${hasMyVote ? 'active' : ''}`;
        if (globalEmojisCache[emojiKey]) rDiv.innerHTML = `<img src="${globalEmojisCache[emojiKey].url}" style="width:16px;height:16px;vertical-align:middle;"> <span>${count}</span>`;
        else rDiv.innerHTML = `<span style="font-size:15px;">${emojiKey}</span> <span>${count}</span>`;
        rDiv.onclick = () => {
            const dbPath = `${chatType === 'server' ? 'messages' : 'dms'}/${currentChatId}/${msgId}/reactions/${emojiKey}/users/${currentUserSafeEmail}`;
            if (hasMyVote) remove(ref(db, dbPath)); else set(ref(db, dbPath), true);
        };
        container.appendChild(rDiv);
    });
}

async function loadMessages(dbPath, chatNameLabel) {
    messagesDiv.innerHTML = '';
    currentChatLabelText = chatNameLabel;
    lastMsgSender = null; lastMsgTime = 0;
    oldestMsgTimestamp = null; isFetchingMore = false;
    if (unsubscribeMessages) unsubscribeMessages();
    if (unsubscribeMessagesRemoved) unsubscribeMessagesRemoved();
    const lastReadSnap = await get(ref(db, `users/${currentUserSafeEmail}/lastRead/${currentChatId}`));
    let lastReadTime = lastReadSnap.val() || 0;
    let insertedDivider = false;
    document.getElementById('chat-loading-spinner').style.display = 'block';
    const msgRef = query(ref(db, dbPath), orderByChild('timestamp'), limitToLast(50));
    const initialSnap = await get(msgRef);
    let highestTimestamp = 0; let firstMsg = true;
    const initialMessages = Object.entries(initialSnap.val() || {});
    for (const childSnap of initialMessages) {
        const msgId = childSnap[0]; const data = childSnap[1];
        if (firstMsg) { oldestMsgTimestamp = data.timestamp; firstMsg = false; }
        const el = await createMessageDOM(msgId, data, lastMsgSender, lastMsgTime);
        if (data.timestamp > lastReadTime && !insertedDivider && data.sender !== auth.currentUser.email) {
            insertedDivider = true;
            const div = document.createElement('div'); div.className = 'new-messages-divider'; div.innerHTML = `<span>New Messages</span>`;
            messagesDiv.appendChild(div);
        }
        messagesDiv.appendChild(el);
        lastMsgSender = data.sender; lastMsgTime = data.timestamp;
        highestTimestamp = Math.max(highestTimestamp, data.timestamp);
    }
    if (initialMessages.length < 50) { insertWelcomeMessage(); oldestMsgTimestamp = null; }
    document.getElementById('chat-loading-spinner').style.display = 'none';
    if (insertedDivider) { const divEl = messagesDiv.querySelector('.new-messages-divider'); if (divEl) setTimeout(() => divEl.scrollIntoView({ behavior: "smooth", block: "center" }), 100); }
    else messagesDiv.scrollTop = messagesDiv.scrollHeight;

    const liveRef = query(ref(db, dbPath), orderByChild('timestamp'), startAt(highestTimestamp + 1));
    unsubscribeMessages = onChildAdded(liveRef, async (childSnap) => {
        const data = childSnap.val();
        if (data.timestamp > highestTimestamp) {
            const existing = document.getElementById(`msg-${childSnap.key}`);
            if (!existing) {
                const el = await createMessageDOM(childSnap.key, data, lastMsgSender, lastMsgTime);
                messagesDiv.appendChild(el);
                lastMsgSender = data.sender; lastMsgTime = data.timestamp;
                if (messagesDiv.scrollHeight - messagesDiv.scrollTop < messagesDiv.clientHeight + 200) messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }
        }
    });

    unsubscribeMessagesRemoved = onChildRemoved(ref(db, dbPath), (snapshot) => { const msgEl = document.getElementById(`msg-${snapshot.key}`); if (msgEl) msgEl.remove(); });

    onValue(ref(db, dbPath), async (snap) => {
        snap.forEach(msgSnap => {
            const mData = msgSnap.val();
            renderReactions(msgSnap.key, mData.reactions || {});
            const msgEl = document.getElementById(`msg-${msgSnap.key}`);
            if (msgEl && mData.edited) {
                buildMessageHtml(mData).then(res => {
                    const contentWrapper = msgEl.querySelector('.msg-content-wrapper');
                    if (contentWrapper && !contentWrapper.querySelector('.edit-msg-input')) { contentWrapper.innerHTML = res.html; bindImageClick(contentWrapper.querySelector('.message-image, .message-gif')); }
                });
            }
        });
    });

    if (chatType === 'dm') clearUnread('dm', currentChatId); else if (chatType === 'server') clearUnread('channel', currentChatId, currentServerId);
}

// ==========================================
// --- REPLY ---
// ==========================================
function triggerReply(msgId, username, text) {
    replyingToMessage = { id: msgId, username, text: text.length > 50 ? text.substring(0, 50) + '...' : text };
    document.getElementById('reply-banner-text').innerHTML = `Replying to <strong style="color:var(--text-bright);">@${username}</strong>`;
    document.getElementById('reply-banner').style.display = 'flex';
    document.getElementById('msg-input').focus();
}
document.getElementById('cancel-reply-btn')?.addEventListener('click', () => { replyingToMessage = null; document.getElementById('reply-banner').style.display = 'none'; });

// ==========================================
// --- MENTION AUTOCOMPLETE ---
// ==========================================
const msgInput = document.getElementById('msg-input');
const mentionMenu = document.getElementById('mention-menu');
let mentionStartIndex = -1; let mentionSearchTerm = null;

msgInput?.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 200) + 'px';
    const val = this.value; const cursorPos = this.selectionStart;
    const textBeforeCursor = val.substring(0, cursorPos);
    const match = textBeforeCursor.match(/@(\w*)$/);
    if (match) { mentionStartIndex = match.index; mentionSearchTerm = match[1].toLowerCase(); showMentionMenu(mentionSearchTerm); }
    else mentionMenu.style.display = 'none';
});

function showMentionMenu(term) {
    mentionMenu.innerHTML = ''; let matches = [];
    if (chatType === 'server') {
        Object.values(serverRolesCache).forEach(role => { if (role.name.toLowerCase().includes(term)) matches.push({ type: 'role', name: role.name, color: role.color }); });
        currentServerMembersList.forEach(m => { if (m.username.toLowerCase().includes(term)) matches.push({ type: 'user', name: m.username, avatar: m.avatar }); });
    } else if (chatType === 'dm') {
        if (currentDMOtherUser) matches.push({ type: 'user', name: currentDMOtherUser.username, avatar: currentDMOtherUser.avatar });
        matches.push({ type: 'user', name: myProfile.username, avatar: myProfile.avatar });
        matches = matches.filter(m => m.name.toLowerCase().includes(term));
    }
    if (matches.length === 0) { mentionMenu.style.display = 'none'; return; }
    matches.slice(0, 8).forEach(m => {
        const div = document.createElement('div'); div.className = 'mention-item';
        if (m.type === 'role') div.innerHTML = `<div style="width:22px;height:22px;border-radius:50%;background:${m.color};display:flex;align-items:center;justify-content:center;font-size:11px;color:white;flex-shrink:0;">@</div><span>@${m.name}</span>`;
        else div.innerHTML = `<img src="${m.avatar || ''}" class="mention-avatar" style="object-fit:cover;"><span>${m.name}</span>`;
        div.addEventListener('click', () => {
            const val = msgInput.value;
            msgInput.value = val.substring(0, mentionStartIndex) + '@' + m.name + ' ' + val.substring(msgInput.selectionStart);
            mentionMenu.style.display = 'none'; msgInput.focus();
        });
        mentionMenu.appendChild(div);
    });
    mentionMenu.style.display = 'flex';
}

// ==========================================
// --- EMOJI PICKER ---
// ==========================================
const emojiPickerEl = document.getElementById('emoji-picker');
const emojiBtn = document.getElementById('emoji-picker-btn');
const epIconSpan = document.getElementById('ep-icon-span');
let emojiHoverInterval = null;
let currentReactionMsgId = null;

const emojiCategories = {
    '😀': ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕'],
    '👍': ['👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🙏','🤝','💪','🦵','🦶','👂','🦻','👃','🧠','🦷','👀','👁','👅','💋','💘','💝','💖','💗','💓','💞','💕','💟','❣️','💔','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎'],
    '🐶': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦗','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌'],
    '🍕': ['🍎','🍊','🍋','🍇','🍓','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🍆','🥦','🥬','🌽','🌶️','🫑','🥒','🫒','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🫓','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫔','🌮','🌯','🥙','🧆','🥚','🍲','🫕','🥘','🍱','🍣','🍤','🍙','🍚','🍘','🍥','🥮','🍢','🧁','🎂','🍰','🍫','🍬','🍭','☕','🍵','🧃','🥤','🧋','🍺','🍻','🥂','🍷','🥃','🍸','🍹'],
    '⚽': ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛷','⛸️','🥌','🎿','🛼','⛷️','🏂','🏋️','🤼','🤸','🏊','🚴','🏇','🤺','🤾','⛹️','🤻','🏌️','🏄','🏰','🏯','🗺️','🌋','⛺','🌄','🌅','🌇','🌃','🌌','🌠','🎆','🎇','🎑','🏞️'],
    '🎉': ['🎃','🎄','🎆','🎇','🧨','✨','🎋','🎍','🎎','🎏','🎐','🎑','🧧','🎀','🎁','🎗️','🎟️','🎫','🎖️','🏆','🥇','🥈','🥉','🏅','🎪','🎭','🎨','🎬','🎤','🎧','🎼','🎵','🎶','🎹','🥁','🎷','🎺','🎸','🪕','🎻','🎲','♟️','🎯','🎳','🎮','🕹️','🎰','🧩','🪆','🧸','🪅','🎭','🎠','🎡','🎢','💈','🎪','🤹','🎨','🖼️','🎭','🎬'],
    '🌍': ['🌍','🌎','🌏','🌐','🗺️','🧭','🌋','⛰️','🏔️','🗻','🏕️','🏖️','🏜️','🏝️','🏞️','🏟️','🏛️','🏗️','🏘️','🏚️','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🗼','🗽','⛪','🕌','🛕','🕍','⛩️','🕋','⛲','⛺','🌁','🌃','🏙️','🌄','🌅','🌆','🌇','🌉','🎠','🎡','⛟','🚀','🛸','🌙','⭐','🌟','💫','⚡','☄️','☀️','🌤️','⛅','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','🌪️','🌫️','🌈','☔','⚡','🌊','🌺','🌸','🌼','🌻','🌞'],
    '💼': ['💼','👓','🕶️','🥽','🦺','👔','👗','👙','👚','👛','👜','👝','🎒','🧳','👒','🎩','🪖','⛑️','💄','💍','💎','🔇','🔈','📢','📣','🔔','🔕','🎵','🎶','💰','💴','💵','💶','💷','💸','💳','💹','✉️','📩','📨','📧','📦','📫','📪','📬','📭','📮','🗳️','✏️','✒️','🖊️','🖋️','📝','📁','📂','📓','📔','📒','📕','📗','📘','📙','📚','📖','🔖','🏷️','💡','🔦','🕯️','🖥️','💻','⌨️','🖱️','🖨️','📱','📲','📞','📟','📠','🔋','🪫','🔌','💾','💿','📀','🎥','📸','📷','📹','📽️','🎞️','📞','🔭','🔬','🩺'],
    '❤️': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','⚕️','♻️','⚜️','🔱','📛','🔰','⭕','✅','☑️','✔️','❌','❎','➕','➖','➗','➰','➿','〽️','✳️','✴️','❇️','💯','🔅','🔆','🔶','🔷','🔸','🔹','🔺','🔻','💠','🔘','🔳','🔲'],
};

emojiBtn?.addEventListener('mouseenter', () => {
    const allEmojis = Object.values(emojiCategories).flat();
    let i = 0;
    emojiHoverInterval = setInterval(() => { epIconSpan.innerHTML = `<span style="font-size:20px;line-height:1;">${allEmojis[Math.floor(Math.random() * allEmojis.length)]}</span>`; i++; }, 300);
});
emojiBtn?.addEventListener('mouseleave', () => { clearInterval(emojiHoverInterval); epIconSpan.innerHTML = icons.smile; });
emojiBtn?.addEventListener('click', (e) => { e.stopPropagation(); currentReactionMsgId = null; closeGifPicker(); toggleEmojiPicker(); });

window.openEmojiPickerForReaction = function (msgId, event) {
    if (event) event.stopPropagation();
    currentReactionMsgId = msgId;
    closeGifPicker();
    toggleEmojiPicker();
};

function toggleEmojiPicker() {
    if (emojiPickerEl.style.display !== 'none' && emojiPickerEl.style.display !== '') {
        emojiPickerEl.style.display = 'none'; return;
    }
    buildEmojiPicker();
    emojiPickerEl.style.display = 'flex';
}

function buildEmojiPicker() {
    const tabsContainer = document.getElementById('emoji-picker-tabs');
    const contentContainer = document.getElementById('emoji-picker-content');
    const searchInput = document.getElementById('emoji-search');

    tabsContainer.innerHTML = '';
    const catNames = Object.keys(emojiCategories);

    // Custom emojis tab
    const customTab = document.createElement('div');
    customTab.className = 'ep-tab active';
    customTab.innerText = '⭐';
    customTab.title = 'Custom & Favorites';
    customTab.onclick = () => { document.querySelectorAll('.ep-tab').forEach(t => t.classList.remove('active')); customTab.classList.add('active'); showEmojiSection('custom'); };
    tabsContainer.appendChild(customTab);

    catNames.forEach((catEmoji, idx) => {
        const tab = document.createElement('div');
        tab.className = 'ep-tab';
        tab.innerText = catEmoji;
        tab.title = catEmoji;
        tab.onclick = () => { document.querySelectorAll('.ep-tab').forEach(t => t.classList.remove('active')); tab.classList.add('active'); showEmojiSection(catEmoji); };
        tabsContainer.appendChild(tab);
    });

    searchInput.value = '';
    searchInput.oninput = () => {
        const term = searchInput.value.toLowerCase();
        if (!term) { showEmojiSection('custom'); return; }
        contentContainer.innerHTML = '';
        const grid = document.createElement('div'); grid.className = 'ep-grid';
        const label = document.createElement('div'); label.className = 'ep-section-label'; label.innerText = 'Search Results';
        contentContainer.appendChild(label);
        Object.entries(emojiCategories).forEach(([, emojis]) => {
            emojis.forEach(e => { if (e.includes(term) || term.length < 2) { const s = document.createElement('div'); s.className = 'ep-emoji'; s.innerText = e; s.onclick = () => insertEmoji(e, e, false); grid.appendChild(s); } });
        });
        contentContainer.appendChild(grid);
    };

    showEmojiSection('custom');
}

function showEmojiSection(catKey) {
    const contentContainer = document.getElementById('emoji-picker-content');
    contentContainer.innerHTML = '';

    if (catKey === 'custom') {
        // Server emojis
        if (currentServerId) {
            get(ref(db, `servers/${currentServerId}/emojis`)).then(snap => {
                if (snap.exists()) {
                    const label = document.createElement('div'); label.className = 'ep-section-label'; label.innerText = 'Server Emojis';
                    contentContainer.insertBefore(label, contentContainer.firstChild);
                    const grid = document.createElement('div'); grid.className = 'ep-grid';
                    Object.keys(snap.val()).forEach(eid => {
                        const edata = globalEmojisCache[eid];
                        if (edata) { const img = document.createElement('img'); img.src = edata.url; img.className = 'ep-custom-img'; img.title = `:${edata.name}:`; img.onclick = () => insertEmoji(eid, edata.name, true); grid.appendChild(img); }
                    });
                    contentContainer.insertBefore(grid, label.nextSibling);
                }
            });
        }
        // Personal emojis
        get(ref(db, `users/${currentUserSafeEmail}/emojis`)).then(snap => {
            if (snap.exists()) {
                const label = document.createElement('div'); label.className = 'ep-section-label'; label.innerText = 'Personal Emojis';
                const grid = document.createElement('div'); grid.className = 'ep-grid';
                Object.keys(snap.val()).forEach(eid => {
                    const edata = globalEmojisCache[eid];
                    if (edata) { const img = document.createElement('img'); img.src = edata.url; img.className = 'ep-custom-img'; img.title = `:${edata.name}:`; img.onclick = () => insertEmoji(eid, edata.name, true); grid.appendChild(img); }
                });
                contentContainer.appendChild(label);
                contentContainer.appendChild(grid);
            }
        });

        // Frequently used standard emojis
        const favLabel = document.createElement('div'); favLabel.className = 'ep-section-label'; favLabel.innerText = 'Frequently Used';
        const favGrid = document.createElement('div'); favGrid.className = 'ep-grid';
        const favEmojis = ['😀','😂','😍','😭','😎','👍','🙏','🔥','✨','🎉','💀','👀','💯','❤️','🥺','😤','🤡','💀','🐛','🤌'];
        favEmojis.forEach(e => { const s = document.createElement('div'); s.className = 'ep-emoji'; s.innerText = e; s.onclick = () => insertEmoji(e, e, false); favGrid.appendChild(s); });
        contentContainer.appendChild(favLabel);
        contentContainer.appendChild(favGrid);
        return;
    }

    const emojis = emojiCategories[catKey] || [];
    const label = document.createElement('div'); label.className = 'ep-section-label'; label.innerText = catKey;
    const grid = document.createElement('div'); grid.className = 'ep-grid';
    emojis.forEach(e => { const s = document.createElement('div'); s.className = 'ep-emoji'; s.innerText = e; s.onclick = () => insertEmoji(e, e, false); grid.appendChild(s); });
    contentContainer.appendChild(label);
    contentContainer.appendChild(grid);
}

function insertEmoji(idOrChar, name, isCustom) {
    if (currentReactionMsgId) {
        const dbPath = `${chatType === 'server' ? 'messages' : 'dms'}/${currentChatId}/${currentReactionMsgId}/reactions/${idOrChar}/users/${currentUserSafeEmail}`;
        set(ref(db, dbPath), true);
    } else {
        const input = document.getElementById('msg-input');
        if (isCustom) input.value += `[:${name}:${idOrChar}] `;
        else input.value += idOrChar;
        input.focus();
        input.dispatchEvent(new Event('input'));
    }
    emojiPickerEl.style.display = 'none';
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('#emoji-picker') && !e.target.closest('#emoji-picker-btn') && !e.target.closest('.react')) emojiPickerEl.style.display = 'none';
    if (!e.target.closest('#gif-picker') && !e.target.closest('#gif-picker-btn')) closeGifPicker();
});

// ==========================================
// --- GIF PICKER (Tenor API) ---
// ==========================================
const gifPickerEl = document.getElementById('gif-picker');

function closeGifPicker() { if (gifPickerEl) gifPickerEl.style.display = 'none'; }

document.getElementById('gif-picker-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    emojiPickerEl.style.display = 'none';
    if (gifPickerEl.style.display !== 'none' && gifPickerEl.style.display !== '') { closeGifPicker(); return; }
    gifPickerEl.style.display = 'flex';
    loadTrendingGifs();
});

async function loadTrendingGifs() {
    const grid = document.getElementById('gif-grid');
    const loading = document.getElementById('gif-loading');
    grid.innerHTML = ''; loading.style.display = 'block';
    try {
        const res = await fetch(`https://api.klipy.com/v2/featured?key=${KLIPY_API_KEY}&limit=20&media_filter=gif`);
        const data = await res.json();
        loading.style.display = 'none';
        renderGifResults(data.results || []);
    } catch (err) {
        loading.style.display = 'none';
        grid.innerHTML = `<p style="color:var(--text-muted);font-size:12px;padding:10px;grid-column:span 2;">GIFs unavailable. Check your KLIPY API key in app.js</p>`;
    }
}

async function searchGifs(query) {
    const grid = document.getElementById('gif-grid');
    const loading = document.getElementById('gif-loading');
    grid.innerHTML = ''; loading.style.display = 'block';
    try {
        const res = await fetch(`https://api.klipy.com/v2/search?key=${KLIPY_API_KEY}&q=${encodeURIComponent(query)}&limit=20&media_filter=gif`);
        const data = await res.json();
        loading.style.display = 'none';
        renderGifResults(data.results || []);
    } catch (err) {
        loading.style.display = 'none';
        grid.innerHTML = `<p style="color:var(--text-muted);font-size:12px;padding:10px;grid-column:span 2;">Search failed. Check your KLIPY API key.</p>`;
    }
}

function renderGifResults(results) {
    const grid = document.getElementById('gif-grid');
    grid.innerHTML = '';
    if (!results.length) { grid.innerHTML = `<p style="color:var(--text-muted);font-size:12px;padding:10px;grid-column:span 2;">No GIFs found.</p>`; return; }
    results.forEach(gif => {
        const item = document.createElement('div'); item.className = 'gif-item';
        const preview = gif.media_formats?.tinygif?.url || gif.media_formats?.gif?.url;
        const full = gif.media_formats?.gif?.url || preview;
        item.innerHTML = `<img src="${preview}" alt="gif" loading="lazy">`;
        item.onclick = () => sendGif(full);
        grid.appendChild(item);
    });
}

let gifSearchTimeout = null;
document.getElementById('gif-search-input')?.addEventListener('input', (e) => {
    clearTimeout(gifSearchTimeout);
    const q = e.target.value.trim();
    gifSearchTimeout = setTimeout(() => { if (q) searchGifs(q); else loadTrendingGifs(); }, 500);
});
document.getElementById('gif-search-btn')?.addEventListener('click', () => {
    const q = document.getElementById('gif-search-input').value.trim();
    if (q) searchGifs(q); else loadTrendingGifs();
});
document.getElementById('gif-search-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') { const q = e.target.value.trim(); if (q) searchGifs(q); }
});

async function sendGif(gifUrl) {
    if (!currentChatId) return;
    closeGifPicker();
    const path = chatType === 'server' ? `messages/${currentChatId}` : `dms/${currentChatId}`;
    let roleId = 'member';
    if (chatType === 'server') { const mSnap = await get(ref(db, `server_members/${currentServerId}/${currentUserSafeEmail}/role`)); roleId = mSnap.val() || 'member'; }
    const msgPayload = { sender: auth.currentUser.email, username: myProfile.username, avatar: myProfile.avatar, text: '', imageUrl: gifUrl, gifUrl: true, timestamp: Date.now(), roleId };
    if (replyingToMessage) { msgPayload.replyTo = replyingToMessage; replyingToMessage = null; document.getElementById('reply-banner').style.display = 'none'; }
    push(ref(db, path), msgPayload);
    if (chatType === 'dm') {
        const friendEmail = currentChatId.replace(currentUserSafeEmail, '').replace(/_/g, '').replace(currentUserSafeEmail, '');
        update(ref(db, `users/${currentUserSafeEmail}/friends/${friendEmail}`), { lastActivity: Date.now(), hidden: false });
    }
    update(ref(db, `users/${currentUserSafeEmail}/lastRead`), { [currentChatId]: Date.now() });
}

// ==========================================
// --- FILE UPLOAD (Firebase Storage) ---
// ==========================================
document.getElementById('upload-file-btn')?.addEventListener('click', () => document.getElementById('file-upload').click());

document.getElementById('file-upload')?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file || !currentChatId) return;
    const maxSize = 25 * 1024 * 1024; // 25MB limit
    if (file.size > maxSize) { customAlert(`File too large. Max size is 25MB.`, "Error"); return; }

    const isImage = file.type.startsWith('image/') && file.type !== 'image/gif';
    const isGif = file.type === 'image/gif';
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');

    if (isGif || isImage) {
        // Keep images/GIFs as base64 for quick viewing
        const reader = new FileReader();
        reader.onload = (ev) => {
            pendingAttachment = { type: isGif ? 'gif' : 'image', data: ev.target.result, mimeType: file.type, name: file.name };
            document.getElementById('attachment-preview-img').src = ev.target.result;
            document.getElementById('attachment-preview-img').style.display = 'block';
            document.getElementById('attachment-preview-vid').style.display = 'none';
            document.getElementById('attachment-preview-file').style.display = 'none';
            document.getElementById('attachment-preview-area').style.display = 'flex';
        };
        reader.readAsDataURL(file);
    } else if (isVideo) {
        const url = URL.createObjectURL(file);
        pendingAttachment = { type: 'video', file, mimeType: file.type, name: file.name, size: file.size };
        document.getElementById('attachment-preview-img').style.display = 'none';
        document.getElementById('attachment-preview-vid').src = url;
        document.getElementById('attachment-preview-vid').style.display = 'block';
        document.getElementById('attachment-preview-file').style.display = 'none';
        document.getElementById('attachment-preview-area').style.display = 'flex';
    } else {
        // Generic file
        pendingAttachment = { type: 'file', file, mimeType: file.type, name: file.name, size: file.size };
        document.getElementById('attachment-preview-img').style.display = 'none';
        document.getElementById('attachment-preview-vid').style.display = 'none';
        const filePreview = document.getElementById('attachment-preview-file');
        filePreview.style.display = 'flex';
        filePreview.style.cssText = 'display:flex; align-items:center; gap:10px; color:var(--text-bright);';
        filePreview.innerHTML = `${icons.file} <div><div style="font-weight:600;">${file.name}</div><div style="font-size:11px;color:var(--text-muted);">${formatBytes(file.size)}</div></div>`;
        document.getElementById('attachment-preview-area').style.display = 'flex';
    }
    document.getElementById('file-upload').value = "";
});

document.getElementById('remove-attachment-btn')?.addEventListener('click', () => {
    pendingAttachment = null;
    document.getElementById('attachment-preview-area').style.display = 'none';
    document.getElementById('attachment-preview-img').src = '';
    document.getElementById('attachment-preview-vid').src = '';
});

// Paste image support
document.getElementById('msg-input')?.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const blob = item.getAsFile();
            if (!blob) continue;
            const reader = new FileReader();
            reader.onload = (ev) => {
                pendingAttachment = { type: 'image', data: ev.target.result, mimeType: blob.type, name: 'paste.png' };
                document.getElementById('attachment-preview-img').src = ev.target.result;
                document.getElementById('attachment-preview-img').style.display = 'block';
                document.getElementById('attachment-preview-vid').style.display = 'none';
                document.getElementById('attachment-preview-file').style.display = 'none';
                document.getElementById('attachment-preview-area').style.display = 'flex';
            };
            reader.readAsDataURL(blob);
        }
    }
});

async function uploadFileToStorage(file) {
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageRef = sRef(storage, `uploads/${currentUserSafeEmail}/${timestamp}_${safeName}`);
    const snapshot = await uploadBytes(storageRef, file);
    return await getDownloadURL(snapshot.ref);
}

// ==========================================
// --- SEND MESSAGE ---
// ==========================================
async function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text && !pendingAttachment) return;
    if (!currentChatId || !myServerPerms.sendMessages) return;

    const path = chatType === 'server' ? `messages/${currentChatId}` : `dms/${currentChatId}`;
    let roleId = 'member';
    if (chatType === 'server') { const mSnap = await get(ref(db, `server_members/${currentServerId}/${currentUserSafeEmail}/role`)); roleId = mSnap.val() || 'member'; }

    let msgPayload = { sender: auth.currentUser.email, username: myProfile.username, avatar: myProfile.avatar, text, timestamp: Date.now(), roleId };

    if (replyingToMessage) { msgPayload.replyTo = replyingToMessage; replyingToMessage = null; document.getElementById('reply-banner').style.display = 'none'; }

    if (pendingAttachment) {
        const att = pendingAttachment;
        if (att.type === 'image' || att.type === 'gif') {
            msgPayload.imageUrl = att.data;
            msgPayload.originalImageUrl = att.data;
            if (att.type === 'gif') msgPayload.gifUrl = true;
        } else if (att.type === 'video') {
            try {
                showToast('Uploading video...', 'info', 8000);
                const url = await uploadFileToStorage(att.file);
                msgPayload.videoUrl = url;
                msgPayload.fileName = att.name;
            } catch (err) { showToast('Upload failed: ' + err.message, 'error'); return; }
        } else if (att.type === 'audio') {
            try {
                showToast('Uploading audio...', 'info', 5000);
                const url = await uploadFileToStorage(att.file);
                msgPayload.audioUrl = url;
                msgPayload.fileName = att.name;
            } catch (err) { showToast('Upload failed: ' + err.message, 'error'); return; }
        } else {
            try {
                showToast(`Uploading ${att.name}...`, 'info', 8000);
                const url = await uploadFileToStorage(att.file);
                msgPayload.fileUrl = url;
                msgPayload.fileName = att.name;
                msgPayload.fileSize = att.size;
            } catch (err) { showToast('Upload failed: ' + err.message, 'error'); return; }
        }
        pendingAttachment = null;
        document.getElementById('attachment-preview-area').style.display = 'none';
    }

    push(ref(db, path), msgPayload);
    input.value = '';
    input.style.height = 'auto';
    mentionMenu.style.display = 'none';

    if (chatType === 'dm') {
        const parts = currentChatId.split('_');
        const friendEmail = parts.find(p => p !== currentUserSafeEmail);
        if (friendEmail) {
            update(ref(db, `users/${currentUserSafeEmail}/friends/${friendEmail}`), { lastActivity: Date.now(), hidden: false });
            update(ref(db, `users/${friendEmail}/friends/${currentUserSafeEmail}`), { lastActivity: Date.now(), hidden: false });
        }
    }
    update(ref(db, `users/${currentUserSafeEmail}/lastRead`), { [currentChatId]: Date.now() });
}

document.getElementById('send-btn')?.addEventListener('click', sendMessage);
document.getElementById('msg-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// ==========================================
// --- NOTIFICATIONS ---
// ==========================================
function startNotificationListeners() {
    if (dmsNotifListener) dmsNotifListener();
    if (serversNotifListener) serversNotifListener();
    dmsNotifListener = onChildAdded(ref(db, `users/${currentUserSafeEmail}/friends`), (childSnapshot) => {
        const dmId = childSnapshot.val().dmId;
        onChildAdded(query(ref(db, `dms/${dmId}`), limitToLast(1)), (msg) => {
            const mData = msg.val();
            if (notificationsActive && currentChatId !== dmId && mData.timestamp > appStartTime && mData.sender !== auth.currentUser.email) markUnread('dm', dmId, null, false);
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

function markUnread(type, id, serverId = null, isMention = false) {
    if (type === 'dm') { unreadState.dms.add(id); updateBadge(`dm-${id}`, true, false, isMention); updateBadge('home-btn', true, true, isMention); }
    else if (type === 'channel') { unreadState.channels.add(id); unreadState.servers.add(serverId); updateBadge(`channel-${id}`, true, false, isMention); updateBadge(`server-${serverId}`, true, true, isMention); }
}
function clearUnread(type, id, serverId = null) {
    if (type === 'dm') { unreadState.dms.delete(id); updateBadge(`dm-${id}`, false); if (unreadState.dms.size === 0) updateBadge('home-btn', false); }
    else if (type === 'channel') { unreadState.channels.delete(id); updateBadge(`channel-${id}`, false); updateBadge(`server-${serverId}`, false); }
}
function updateBadge(id, show, isDot = false, isMention = false) {
    const el = document.getElementById(id); if (!el) return;
    let badge = el.querySelector('.unread-indicator');
    if (show) { if (!badge) { badge = document.createElement('div'); el.appendChild(badge); } badge.className = `unread-indicator ${isMention ? 'mention' : (isDot ? 'dot' : 'pill')}`; }
    else { if (badge) badge.remove(); }
}