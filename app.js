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
let currentServerId = null;
let currentChatId = null; 
let chatType = 'home'; 
let currentHomeTab = 'friends'; 
let currentUserSafeEmail = null;
let myProfile = {}; 
let myServerPerms = { viewChannels: true, sendMessages: true, manageChannels: false, manageServerSettings: false, manageServerProfile: false, manageServerOverview: false, manageRoles: false, manageMessages: false, kickMembers: false, banMembers: false, timeoutMembers: false };
let myServerRoles = []; 
let myServerMemberData = {}; // Tracks timeouts

// Mention & Global Caching
let currentServerMembersList = [];
let currentDMOtherUser = null;
let serverRolesCache = {}; 
let globalUsersCache = {}; 
let activeFriendsData = []; 
let globalEmojisCache = {};

// Listeners
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
let pendingAttachmentBase64 = null; 
let pendingAttachmentOriginal = null;

let notificationsActive = true; 
const appStartTime = Date.now(); 
let unreadState = { dms: new Set(), channels: new Set(), servers: new Set() };

// Voice State Tracking
let myPeer = null; let myCurrentPeerId = null; let localAudioStream = null;
let activeCalls = {}; let currentVoiceChannel = null; let isMuted = false; let isDeafened = false;
let currentServerVoiceRosters = {};

// Global Channel Data Sync
let currentChannelsData = {}; 
let currentCategoriesData = {};
let dragSrcEl = null;

const appContainer = document.getElementById('app-container');
const authSection = document.getElementById('auth-section');
const appBaseUrl = window.location.href.split('?')[0];

function sanitizeEmail(email) { return email.replace(/\./g, ','); }
function generateCode() { return Math.random().toString(36).substring(2, 10); }

// SVG Icons
const icons = {
    textChannel: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="8" y2="21"></line><line x1="16" y1="3" x2="14" y2="21"></line></svg>`,
    voiceChannel: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`,
    trash: `<svg class="svg-icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
    gear: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`,
    addFriend: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>`,
    removeFriend: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="18" y1="8" x2="23" y2="13"></line><line x1="23" y1="8" x2="18" y2="13"></line></svg>`,
    closeDM: `<svg class="svg-icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    message: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-2.67 0-8 1.34-8 4v3h16v-3c0-2.66-5.33-4-8-4z"/></svg>`,
    reply: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>`,
    leave: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>`,
    smile: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>`,
    addReaction: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line><line x1="20" y1="4" x2="24" y2="4"></line><line x1="22" y1="2" x2="22" y2="6"></line></svg>`,
    download: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
    ban: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>`,
    kick: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`,
    timeout: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`
};

// Image Compressor helper
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
    if(!channelData) return result;

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

// Image Fullscreen Logic
document.getElementById('image-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'image-modal' || e.target.id === 'close-image-modal') {
        document.getElementById('image-modal').style.display = 'none';
    }
});

function bindImageClick(imgEl) {
    if (!imgEl) return;
    imgEl.addEventListener('click', () => { 
        document.getElementById('enlarged-image').src = imgEl.getAttribute('data-original'); 
        document.getElementById('download-image-btn').href = imgEl.getAttribute('data-original'); 
        document.getElementById('image-modal').style.display = 'flex'; 
    });
}

// ==========================================
// --- USER PROFILES & MODERATION ---
// ==========================================
window.showGlobalUserProfile = async function(email, event) {
    if (event) event.stopPropagation();
    
    const safeEmail = sanitizeEmail(email); 
    const modal = document.getElementById('global-user-profile-modal');
    const content = modal.querySelector('.modal-content');
    
    const nameEl = document.getElementById('gup-username');
    const tagEl = document.getElementById('gup-tag');
    const avatarEl = document.getElementById('gup-avatar');
    const bannerEl = document.getElementById('gup-banner');
    const rolesContainer = document.getElementById('gup-roles-container');
    
    // Moderation Actions Container
    let modContainer = document.getElementById('gup-mod-actions');
    if(!modContainer) {
        modContainer = document.createElement('div');
        modContainer.id = 'gup-mod-actions';
        modContainer.style.display = 'none';
        modContainer.style.marginTop = '15px';
        modContainer.style.paddingTop = '10px';
        modContainer.style.borderTop = '1px solid var(--border-color)';
        document.getElementById('gup-username').parentElement.appendChild(modContainer);
    }
    modContainer.innerHTML = '';
    modContainer.style.display = 'none';

    const addFriendBtn = document.getElementById('gup-add-friend');
    const removeFriendBtn = document.getElementById('gup-remove-friend');
    const sendMsgBtn = document.getElementById('gup-send-message');
    
    nameEl.innerText = "Loading..."; tagEl.innerText = "";
    avatarEl.src = "https://cdn.pixabay.com/photo/2023/02/18/11/00/icon-7797704_640.png";
    bannerEl.style.backgroundColor = "var(--accent-primary)";
    rolesContainer.style.display = 'none';
    rolesContainer.innerHTML = '';
    
    addFriendBtn.style.display = 'none';
    removeFriendBtn.style.display = 'none';
    sendMsgBtn.style.display = 'none';
    
    modal.style.visibility = 'hidden';
    modal.style.display = 'block'; 
    
    if(event) {
        let x = event.clientX;
        let y = event.clientY;
        setTimeout(() => {
            const rect = content.getBoundingClientRect();
            if (x + 340 > window.innerWidth) x = window.innerWidth - 350;
            if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 20;
            if (x < 10) x = 10;
            if (y < 10) y = 10;
            content.style.left = `${x}px`;
            content.style.top = `${y}px`;
            modal.style.visibility = 'visible';
        }, 0);
    } else {
        content.style.left = `calc(50% - 170px)`;
        content.style.top = `20%`;
        modal.style.visibility = 'visible';
    }
    
    const uSnap = await get(child(ref(db), `users/${safeEmail}`));
    if(uSnap.exists()) {
        const uData = uSnap.val();
        nameEl.innerText = uData.username;
        tagEl.innerText = `#${uData.tag}`;
        avatarEl.src = uData.avatar;
        
        // Roles rendering if inside a server
        if(currentServerId) {
            const memSnap = await get(ref(db, `server_members/${currentServerId}/${safeEmail}`));
            if(memSnap.exists()) {
                const memInfo = memSnap.val();
                let userRoles = memInfo.roles ? Object.keys(memInfo.roles) : (memInfo.role && memInfo.role !== 'member' ? [memInfo.role] : []);
                
                rolesContainer.style.display = 'block';
                rolesContainer.innerHTML = '<div style="font-size: 11px; font-weight: bold; color: var(--text-muted); margin-bottom: 5px; text-transform: uppercase;">Roles</div>';
                
                const roleFlex = document.createElement('div');
                roleFlex.style.display = 'flex'; roleFlex.style.flexWrap = 'wrap'; roleFlex.style.gap = '5px';
                
                userRoles.forEach(rId => {
                    const rData = serverRolesCache[rId];
                    if(rData && rId !== 'everyone') {
                        const badge = document.createElement('div');
                        badge.className = 'role-badge';
                        badge.style.borderColor = rData.color;
                        if(myServerPerms.manageRoles || myServerRoles.includes('owner')) {
                            badge.innerHTML = `<span style="color:${rData.color}">●</span> ${rData.name} <span class="remove-role-btn" data-role="${rId}" style="margin-left:4px;cursor:pointer;opacity:0.8;">×</span>`;
                            badge.querySelector('.remove-role-btn').onclick = async (e) => {
                                e.stopPropagation();
                                const newRoles = { ...memInfo.roles };
                                delete newRoles[rId];
                                await update(ref(db, `server_members/${currentServerId}/${safeEmail}`), { roles: newRoles });
                                showGlobalUserProfile(safeEmail); // refresh modal
                            };
                        } else {
                            badge.innerHTML = `<span style="color:${rData.color}">●</span> ${rData.name}`;
                        }
                        roleFlex.appendChild(badge);
                    }
                });
                
                if(myServerPerms.manageRoles || myServerRoles.includes('owner')) {
                    const addRoleBtn = document.createElement('div');
                    addRoleBtn.className = 'role-badge';
                    addRoleBtn.style.cursor = 'pointer';
                    addRoleBtn.innerHTML = `+`;
                    addRoleBtn.onclick = (e) => {
                        e.stopPropagation();
                        openQuickRoleDropdown(safeEmail, userRoles, e.target);
                    };
                    roleFlex.appendChild(addRoleBtn);
                }
                
                if(roleFlex.children.length > 0) rolesContainer.appendChild(roleFlex);
                else rolesContainer.style.display = 'none';

                // Moderation Checks
                if (safeEmail !== currentUserSafeEmail && (myServerRoles.includes('owner') || myServerPerms.kickMembers || myServerPerms.banMembers || myServerPerms.timeoutMembers)) {
                    modContainer.style.display = 'flex';
                    modContainer.style.flexDirection = 'column';
                    modContainer.style.gap = '5px';
                    
                    if(myServerRoles.includes('owner') || myServerPerms.timeoutMembers) {
                        const timeoutBtn = document.createElement('button');
                        timeoutBtn.innerHTML = `${icons.timeout} Timeout Member`;
                        timeoutBtn.className = 'mod-action-btn';
                        timeoutBtn.style.cssText = 'background: transparent; border: 1px solid var(--border-color); color: var(--text-bright); margin: 0; display:flex; gap:8px; align-items:center;';
                        timeoutBtn.onclick = () => {
                            openInputModal("Timeout User", "Duration in minutes (e.g. 10)", "How many minutes?", async (mins) => {
                                const m = parseInt(mins);
                                if(m && m > 0) {
                                    const until = Date.now() + (m * 60 * 1000);
                                    await update(ref(db, `server_members/${currentServerId}/${safeEmail}`), { timeoutUntil: until });
                                    customAlert(`${uData.username} timed out for ${m} minutes.`, "Timeout Applied");
                                }
                            });
                        };
                        modContainer.appendChild(timeoutBtn);
                    }
                    if(myServerRoles.includes('owner') || myServerPerms.kickMembers) {
                        const kickBtn = document.createElement('button');
                        kickBtn.innerHTML = `${icons.kick} Kick Member`;
                        kickBtn.className = 'mod-action-btn';
                        kickBtn.style.cssText = 'background: transparent; border: 1px solid var(--accent-warning); color: var(--accent-warning); margin: 0; display:flex; gap:8px; align-items:center;';
                        kickBtn.onclick = () => {
                            customConfirm(`Are you sure you want to kick ${uData.username}?`, "Kick Member", async (yes) => {
                                if(yes) {
                                    await remove(ref(db, `server_members/${currentServerId}/${safeEmail}`));
                                    await remove(ref(db, `users/${safeEmail}/servers/${currentServerId}`));
                                    modal.style.display = 'none';
                                    customAlert(`${uData.username} was kicked.`, "Kicked");
                                }
                            });
                        };
                        modContainer.appendChild(kickBtn);
                    }
                    if(myServerRoles.includes('owner') || myServerPerms.banMembers) {
                        const banBtn = document.createElement('button');
                        banBtn.innerHTML = `${icons.ban} Ban Member`;
                        banBtn.className = 'mod-action-btn';
                        banBtn.style.cssText = 'background: transparent; border: 1px solid var(--accent-danger); color: var(--accent-danger); margin: 0; display:flex; gap:8px; align-items:center;';
                        banBtn.onclick = () => {
                            customConfirm(`Are you sure you want to BAN ${uData.username}? They won't be able to rejoin.`, "Ban Member", async (yes) => {
                                if(yes) {
                                    await set(ref(db, `servers/${currentServerId}/bans/${safeEmail}`), { timestamp: Date.now(), by: currentUserSafeEmail });
                                    await remove(ref(db, `server_members/${currentServerId}/${safeEmail}`));
                                    await remove(ref(db, `users/${safeEmail}/servers/${currentServerId}`));
                                    modal.style.display = 'none';
                                    customAlert(`${uData.username} was permanently banned.`, "Banned");
                                }
                            });
                        };
                        modContainer.appendChild(banBtn);
                    }
                }
            }
        }
        
        if(safeEmail !== currentUserSafeEmail) {
            const friendSnap = await get(ref(db, `users/${currentUserSafeEmail}/friends/${safeEmail}`));
            
            sendMsgBtn.style.display = 'flex';
            sendMsgBtn.onclick = async () => {
                modal.style.display = 'none';
                const dmId = [currentUserSafeEmail, safeEmail].sort().join('_');
                await update(ref(db, `users/${currentUserSafeEmail}/friends/${safeEmail}`), { dmId: dmId, hidden: false, lastActivity: Date.now() });
                if(!globalUsersCache[safeEmail]) globalUsersCache[safeEmail] = uData;
                switchToHomeView();
                openDM(dmId, safeEmail);
            };

            if(!friendSnap.exists()) {
                addFriendBtn.style.display = 'flex';
                addFriendBtn.onclick = async () => {
                    await set(ref(db, `friend_requests/${safeEmail}/${currentUserSafeEmail}`), { username: myProfile.username, avatar: myProfile.avatar, timestamp: Date.now() });
                    customAlert(`Friend request sent to ${uData.username}!`, "Success");
                    modal.style.display = 'none';
                };
            } else {
                removeFriendBtn.style.display = 'flex';
                removeFriendBtn.onclick = async () => {
                    customConfirm(`Remove ${uData.username} from your friends list?`, "Remove Friend", async (yes) => {
                        if(yes) {
                            await remove(ref(db, `users/${currentUserSafeEmail}/friends/${safeEmail}`));
                            await remove(ref(db, `users/${safeEmail}/friends/${currentUserSafeEmail}`));
                            modal.style.display = 'none';
                        }
                    });
                };
            }
        }
    }
};

window.handleMentionClick = function(username, event) {
    event.stopPropagation();
    let foundEmail = null;
    if (currentServerId) {
        currentServerMembersList.forEach(m => { if(m.username === username) foundEmail = m.email || Object.keys(globalUsersCache).find(k => globalUsersCache[k].username === username); });
    }
    if (!foundEmail) {
        Object.keys(globalUsersCache).forEach(email => { if(globalUsersCache[email].username === username) foundEmail = email; });
    }
    if (foundEmail) showGlobalUserProfile(foundEmail, event);
};

document.getElementById('global-user-profile-modal')?.addEventListener('click', (e) => { 
    if(e.target.id === 'global-user-profile-modal') {
        e.target.style.display = 'none'; 
        const drp = document.getElementById('role-quick-dropdown');
        if(drp) drp.remove();
    }
});

function openQuickRoleDropdown(targetEmail, currentRolesArray, anchorEl) {
    let existing = document.getElementById('role-quick-dropdown');
    if (existing) existing.remove();

    const dropdown = document.createElement('div');
    dropdown.id = 'role-quick-dropdown';
    dropdown.style.position = 'absolute';
    dropdown.style.background = 'var(--bg-tertiary)';
    dropdown.style.border = '1px solid var(--border-color)';
    dropdown.style.borderRadius = '4px';
    dropdown.style.padding = '5px';
    dropdown.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
    dropdown.style.zIndex = '5000';
    dropdown.style.maxHeight = '150px';
    dropdown.style.overflowY = 'auto';

    let hasOpts = false;
    Object.keys(serverRolesCache).forEach(rId => {
        if(rId === 'everyone' || currentRolesArray.includes(rId)) return;
        hasOpts = true;
        const opt = document.createElement('div');
        opt.style.padding = '5px 8px';
        opt.style.cursor = 'pointer';
        opt.style.borderRadius = '3px';
        opt.style.color = 'var(--text-bright)';
        opt.style.fontSize = '12px';
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

    if(!hasOpts) {
        dropdown.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:5px;">No roles available</div>';
    }

    document.body.appendChild(dropdown);
    const rect = anchorEl.getBoundingClientRect();
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 5}px`;

    setTimeout(() => {
        document.addEventListener('click', function closeDrp(e) {
            if(!dropdown.contains(e.target)) {
                dropdown.remove();
                document.removeEventListener('click', closeDrp);
            }
        });
    }, 10);
}


// ==========================================
// --- CONTEXT MENU (Delegated) ---
// ==========================================
let contextTarget = null;
const ctxMenu = document.getElementById('context-menu');

function showContextMenu(e, type, id) {
    e.preventDefault();
    
    let html = '';
    if (type === 'channel') {
        if (!myServerPerms.manageChannels && !myServerPerms.manageServerSettings && !myServerRoles.includes('owner')) return; 
        html += `<div class="context-item" id="ctx-edit">${icons.gear} Edit Channel</div>`;
        html += `<div class="context-item" id="ctx-delete" style="color: var(--accent-danger);">${icons.trash} Delete Channel</div>`;
    } else if (type === 'category') {
        if (!myServerPerms.manageChannels && !myServerPerms.manageServerSettings && !myServerRoles.includes('owner')) return;
        html += `<div class="context-item" id="ctx-cat-add-text">${icons.textChannel} Add Text Channel</div>`;
        html += `<div class="context-item" id="ctx-cat-add-voice">${icons.voiceChannel} Add Voice Channel</div>`;
        html += `<div style="height:1px; background:var(--border-color); margin:5px 0;"></div>`;
        html += `<div class="context-item" id="ctx-edit">${icons.gear} Edit Category</div>`;
        html += `<div class="context-item" id="ctx-delete" style="color: var(--accent-danger);">${icons.trash} Delete Category</div>`;
    } else if (type === 'dm') {
        html = `<div class="context-item" id="ctx-delete" style="color: var(--accent-danger);">${icons.closeDM} Close DM</div>`;
    } else if (type === 'friend') {
        html = `<div class="context-item" id="ctx-delete" style="color: var(--accent-danger);">${icons.removeFriend} Remove Friend</div>`;
    } else if (type === 'emoji') {
        html = `<div class="context-item" id="ctx-save-emoji" style="color: var(--text-bright);">${icons.addFriend} Save Emoji</div>`;
    }
    
    if(html === '') return;
    ctxMenu.innerHTML = html;
    
    contextTarget = { type, id };
    ctxMenu.style.display = 'flex';
    
    const x = e.pageX || e.touches[0].pageX;
    const y = e.pageY || e.touches[0].pageY;
    ctxMenu.style.left = `${x}px`;
    ctxMenu.style.top = `${y}px`;
}

document.addEventListener('contextmenu', (e) => {
    if(e.target.classList.contains('custom-emoji')) {
        const eid = e.target.getAttribute('data-id');
        if(eid) showContextMenu(e, 'emoji', eid);
    }
});

document.addEventListener('click', (e) => { 
    const ctxDel = e.target.closest('#ctx-delete');
    const ctxEdit = e.target.closest('#ctx-edit');
    const ctxSaveEmoji = e.target.closest('#ctx-save-emoji');
    const ctxAddText = e.target.closest('#ctx-cat-add-text');
    const ctxAddVoice = e.target.closest('#ctx-cat-add-voice');

    if(ctxDel && contextTarget) {
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
        ctxMenu.style.display = 'none';
    } else if (ctxEdit && contextTarget) {
        if (contextTarget.type === 'channel') openChannelSettings(contextTarget.id, 'channel');
        else if (contextTarget.type === 'category') openChannelSettings(contextTarget.id, 'category');
        ctxMenu.style.display = 'none';
    } else if (ctxAddText && contextTarget && contextTarget.type === 'category') {
        openInputModal("Add Text Channel", "channel-name", "", (name) => { 
            if (name && currentServerId) push(ref(db, `channels/${currentServerId}`), { name: name.toLowerCase(), type: "text", categoryId: contextTarget.id, order: Date.now() }); 
        });
        ctxMenu.style.display = 'none';
    } else if (ctxAddVoice && contextTarget && contextTarget.type === 'category') {
        openInputModal("Add Voice Channel", "Lounge", "", (name) => { 
            if (name && currentServerId) push(ref(db, `channels/${currentServerId}`), { name: name, type: "voice", categoryId: contextTarget.id, order: Date.now() }); 
        });
        ctxMenu.style.display = 'none';
    } else if (ctxSaveEmoji && contextTarget && contextTarget.type === 'emoji') {
        const targetEmoji = globalEmojisCache[contextTarget.id];
        if(targetEmoji) {
            set(ref(db, `users/${currentUserSafeEmail}/emojis/${contextTarget.id}`), true);
            customAlert("Custom emoji saved to your personal collection!");
        }
        ctxMenu.style.display = 'none';
    }

    if(ctxMenu && !e.target.closest('#context-menu')) {
        ctxMenu.style.display = 'none';
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
        const defaultAvatar = `https://ui-avatars.com/api/?name=${baseName.charAt(0)}&background=4d78cc&color=fff&size=256`;

        await set(ref(db, `users/${safeEmail}`), { email, uid: userCredential.user.uid, username: baseName, tag: randomTag, avatar: defaultAvatar, status: 'online', saved_status: 'online' });
        await set(ref(db, `user_tags/${baseName}_${randomTag}`), safeEmail);
        customAlert("Registered successfully!", "Success");
    } catch (error) { customAlert(error.message, "Error"); }
});

document.getElementById('login-btn')?.addEventListener('click', () => {
    signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value).catch(e => customAlert(e.message, "Login Error"));
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

        // Preload all emojis for rendering
        onValue(ref(db, 'emojis'), snap => {
            globalEmojisCache = snap.val() || {};
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

// Full Screen User Settings
let tempBase64Avatar = null;

function setupUserSettingsTabs() {
    document.querySelectorAll('#user-settings-modal .fs-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabName = e.target.getAttribute('data-tab');
            if(!tabName) return;
            
            document.querySelectorAll('#user-settings-modal .fs-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            
            document.querySelectorAll('#user-settings-modal .ss-pane').forEach(p => p.style.display = 'none');
            document.getElementById(`pane-us-${tabName}`).style.display = 'block';
            
            if(window.innerWidth <= 768) {
                document.querySelector('#user-settings-modal .fs-modal-layout').classList.add('mobile-viewing-content');
            }
        });
    });
}
setupUserSettingsTabs();

document.getElementById('us-mobile-back')?.addEventListener('click', () => {
    document.querySelector('#user-settings-modal .fs-modal-layout').classList.remove('mobile-viewing-content');
});
document.getElementById('close-user-settings-btn')?.addEventListener('click', () => document.getElementById('user-settings-modal').style.display = 'none');
document.getElementById('close-user-settings-btn-desktop')?.addEventListener('click', () => document.getElementById('user-settings-modal').style.display = 'none');

document.getElementById('user-controls')?.addEventListener('click', (e) => {
    if(e.target.id === 'my-status-indicator' || e.target.closest('#status-selector')) return; 
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
    leaveVoiceChannel(); if (currentUserSafeEmail) set(ref(db, `users/${currentUserSafeEmail}/status`), 'offline'); signOut(auth);
});

document.getElementById('avatar-upload')?.addEventListener('change', async (e) => { 
    const file = e.target.files[0]; 
    if (file) { 
        const result = await compressImage(file, 256, 256, 0.85);
        tempBase64Avatar = result.compressed; 
        document.getElementById('profile-preview').src = tempBase64Avatar; 
    } 
});

document.getElementById('save-profile-btn')?.addEventListener('click', async () => {
    const newUsername = document.getElementById('edit-username').value.trim(); const newTag = document.getElementById('edit-tag').value.trim();
    if(!newUsername || !newTag) return customAlert("Fields cannot be empty", "Error");
    await remove(ref(db, `user_tags/${myProfile.username}_${myProfile.tag}`)); 
    await set(ref(db, `user_tags/${newUsername}_${newTag}`), currentUserSafeEmail); 
    await update(ref(db, `users/${currentUserSafeEmail}`), {username: newUsername, tag: newTag, avatar: tempBase64Avatar});
    customAlert("Profile Saved!");
});

// Personal Emojis
function loadPersonalEmojis() {
    const list = document.getElementById('us-emojis-list');
    onValue(ref(db, `users/${currentUserSafeEmail}/emojis`), async (snap) => {
        list.innerHTML = '';
        if(!snap.exists()) { list.innerHTML = '<p style="color:var(--text-muted); font-size:12px;">No personal emojis yet.</p>'; return; }
        
        for(let eId of Object.keys(snap.val())) {
            const eData = globalEmojisCache[eId];
            if(eData) {
                const d = document.createElement('div');
                d.className = 'role-list-item';
                d.style.display = 'flex'; d.style.justifyContent = 'space-between'; d.style.alignItems = 'center';
                d.innerHTML = `<div><img src="${eData.url}" class="custom-emoji" style="margin-right:10px;"> :${eData.name}:</div>
                               <button class="small-btn" style="background:transparent; border:1px solid var(--accent-danger); color:var(--accent-danger);">Remove</button>`;
                d.querySelector('button').onclick = () => { remove(ref(db, `users/${currentUserSafeEmail}/emojis/${eId}`)); };
                list.appendChild(d);
            }
        }
    });
}

document.getElementById('us-upload-emoji-btn')?.addEventListener('click', async () => {
    const file = document.getElementById('us-emoji-file').files[0];
    const name = document.getElementById('us-emoji-name').value.trim().replace(/[^a-zA-Z0-9_]/g, '');
    if(!file || !name) return customAlert("Please select an image and enter a valid name.");
    
    const result = await compressImage(file, 128, 128, 0.9);
    const emojiId = push(ref(db, 'emojis')).key;
    await set(ref(db, `emojis/${emojiId}`), { name: name, url: result.compressed });
    await set(ref(db, `users/${currentUserSafeEmail}/emojis/${emojiId}`), true);
    
    document.getElementById('us-emoji-file').value = "";
    document.getElementById('us-emoji-name').value = "";
});

// Status Dropdown
document.getElementById('my-status-indicator')?.addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('status-selector').style.display = 'block'; });
document.querySelectorAll('.status-option').forEach(opt => { opt.addEventListener('click', (e) => { const s = e.target.getAttribute('data-status'); update(ref(db, `users/${currentUserSafeEmail}`), {status: s, saved_status: s}); document.getElementById('status-selector').style.display = 'none'; }); });
document.addEventListener('click', (e) => { 
    if (!e.target.closest('#user-controls')) { const s = document.getElementById('status-selector'); if(s) s.style.display = 'none'; } 
    if (!e.target.closest('#sidebar-header') && !e.target.closest('#server-settings-modal') && !e.target.closest('#channel-settings-modal')) { const sd = document.getElementById('server-dropdown'); if(sd) sd.style.display = 'none'; } 
});

// ==========================================
// --- NAVIGATION, HOME & FRIENDS VIEW ---
// ==========================================
function switchToHomeView() {
    document.body.classList.remove('mobile-chat-active');
    document.body.classList.remove('mobile-home-active');
    
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
    
    if(unsubscribeMembers) { unsubscribeMembers(); unsubscribeMembers = null; }
    if(unsubscribeChannels) { unsubscribeChannels(); unsubscribeChannels = null; }
    if(unsubscribeCategories) { unsubscribeCategories(); unsubscribeCategories = null; }
    if(unsubscribeVoiceRosters) { unsubscribeVoiceRosters(); unsubscribeVoiceRosters = null; }
    if(unsubscribeMyMemberData) { unsubscribeMyMemberData(); unsubscribeMyMemberData = null; }
    document.getElementById('voice-controls-area').style.display = currentVoiceChannel ? 'flex' : 'none';
    
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
    document.getElementById('home-btn').classList.add('active');

    renderHomeContent();
}

document.getElementById('home-btn')?.addEventListener('click', switchToHomeView);

document.getElementById('mobile-back-btn')?.addEventListener('click', () => { 
    document.body.classList.remove('mobile-chat-active'); 
    document.body.classList.remove('mobile-home-active'); 
});
document.getElementById('mobile-back-btn-home')?.addEventListener('click', () => { 
    document.body.classList.remove('mobile-chat-active'); 
    document.body.classList.remove('mobile-home-active'); 
});

document.getElementById('nav-friends-btn')?.addEventListener('click', () => { 
    currentHomeTab = 'friends'; 
    if(chatType !== 'home') switchToHomeView(); 
    document.body.classList.add('mobile-home-active'); 
    renderHomeContent(); 
});
document.getElementById('nav-requests-btn')?.addEventListener('click', () => { 
    currentHomeTab = 'requests'; 
    if(chatType !== 'home') switchToHomeView(); 
    document.body.classList.add('mobile-home-active'); 
    renderHomeContent(); 
});

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
        if(activeFriendsData.length === 0) { content.innerHTML = '<div style="color: var(--text-muted); text-align: center; margin-top: 50px;">You have no friends. Add some!</div>'; return; }
        
        activeFriendsData.forEach(fData => {
            const cachedUser = globalUsersCache[fData.email] || {};
            const displayAvatar = cachedUser.avatar || "";
            const displayName = cachedUser.username || "Loading...";
            const displayStatus = cachedUser.status || "offline";
            
            const div = document.createElement('div'); div.className = 'friend-card';
            div.innerHTML = `
                <div class="friend-card-left" onclick="showGlobalUserProfile('${fData.email}', event)" style="cursor:pointer;">
                    <div class="avatar-container"><img src="${displayAvatar}" class="avatar-small"><div class="status-indicator status-${displayStatus}"></div></div>
                    <div style="display:flex; flex-direction:column;">
                        <span style="font-weight:bold; color:var(--text-bright); font-size:15px;">${displayName}</span>
                        <span style="font-size:12px; color:var(--text-muted);">${displayStatus}</span>
                    </div>
                </div>
                <div class="friend-card-right">
                    <div class="action-circle message-btn" title="Message">${icons.message}</div>
                    <div class="action-circle red remove-btn" title="Remove Friend">${icons.removeFriend}</div>
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
        
        content.innerHTML = '<div style="color: var(--text-muted); text-align: center; margin-top: 50px;">Loading requests...</div>';
        get(ref(db, `friend_requests/${currentUserSafeEmail}`)).then(snap => {
            content.innerHTML = '';
            if(!snap.exists() || Object.keys(snap.val()).length === 0) { content.innerHTML = '<div style="color: var(--text-muted); text-align: center; margin-top: 50px;">No pending requests.</div>'; return; }
            
            snap.forEach(child => {
                const senderEmail = child.key; const sData = child.val();
                const div = document.createElement('div'); div.className = 'friend-card';
                div.innerHTML = `
                    <div class="friend-card-left" onclick="showGlobalUserProfile('${senderEmail}', event)" style="cursor:pointer;">
                        <img src="${sData.avatar}" class="avatar-small">
                        <span style="font-weight:bold; color:var(--text-bright); font-size:15px;">${sData.username}</span>
                    </div>
                    <div class="friend-card-right">
                        <div class="action-circle green accept-fr" title="Accept"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
                        <div class="action-circle red decline-fr" title="Decline"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></div>
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
            div.innerHTML = `<div class="avatar-container"><img src="${displayAvatar}" class="avatar-small" id="f-avatar-${fEmail}"><div class="status-indicator status-${displayStatus}" id="status-${fEmail}"></div></div><span id="f-name-${fEmail}" class="c-name">${displayName}</span>`;
            
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
    myServerPerms = { viewChannels: true, sendMessages: true, manageMessages: false }; 
    myServerMemberData = {}; // clear timeouts
    
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
    if(activeDmEl) activeDmEl.classList.add('active');

    enableChat(); loadMessages(`dms/${currentChatId}`, `@${uData.username}`);
    loadDMMemberList(friendEmail);
}

function loadDMMemberList(friendEmail) {
    const listContent = document.getElementById('member-list-content');
    listContent.innerHTML = '';
    
    const catDiv = document.createElement('div');
    catDiv.className = 'member-category';
    catDiv.innerText = `IN THIS CONVERSATION — 2`;
    listContent.appendChild(catDiv);
    
    const users = [myProfile, globalUsersCache[friendEmail]];
    users.forEach(u => {
        if (!u) return;
        const mDiv = document.createElement('div'); 
        mDiv.className = 'member-item';
        mDiv.innerHTML = `<div class="avatar-container"><img src="${u.avatar}" class="avatar-small"><div class="status-indicator status-${u.status || 'offline'}"></div></div><div class="member-username" style="color: var(--text-main); pointer-events:none;">${u.username}</div>`;
        const safeE = (u.username === myProfile.username && u.tag === myProfile.tag) ? currentUserSafeEmail : friendEmail;
        mDiv.addEventListener('click', (e) => showGlobalUserProfile(safeE, e));
        listContent.appendChild(mDiv);
    });
}

// ==========================================
// --- SERVERS, CHANNELS, SETTINGS & MEMBERS ---
// ==========================================

// Global Event Listeners for Member List Toggle
document.getElementById('toggle-members-btn')?.addEventListener('click', () => {
    const sidebar = document.getElementById('member-sidebar');
    sidebar.style.display = sidebar.style.display === 'none' || sidebar.style.display === '' ? 'flex' : 'none';
});

document.getElementById('close-members-mobile-btn')?.addEventListener('click', () => {
    document.getElementById('member-sidebar').style.display = 'none';
});

document.getElementById('create-server-btn')?.addEventListener('click', () => {
    openInputModal("Create Server", "Server Name", "Give your server a name:", (serverName) => {
        if (serverName) {
            const serverId = generateCode();
            const everyonePerms = { viewChannels: true, sendMessages: true, manageChannels: false, manageServerSettings: false, manageServerProfile: false, manageServerOverview: false, manageRoles: false, manageMessages: false, kickMembers: false, banMembers: false, timeoutMembers: false };
            
            set(ref(db, `servers/${serverId}`), { name: serverName, owner: auth.currentUser.email });
            set(ref(db, `servers/${serverId}/roles/everyone`), { name: '@everyone', color: '#abb2bf', order: -1, mentionable: true, perms: everyonePerms });
            
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
    const banSnap = await get(ref(db, `servers/${codeToJoin}/bans/${currentUserSafeEmail}`));
    if (banSnap.exists()) {
        return customAlert("You are banned from this server.", "Access Denied");
    }

    const snapshot = await get(child(ref(db), `servers/${codeToJoin}`));
    if (snapshot.exists()) {
        const sData = snapshot.val();
        await set(ref(db, `server_members/${codeToJoin}/${currentUserSafeEmail}`), { role: 'member' });
        await set(ref(db, `users/${currentUserSafeEmail}/servers/${codeToJoin}`), { order: Date.now() });
        
        if(sData.engagement && sData.engagement.joinChannel) {
            push(ref(db, `messages/${sData.engagement.joinChannel}`), {
                sender: 'system', username: 'System', avatar: 'https://cdn.pixabay.com/photo/2023/02/18/11/00/icon-7797704_640.png',
                text: `Welcome to the server, **@${myProfile.username}**!`,
                timestamp: Date.now(), roleId: 'system'
            });
        }
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
                    document.body.classList.remove('mobile-chat-active'); 
                    document.body.classList.remove('mobile-home-active');
                    currentServerId = serverId;
                    document.getElementById('server-name-display').innerText = sData.name;
                    document.getElementById('server-dropdown-arrow').style.display = 'inline';
                    
                    const header = document.getElementById('sidebar-header');
                    if(sData.banner) {
                        header.classList.add('server-header-banner');
                        header.style.backgroundImage = `linear-gradient(to bottom, rgba(24, 26, 31, 0.4), var(--bg-secondary)), url(${sData.banner})`;
                    } else {
                        header.classList.remove('server-header-banner');
                        header.style.backgroundImage = 'none';
                    }
                    
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

                    // Set up Live Timeout Tracking
                    if(unsubscribeMyMemberData) unsubscribeMyMemberData();
                    unsubscribeMyMemberData = onValue(ref(db, `server_members/${serverId}/${currentUserSafeEmail}`), (memLiveSnap) => {
                        myServerMemberData = memLiveSnap.val() || {};
                        enableChat();
                    });

                    // Resolve Advanced Permissions
                    const memberInfo = myServerMemberData;
                    let userRoles = memberInfo.roles ? Object.keys(memberInfo.roles) : (memberInfo.role && memberInfo.role !== 'member' ? [memberInfo.role] : []);
                    myServerRoles = ['everyone', ...userRoles];
                    
                    const rolesSnap = await get(ref(db, `servers/${serverId}/roles`));
                    serverRolesCache = rolesSnap.val() || {};
                    
                    let resolvedPerms = { ...(serverRolesCache['everyone']?.perms || { viewChannels: true, sendMessages: true }) };
                    
                    myServerRoles.forEach(roleId => {
                        if(roleId !== 'everyone' && roleId !== 'owner' && serverRolesCache[roleId]) {
                            const rPerms = serverRolesCache[roleId].perms;
                            if(rPerms) for(let p in rPerms) { if(rPerms[p]) resolvedPerms[p] = true; }
                        }
                    });
                    
                    if (sData.owner === auth.currentUser.email || myServerRoles.includes('owner') || resolvedPerms.manageServerSettings) { 
                        if(!myServerRoles.includes('owner')) myServerRoles.push('owner');
                        resolvedPerms = { viewChannels: true, sendMessages: true, manageChannels: true, manageServerSettings: true, manageServerProfile: true, manageServerOverview: true, manageRoles: true, manageMessages: true, kickMembers: true, banMembers: true, timeoutMembers: true }; 
                    } 
                    
                    myServerPerms = resolvedPerms;

                    // Configure Dropdown Menu dynamically
                    const anySettings = myServerPerms.manageServerSettings || myServerPerms.manageServerProfile || myServerPerms.manageServerOverview || myServerPerms.manageRoles;
                    document.getElementById('menu-server-settings').style.display = anySettings ? 'flex' : 'none';
                    document.getElementById('menu-add-category').style.display = myServerPerms.manageChannels ? 'flex' : 'none';
                    document.getElementById('menu-add-text').style.display = myServerPerms.manageChannels ? 'flex' : 'none';
                    document.getElementById('menu-add-voice').style.display = myServerPerms.manageChannels ? 'flex' : 'none';
                    document.getElementById('menu-leave-server').style.display = (sData.owner === auth.currentUser.email) ? 'none' : 'flex';

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

document.getElementById('server-header-clickable')?.addEventListener('click', (e) => { e.stopPropagation(); if (currentServerId) { const d = document.getElementById('server-dropdown'); d.style.display = d.style.display === 'none' ? 'flex' : 'none'; } });
document.getElementById('menu-add-category')?.addEventListener('click', () => { openInputModal("Add Category", "Category Name", "", (name) => { if (name && currentServerId) { push(ref(db, `categories/${currentServerId}`), { name: name.toUpperCase(), order: Date.now() }); } }); document.getElementById('server-dropdown').style.display='none'; });
document.getElementById('menu-add-text')?.addEventListener('click', () => { openInputModal("Add Text Channel", "channel-name", "", (name) => { if (name && currentServerId) { push(ref(db, `channels/${currentServerId}`), { name: name.toLowerCase(), type: "text", order: Date.now() }); } }); document.getElementById('server-dropdown').style.display='none'; });
document.getElementById('menu-add-voice')?.addEventListener('click', () => { openInputModal("Add Voice Channel", "Lounge", "", (name) => { if (name && currentServerId) { push(ref(db, `channels/${currentServerId}`), { name: name, type: "voice", order: Date.now() }); } }); document.getElementById('server-dropdown').style.display='none'; });
document.getElementById('menu-invite')?.addEventListener('click', () => { if (currentServerId) { const link = `${appBaseUrl}?invite=${currentServerId}`; navigator.clipboard.writeText(link).then(() => { customAlert(`Link copied!\n${link}`, "Success"); }).catch(() => { openInputModal("Copy Link", "", "", ()=>{}, link); }); } document.getElementById('server-dropdown').style.display='none'; });

document.getElementById('menu-leave-server')?.addEventListener('click', () => {
    if(currentServerId) {
        customConfirm("Are you sure you want to leave this server?", "Leave Server", async (yes) => {
            if(yes) {
                const sSnap = await get(ref(db, `servers/${currentServerId}`));
                if(sSnap.exists() && sSnap.val().engagement?.leaveChannel) {
                    push(ref(db, `messages/${sSnap.val().engagement.leaveChannel}`), {
                        sender: 'system', username: 'System', avatar: 'https://cdn.pixabay.com/photo/2023/02/18/11/00/icon-7797704_640.png',
                        text: `**@${myProfile.username}** just left the server.`,
                        timestamp: Date.now(), roleId: 'system'
                    });
                }
                await remove(ref(db, `server_members/${currentServerId}/${currentUserSafeEmail}`));
                await remove(ref(db, `users/${currentUserSafeEmail}/servers/${currentServerId}`));
                switchToHomeView();
            }
        });
    }
});

// ==========================================
// --- FULL SCREEN SETTINGS MENUS ---
// ==========================================
let tempServerIcon = null;
let tempServerBanner = null;

function setupServerSettingsTabs() {
    document.querySelectorAll('#server-settings-modal .fs-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabName = e.target.getAttribute('data-tab');
            if(!tabName) return;
            
            document.querySelectorAll('#server-settings-modal .fs-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            
            document.querySelectorAll('#server-settings-modal .ss-pane').forEach(p => p.style.display = 'none');
            document.getElementById(`pane-ss-${tabName}`).style.display = 'block';
            
            if(window.innerWidth <= 768) {
                document.querySelector('#server-settings-modal .fs-modal-layout').classList.add('mobile-viewing-content');
            }
        });
    });
}
setupServerSettingsTabs();

document.getElementById('ss-mobile-back')?.addEventListener('click', () => {
    document.querySelector('#server-settings-modal .fs-modal-layout').classList.remove('mobile-viewing-content');
});

document.getElementById('menu-server-settings')?.addEventListener('click', async () => {
    document.getElementById('server-dropdown').style.display='none';
    const sSnap = await get(ref(db, `servers/${currentServerId}`)); const sData = sSnap.val();
    
    // Apply granular permissions
    document.getElementById('tab-ss-profile').style.display = (myServerPerms.manageServerSettings || myServerPerms.manageServerProfile) ? 'block' : 'none';
    document.getElementById('tab-ss-engagement').style.display = (myServerPerms.manageServerSettings || myServerPerms.manageServerOverview) ? 'block' : 'none';
    document.getElementById('tab-ss-roles').style.display = (myServerPerms.manageServerSettings || myServerPerms.manageRoles) ? 'block' : 'none';
    document.getElementById('tab-ss-emojis').style.display = (myServerPerms.manageServerSettings || myServerPerms.manageServerOverview) ? 'block' : 'none';
    document.getElementById('tab-ss-delete').style.display = (myServerPerms.manageServerSettings || sData.owner === auth.currentUser.email) ? 'block' : 'none';
    
    document.getElementById('ss-header-name').innerText = sData.name;
    document.getElementById('ss-server-name').value = sData.name;
    
    const preview = document.getElementById('ss-icon-preview');
    if(sData.icon) { preview.style.backgroundImage = `url(${sData.icon})`; preview.innerText = ""; tempServerIcon = sData.icon; } else { preview.style.backgroundImage = 'none'; preview.innerText = sData.name.charAt(0); }
    
    const bannerPreview = document.getElementById('ss-banner-preview');
    if(sData.banner) { bannerPreview.style.backgroundImage = `url(${sData.banner})`; tempServerBanner = sData.banner; } else { bannerPreview.style.backgroundImage = 'none'; }
    
    // Load Engagement Data
    const joinSel = document.getElementById('ss-join-channel');
    const leaveSel = document.getElementById('ss-leave-channel');
    joinSel.innerHTML = '<option value="">No Messages</option>';
    leaveSel.innerHTML = '<option value="">No Messages</option>';
    
    Object.keys(currentChannelsData).forEach(cId => {
        if(currentChannelsData[cId].type === 'text') {
            joinSel.innerHTML += `<option value="${cId}"># ${currentChannelsData[cId].name}</option>`;
            leaveSel.innerHTML += `<option value="${cId}"># ${currentChannelsData[cId].name}</option>`;
        }
    });
    if(sData.engagement) {
        if(sData.engagement.joinChannel) joinSel.value = sData.engagement.joinChannel;
        if(sData.engagement.leaveChannel) leaveSel.value = sData.engagement.leaveChannel;
    }

    document.getElementById('server-settings-modal').style.display = 'flex'; 
    document.querySelector('#server-settings-modal .fs-modal-layout').classList.remove('mobile-viewing-content');
    
    const firstVisibleTab = document.querySelector('#server-settings-modal .fs-tab[style="display: block;"]');
    if(firstVisibleTab) firstVisibleTab.click();
    
    loadRolesAdvanced();
    loadServerEmojis();
});

document.getElementById('close-server-settings-btn')?.addEventListener('click', () => document.getElementById('server-settings-modal').style.display = 'none');

document.getElementById('ss-icon-upload')?.addEventListener('change', async (e) => { 
    const file = e.target.files[0]; 
    if (file) { 
        const result = await compressImage(file, 256, 256, 0.85);
        tempServerIcon = result.compressed;
        document.getElementById('ss-icon-preview').style.backgroundImage = `url(${tempServerIcon})`; document.getElementById('ss-icon-preview').innerText = ""; 
    } 
});
document.getElementById('ss-banner-upload')?.addEventListener('change', async (e) => { 
    const file = e.target.files[0]; 
    if (file) { 
        const result = await compressImage(file, 960, 540, 0.85);
        tempServerBanner = result.compressed; 
        document.getElementById('ss-banner-preview').style.backgroundImage = `url(${tempServerBanner})`; 
    } 
});

document.getElementById('ss-save-profile-btn')?.addEventListener('click', () => { 
    const newName = document.getElementById('ss-server-name').value.trim(); 
    if(newName && currentServerId) { update(ref(db, `servers/${currentServerId}`), {name: newName, icon: tempServerIcon, banner: tempServerBanner}); customAlert("Server Profile updated!"); } 
});

document.getElementById('ss-save-engagement-btn')?.addEventListener('click', () => {
    if(currentServerId) {
        update(ref(db, `servers/${currentServerId}/engagement`), {
            joinChannel: document.getElementById('ss-join-channel').value || null,
            leaveChannel: document.getElementById('ss-leave-channel').value || null
        });
        customAlert("Engagement settings saved!");
    }
});

document.getElementById('delete-server-btn')?.addEventListener('click', async () => {
    customConfirm("Are you ABSOLUTELY sure you want to delete this server? This will wipe all channels, roles, and messages.", "Delete Server", async (yes) => {
        if(yes && currentServerId) {
            await remove(ref(db, `servers/${currentServerId}`)); await remove(ref(db, `server_members/${currentServerId}`)); await remove(ref(db, `channels/${currentServerId}`)); await remove(ref(db, `categories/${currentServerId}`)); await remove(ref(db, `users/${currentUserSafeEmail}/servers/${currentServerId}`));
            document.getElementById('server-settings-modal').style.display = 'none'; document.getElementById('home-btn').click(); customAlert("Server deleted successfully.");
        }
    });
});

// Roles Advanced
let dragRoleEl = null;
let currentEditingRoleId = null;
let rolesArrayCache = [];

function loadRolesAdvanced() {
    // FIX: Target the inner list container, NOT the whole left panel!
    const list = document.getElementById('ss-roles-list'); 
    onValue(ref(db, `servers/${currentServerId}/roles`), (snap) => {
        list.innerHTML = ''; rolesArrayCache = [];
        let rolesData = snap.val() || {};
        
        if(!rolesData['everyone']) {
            rolesData['everyone'] = { name: '@everyone', color: '#abb2bf', order: -999, mentionable: true, perms: { viewChannels: true, sendMessages: true } };
        }
        
        Object.keys(rolesData).forEach(k => { let data = rolesData[k]; data.id = k; rolesArrayCache.push(data); });
        rolesArrayCache.sort((a,b) => (b.order || 0) - (a.order || 0));

        rolesArrayCache.forEach((rData, index, arr) => {
            const roleId = rData.id; 
            const div = document.createElement('div'); div.className = 'role-list-item'; div.id = `role-set-${roleId}`; 
            
            if(roleId !== 'everyone') {
                div.draggable = true;
                div.addEventListener('dragstart', (e) => { dragRoleEl = div; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/html', div.innerHTML); });
                div.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; div.classList.add('drag-over'); return false; });
                div.addEventListener('dragleave', (e) => { div.classList.remove('drag-over'); });
                div.addEventListener('drop', (e) => { 
                    e.stopPropagation(); div.classList.remove('drag-over'); 
                    if (dragRoleEl !== div) { 
                        const srcId = dragRoleEl.id.replace('role-set-', ''); 
                        const targetOrder = rData.order || 0; 
                        const prevRole = arr[index - 1]; const nextRole = arr[index + 1]; 
                        const srcData = rolesArrayCache.find(r => r.id === srcId); 
                        if ((srcData.order||0) > targetOrder) { update(ref(db, `servers/${currentServerId}/roles/${srcId}`), { order: nextRole && nextRole.id !== 'everyone' ? (targetOrder + nextRole.order)/2 : targetOrder - 10 }); } 
                        else { update(ref(db, `servers/${currentServerId}/roles/${srcId}`), { order: prevRole ? (targetOrder + prevRole.order)/2 : targetOrder + 10 }); } 
                    } return false; 
                });
            }
            
            div.innerHTML = `<span style="color: ${rData.color};">●</span> ${rData.name}`;
            div.addEventListener('click', () => editRole(roleId));
            list.appendChild(div);
        });
        
        if(!currentEditingRoleId && rolesArrayCache.length > 0) editRole('everyone');
        else if (currentEditingRoleId) editRole(currentEditingRoleId, true);
    });
}

function editRole(roleId, noSwitch = false) {
    currentEditingRoleId = roleId;
    document.querySelectorAll('.role-list-item').forEach(el => el.classList.remove('active'));
    const activeEl = document.getElementById(`role-set-${roleId}`);
    if(activeEl) activeEl.classList.add('active');
    
    document.getElementById('ss-role-edit-area').style.display = 'block';
    
    const rData = rolesArrayCache.find(r => r.id === roleId);
    if(!rData) return;
    
    document.getElementById('er-name').value = rData.name;
    document.getElementById('er-name').disabled = roleId === 'everyone';
    document.getElementById('er-color').value = rData.color || '#abb2bf';
    document.getElementById('er-mentionable').checked = !!rData.mentionable;
    
    const p = rData.perms || {};
    document.getElementById('p-viewChannels').checked = !!p.viewChannels;
    document.getElementById('p-sendMessages').checked = !!p.sendMessages;
    document.getElementById('p-manageChannels').checked = !!p.manageChannels;
    document.getElementById('p-manageServerSettings').checked = !!p.manageServerSettings;
    document.getElementById('p-manageServerProfile').checked = !!p.manageServerProfile;
    document.getElementById('p-manageServerOverview').checked = !!p.manageServerOverview;
    document.getElementById('p-manageRoles').checked = !!p.manageRoles;
    document.getElementById('p-manageMessages').checked = !!p.manageMessages;
    
    const kickP = document.getElementById('p-kickMembers'); if(kickP) kickP.checked = !!p.kickMembers;
    const banP = document.getElementById('p-banMembers'); if(banP) banP.checked = !!p.banMembers;
    const timeoutP = document.getElementById('p-timeoutMembers'); if(timeoutP) timeoutP.checked = !!p.timeoutMembers;

    document.getElementById('delete-role-btn').style.display = roleId === 'everyone' ? 'none' : 'block';
    
    if(!noSwitch && window.innerWidth <= 768) {
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
    if(currentServerId) { push(ref(db, `servers/${currentServerId}/roles`), { name: 'New Role', color: '#abb2bf', order: Date.now(), mentionable: true, perms: {viewChannels:true, sendMessages:true} }); } 
});

document.getElementById('save-role-settings-btn')?.addEventListener('click', () => {
    if(currentServerId && currentEditingRoleId) {
        const kickP = document.getElementById('p-kickMembers');
        const banP = document.getElementById('p-banMembers');
        const timeoutP = document.getElementById('p-timeoutMembers');

        const payload = {
            color: document.getElementById('er-color').value,
            mentionable: document.getElementById('er-mentionable').checked,
            perms: {
                viewChannels: document.getElementById('p-viewChannels').checked,
                sendMessages: document.getElementById('p-sendMessages').checked,
                manageChannels: document.getElementById('p-manageChannels').checked,
                manageServerSettings: document.getElementById('p-manageServerSettings').checked,
                manageServerProfile: document.getElementById('p-manageServerProfile').checked,
                manageServerOverview: document.getElementById('p-manageServerOverview').checked,
                manageRoles: document.getElementById('p-manageRoles').checked,
                manageMessages: document.getElementById('p-manageMessages').checked,
                kickMembers: kickP ? kickP.checked : false,
                banMembers: banP ? banP.checked : false,
                timeoutMembers: timeoutP ? timeoutP.checked : false
            }
        };
        if(currentEditingRoleId !== 'everyone') payload.name = document.getElementById('er-name').value.trim();
        
        update(ref(db, `servers/${currentServerId}/roles/${currentEditingRoleId}`), payload);
        customAlert("Role updated successfully.");
    }
});

document.getElementById('delete-role-btn')?.addEventListener('click', () => {
    if(currentServerId && currentEditingRoleId && currentEditingRoleId !== 'everyone') {
        customConfirm("Delete this role permanently?", "Delete Role", async (yes) => {
            if(yes) {
                await remove(ref(db, `servers/${currentServerId}/roles/${currentEditingRoleId}`));
                currentEditingRoleId = null;
                document.getElementById('ss-role-edit-area').style.display = 'none';
                if(window.innerWidth <= 768) document.getElementById('ss-roles-pane-mobile-back').click();
            }
        });
    }
});

// Server Emojis
function loadServerEmojis() {
    const list = document.getElementById('ss-emojis-list');
    onValue(ref(db, `servers/${currentServerId}/emojis`), async (snap) => {
        list.innerHTML = '';
        if(!snap.exists()) { list.innerHTML = '<p style="color:var(--text-muted); font-size:12px;">No server emojis yet.</p>'; return; }
        
        for(let eId of Object.keys(snap.val())) {
            const eData = globalEmojisCache[eId];
            if(eData) {
                const d = document.createElement('div');
                d.className = 'role-list-item';
                d.style.display = 'flex'; d.style.justifyContent = 'space-between'; d.style.alignItems = 'center';
                d.innerHTML = `<div><img src="${eData.url}" class="custom-emoji" style="margin-right:10px;"> :${eData.name}:</div>
                               <button class="small-btn" style="background:transparent; border:1px solid var(--accent-danger); color:var(--accent-danger);">Remove</button>`;
                d.querySelector('button').onclick = () => { remove(ref(db, `servers/${currentServerId}/emojis/${eId}`)); };
                list.appendChild(d);
            }
        }
    });
}

document.getElementById('ss-upload-emoji-btn')?.addEventListener('click', async () => {
    const file = document.getElementById('ss-emoji-file').files[0];
    const name = document.getElementById('ss-emoji-name').value.trim().replace(/[^a-zA-Z0-9_]/g, '');
    if(!file || !name) return customAlert("Please select an image and enter a valid name (no spaces).");
    
    const result = await compressImage(file, 128, 128, 0.9);
    const emojiId = push(ref(db, 'emojis')).key;
    await set(ref(db, `emojis/${emojiId}`), { name: name, url: result.compressed });
    await set(ref(db, `servers/${currentServerId}/emojis/${emojiId}`), true);
    
    document.getElementById('ss-emoji-file').value = "";
    document.getElementById('ss-emoji-name').value = "";
});

// Channel & Category Settings Full Screen Logic
let currentEditingChannelId = null;
let currentEditingChannelType = null;

function openChannelSettings(channelId, type = 'channel') {
    currentEditingChannelId = channelId;
    currentEditingChannelType = type;
    
    let targetData = type === 'channel' ? currentChannelsData[channelId] : currentCategoriesData[channelId];
    if(!targetData) return;
    
    document.getElementById('cs-header-name').innerText = type === 'channel' ? `# ${targetData.name}` : `Category: ${targetData.name}`;
    document.getElementById('cs-channel-name').value = targetData.name;
    
    if (type === 'channel' && targetData.type === 'voice') {
        document.getElementById('cs-send-msg-label').innerText = "Connect (Voice)";
    } else {
        document.getElementById('cs-send-msg-label').innerText = "Send Messages";
    }

    document.querySelectorAll('#channel-settings-modal .fs-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-cs-overview').classList.add('active');
    document.querySelectorAll('#channel-settings-modal .ss-pane').forEach(p => p.style.display = 'none');
    document.getElementById('pane-cs-overview').style.display = 'block';
    
    // Build Permissions List
    const permList = document.getElementById('cs-roles-list-left');
    permList.innerHTML = '';
    const sortedRoles = Object.keys(serverRolesCache).map(k => ({id: k, ...serverRolesCache[k]})).sort((a,b) => (b.order||0) - (a.order||0));
    
    sortedRoles.forEach((r, idx) => {
        const div = document.createElement('div'); div.className = 'role-list-item'; div.id = `cs-role-${r.id}`;
        div.innerHTML = `<span style="color: ${r.color};">●</span> ${r.name}`;
        div.onclick = () => editChannelPerms(r.id, channelId, type);
        permList.appendChild(div);
    });
    
    document.getElementById('channel-settings-modal').style.display = 'flex';
    document.querySelector('#channel-settings-modal .fs-modal-layout').classList.remove('mobile-viewing-content');
    
    editChannelPerms('everyone', channelId, type);
}

function editChannelPerms(roleId, channelId, type) {
    document.querySelectorAll('#cs-roles-list-left .role-list-item').forEach(el => el.classList.remove('active'));
    const activeEl = document.getElementById(`cs-role-${roleId}`);
    if(activeEl) activeEl.classList.add('active');
    
    document.getElementById('cs-role-edit-area').style.display = 'block';
    
    const rData = serverRolesCache[roleId];
    document.getElementById('cs-editing-role-name').innerText = `Role: ${rData.name}`;
    
    let targetData = type === 'channel' ? currentChannelsData[channelId] : currentCategoriesData[channelId];
    const overwrites = targetData?.overwrites?.[roleId] || {};
    document.getElementById('cp-viewChannels').value = overwrites.viewChannels || "inherit";
    document.getElementById('cp-sendMessages').value = overwrites.sendMessages || "inherit";
    
    document.getElementById('cs-save-perms-btn').onclick = () => {
        const dbPath = type === 'channel' ? `channels/${currentServerId}/${channelId}/overwrites/${roleId}` : `categories/${currentServerId}/${channelId}/overwrites/${roleId}`;
        update(ref(db, dbPath), {
            viewChannels: document.getElementById('cp-viewChannels').value,
            sendMessages: document.getElementById('cp-sendMessages').value
        });
        customAlert("Permissions saved.");
    };
    
    if(window.innerWidth <= 768) {
        document.getElementById('cs-roles-list-left').style.display = 'none';
        document.getElementById('cs-roles-pane-mobile-back').style.display = 'block';
    }
}

document.querySelectorAll('#channel-settings-modal .fs-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        const tabName = e.target.getAttribute('data-tab');
        if(!tabName) return;
        
        document.querySelectorAll('#channel-settings-modal .fs-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        
        document.querySelectorAll('#channel-settings-modal .ss-pane').forEach(p => p.style.display = 'none');
        document.getElementById(`pane-cs-${tabName}`).style.display = 'block';
        
        if(window.innerWidth <= 768) {
            document.querySelector('#channel-settings-modal .fs-modal-layout').classList.add('mobile-viewing-content');
        }
    });
});

document.getElementById('cs-roles-pane-mobile-back')?.addEventListener('click', () => {
    document.getElementById('cs-roles-list-left').style.display = 'flex';
    document.getElementById('cs-roles-pane-mobile-back').style.display = 'none';
    document.getElementById('cs-role-edit-area').style.display = 'none';
});

document.getElementById('cs-mobile-back')?.addEventListener('click', () => { document.querySelector('#channel-settings-modal .fs-modal-layout').classList.remove('mobile-viewing-content'); });
document.getElementById('close-channel-settings-btn')?.addEventListener('click', () => { document.getElementById('channel-settings-modal').style.display = 'none'; });

document.getElementById('cs-save-overview-btn')?.addEventListener('click', () => {
    const newName = document.getElementById('cs-channel-name').value.trim();
    if(newName && currentServerId && currentEditingChannelId) {
        const dbPath = currentEditingChannelType === 'channel' ? `channels/${currentServerId}/${currentEditingChannelId}` : `categories/${currentServerId}/${currentEditingChannelId}`;
        update(ref(db, dbPath), { name: currentEditingChannelType === 'channel' ? newName.toLowerCase() : newName.toUpperCase() });
        customAlert("Settings updated!");
        document.getElementById('cs-header-name').innerText = currentEditingChannelType === 'channel' ? `# ${newName.toLowerCase()}` : `Category: ${newName.toUpperCase()}`;
    }
});
document.getElementById('tab-cs-delete')?.addEventListener('click', () => {
    if(currentServerId && currentEditingChannelId) {
        customConfirm("Delete this forever?", "Confirm Delete", async (yes) => {
            if(yes) {
                if (currentEditingChannelType === 'channel') {
                    await remove(ref(db, `channels/${currentServerId}/${currentEditingChannelId}`));
                    await remove(ref(db, `messages/${currentEditingChannelId}`));
                } else {
                    await remove(ref(db, `categories/${currentServerId}/${currentEditingChannelId}`));
                }
                document.getElementById('channel-settings-modal').style.display = 'none';
            }
        });
    }
});

// Members System
function loadMemberList(serverId) {
    if(unsubscribeMembers) unsubscribeMembers();
    const listContent = document.getElementById('member-list-content');
    
    unsubscribeMembers = onValue(ref(db, `server_members/${serverId}`), async (membersSnap) => {
        let groups = { owner: { name: "Server Owner", order: -9999, members: [] }, online: { name: "Online", order: 9998, members: [] }, offline: { name: "Offline", order: 9999, members: [] } };
        Object.keys(serverRolesCache).forEach(rId => { groups[rId] = { name: serverRolesCache[rId].name, order: serverRolesCache[rId].order || 0, color: serverRolesCache[rId].color, members: [] }; });
        
        const memberPromises = []; currentServerMembersList = [];
        let onlineCount = 0; let totalCount = 0;
        
        membersSnap.forEach(mSnap => {
            const memberEmail = mSnap.key; const memberInfo = mSnap.val();
            totalCount++;
            const p = get(child(ref(db), `users/${memberEmail}`)).then(uSnap => {
                if (uSnap.exists()) {
                    const uData = uSnap.val(); const status = uData.status || 'offline'; 
                    uData.email = memberEmail;
                    currentServerMembersList.push(uData); globalUsersCache[memberEmail] = uData;
                    
                    if(status !== 'offline' && status !== 'invisible') onlineCount++;
                    
                    let highestRole = null; let highestOrder = 9999;
                    let userRoles = memberInfo.roles ? Object.keys(memberInfo.roles) : (memberInfo.role && memberInfo.role !== 'member' ? [memberInfo.role] : []);
                    
                    // Find the highest hoisted (mentionable) role
                    userRoles.forEach(rId => {
                        if(serverRolesCache[rId] && serverRolesCache[rId].mentionable && serverRolesCache[rId].order < highestOrder) {
                            highestOrder = serverRolesCache[rId].order;
                            highestRole = rId;
                        }
                    });
                    
                    let targetGroup = 'offline';
                    // Force strictly offline ordering for users who are offline, like Discord
                    if (status !== 'offline' && status !== 'invisible') {
                        if (memberInfo.role === 'owner') targetGroup = 'owner';
                        else if (highestRole && highestRole !== 'everyone') targetGroup = highestRole;
                        else targetGroup = 'online';
                    }
                    
                    // Assign correct color purely based on role (even if offline)
                    let nameColor = "var(--text-main)";
                    let colorOrder = 9999;
                    userRoles.forEach(rId => {
                        if(serverRolesCache[rId] && serverRolesCache[rId].color !== '#abb2bf' && serverRolesCache[rId].order < colorOrder) {
                            colorOrder = serverRolesCache[rId].order;
                            nameColor = serverRolesCache[rId].color;
                        }
                    });
                    
                    groups[targetGroup].members.push({ email: memberEmail, data: uData, status: status, nameColor: nameColor });
                }
            });
            memberPromises.push(p);
        });
        await Promise.all(memberPromises);

        document.getElementById('server-stats-display').innerText = `${onlineCount} Online • ${totalCount} Members`;
        document.getElementById('server-stats-display').style.display = 'block';

        listContent.innerHTML = '';
        const sortedGroupKeys = Object.keys(groups).sort((a,b) => groups[a].order - groups[b].order);
        sortedGroupKeys.forEach(gKey => {
            const group = groups[gKey]; if (group.members.length === 0) return;
            // Sort members within group alphabetically
            group.members.sort((a,b) => a.data.username.localeCompare(b.data.username));
            
            const catDiv = document.createElement('div'); catDiv.className = 'member-category'; catDiv.innerText = `${group.name} — ${group.members.length}`;
            listContent.appendChild(catDiv);

            group.members.forEach(m => {
                const mDiv = document.createElement('div'); mDiv.className = 'member-item';
                mDiv.innerHTML = `<div class="avatar-container"><img src="${m.data.avatar}" class="avatar-small"><div class="status-indicator status-${m.status}"></div></div><div class="member-username" style="color: ${m.nameColor}; pointer-events:none;">${m.data.username}</div>`;
                mDiv.addEventListener('click', (e) => {
                    showGlobalUserProfile(m.email, e);
                });
                listContent.appendChild(mDiv);
            });
        });
    });
}

// Global Sync for Channels AND Categories
function initChannelSync(serverId) {
    if(unsubscribeChannels) unsubscribeChannels(); 
    if(unsubscribeCategories) unsubscribeCategories();
    if(unsubscribeVoiceRosters) unsubscribeVoiceRosters();
    
    unsubscribeVoiceRosters = onValue(ref(db, `voice_rosters/${serverId}`), (snap) => {
        currentServerVoiceRosters = snap.val() || {};
        renderChannels(serverId);
    });
    unsubscribeChannels = onValue(ref(db, `channels/${serverId}`), (snap) => { 
        currentChannelsData = snap.val() || {}; 
        renderChannels(serverId); 
    });
    unsubscribeCategories = onValue(ref(db, `categories/${serverId}`), (snap) => { 
        currentCategoriesData = snap.val() || {}; 
        renderChannels(serverId); 
    });
}

function renderChannels(serverId) {
    const channelList = document.getElementById('channel-list');
    let categories = { "uncategorized": { name: "UNCATEGORIZED", order: -1 } };
    Object.keys(currentCategoriesData).forEach(k => categories[k] = currentCategoriesData[k]);
    let grouped = {}; Object.keys(categories).forEach(k => grouped[k] = []);
    
    Object.keys(currentChannelsData).forEach(cId => { 
        const c = currentChannelsData[cId]; c.id = cId; 
        const cid = c.categoryId && categories[c.categoryId] ? c.categoryId : "uncategorized"; 
        
        // Evaluate View Channels Perm dynamically checking category overwrites
        if(getChannelPerm(cId, 'viewChannels')) {
            grouped[cid].push(c); 
        }
    });
    
    const sortedCats = Object.keys(categories).sort((a,b) => categories[a].order - categories[b].order);
    channelList.innerHTML = '';
    
    sortedCats.forEach(catId => {
        // If category itself isn't viewable, skip it
        if (!getCategoryPerm(catId, 'viewChannels') && catId !== "uncategorized") return;
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
            const div = document.createElement('div'); div.classList.add('channel-item'); div.id = `channel-${channelData.id}`; div.draggable = myServerPerms.manageChannels;
            
            div.innerHTML = channelData.type === "voice" ? `<span class="c-icon">${icons.voiceChannel}</span> <span class="c-name">${channelData.name}</span>` : `<span class="c-icon">${icons.textChannel}</span> <span class="c-name">${channelData.name}</span>`;
            
            div.addEventListener('click', () => { 
                if(channelData.type === "voice") { joinVoiceChannel(serverId, channelData.id); } 
                else { 
                    chatType = 'server'; currentChatId = channelData.id; 
                    document.getElementById('chat-title').innerText = channelData.name; 
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
            let touchTimer; div.addEventListener('touchstart', (e) => { touchTimer = setTimeout(() => showContextMenu(e, 'channel', channelData.id), 500); }); div.addEventListener('touchend', () => clearTimeout(touchTimer)); div.addEventListener('touchmove', () => clearTimeout(touchTimer));
            div.addEventListener('dragstart', (e) => { dragSrcEl = div; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/html', div.innerHTML); });
            div.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; div.classList.add('drag-over'); return false; });
            div.addEventListener('dragleave', () => div.classList.remove('drag-over'));
            div.addEventListener('drop', (e) => { e.stopPropagation(); div.classList.remove('drag-over'); if (dragSrcEl !== div) { const srcId = dragSrcEl.id.replace('channel-', ''); const targetOrder = channelData.order || 0; const prevChannel = arr[index - 1]; const nextChannel = arr[index + 1]; const srcData = currentChannelsData[srcId]; if(srcData.categoryId !== channelData.categoryId) { update(ref(db, `channels/${serverId}/${srcId}`), { categoryId: catId, order: targetOrder + 0.5 }); } else { if((srcData.order || 0) < targetOrder) { update(ref(db, `channels/${serverId}/${srcId}`), { order: nextChannel ? (targetOrder + nextChannel.order)/2 : targetOrder + 10 }); } else { update(ref(db, `channels/${serverId}/${srcId}`), { order: prevChannel ? (targetOrder + prevChannel.order)/2 : targetOrder - 10 }); } } } return false; });
            
            channelList.appendChild(div);
            if (unreadState.channels.has(channelData.id)) updateBadge(`channel-${channelData.id}`, true, false, false);
            
            if(channelData.type === "voice" && currentServerVoiceRosters[channelData.id]) {
                const roster = currentServerVoiceRosters[channelData.id];
                Object.keys(roster).forEach(peerEmail => {
                    const uData = globalUsersCache[peerEmail] || { username: peerEmail, avatar: "https://cdn.pixabay.com/photo/2023/02/18/11/00/icon-7797704_640.png" };
                    const vcUserDiv = document.createElement('div');
                    vcUserDiv.className = 'vc-sidebar-user';
                    vcUserDiv.innerHTML = `<img src="${uData.avatar}" class="avatar-small"><span>${uData.username}</span>`;
                    vcUserDiv.onclick = (e) => { e.stopPropagation(); showGlobalUserProfile(peerEmail, e); };
                    channelList.appendChild(vcUserDiv);
                    
                    if(!globalUsersCache[peerEmail]) {
                        get(child(ref(db), `users/${peerEmail}`)).then(s => { if(s.exists()) { globalUsersCache[peerEmail] = s.val(); renderChannels(serverId); }});
                    }
                });
            }
        });
    });
}

// ==========================================
// --- VOICE CHAT ENGINE ---
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
    if (!getChannelPerm(channelId, 'sendMessages')) return customAlert("You do not have permission to connect to this channel.", "Permission Denied");
    if (!myCurrentPeerId) return customAlert("Voice server connecting..."); 
    leaveVoiceChannel(); 
    try { 
        localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true }); 
        currentVoiceChannel = channelId; 
        document.getElementById('voice-controls-area').style.display = 'flex'; 
        
        const vcRef = ref(db, `voice_rosters/${serverId}/${channelId}/${currentUserSafeEmail}`); 
        await set(vcRef, myCurrentPeerId); 
        onDisconnect(vcRef).remove(); 
        
        onValue(ref(db, `voice_rosters/${serverId}/${channelId}`), (snap) => { 
            snap.forEach((childSnapshot) => { 
                const pEmail = childSnapshot.key; 
                const pId = childSnapshot.val(); 
                if (pEmail !== currentUserSafeEmail && !activeCalls[pEmail]) { 
                    const call = myPeer.call(pId, localAudioStream, { metadata: { callerEmail: currentUserSafeEmail } }); 
                    call.on('stream', stream => setupHiddenAudio(pEmail, stream)); 
                    activeCalls[pEmail] = call; 
                } 
            }); 
        }); 
    } catch (err) { customAlert("Mic access denied.", "Error"); } 
}

function leaveVoiceChannel() { 
    if (!currentVoiceChannel) return; 
    Object.keys(activeCalls).forEach(pEmail => { activeCalls[pEmail].close(); removeHiddenAudio(pEmail); }); 
    activeCalls = {}; 
    if (localAudioStream) { localAudioStream.getTracks().forEach(track => track.stop()); } 
    remove(ref(db, `voice_rosters/${currentServerId}/${currentVoiceChannel}/${currentUserSafeEmail}`)); 
    currentVoiceChannel = null; 
    document.getElementById('voice-controls-area').style.display = 'none'; 
}

document.getElementById('disconnect-vc-btn')?.addEventListener('click', leaveVoiceChannel);
document.getElementById('mute-btn')?.addEventListener('click', (e) => { 
    isMuted = !isMuted; 
    if(localAudioStream) { localAudioStream.getAudioTracks()[0].enabled = !isMuted; } 
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
    const audio = document.createElement('audio');
    audio.id = `audio-${peerEmail}`;
    audio.className = 'vc-audio-element';
    audio.autoplay = true;
    audio.srcObject = stream;
    if(isDeafened) audio.muted = true;
    container.appendChild(audio);
}
function removeHiddenAudio(peerEmail) { 
    const el = document.getElementById(`audio-${peerEmail}`); 
    if (el) el.remove(); 
}

// ==========================================
// --- MESSAGES, EMBEDS & NOTIFICATIONS ---
// ==========================================
function enableChat() { 
    let canSend = chatType === 'dm' ? true : getChannelPerm(currentChatId, 'sendMessages');
    
    // Process Timeout Restrictions
    if (chatType === 'server' && myServerMemberData && myServerMemberData.timeoutUntil && myServerMemberData.timeoutUntil > Date.now()) {
        canSend = false;
        document.getElementById('msg-input').placeholder = "You are timed out and cannot send messages.";
    } else {
        document.getElementById('msg-input').placeholder = canSend ? "Message..." : "You do not have permission to send messages here.";
    }

    document.getElementById('msg-input').disabled = !canSend; 
    document.getElementById('send-btn').disabled = !canSend; 
    document.getElementById('upload-img-btn').disabled = !canSend; 
    document.getElementById('emoji-picker-btn').disabled = !canSend; 
}

function processMentionsAndText(text) {
    if (!text) return { html: "", isMentioned: false };
    let processed = text.replace(/</g, "&lt;").replace(/>/g, "&gt;"); 
    let isMentioned = false;
    
    if(myProfile.username && text.includes('@' + myProfile.username)) isMentioned = true;
    myServerRoles.forEach(role => { if(serverRolesCache[role] && text.includes('@' + serverRolesCache[role].name)) isMentioned = true; });
    
    // Markdown
    processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    processed = processed.replace(/\*(.*?)\*/g, '<em>$1</em>');
    processed = processed.replace(/~~(.*?)~~/g, '<del>$1</del>');
    processed = processed.replace(/__(.*?)__/g, '<u>$1</u>');
    processed = processed.replace(/`(.*?)`/g, '<code class="markdown-code">$1</code>');
    processed = processed.replace(/\n/g, '<br>');

    // Mentions link
    processed = processed.replace(/@([a-zA-Z0-9_]+)/g, `<strong class="mention-link" style="color: var(--accent-warning); background: rgba(229, 192, 123, 0.1); padding: 0 3px; border-radius: 3px; cursor: pointer;" onclick="handleMentionClick('$1', event)">@$1</strong>`);
    
    // Parse Emojis [:name:id]
    processed = processed.replace(/\[:([^:]+):([^\]]+)\]/g, (match, name, id) => {
        if(globalEmojisCache[id]) {
            return `<img src="${globalEmojisCache[id].url}" class="custom-emoji" data-id="${id}" alt="${name}" title=":${name}:">`;
        }
        return `:${name}:`;
    });

    return { html: processed, isMentioned };
}

async function buildMessageHtml(data) {
    const mentionData = processMentionsAndText(data.text);
    let editedHtml = data.edited ? `<span style="font-size:10px; color:var(--text-muted); margin-left:5px;">(edited)</span>` : ``;
    let contentHtml = `<div style="margin-left: 42px; word-break: break-word; color: var(--text-main);">${mentionData.html}${editedHtml}</div>`;
    
    const inviteRegex = new RegExp(`${appBaseUrl.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\?invite=([a-zA-Z0-9]+)`, 'g');
    let match; let tempEmbeds = [];
    
    while ((match = inviteRegex.exec(data.text)) !== null) {
        const iCode = match[1]; const placeholderId = 'embed-' + generateCode();
        contentHtml += `<div id="${placeholderId}" style="margin-left: 42px; margin-top: 5px;"></div>`;
        tempEmbeds.push({ code: iCode, id: placeholderId });
    }

    if (data.imageUrl) { 
        contentHtml += `<img src="${data.imageUrl}" data-original="${data.originalImageUrl || data.imageUrl}" class="message-image" style="margin-left: 42px;">`; 
    }
    return { html: contentHtml, isMentioned: mentionData.isMentioned, embeds: tempEmbeds };
}

let lastMsgSender = null; let lastMsgTime = 0;
const scrollBtn = document.getElementById('scroll-bottom-btn');
const messagesDiv = document.getElementById('messages');
let oldestMsgTimestamp = null;
let isFetchingMore = false;
let currentChatLabelText = "";

messagesDiv?.addEventListener('scroll', () => {
    if (messagesDiv.scrollHeight - messagesDiv.scrollTop > messagesDiv.clientHeight + 100) { scrollBtn.style.display = 'flex'; } 
    else { scrollBtn.style.display = 'none'; update(ref(db, `users/${currentUserSafeEmail}/lastRead`), { [currentChatId]: Date.now() }); }
    
    if (messagesDiv.scrollTop < 50 && !isFetchingMore && oldestMsgTimestamp) {
        fetchOlderMessages();
    }
});
scrollBtn?.addEventListener('click', () => { messagesDiv.scrollTop = messagesDiv.scrollHeight; update(ref(db, `users/${currentUserSafeEmail}/lastRead`), { [currentChatId]: Date.now() }); });

function insertWelcomeMessage() {
    let w = document.getElementById('chat-welcome-msg');
    if(!w) {
        w = document.createElement('div');
        w.id = 'chat-welcome-msg';
        w.className = 'welcome-message';
        w.innerHTML = `<h1>Welcome to ${currentChatLabelText}!</h1><p>This is the start of the ${currentChatLabelText} channel.</p>`;
    }
    messagesDiv.insertBefore(w, messagesDiv.firstChild);
}

async function fetchOlderMessages() {
    isFetchingMore = true;
    const oldScrollHeight = messagesDiv.scrollHeight;
    document.getElementById('chat-loading-spinner').style.display = 'block';
    
    const msgRef = query(ref(db, chatType === 'server' ? `messages/${currentChatId}` : `dms/${currentChatId}`), orderByChild('timestamp'), endAt(oldestMsgTimestamp - 1), limitToLast(50));
    const snap = await get(msgRef);
    
    if(snap.exists()) {
        const msgs = [];
        snap.forEach(c => { msgs.push({id: c.key, data: c.val()}); });
        
        if(msgs.length > 0) oldestMsgTimestamp = msgs[0].data.timestamp;
        else oldestMsgTimestamp = null;

        const fragment = document.createDocumentFragment();
        let tempLastSender = null; let tempLastTime = 0;
        
        for (const m of msgs) {
            const el = await createMessageDOM(m.id, m.data, tempLastSender, tempLastTime);
            fragment.appendChild(el);
            tempLastSender = m.data.sender; tempLastTime = m.data.timestamp;
        }
        
        messagesDiv.insertBefore(fragment, messagesDiv.firstChild);
        messagesDiv.scrollTop = messagesDiv.scrollHeight - oldScrollHeight;
        
        if (msgs.length < 50) {
            oldestMsgTimestamp = null;
            insertWelcomeMessage();
        }
    } else {
        oldestMsgTimestamp = null;
        insertWelcomeMessage();
    }
    
    document.getElementById('chat-loading-spinner').style.display = 'none';
    isFetchingMore = false;
}

async function createMessageDOM(msgId, data, prevSender, prevTime) {
    const isConsecutive = (prevSender === data.sender) && (data.timestamp - prevTime < 300000) && (!data.replyTo);
    const msgElement = document.createElement('div');
    msgElement.classList.add('message');
    if(isConsecutive) msgElement.classList.add('consecutive');
    msgElement.id = `msg-${msgId}`;
    
    const buildRes = await buildMessageHtml(data);
    if(buildRes.isMentioned && data.sender !== auth.currentUser.email) msgElement.classList.add('mentioned');

    let canEdit = (data.sender === auth.currentUser.email);
    let canDelete = (canEdit || (chatType === 'server' && (myServerPerms.manageServerSettings || myServerPerms.manageMessages)));
    let nameColor = "var(--text-bright)";
    if(chatType === 'server' && data.roleId && data.roleId !== 'member' && data.roleId !== 'owner') { const rSnap = await get(ref(db, `servers/${currentServerId}/roles/${data.roleId}`)); if(rSnap.exists()) nameColor = rSnap.val().color; }
    if(data.roleId === 'system') nameColor = "var(--accent-primary)";

    let actionsHtml = `<div class="msg-actions">
        <button class="msg-action-btn react" onclick="openEmojiPickerForReaction('${msgId}', event)">${icons.addReaction} React</button>
        <button class="msg-action-btn reply">${icons.reply} Reply</button>
        ${canEdit ? `<button class="msg-action-btn edit-msg">${icons.gear} Edit</button>` : ''}
        ${canDelete ? `<button class="msg-action-btn del">${icons.trash} Delete</button>` : ''}
    </div>`;
    
    if (!isConsecutive) {
        let replyHtml = data.replyTo ? `<div class="reply-context"><strong>@${data.replyTo.username}</strong> ${data.replyTo.text}</div>` : "";
        let headerHtml = `${replyHtml}<div class="message-header"><img src="${data.avatar}" class="avatar-small" style="cursor:pointer;" onclick="showGlobalUserProfile('${data.sender}', event)"><span class="message-sender" style="color: ${nameColor}; cursor:pointer;" onclick="showGlobalUserProfile('${data.sender}', event)">${data.username}</span><span style="font-size: 0.8em; color: var(--text-muted);">${new Date(data.timestamp).toLocaleTimeString()}</span></div>`;
        msgElement.innerHTML = `${actionsHtml}${headerHtml}<div class="msg-content-wrapper">${buildRes.html}</div>`;
    } else { msgElement.innerHTML = `${actionsHtml}<div class="msg-content-wrapper">${buildRes.html}</div>`; }

    // Reactions container
    const reactionsDiv = document.createElement('div');
    reactionsDiv.className = 'reactions-container';
    reactionsDiv.id = `reactions-${msgId}`;
    msgElement.appendChild(reactionsDiv);
    
    if(data.reactions) renderReactions(msgId, data.reactions);

    buildRes.embeds.forEach(async (eObj) => {
        const sSnap = await get(ref(db, `servers/${eObj.code}`));
        if(sSnap.exists()) {
            const sData = sSnap.val();
            const iHtml = sData.icon ? `<div class="invite-embed-icon" style="background-image:url(${sData.icon})"></div>` : `<div class="invite-embed-icon">${sData.name.charAt(0)}</div>`;
            const embedContainer = msgElement.querySelector('#' + eObj.id);
            if(embedContainer) {
                embedContainer.innerHTML = `<div class="invite-embed"><h4>You've been invited to join a server</h4><div class="invite-embed-content">${iHtml}<div class="invite-embed-info"><div class="invite-embed-name">${sData.name}</div><button onclick="window.location.href='${appBaseUrl}?invite=${eObj.code}'" style="margin:0; padding:5px 15px;">Join</button></div></div></div>`;
            }
        }
    });

    // Message Actions listeners
    const delBtn = msgElement.querySelector('.msg-action-btn.del'); 
    if (delBtn) {
        delBtn.addEventListener('click', (e) => { 
            if (e.shiftKey) {
                remove(ref(db, `${chatType === 'server' ? 'messages' : 'dms'}/${currentChatId}/${msgId}`));
            } else {
                customConfirm("Are you sure you want to delete this message? This action cannot be undone.", "Delete Message", async (yes) => {
                    if(yes) await remove(ref(db, `${chatType === 'server' ? 'messages' : 'dms'}/${currentChatId}/${msgId}`));
                });
            }
        }); 
    }

    const editBtn = msgElement.querySelector('.msg-action-btn.edit-msg');
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            const contentWrapper = msgElement.querySelector('.msg-content-wrapper');
            const originalHtml = contentWrapper.innerHTML;
            const rawText = data.text || '';
            contentWrapper.innerHTML = `
                <div style="margin-left: 42px;">
                    <textarea class="edit-msg-input" style="width:100%; background:var(--bg-tertiary); color:white; border:1px solid var(--border-color); border-radius:4px; padding:8px; margin-top:5px; resize:vertical; font-family:inherit;">${rawText.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</textarea>
                    <div style="display:flex; gap:10px; margin-top:5px; font-size:12px;">
                        <button class="save-edit-btn small-btn">Save</button>
                        <button class="cancel-edit-btn small-btn" style="background:transparent; border:1px solid var(--text-muted); color:var(--text-muted);">Cancel</button>
                    </div>
                </div>
            `;
            const ta = contentWrapper.querySelector('.edit-msg-input');
            ta.style.height = ta.scrollHeight + 'px';
            ta.addEventListener('input', function() { this.style.height = 'auto'; this.style.height = (this.scrollHeight) + 'px'; });
            
            // Shift + Enter for new line, Enter to save inside edit box
            ta.addEventListener('keydown', (e) => {
                if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); contentWrapper.querySelector('.save-edit-btn').click(); }
            });
            ta.focus();
            
            contentWrapper.querySelector('.cancel-edit-btn').onclick = () => { contentWrapper.innerHTML = originalHtml; bindImageClick(contentWrapper.querySelector('.message-image')); };
            contentWrapper.querySelector('.save-edit-btn').onclick = () => {
                const newText = ta.value.trim();
                if(newText && newText !== rawText) {
                    // Instantly update the local UI without a reload/flicker
                    data.text = newText;
                    data.edited = true;
                    buildMessageHtml(data).then(res => {
                        contentWrapper.innerHTML = res.html;
                        bindImageClick(contentWrapper.querySelector('.message-image'));
                    });
                    // Push update to DB for others
                    update(ref(db, `${chatType === 'server' ? 'messages' : 'dms'}/${currentChatId}/${msgId}`), { text: newText, edited: true });
                } else {
                    contentWrapper.innerHTML = originalHtml;
                    bindImageClick(contentWrapper.querySelector('.message-image'));
                }
            };
        });
    }

    const replyBtn = msgElement.querySelector('.msg-action-btn.reply'); if (replyBtn) replyBtn.addEventListener('click', () => triggerReply(msgId, data.username, data.text || "Attachment..."));
    
    bindImageClick(msgElement.querySelector('.message-image'));
    
    return msgElement;
}

function renderReactions(msgId, reactionsObj) {
    const container = document.getElementById(`reactions-${msgId}`);
    if(!container) return;
    container.innerHTML = '';
    
    if(!reactionsObj) return;

    Object.keys(reactionsObj).forEach(emojiKey => {
        const users = reactionsObj[emojiKey].users || {};
        const count = Object.keys(users).length;
        if(count === 0) return;
        
        const hasMyVote = !!users[currentUserSafeEmail];
        
        const rDiv = document.createElement('div');
        rDiv.className = `msg-reaction ${hasMyVote ? 'active' : ''}`;
        
        if(globalEmojisCache[emojiKey]) {
            rDiv.innerHTML = `<img src="${globalEmojisCache[emojiKey].url}" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;"> ${count}`;
        } else {
            rDiv.innerHTML = `<span style="font-size:14px;margin-right:4px;">${emojiKey}</span> ${count}`;
        }
        
        rDiv.onclick = () => {
            const dbPath = `${chatType === 'server' ? 'messages' : 'dms'}/${currentChatId}/${msgId}/reactions/${emojiKey}/users/${currentUserSafeEmail}`;
            if(hasMyVote) remove(ref(db, dbPath));
            else set(ref(db, dbPath), true);
        };
        
        container.appendChild(rDiv);
    });
}

async function loadMessages(dbPath, chatNameLabel) {
    messagesDiv.innerHTML = '';
    currentChatLabelText = chatNameLabel;
    lastMsgSender = null; lastMsgTime = 0;
    oldestMsgTimestamp = null;
    isFetchingMore = false;
    
    if (unsubscribeMessages) unsubscribeMessages();
    if (unsubscribeMessagesRemoved) unsubscribeMessagesRemoved();

    const lastReadSnap = await get(ref(db, `users/${currentUserSafeEmail}/lastRead/${currentChatId}`));
    let lastReadTime = lastReadSnap.val() || 0;
    let insertedDivider = false;

    document.getElementById('chat-loading-spinner').style.display = 'block';
    const msgRef = query(ref(db, dbPath), orderByChild('timestamp'), limitToLast(50));
    const initialSnap = await get(msgRef);
    
    let highestTimestamp = 0;
    let firstMsg = true;
    
    const initialMessages = Object.entries(initialSnap.val() || {});

    for (const childSnap of initialMessages) {
        const msgId = childSnap[0]; const data = childSnap[1];
        if(firstMsg) { oldestMsgTimestamp = data.timestamp; firstMsg = false; }
        
        const el = await createMessageDOM(msgId, data, lastMsgSender, lastMsgTime);
        messagesDiv.appendChild(el);
        lastMsgSender = data.sender; lastMsgTime = data.timestamp;
        highestTimestamp = Math.max(highestTimestamp, data.timestamp);
        
        if (data.timestamp > lastReadTime && !insertedDivider && data.sender !== auth.currentUser.email) {
            insertedDivider = true;
            const div = document.createElement('div'); div.className = 'new-messages-divider'; div.innerHTML = `<span>New Messages</span>`;
            messagesDiv.insertBefore(div, el);
            setTimeout(() => { div.scrollIntoView({behavior: "smooth", block: "center"}); }, 100);
        }
    }

    if (initialMessages.length < 50) {
        insertWelcomeMessage();
        oldestMsgTimestamp = null;
    }

    document.getElementById('chat-loading-spinner').style.display = 'none';

    if(!insertedDivider) {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        setTimeout(() => { if(!insertedDivider) messagesDiv.scrollTop = messagesDiv.scrollHeight; }, 100);
    }

    const liveRef = query(ref(db, dbPath), orderByChild('timestamp'), startAt(highestTimestamp + 1));
    unsubscribeMessages = onChildAdded(liveRef, async (childSnap) => {
        const data = childSnap.val();
        if(data.timestamp > highestTimestamp) {
            const el = await createMessageDOM(childSnap.key, data, lastMsgSender, lastMsgTime);
            
            // Check if it's an edited message pushing through onChildAdded. 
            // Better to handle edits with onValue or clear up re-renders, 
            // but standard Firebase push won't trigger added for edits.
            const existing = document.getElementById(`msg-${childSnap.key}`);
            if(!existing) {
                messagesDiv.appendChild(el);
                lastMsgSender = data.sender; lastMsgTime = data.timestamp;
                if (!insertedDivider || (messagesDiv.scrollHeight - messagesDiv.scrollTop < messagesDiv.clientHeight + 150)) {
                    messagesDiv.scrollTop = messagesDiv.scrollHeight;
                }
            }
        }
    });

    unsubscribeMessagesRemoved = onChildRemoved(ref(db, dbPath), (snapshot) => { const msgEl = document.getElementById(`msg-${snapshot.key}`); if(msgEl) msgEl.remove(); });
    
    // Live update reactions & edits
    onValue(ref(db, dbPath), async (snap) => {
        snap.forEach(msgSnap => {
            const mData = msgSnap.val();
            renderReactions(msgSnap.key, mData.reactions || {});
            
            // Re-render edited content dynamically if it changed.
            const msgEl = document.getElementById(`msg-${msgSnap.key}`);
            if (msgEl && mData.edited) {
                buildMessageHtml(mData).then(res => {
                    const contentWrapper = msgEl.querySelector('.msg-content-wrapper');
                    if(contentWrapper && !contentWrapper.querySelector('.edit-msg-input')) {
                        contentWrapper.innerHTML = res.html;
                        bindImageClick(contentWrapper.querySelector('.message-image'));
                    }
                });
            }
        });
    });

    if (chatType === 'dm') clearUnread('dm', currentChatId); else if (chatType === 'server') clearUnread('channel', currentChatId, currentServerId);
}

// Replier Logic
function triggerReply(msgId, username, text) {
    replyingToMessage = { id: msgId, username: username, text: text.length > 50 ? text.substring(0, 50) + '...' : text };
    document.getElementById('reply-banner-text').innerHTML = `Replying to <strong style="color:var(--text-bright);">@${username}</strong>`;
    document.getElementById('reply-banner').style.display = 'flex'; document.getElementById('msg-input').focus();
}
document.getElementById('cancel-reply-btn')?.addEventListener('click', () => { replyingToMessage = null; document.getElementById('reply-banner').style.display = 'none'; });

// Mention Autocomplete
const msgInput = document.getElementById('msg-input');
const mentionMenu = document.getElementById('mention-menu');
let mentionStartIndex = -1; let mentionSearchTerm = null;

// Textarea auto-resize
msgInput?.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    
    const val = this.value; const cursorPos = this.selectionStart;
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

// Emojis & Reactions Logic
const emojiPicker = document.getElementById('emoji-picker');
const emojiBtn = document.getElementById('emoji-picker-btn');
const epIconSpan = document.getElementById('ep-icon-span');
let emojiHoverInterval = null;
let currentReactionMsgId = null;

const standardEmojis = ['😀','😂','😍','😭','😎','👍','🙏','🔥','✨','🎉','💀','👀','💯','❤️'];

emojiBtn.addEventListener('mouseenter', () => {
    let i = 0;
    emojiHoverInterval = setInterval(() => {
        epIconSpan.innerHTML = `<span style="font-size:20px; line-height:1;">${standardEmojis[i % standardEmojis.length]}</span>`;
        i++;
    }, 200);
});
emojiBtn.addEventListener('mouseleave', () => {
    clearInterval(emojiHoverInterval);
    epIconSpan.innerHTML = icons.smile;
});

emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    currentReactionMsgId = null;
    toggleEmojiPicker();
});

window.openEmojiPickerForReaction = function(msgId, event) {
    if(event) event.stopPropagation();
    currentReactionMsgId = msgId;
    toggleEmojiPicker();
};

function toggleEmojiPicker() {
    if(emojiPicker.style.display === 'block') { emojiPicker.style.display = 'none'; return; }
    
    emojiPicker.innerHTML = '';
    
    // Server Emojis
    if(currentServerId) {
        get(ref(db, `servers/${currentServerId}/emojis`)).then(snap => {
            if(snap.exists()) {
                const sDiv = document.createElement('div'); sDiv.innerHTML = '<div style="font-size:11px; color:var(--text-muted); margin-bottom:5px; text-transform:uppercase;">Server</div>';
                const flex = document.createElement('div'); flex.className = 'ep-grid';
                Object.keys(snap.val()).forEach(eid => {
                    const edata = globalEmojisCache[eid];
                    if(edata) {
                        const img = document.createElement('img'); img.src = edata.url; img.title = `:${edata.name}:`;
                        img.onclick = () => insertEmoji(eid, edata.name, true);
                        flex.appendChild(img);
                    }
                });
                sDiv.appendChild(flex);
                emojiPicker.appendChild(sDiv);
            }
        });
    }

    // Personal Emojis
    get(ref(db, `users/${currentUserSafeEmail}/emojis`)).then(snap => {
        if(snap.exists()) {
            const pDiv = document.createElement('div'); pDiv.innerHTML = '<div style="font-size:11px; color:var(--text-muted); margin-top:10px; margin-bottom:5px; text-transform:uppercase;">Personal</div>';
            const flex = document.createElement('div'); flex.className = 'ep-grid';
            Object.keys(snap.val()).forEach(eid => {
                const edata = globalEmojisCache[eid];
                if(edata) {
                    const img = document.createElement('img'); img.src = edata.url; img.title = `:${edata.name}:`;
                    img.onclick = () => insertEmoji(eid, edata.name, true);
                    flex.appendChild(img);
                }
            });
            pDiv.appendChild(flex);
            emojiPicker.appendChild(pDiv);
        }
    });

    // Standard
    const dDiv = document.createElement('div'); dDiv.innerHTML = '<div style="font-size:11px; color:var(--text-muted); margin-top:10px; margin-bottom:5px; text-transform:uppercase;">Standard</div>';
    const flex = document.createElement('div'); flex.className = 'ep-grid text-emojis';
    standardEmojis.forEach(e => {
        const span = document.createElement('span'); span.innerText = e;
        span.onclick = () => insertEmoji(e, e, false);
        flex.appendChild(span);
    });
    dDiv.appendChild(flex);
    emojiPicker.appendChild(dDiv);

    emojiPicker.style.display = 'block';
}

function insertEmoji(idOrChar, name, isCustom) {
    if(currentReactionMsgId) {
        const dbPath = `${chatType === 'server' ? 'messages' : 'dms'}/${currentChatId}/${currentReactionMsgId}/reactions/${idOrChar}/users/${currentUserSafeEmail}`;
        set(ref(db, dbPath), true);
    } else {
        const input = document.getElementById('msg-input');
        if(isCustom) input.value += `[:${name}:${idOrChar}] `;
        else input.value += `${idOrChar}`;
        input.focus();
    }
    emojiPicker.style.display = 'none';
}

document.addEventListener('click', (e) => { 
    if(!e.target.closest('#emoji-picker') && !e.target.closest('#emoji-picker-btn') && !e.target.closest('.react')) {
        emojiPicker.style.display = 'none'; 
    }
});

// Image / Paste Preview Logic
document.getElementById('upload-img-btn')?.addEventListener('click', () => document.getElementById('image-upload').click());
document.getElementById('image-upload')?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file || !currentChatId) return;
    if (file.size > 2 * 1024 * 1024) return customAlert("File too large. Please select an image under 2MB.", "Error");
    
    const result = await compressImage(file, 800, 800, 0.85); // Compress for display
    pendingAttachmentBase64 = result.compressed; 
    pendingAttachmentOriginal = result.original; // Keep high-res for download
    document.getElementById('attachment-preview-img').src = pendingAttachmentBase64; 
    document.getElementById('attachment-preview-area').style.display = 'flex'; 
    document.getElementById('image-upload').value = "";
});
document.getElementById('remove-attachment-btn')?.addEventListener('click', () => { pendingAttachmentBase64 = null; pendingAttachmentOriginal = null; document.getElementById('attachment-preview-area').style.display = 'none'; });
document.getElementById('msg-input')?.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const blob = item.getAsFile(); if (blob.size > 2 * 1024 * 1024) return customAlert("Pasted image is too large (max 2MB).");
            compressImage(blob, 800, 800, 0.85).then(result => {
                pendingAttachmentBase64 = result.compressed; 
                pendingAttachmentOriginal = result.original;
                document.getElementById('attachment-preview-img').src = pendingAttachmentBase64; 
                document.getElementById('attachment-preview-area').style.display = 'flex'; 
            });
        }
    }
});

async function sendMessage() {
    const input = document.getElementById('msg-input'); const text = input.value.trim();
    if ((text !== "" || pendingAttachmentBase64) && currentChatId && myServerPerms.sendMessages) {
        const path = chatType === 'server' ? `messages/${currentChatId}` : `dms/${currentChatId}`;
        let roleId = 'member';
        if(chatType === 'server') { const mSnap = await get(ref(db, `server_members/${currentServerId}/${currentUserSafeEmail}/role`)); roleId = mSnap.val() || 'member'; }
        
        let msgPayload = { sender: auth.currentUser.email, username: myProfile.username, avatar: myProfile.avatar, text: text, timestamp: Date.now(), roleId: roleId };
        
        if (replyingToMessage) { msgPayload.replyTo = replyingToMessage; replyingToMessage = null; document.getElementById('reply-banner').style.display = 'none'; }
        if (pendingAttachmentBase64) { 
            msgPayload.imageUrl = pendingAttachmentBase64; 
            msgPayload.originalImageUrl = pendingAttachmentOriginal;
            pendingAttachmentBase64 = null; 
            pendingAttachmentOriginal = null;
            document.getElementById('attachment-preview-area').style.display = 'none'; 
        }

        push(ref(db, path), msgPayload);
        input.value = "";
        input.style.height = 'auto'; // Reset height
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
document.getElementById('msg-input')?.addEventListener('keydown', (e) => { 
    if (e.key === 'Enter' && !e.shiftKey) { 
        e.preventDefault(); 
        sendMessage(); 
    } 
});

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