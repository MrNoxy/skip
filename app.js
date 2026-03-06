import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, push, onChildAdded, onChildRemoved, onValue, set, get, child, remove, onDisconnect, query, limitToLast, update } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

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
let myServerPerms = { admin: false, manageChannels: false, deleteMessages: false };
let unsubscribeMessages = null; 
let unsubscribeMessagesRemoved = null; 
let unsubscribeMembers = null; // Track members listener to prevent memory leaks
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
const appBaseUrl = window.location.href.split('?')[0];

function sanitizeEmail(email) { 
    return email.replace(/\./g, ','); 
}

function generateCode() { 
    return Math.random().toString(36).substring(2, 10); 
}

// ==========================================
// --- GLOBAL MODAL CONTROLLERS ---
// ==========================================
function customAlert(desc, title = "Notice") {
    document.getElementById('alert-modal-title').innerText = title;
    document.getElementById('alert-modal-desc').innerText = desc;
    document.getElementById('alert-modal').style.display = 'flex';
}

document.getElementById('alert-modal-ok').addEventListener('click', () => { 
    document.getElementById('alert-modal').style.display = 'none'; 
});

let currentInputCallback = null;

function openInputModal(title, placeholder, desc, callback, defaultValue = "") {
    document.getElementById('input-modal-title').innerText = title;
    document.getElementById('input-modal-field').placeholder = placeholder;
    document.getElementById('input-modal-field').value = defaultValue;
    
    const descEl = document.getElementById('input-modal-desc');
    if (desc) { 
        descEl.innerText = desc; 
        descEl.style.display = 'block'; 
    } else { 
        descEl.style.display = 'none'; 
    }
    
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
    if (e.key === 'Enter') {
        document.getElementById('input-modal-submit').click(); 
    }
});

// ==========================================
// --- CONTEXT MENU (Right Click / Long Press) ---
// ==========================================
let contextTarget = null;
const ctxMenu = document.getElementById('context-menu');

function showContextMenu(e, type, id, categoryId = null) {
    e.preventDefault();
    if (type !== 'channel' || (!myServerPerms.admin && !myServerPerms.manageChannels)) return; 
    
    contextTarget = { type, id, categoryId };
    ctxMenu.style.display = 'block';
    
    const x = e.pageX || e.touches[0].pageX;
    const y = e.pageY || e.touches[0].pageY;
    ctxMenu.style.left = `${x}px`;
    ctxMenu.style.top = `${y}px`;
}

document.addEventListener('click', () => {
    ctxMenu.style.display = 'none';
});

document.getElementById('ctx-delete').addEventListener('click', () => {
    if (contextTarget && currentServerId) {
        if(confirm("Delete this channel?")) {
            remove(ref(db, `channels/${currentServerId}/${contextTarget.id}`));
            remove(ref(db, `messages/${contextTarget.id}`)); 
        }
    }
});

// ==========================================
// --- AUTH & PROFILE ---
// ==========================================
document.getElementById('register-btn').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const safeEmail = sanitizeEmail(email);
        const baseName = email.split('@')[0];
        const randomTag = Math.floor(1000 + Math.random() * 9000).toString(); 
        const defaultAvatar = `https://ui-avatars.com/api/?name=${baseName.charAt(0)}&background=5865F2&color=fff&size=150`;

        await set(ref(db, `users/${safeEmail}`), { 
            email: email, 
            uid: userCredential.user.uid, 
            username: baseName, 
            tag: randomTag, 
            avatar: defaultAvatar, 
            status: 'online', 
            saved_status: 'online' 
        });
        await set(ref(db, `user_tags/${baseName}_${randomTag}`), safeEmail);
        customAlert("Registered successfully!", "Success");
    } catch (error) { 
        customAlert(error.message, "Error"); 
    }
});

document.getElementById('login-btn').addEventListener('click', () => {
    signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value)
        .catch(e => customAlert(e.message, "Login Error"));
});

document.getElementById('logout-btn').addEventListener('click', () => {
    leaveVoiceChannel();
    if (currentUserSafeEmail) {
        set(ref(db, `users/${currentUserSafeEmail}/status`), 'offline');
    }
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
                document.getElementById('my-status-indicator').className = `status-indicator status-${myProfile.status || 'online'}`;
            }
        });

        const connectedRef = ref(db, '.info/connected');
        onValue(connectedRef, (snap) => {
            if (snap.val() === true) {
                const myStatusRef = ref(db, `users/${currentUserSafeEmail}/status`);
                onDisconnect(myStatusRef).set('offline');
                get(ref(db, `users/${currentUserSafeEmail}/saved_status`)).then(sSnap => { 
                    set(myStatusRef, sSnap.val() || 'online'); 
                });
            }
        });

        initVoiceChat(); 
        loadMyServers(); 
        loadFriendsList(); 
        startNotificationListeners(); 
        
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('invite')) {
            await joinServerByCode(urlParams.get('invite'));
            window.history.replaceState({}, document.title, appBaseUrl);
        }
    } else {
        authSection.style.display = 'block'; 
        appContainer.style.display = 'none';
    }
});

// Profile Modals
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

document.getElementById('close-profile-btn').addEventListener('click', () => {
    profileModal.style.display = 'none';
});

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
    
    if(!newUsername || !newTag) {
        return customAlert("Fields cannot be empty", "Error");
    }

    await remove(ref(db, `user_tags/${myProfile.username}_${myProfile.tag}`)); 
    await set(ref(db, `user_tags/${newUsername}_${newTag}`), currentUserSafeEmail); 
    await update(ref(db, `users/${currentUserSafeEmail}`), {username: newUsername, tag: newTag, avatar: tempBase64Avatar});
    
    profileModal.style.display = 'none';
});

// Status Dropdown
document.getElementById('my-status-indicator').addEventListener('click', (e) => { 
    e.stopPropagation(); 
    document.getElementById('status-selector').style.display = 'block'; 
});

document.querySelectorAll('.status-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
        const s = e.target.getAttribute('data-status');
        update(ref(db, `users/${currentUserSafeEmail}`), {status: s, saved_status: s});
        document.getElementById('status-selector').style.display = 'none';
    });
});

document.addEventListener('click', (e) => { 
    if (!e.target.closest('#user-controls')) {
        document.getElementById('status-selector').style.display = 'none'; 
    }
    if (!e.target.closest('#sidebar-header') && !e.target.closest('#server-settings-modal')) {
        document.getElementById('server-dropdown').style.display = 'none'; 
    }
});

// ==========================================
// --- NAVIGATION & FRIENDS ---
// ==========================================
document.getElementById('home-btn').addEventListener('click', () => {
    document.body.classList.remove('mobile-chat-active'); 
    currentServerId = null;
    document.getElementById('server-name-display').innerText = "Friends & DMs";
    document.getElementById('server-dropdown-arrow').style.display = 'none';
    document.getElementById('add-friend-btn').style.display = 'block';
    document.getElementById('server-dropdown').style.display = 'none';
    document.getElementById('toggle-members-btn').style.display = 'none';
    document.getElementById('member-sidebar').style.display = 'none';
    if(unsubscribeMembers) { unsubscribeMembers(); unsubscribeMembers = null; }
    loadFriendsList();
});

document.getElementById('mobile-back-btn').addEventListener('click', () => {
    document.body.classList.remove('mobile-chat-active');
});

document.getElementById('add-friend-btn').addEventListener('click', () => {
    openInputModal("Add Friend", "e.g. noxy#6996", "Enter your friend's tag below:", async (inputTag) => {
        if (!inputTag) return;
        if(inputTag.startsWith('@')) inputTag = inputTag.substring(1);
        
        const tagSnap = await get(child(ref(db), `user_tags/${inputTag.replace('#', '_')}`));
        if (tagSnap.exists()) {
            const friendSafeEmail = tagSnap.val();
            if(friendSafeEmail === currentUserSafeEmail) {
                return customAlert("You can't add yourself!", "Wait a minute...");
            }

            const fProf = (await get(child(ref(db), `users/${friendSafeEmail}`))).val();
            const dmId = [currentUserSafeEmail, friendSafeEmail].sort().join('_');
            
            await set(ref(db, `users/${currentUserSafeEmail}/friends/${friendSafeEmail}`), { username: fProf.username, tag: fProf.tag, avatar: fProf.avatar, dmId: dmId });
            await set(ref(db, `users/${friendSafeEmail}/friends/${currentUserSafeEmail}`), { username: myProfile.username, tag: myProfile.tag, avatar: myProfile.avatar, dmId: dmId });
            
            customAlert(`Added ${inputTag} to friends!`, "Success");
        } else { 
            customAlert("User not found.", "Error"); 
        }
    });
});

function loadFriendsList() {
    const channelList = document.getElementById('channel-list');
    onValue(ref(db, `users/${currentUserSafeEmail}/friends`), (snapshot) => {
        channelList.innerHTML = '';
        snapshot.forEach((childSnapshot) => {
            const fEmail = childSnapshot.key; 
            const fData = childSnapshot.val();
            const div = document.createElement('div'); 
            
            div.classList.add('channel-item', 'friend-item'); 
            div.id = `dm-${fData.dmId}`;
            div.innerHTML = `
                <div class="avatar-container">
                    <img src="${fData.avatar}" class="avatar-small">
                    <div class="status-indicator status-offline" id="status-${fEmail}"></div>
                </div>
                <span>${fData.username}</span>
            `;
            
            div.addEventListener('click', () => {
                chatType = 'dm'; 
                currentChatId = fData.dmId;
                document.getElementById('chat-title').innerText = `@${fData.username}#${fData.tag}`;
                document.getElementById('toggle-members-btn').style.display = 'none';
                document.getElementById('member-sidebar').style.display = 'none';
                enableChat(); 
                loadMessages(`dms/${currentChatId}`, `@${fData.username}`);
            });
            
            channelList.appendChild(div);
            
            onValue(ref(db, `users/${fEmail}/status`), (snap) => { 
                const el = document.getElementById(`status-${fEmail}`); 
                if(el) el.className = `status-indicator status-${snap.val() || 'offline'}`; 
            });
            
            if (unreadState.dms.has(fData.dmId)) {
                updateBadge(`dm-${fData.dmId}`, true, false);
            }
        });
    });
}

// ==========================================
// --- SERVERS, CHANNELS, SETTINGS & MEMBERS ---
// ==========================================
document.getElementById('create-server-btn').addEventListener('click', () => {
    openInputModal("Create Server", "Server Name", "Give your server a name:", (serverName) => {
        if (serverName) {
            const serverId = generateCode();
            set(ref(db, `servers/${serverId}`), { name: serverName, owner: auth.currentUser.email });
            set(ref(db, `server_members/${serverId}/${currentUserSafeEmail}`), { role: 'owner' });
            set(ref(db, `users/${currentUserSafeEmail}/servers/${serverId}`), true);
            
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
        await set(ref(db, `users/${currentUserSafeEmail}/servers/${codeToJoin}`), true);
        customAlert("Joined server successfully!", "Success");
    } else { 
        customAlert("Invalid invite link or code.", "Error"); 
    }
}

document.getElementById('join-server-btn').addEventListener('click', () => {
    openInputModal("Join Server", "Invite Link or Code", "", async (input) => {
        if (!input) return; 
        let code = input.includes('invite=') ? input.split('invite=')[1].split('&')[0] : input.split('/').pop();
        await joinServerByCode(code);
    });
});

function loadMyServers() {
    const serverList = document.getElementById('server-list');
    onValue(ref(db, `users/${currentUserSafeEmail}/servers`), (snap) => {
        serverList.innerHTML = '';
        snap.forEach((childSnapshot) => {
            const serverId = childSnapshot.key;
            get(child(ref(db), `servers/${serverId}`)).then((sSnap) => {
                if (sSnap.exists()) {
                    const sData = sSnap.val();
                    const div = document.createElement('div'); 
                    div.classList.add('server-icon'); 
                    div.id = `server-${serverId}`;
                    
                    if(sData.icon) { 
                        div.style.backgroundImage = `url(${sData.icon})`; 
                    } else { 
                        div.innerText = sData.name.charAt(0).toUpperCase(); 
                    }
                    
                    div.addEventListener('click', async () => {
                        document.body.classList.remove('mobile-chat-active'); 
                        currentServerId = serverId;
                        document.getElementById('server-name-display').innerText = sData.name;
                        document.getElementById('server-dropdown-arrow').style.display = 'inline';
                        document.getElementById('add-friend-btn').style.display = 'none';
                        document.getElementById('toggle-members-btn').style.display = 'inline-block';
                        
                        // Check perms
                        const myRoleSnap = await get(ref(db, `server_members/${serverId}/${currentUserSafeEmail}/role`));
                        const roleId = myRoleSnap.val();
                        if (sData.owner === auth.currentUser.email || roleId === 'owner') {
                            myServerPerms = { admin: true, manageChannels: true, deleteMessages: true };
                        } else if (roleId && roleId !== 'member') {
                            const pSnap = await get(ref(db, `servers/${serverId}/roles/${roleId}`));
                            if(pSnap.exists()) myServerPerms = pSnap.val().perms || {};
                        } else { 
                            myServerPerms = { admin: false, manageChannels: false, deleteMessages: false }; 
                        }

                        document.getElementById('menu-server-settings').style.display = myServerPerms.admin ? 'block' : 'none';
                        document.getElementById('menu-add-category').style.display = myServerPerms.manageChannels || myServerPerms.admin ? 'block' : 'none';
                        document.getElementById('menu-add-text').style.display = myServerPerms.manageChannels || myServerPerms.admin ? 'block' : 'none';
                        document.getElementById('menu-add-voice').style.display = myServerPerms.manageChannels || myServerPerms.admin ? 'block' : 'none';

                        loadChannels(serverId);
                        loadMemberList(serverId); // Load the member list right away
                    });
                    
                    serverList.appendChild(div);
                    if (unreadState.servers.has(serverId)) {
                        updateBadge(`server-${serverId}`, true, true);
                    }
                }
            });
        });
    });
}

// Dropdown Menus
document.getElementById('server-header-clickable').addEventListener('click', (e) => { 
    e.stopPropagation(); 
    if (currentServerId) { 
        const d = document.getElementById('server-dropdown'); 
        d.style.display = d.style.display === 'none' ? 'block' : 'none'; 
    } 
});

document.getElementById('menu-add-category').addEventListener('click', () => { 
    openInputModal("Add Category", "Category Name", "", (name) => { 
        if (name && currentServerId) {
            push(ref(db, `categories/${currentServerId}`), { name: name.toUpperCase(), order: 99 }); 
        }
    }); 
    document.getElementById('server-dropdown').style.display='none'; 
});

document.getElementById('menu-add-text').addEventListener('click', () => { 
    openInputModal("Add Text Channel", "channel-name", "", (name) => { 
        if (name && currentServerId) {
            push(ref(db, `channels/${currentServerId}`), { name: name.toLowerCase(), type: "text", order: 99 }); 
        }
    }); 
    document.getElementById('server-dropdown').style.display='none'; 
});

document.getElementById('menu-add-voice').addEventListener('click', () => { 
    openInputModal("Add Voice Channel", "Lounge", "", (name) => { 
        if (name && currentServerId) {
            push(ref(db, `channels/${currentServerId}`), { name: name, type: "voice", order: 99 }); 
        }
    }); 
    document.getElementById('server-dropdown').style.display='none'; 
});

document.getElementById('menu-invite').addEventListener('click', () => { 
    if (currentServerId) { 
        const link = `${appBaseUrl}?invite=${currentServerId}`; 
        navigator.clipboard.writeText(link).then(() => {
            customAlert(`Link copied!\n${link}`, "Success");
        }).catch(() => {
            openInputModal("Copy Link", "", "", ()=>{}, link);
        }); 
    } 
    document.getElementById('server-dropdown').style.display='none'; 
});

// Server Settings
let tempServerIcon = null;
document.getElementById('menu-server-settings').addEventListener('click', async () => {
    document.getElementById('server-dropdown').style.display='none';
    const sSnap = await get(ref(db, `servers/${currentServerId}`));
    const sData = sSnap.val();
    
    document.getElementById('ss-server-name').value = sData.name;
    const preview = document.getElementById('ss-icon-preview');
    
    if(sData.icon) { 
        preview.style.backgroundImage = `url(${sData.icon})`; 
        preview.innerText = ""; 
        tempServerIcon = sData.icon; 
    } else { 
        preview.style.backgroundImage = 'none'; 
        preview.innerText = sData.name.charAt(0); 
    }
    
    document.getElementById('server-settings-modal').style.display = 'flex';
    loadRoles();
});

document.getElementById('close-server-settings-btn').addEventListener('click', () => {
    document.getElementById('server-settings-modal').style.display = 'none';
});

document.getElementById('ss-icon-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) { 
        const reader = new FileReader(); 
        reader.onloadend = () => { 
            tempServerIcon = reader.result; 
            document.getElementById('ss-icon-preview').style.backgroundImage = `url(${tempServerIcon})`; 
            document.getElementById('ss-icon-preview').innerText = ""; 
        }; 
        reader.readAsDataURL(file); 
    }
});

document.getElementById('ss-save-overview-btn').addEventListener('click', () => {
    const newName = document.getElementById('ss-server-name').value.trim();
    if(newName && currentServerId) { 
        update(ref(db, `servers/${currentServerId}`), {name: newName, icon: tempServerIcon}); 
        customAlert("Server updated!"); 
    }
});

// Roles UI Logic & Drag/Drop
document.getElementById('tab-overview').addEventListener('click', (e) => { 
    e.target.style.color='white'; 
    document.getElementById('tab-roles').style.color='gray'; 
    document.getElementById('ss-overview').style.display='block'; 
    document.getElementById('ss-roles').style.display='none'; 
});

document.getElementById('tab-roles').addEventListener('click', (e) => { 
    e.target.style.color='white'; 
    document.getElementById('tab-overview').style.color='gray'; 
    document.getElementById('ss-roles').style.display='block'; 
    document.getElementById('ss-overview').style.display='none'; 
});

let dragRoleEl = null;

function loadRoles() {
    const list = document.getElementById('ss-roles-list');
    onValue(ref(db, `servers/${currentServerId}/roles`), (snap) => {
        list.innerHTML = '';
        
        // Convert to array and sort by order
        let rolesArray = [];
        snap.forEach(childSnapshot => {
            let data = childSnapshot.val();
            data.id = childSnapshot.key;
            rolesArray.push(data);
        });
        rolesArray.sort((a,b) => (a.order || 0) - (b.order || 0));

        rolesArray.forEach(rData => {
            const roleId = rData.id;
            const div = document.createElement('div'); 
            div.className = 'role-setting-item';
            div.id = `role-set-${roleId}`;
            div.draggable = true;
            
            div.innerHTML = `
                <div style="color: ${rData.color}; font-weight: bold; pointer-events: none;">☰ ${rData.name}</div>
                <div>
                    <label style="font-size:11px; margin-right:5px;">
                        <input type="checkbox" ${rData.perms.admin?'checked':''} class="r-perm" data-role="${roleId}" data-perm="admin"> Admin
                    </label>
                    <label style="font-size:11px; margin-right:5px;">
                        <input type="checkbox" ${rData.perms.manageChannels?'checked':''} class="r-perm" data-role="${roleId}" data-perm="manageChannels"> Channels
                    </label>
                    <label style="font-size:11px;">
                        <input type="checkbox" ${rData.perms.deleteMessages?'checked':''} class="r-perm" data-role="${roleId}" data-perm="deleteMessages"> Delete Msg
                    </label>
                </div>
            `;
            
            // Drag and Drop for Roles
            div.addEventListener('dragstart', (e) => { 
                dragRoleEl = div; 
                e.dataTransfer.effectAllowed = 'move'; 
                e.dataTransfer.setData('text/html', div.innerHTML); 
            });
            
            div.addEventListener('dragover', (e) => { 
                e.preventDefault(); 
                e.dataTransfer.dropEffect = 'move'; 
                div.classList.add('drag-over'); 
                return false; 
            });
            
            div.addEventListener('dragleave', (e) => { 
                div.classList.remove('drag-over'); 
            });
            
            div.addEventListener('drop', (e) => {
                e.stopPropagation(); 
                div.classList.remove('drag-over');
                if (dragRoleEl !== div) {
                    const srcId = dragRoleEl.id.replace('role-set-', ''); 
                    const tgtId = div.id.replace('role-set-', '');
                    update(ref(db, `servers/${currentServerId}/roles/${srcId}`), { order: (rData.order || 0) - 0.5 });
                }
                return false;
            });

            list.appendChild(div);
        });
        
        document.querySelectorAll('.r-perm').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const rId = e.target.getAttribute('data-role'); 
                const p = e.target.getAttribute('data-perm');
                update(ref(db, `servers/${currentServerId}/roles/${rId}/perms`), { [p]: e.target.checked });
            });
        });
    });
}

document.getElementById('ss-create-role-btn').addEventListener('click', () => {
    const name = document.getElementById('ss-new-role-name').value; 
    const color = document.getElementById('ss-new-role-color').value;
    
    if(name && currentServerId) {
        push(ref(db, `servers/${currentServerId}/roles`), { 
            name, 
            color, 
            order: Date.now(), // Easy default ordering
            perms: {admin:false, manageChannels:false, deleteMessages:false} 
        });
        document.getElementById('ss-new-role-name').value = '';
    }
});

// Member List Loading & UI
let userToManageEmail = null;

document.getElementById('toggle-members-btn').addEventListener('click', () => {
    const sidebar = document.getElementById('member-sidebar');
    if (sidebar.style.display === 'none') {
        sidebar.style.display = 'flex';
    } else {
        sidebar.style.display = 'none';
    }
});

document.getElementById('close-role-modal-btn').addEventListener('click', () => {
    document.getElementById('assign-role-modal').style.display = 'none';
});

document.getElementById('save-role-btn').addEventListener('click', () => {
    const roleId = document.getElementById('assign-role-select').value;
    if (userToManageEmail && currentServerId) {
        update(ref(db, `server_members/${currentServerId}/${userToManageEmail}`), { role: roleId });
        document.getElementById('assign-role-modal').style.display = 'none';
    }
});

function loadMemberList(serverId) {
    if(unsubscribeMembers) unsubscribeMembers();

    const listContent = document.getElementById('member-list-content');
    
    unsubscribeMembers = onValue(ref(db, `server_members/${serverId}`), async (membersSnap) => {
        const rolesSnap = await get(ref(db, `servers/${serverId}/roles`));
        let rolesData = {};
        if (rolesSnap.exists()) {
            rolesData = rolesSnap.val();
        }

        // Default Groups
        let groups = {
            owner: { name: "Server Owner", order: -2, members: [] },
            online: { name: "Online", order: 9998, members: [] },
            offline: { name: "Offline", order: 9999, members: [] }
        };

        // Add Custom Role Groups
        Object.keys(rolesData).forEach(rId => {
            groups[rId] = { 
                name: rolesData[rId].name, 
                order: rolesData[rId].order || 0, 
                color: rolesData[rId].color,
                members: [] 
            };
        });

        // Loop through members, fetch data, and categorize
        const memberPromises = [];
        membersSnap.forEach(mSnap => {
            const memberEmail = mSnap.key;
            const memberInfo = mSnap.val();
            
            const p = get(child(ref(db), `users/${memberEmail}`)).then(uSnap => {
                if (uSnap.exists()) {
                    const uData = uSnap.val();
                    const status = uData.status || 'offline';
                    let targetGroup = 'offline';

                    if (memberInfo.role === 'owner') {
                        targetGroup = 'owner';
                    } else if (memberInfo.role && memberInfo.role !== 'member' && groups[memberInfo.role]) {
                        targetGroup = memberInfo.role;
                    } else if (status !== 'offline' && status !== 'invisible') {
                        targetGroup = 'online';
                    }

                    groups[targetGroup].members.push({ email: memberEmail, data: uData, status: status });
                }
            });
            memberPromises.push(p);
        });

        await Promise.all(memberPromises);

        // Render List
        listContent.innerHTML = '';
        const sortedGroupKeys = Object.keys(groups).sort((a,b) => groups[a].order - groups[b].order);

        sortedGroupKeys.forEach(gKey => {
            const group = groups[gKey];
            if (group.members.length === 0) return;

            const catDiv = document.createElement('div');
            catDiv.className = 'member-category';
            catDiv.innerText = `${group.name} — ${group.members.length}`;
            listContent.appendChild(catDiv);

            group.members.forEach(m => {
                const mDiv = document.createElement('div');
                mDiv.className = 'member-item';
                
                let nameColor = group.color || "white";
                if(gKey === 'owner' || gKey === 'online' || gKey === 'offline') nameColor = "white"; // Only colorize custom roles

                mDiv.innerHTML = `
                    <div class="avatar-container">
                        <img src="${m.data.avatar}" class="avatar-small">
                        <div class="status-indicator status-${m.status}"></div>
                    </div>
                    <div class="member-username" style="color: ${nameColor};">${m.data.username}</div>
                `;

                // Admin functionality to assign roles
                mDiv.addEventListener('click', () => {
                    if (!myServerPerms.admin || m.email === auth.currentUser.email) return; // Cant edit self or without perms
                    userToManageEmail = m.email;
                    
                    const select = document.getElementById('assign-role-select');
                    select.innerHTML = `<option value="member">Member (Default)</option>`;
                    Object.keys(rolesData).forEach(rId => {
                        select.innerHTML += `<option value="${rId}">${rolesData[rId].name}</option>`;
                    });
                    
                    // Select current role
                    select.value = membersSnap.val()[m.email].role || 'member';
                    
                    document.getElementById('assign-role-modal').style.display = 'flex';
                });

                listContent.appendChild(mDiv);
            });
        });
    });
}

// Drag and Drop Channels
let dragSrcEl = null;

function loadChannels(serverId) {
    const channelList = document.getElementById('channel-list');
    
    onValue(ref(db, `channels/${serverId}`), async (cSnap) => {
        const catSnap = await get(ref(db, `categories/${serverId}`));
        let categories = { "uncategorized": { name: "UNCATEGORIZED", order: -1 } };
        
        if(catSnap.exists()) { 
            catSnap.forEach(c => categories[c.key] = c.val() ); 
        }
        
        let grouped = {};
        Object.keys(categories).forEach(k => grouped[k] = []);
        
        cSnap.forEach(cChild => {
            const c = cChild.val(); 
            c.id = cChild.key;
            const cid = c.categoryId && categories[c.categoryId] ? c.categoryId : "uncategorized";
            grouped[cid].push(c);
        });

        const sortedCats = Object.keys(categories).sort((a,b) => categories[a].order - categories[b].order);
        
        channelList.innerHTML = '';
        sortedCats.forEach(catId => {
            if(grouped[catId].length === 0 && catId === "uncategorized") return;
            
            if(catId !== "uncategorized") {
                const catDiv = document.createElement('div'); 
                catDiv.className = 'channel-category'; 
                catDiv.innerText = `⌄ ${categories[catId].name}`;
                channelList.appendChild(catDiv);
            }

            grouped[catId].sort((a,b) => (a.order||0) - (b.order||0)).forEach(channelData => {
                const div = document.createElement('div'); 
                div.classList.add('channel-item'); 
                div.id = `channel-${channelData.id}`;
                div.draggable = myServerPerms.admin || myServerPerms.manageChannels;
                
                div.innerHTML = channelData.type === "voice" ? `🔊 ${channelData.name}` : `# ${channelData.name}`;
                
                div.addEventListener('click', () => {
                    if(channelData.type === "voice") {
                        joinVoiceChannel(serverId, channelData.id);
                    } else { 
                        chatType = 'server'; 
                        currentChatId = channelData.id; 
                        document.getElementById('chat-title').innerText = `# ${channelData.name}`; 
                        enableChat(); 
                        loadMessages(`messages/${channelData.id}`, `# ${channelData.name}`); 
                    }
                });

                div.addEventListener('contextmenu', (e) => showContextMenu(e, 'channel', channelData.id));
                let touchTimer;
                div.addEventListener('touchstart', (e) => { 
                    touchTimer = setTimeout(() => showContextMenu(e, 'channel', channelData.id), 500); 
                });
                div.addEventListener('touchend', () => clearTimeout(touchTimer));
                div.addEventListener('touchmove', () => clearTimeout(touchTimer));

                div.addEventListener('dragstart', (e) => { 
                    dragSrcEl = div; 
                    e.dataTransfer.effectAllowed = 'move'; 
                    e.dataTransfer.setData('text/html', div.innerHTML); 
                });
                
                div.addEventListener('dragover', (e) => { 
                    e.preventDefault(); 
                    e.dataTransfer.dropEffect = 'move'; 
                    div.classList.add('drag-over'); 
                    return false; 
                });
                
                div.addEventListener('dragleave', (e) => { 
                    div.classList.remove('drag-over'); 
                });
                
                div.addEventListener('drop', (e) => {
                    e.stopPropagation(); 
                    div.classList.remove('drag-over');
                    if (dragSrcEl !== div) {
                        const srcId = dragSrcEl.id.replace('channel-', ''); 
                        const tgtId = div.id.replace('channel-', '');
                        update(ref(db, `channels/${serverId}/${srcId}`), { order: channelData.order - 0.5 });
                    }
                    return false;
                });

                channelList.appendChild(div);
                if (unreadState.channels.has(channelData.id)) {
                    updateBadge(`channel-${channelData.id}`, true, false);
                }
            });
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
        call.on('stream', stream => addVoiceUserUI(cEmail, stream)); 
        activeCalls[cEmail] = call; 
        call.on('close', () => removeVoiceUserUI(cEmail)); 
    }); 
}

async function joinVoiceChannel(serverId, channelId) { 
    if (currentVoiceChannel === channelId) return; 
    if (!myCurrentPeerId) return customAlert("Voice server connecting..."); 
    
    leaveVoiceChannel(); 
    
    try { 
        localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true }); 
        currentVoiceChannel = channelId; 
        document.getElementById('voice-area').style.display = 'flex'; 
        
        const vcRef = ref(db, `voice_rosters/${serverId}/${channelId}/${currentUserSafeEmail}`); 
        await set(vcRef, myCurrentPeerId); 
        onDisconnect(vcRef).remove(); 
        
        onValue(ref(db, `voice_rosters/${serverId}/${channelId}`), (snap) => { 
            snap.forEach((childSnapshot) => { 
                const pEmail = childSnapshot.key; 
                const pId = childSnapshot.val(); 
                if (pEmail !== currentUserSafeEmail && !activeCalls[pEmail]) { 
                    const call = myPeer.call(pId, localAudioStream, { metadata: { callerEmail: currentUserSafeEmail } }); 
                    call.on('stream', stream => addVoiceUserUI(pEmail, stream)); 
                    call.on('close', () => removeVoiceUserUI(pEmail)); 
                    activeCalls[pEmail] = call; 
                } 
            }); 
        }); 
    } catch (err) { 
        customAlert("Mic access denied.", "Error"); 
    } 
}

function leaveVoiceChannel() { 
    if (!currentVoiceChannel) return; 
    
    Object.keys(activeCalls).forEach(pEmail => { 
        activeCalls[pEmail].close(); 
        removeVoiceUserUI(pEmail); 
    }); 
    activeCalls = {}; 
    
    if (localAudioStream) {
        localAudioStream.getTracks().forEach(track => track.stop()); 
    }
    
    remove(ref(db, `voice_rosters/${currentServerId}/${currentVoiceChannel}/${currentUserSafeEmail}`)); 
    currentVoiceChannel = null; 
    
    document.getElementById('voice-area').style.display = 'none'; 
    document.getElementById('voice-users-list').innerHTML = ''; 
}

document.getElementById('disconnect-vc-btn').addEventListener('click', leaveVoiceChannel);

document.getElementById('mute-btn').addEventListener('click', (e) => { 
    isMuted = !isMuted; 
    if(localAudioStream) {
        localAudioStream.getAudioTracks()[0].enabled = !isMuted; 
    }
    e.target.classList.toggle('muted-state'); 
});

document.getElementById('deafen-btn').addEventListener('click', (e) => { 
    isDeafened = !isDeafened; 
    e.target.classList.toggle('muted-state'); 
    document.querySelectorAll('.vc-audio-element').forEach(audio => audio.muted = isDeafened); 
});

function addVoiceUserUI(peerEmail, stream) { 
    if (document.getElementById(`vc-user-${peerEmail}`)) return; 
    
    const list = document.getElementById('voice-users-list'); 
    const div = document.createElement('div'); 
    div.classList.add('vc-user'); 
    div.id = `vc-user-${peerEmail}`; 
    
    get(child(ref(db), `users/${peerEmail}`)).then(snap => { 
        div.innerHTML = `
            <span>👤 ${snap.exists() ? snap.val().username : peerEmail}</span>
            <input type="range" min="0" max="1" step="0.01" value="1" id="vol-${peerEmail}">
            <audio id="audio-${peerEmail}" class="vc-audio-element" autoplay></audio>
        `; 
        list.appendChild(div); 
        
        const audio = document.getElementById(`audio-${peerEmail}`); 
        audio.srcObject = stream; 
        
        if(isDeafened) {
            audio.muted = true; 
        }
        
        document.getElementById(`vol-${peerEmail}`).addEventListener('input', (e) => {
            audio.volume = e.target.value;
        }); 
    }); 
}

function removeVoiceUserUI(peerEmail) { 
    const el = document.getElementById(`vc-user-${peerEmail}`); 
    if (el) el.remove(); 
}

// ==========================================
// --- MESSAGES, EMBEDS & NOTIFICATIONS ---
// ==========================================
function enableChat() { 
    document.getElementById('msg-input').disabled = false; 
    document.getElementById('send-btn').disabled = false; 
    document.getElementById('upload-img-btn').disabled = false; 
    document.body.classList.add('mobile-chat-active'); 
}

async function buildMessageHtml(data) {
    let contentHtml = `<div style="margin-left: 42px; word-break: break-word;">${data.text || ''}</div>`;
    
    const inviteRegex = new RegExp(`${appBaseUrl.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\?invite=([a-zA-Z0-9]+)`, 'g');
    let match;
    
    while ((match = inviteRegex.exec(data.text)) !== null) {
        const inviteCode = match[1];
        const sSnap = await get(ref(db, `servers/${inviteCode}`));
        if(sSnap.exists()) {
            const sData = sSnap.val();
            const iconHtml = sData.icon 
                ? `<div class="invite-embed-icon" style="background-image:url(${sData.icon})"></div>` 
                : `<div class="invite-embed-icon">${sData.name.charAt(0)}</div>`;
                
            contentHtml += `
                <div class="invite-embed" style="margin-left: 42px;">
                    <h4>You've been invited to join a server</h4>
                    <div class="invite-embed-content">
                        ${iconHtml}
                        <div class="invite-embed-info">
                            <div class="invite-embed-name">${sData.name}</div>
                            <button onclick="window.location.href='${appBaseUrl}?invite=${inviteCode}'" style="margin:0; padding:5px 15px; background:#3ba55c;">Join</button>
                        </div>
                    </div>
                </div>`;
        }
    }

    if (data.imageUrl) { 
        contentHtml += `<img src="${data.imageUrl}" class="message-image" style="margin-left: 42px;">`; 
    }
    return contentHtml;
}

function loadMessages(dbPath, chatNameLabel) {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.innerHTML = ''; 
    
    messagesDiv.innerHTML = `
        <div class="welcome-message">
            <h1>Welcome to ${chatNameLabel}!</h1>
            <p>This is the start of the ${chatNameLabel} channel.</p>
        </div>
    `;
    
    if (unsubscribeMessages) unsubscribeMessages();
    if (unsubscribeMessagesRemoved) unsubscribeMessagesRemoved();

    unsubscribeMessages = onChildAdded(ref(db, dbPath), async (snapshot) => {
        const data = snapshot.val();
        const msgElement = document.createElement('div');
        msgElement.classList.add('message');
        msgElement.id = `msg-${snapshot.key}`;
        
        let deleteBtnHtml = '';
        if (data.sender === auth.currentUser.email || (chatType === 'server' && (myServerPerms.admin || myServerPerms.deleteMessages))) {
            deleteBtnHtml = `<button class="msg-delete-btn">🗑️ Delete</button>`;
        }

        let nameColor = "white";
        if(chatType === 'server' && data.roleId && data.roleId !== 'member' && data.roleId !== 'owner') {
            const rSnap = await get(ref(db, `servers/${currentServerId}/roles/${data.roleId}`));
            if(rSnap.exists()) nameColor = rSnap.val().color;
        }

        const contentHtml = await buildMessageHtml(data);

        msgElement.innerHTML = `
            <div class="message-header">
                <img src="${data.avatar}" class="avatar-small">
                <span class="message-sender" style="color: ${nameColor};">${data.username}</span>
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
    
    if (chatType === 'dm') {
        clearUnread('dm', currentChatId); 
    } else if (chatType === 'server') {
        clearUnread('channel', currentChatId, currentServerId);
    }
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

async function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    
    if (text !== "" && currentChatId) {
        const path = chatType === 'server' ? `messages/${currentChatId}` : `dms/${currentChatId}`;
        let roleId = 'member';
        
        if(chatType === 'server') { 
            const mSnap = await get(ref(db, `server_members/${currentServerId}/${currentUserSafeEmail}/role`)); 
            roleId = mSnap.val() || 'member'; 
        }
        
        push(ref(db, path), { 
            sender: auth.currentUser.email, 
            username: myProfile.username, 
            avatar: myProfile.avatar, 
            text: text, 
            timestamp: Date.now(), 
            roleId: roleId 
        });
        
        input.value = "";
    }
}

document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('msg-input').addEventListener('keypress', (e) => { 
    if (e.key === 'Enter') sendMessage(); 
});

document.getElementById('upload-img-btn').addEventListener('click', () => {
    document.getElementById('image-upload').click();
});

document.getElementById('image-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0]; 
    if (!file || !currentChatId) return;
    
    if (file.size > 2 * 1024 * 1024) {
        return customAlert("File too large. Please select an image under 2MB.", "Error");
    }
    
    let roleId = 'member';
    if(chatType === 'server') { 
        const mSnap = await get(ref(db, `server_members/${currentServerId}/${currentUserSafeEmail}/role`)); 
        roleId = mSnap.val() || 'member'; 
    }

    const reader = new FileReader();
    reader.onloadend = () => {
        push(ref(db, chatType === 'server' ? `messages/${currentChatId}` : `dms/${currentChatId}`), { 
            sender: auth.currentUser.email, 
            username: myProfile.username, 
            avatar: myProfile.avatar, 
            text: "", 
            imageUrl: reader.result, 
            timestamp: Date.now(), 
            roleId: roleId 
        });
        document.getElementById('image-upload').value = "";
    };
    reader.readAsDataURL(file);
});

document.getElementById('close-image-modal').addEventListener('click', () => {
    document.getElementById('image-modal').style.display = 'none';
});

// Notifications
function startNotificationListeners() {
    onValue(ref(db, `users/${currentUserSafeEmail}/friends`), (snap) => { 
        snap.forEach(childSnapshot => { 
            const dmId = childSnapshot.val().dmId; 
            onChildAdded(query(ref(db, `dms/${dmId}`), limitToLast(1)), (msg) => { 
                if (currentChatId !== dmId && msg.val().timestamp > appStartTime) {
                    markUnread('dm', dmId); 
                }
            }); 
        }); 
    });
    
    onValue(ref(db, `users/${currentUserSafeEmail}/servers`), (snap) => { 
        snap.forEach(childSnapshot => { 
            const serverId = childSnapshot.key; 
            onValue(ref(db, `channels/${serverId}`), (cSnap) => { 
                cSnap.forEach(c => { 
                    if (c.val().type === 'text') {
                        onChildAdded(query(ref(db, `messages/${c.key}`), limitToLast(1)), (msg) => { 
                            if (currentChatId !== c.key && msg.val().timestamp > appStartTime) {
                                markUnread('channel', c.key, serverId); 
                            }
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

function updateBadge(id, show, isDot = false) { 
    const el = document.getElementById(id); 
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