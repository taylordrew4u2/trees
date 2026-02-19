// auth.js – User Authentication & File Storage System (Dexie.js / IndexedDB)
// ────────────────────────────────────────────────────────────────────────────
// Local-first approach: all data lives on the user's device in IndexedDB.
// Each browser tab maintains its own session via sessionStorage.
// ────────────────────────────────────────────────────────────────────────────

// ─── Database Setup ─────────────────────────────────────────────────────────
// Dexie wraps IndexedDB with a clean Promise/async-await API.
// We define two stores: `users` (credentials) and `userFiles` (per-user data).

const userDB = new Dexie('UserAppDB');

userDB.version(1).stores({
    users:     '++id, &username',
    userFiles: '++id, ownerId'
});

// v2 adds a dedicated jokes table
userDB.version(2).stores({
    users:     '++id, &username',
    userFiles: '++id, ownerId',
    jokes:     '++id, ownerId, folder'
});

// ─── Password Hashing Helpers ───────────────────────────────────────────────
// Uses the browser's built-in SubtleCrypto (Web Crypto API) to derive a
// PBKDF2 hash with a random salt.  No external library needed.

async function hashPassword(plainText) {
    const encoder = new TextEncoder();
    // Generate a random 16-byte salt for each password
    const salt = crypto.getRandomValues(new Uint8Array(16));

    // Import the password as a CryptoKey
    const keyMaterial = await crypto.subtle.importKey(
        'raw', encoder.encode(plainText), 'PBKDF2', false, ['deriveBits']
    );

    // Derive 256 bits using PBKDF2 with 100 000 iterations and SHA-256
    const derivedBits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial, 256
    );

    // Store salt + hash together so we can verify later
    const hashArray = Array.from(new Uint8Array(derivedBits));
    const saltArray = Array.from(salt);
    return JSON.stringify({ salt: saltArray, hash: hashArray });
}

async function verifyPassword(plainText, storedJSON) {
    const { salt, hash: storedHash } = JSON.parse(storedJSON);
    const encoder   = new TextEncoder();
    const saltBytes = new Uint8Array(salt);

    const keyMaterial = await crypto.subtle.importKey(
        'raw', encoder.encode(plainText), 'PBKDF2', false, ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
        keyMaterial, 256
    );

    const derivedArray = Array.from(new Uint8Array(derivedBits));
    // Constant-time-ish comparison (good enough for client-side)
    return derivedArray.length === storedHash.length &&
           derivedArray.every((byte, i) => byte === storedHash[i]);
}

// ─── User Registration ──────────────────────────────────────────────────────
// Creates a new account.  Throws if username is taken.

async function registerUser(username, password) {
    const trimmed = username.trim().toLowerCase();
    if (!trimmed)   throw new Error('Username cannot be empty.');
    if (trimmed.length < 3) throw new Error('Username must be at least 3 characters.');
    if (!password || password.length < 4) throw new Error('Password must be at least 4 characters.');

    // Check uniqueness via the &username index
    const existing = await userDB.users.where('username').equals(trimmed).first();
    if (existing)   throw new Error('Username already taken.');

    // Hash the password before storing (never store plaintext)
    const hashedPassword = await hashPassword(password);

    const id = await userDB.users.add({
        username:  trimmed,
        password:  hashedPassword,
        createdAt: new Date().toISOString()
    });

    return id;   // Return the auto-generated user ID
}

// ─── User Login ─────────────────────────────────────────────────────────────
// Validates credentials and creates a session (sessionStorage).

async function loginUser(username, password) {
    const trimmed = username.trim().toLowerCase();
    const user = await userDB.users.where('username').equals(trimmed).first();
    if (!user) throw new Error('User not found.');

    const valid = await verifyPassword(password, user.password);
    if (!valid) throw new Error('Incorrect password.');

    // Persist session for this tab
    sessionStorage.setItem('currentUserId', user.id);
    sessionStorage.setItem('currentUsername', user.username);
    return user;
}

// ─── Logout ─────────────────────────────────────────────────────────────────

function logoutUser() {
    sessionStorage.removeItem('currentUserId');
    sessionStorage.removeItem('currentUsername');
}

// ─── Session Helpers ────────────────────────────────────────────────────────

function getCurrentUserId() {
    const id = sessionStorage.getItem('currentUserId');
    return id ? Number(id) : null;
}

function getCurrentUsername() {
    return sessionStorage.getItem('currentUsername') || null;
}

function requireAuth() {
    const uid = getCurrentUserId();
    if (!uid) throw new Error('Not authenticated. Please log in.');
    return uid;
}

// ─── User Files CRUD ────────────────────────────────────────────────────────
// All file operations automatically scope to the logged-in user via ownerId.

async function saveUserFile(fileName, fileContent) {
    const ownerId = requireAuth();
    if (!fileName || !fileName.trim()) throw new Error('File name is required.');

    const id = await userDB.userFiles.add({
        ownerId,
        fileName:    fileName.trim(),
        fileContent, // can be string, Blob, ArrayBuffer, etc.
        lastUpdated: new Date().toISOString()
    });
    return id;
}

async function getUserFiles() {
    const ownerId = requireAuth();
    // Use the ownerId index to fetch only this user's files
    return userDB.userFiles.where('ownerId').equals(ownerId).toArray();
}

async function getUserFile(fileId) {
    const ownerId = requireAuth();
    const file = await userDB.userFiles.get(fileId);
    if (!file || file.ownerId !== ownerId) throw new Error('File not found.');
    return file;
}

async function updateUserFile(fileId, newContent) {
    const ownerId = requireAuth();
    const file = await userDB.userFiles.get(fileId);
    if (!file || file.ownerId !== ownerId) throw new Error('File not found or access denied.');

    await userDB.userFiles.update(fileId, {
        fileContent: newContent,
        lastUpdated: new Date().toISOString()
    });
}

async function renameUserFile(fileId, newName) {
    const ownerId = requireAuth();
    const file = await userDB.userFiles.get(fileId);
    if (!file || file.ownerId !== ownerId) throw new Error('File not found or access denied.');

    await userDB.userFiles.update(fileId, {
        fileName:    newName.trim(),
        lastUpdated: new Date().toISOString()
    });
}

async function deleteUserFile(fileId) {
    const ownerId = requireAuth();
    const file = await userDB.userFiles.get(fileId);
    if (!file || file.ownerId !== ownerId) throw new Error('File not found or access denied.');

    await userDB.userFiles.delete(fileId);
}

// ─── Auth UI Controller ─────────────────────────────────────────────────────
// Manages the auth gate overlay: login / register forms, session check on load.

function initAuthGate() {
    const gate         = document.getElementById('auth-gate');
    const appEl        = document.getElementById('app');
    const loginForm    = document.getElementById('auth-login-form');
    const registerForm = document.getElementById('auth-register-form');
    const switchToReg  = document.getElementById('switch-to-register');
    const switchToLog  = document.getElementById('switch-to-login');
    const loginPanel   = document.getElementById('auth-login-panel');
    const regPanel     = document.getElementById('auth-register-panel');
    const loginError   = document.getElementById('auth-login-error');
    const regError     = document.getElementById('auth-register-error');
    const regSuccess   = document.getElementById('auth-register-success');

    // If already logged in (same tab session), skip the gate
    if (getCurrentUserId()) {
        gate.style.display = 'none';
        appEl.style.display = '';
        updateAuthUI();
        return true;  // already authenticated
    }

    // Show the gate, hide the app
    gate.style.display = 'flex';
    appEl.style.display = 'none';

    // Toggle between login / register panels
    switchToReg.addEventListener('click', e => {
        e.preventDefault();
        loginPanel.style.display  = 'none';
        regPanel.style.display    = 'block';
        loginError.style.display  = 'none';
        regError.style.display    = 'none';
        regSuccess.style.display  = 'none';
    });

    switchToLog.addEventListener('click', e => {
        e.preventDefault();
        regPanel.style.display    = 'none';
        loginPanel.style.display  = 'block';
        loginError.style.display  = 'none';
        regError.style.display    = 'none';
        regSuccess.style.display  = 'none';
    });

    // ── Login submit ──
    loginForm.addEventListener('submit', async e => {
        e.preventDefault();
        loginError.style.display = 'none';
        const username = document.getElementById('auth-login-user').value;
        const password = document.getElementById('auth-login-pass').value;

        try {
            await loginUser(username, password);
            // Success → hide gate, show app, initialize
            gate.style.animation = 'authFadeOut 0.3s forwards';
            setTimeout(() => {
                gate.style.display = 'none';
                appEl.style.display = '';
                updateAuthUI();
                // Boot the app now that the user is authenticated
                if (typeof window.initApp === 'function') window.initApp();
            }, 300);
        } catch (err) {
            loginError.textContent   = err.message;
            loginError.style.display = 'block';
            // Shake the input
            const input = document.getElementById('auth-login-pass');
            input.classList.add('input-shake');
            setTimeout(() => input.classList.remove('input-shake'), 400);
        }
    });

    // ── Register submit ──
    registerForm.addEventListener('submit', async e => {
        e.preventDefault();
        regError.style.display   = 'none';
        regSuccess.style.display = 'none';
        const username = document.getElementById('auth-reg-user').value;
        const password = document.getElementById('auth-reg-pass').value;
        const confirm  = document.getElementById('auth-reg-confirm').value;

        if (password !== confirm) {
            regError.textContent   = 'Passwords do not match.';
            regError.style.display = 'block';
            return;
        }

        try {
            await registerUser(username, password);
            regSuccess.textContent   = 'Account created! You can now log in.';
            regSuccess.style.display = 'block';
            // Auto-switch to login after short delay
            setTimeout(() => {
                regPanel.style.display    = 'none';
                loginPanel.style.display  = 'block';
                regSuccess.style.display  = 'none';
                // Pre-fill username
                document.getElementById('auth-login-user').value = username.trim().toLowerCase();
            }, 1500);
        } catch (err) {
            regError.textContent   = err.message;
            regError.style.display = 'block';
        }
    });

    return false; // not authenticated yet
}

// Update UI elements that reflect the current user (e.g. username badge, logout)
function updateAuthUI() {
    const name = getCurrentUsername();
    const badge = document.getElementById('auth-user-badge');
    if (badge) badge.textContent = name || '';

    const logoutBtn = document.getElementById('auth-logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = () => {
            logoutUser();
            window.location.reload();
        };
    }
}

// ─── User Files Panel ───────────────────────────────────────────────────────
// Renders the "My Files" area inside Settings or as a dedicated view.

async function renderUserFilesPanel() {
    const container = document.getElementById('user-files-list');
    if (!container) return;

    try {
        const files = await getUserFiles();

        if (files.length === 0) {
            container.innerHTML = '<p class="empty-text">No files yet. Create one below.</p>';
            return;
        }

        container.innerHTML = files.map(f => `
            <div class="uf-item" data-file-id="${f.id}">
                <div class="uf-info">
                    <span class="uf-name">${escapeHTML(f.fileName)}</span>
                    <span class="uf-date">${new Date(f.lastUpdated).toLocaleDateString()}</span>
                </div>
                <div class="uf-actions">
                    <button class="btn btn-ghost btn-sm uf-edit-btn" data-id="${f.id}" title="Edit">✏️</button>
                    <button class="btn btn-ghost btn-sm uf-delete-btn" data-id="${f.id}" title="Delete">🗑️</button>
                </div>
            </div>
        `).join('');

        // Edit buttons
        container.querySelectorAll('.uf-edit-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const fid = Number(btn.dataset.id);
                try {
                    const file = await getUserFile(fid);
                    const newContent = prompt('Edit file content:', file.fileContent || '');
                    if (newContent !== null) {
                        await updateUserFile(fid, newContent);
                        renderUserFilesPanel();
                    }
                } catch (err) {
                    alert(err.message);
                }
            });
        });

        // Delete buttons
        container.querySelectorAll('.uf-delete-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const fid = Number(btn.dataset.id);
                if (confirm('Delete this file?')) {
                    try {
                        await deleteUserFile(fid);
                        renderUserFilesPanel();
                    } catch (err) {
                        alert(err.message);
                    }
                }
            });
        });
    } catch (err) {
        container.innerHTML = `<p class="empty-text" style="color:var(--red);">${escapeHTML(err.message)}</p>`;
    }
}

function initUserFilesForm() {
    const form = document.getElementById('user-file-form');
    if (!form) return;

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const nameInput    = document.getElementById('uf-new-name');
        const contentInput = document.getElementById('uf-new-content');

        try {
            await saveUserFile(nameInput.value, contentInput.value);
            nameInput.value    = '';
            contentInput.value = '';
            renderUserFilesPanel();
        } catch (err) {
            alert(err.message);
        }
    });
}

// ─── Jokebook CRUD ──────────────────────────────────────────────────────────
// All joke operations are scoped to the logged-in user via ownerId.

async function getUsernameById(userId) {
    const user = await userDB.users.get(userId);
    return user ? user.username : null;
}

async function addJokeToJokebook(jokeText, folder = 'bitbuddy') {
    const ownerId = requireAuth();
    const now = new Date().toISOString();
    const id = await userDB.jokes.add({
        ownerId,
        folder:    (folder || 'bitbuddy').trim(),
        text:      jokeText,
        createdAt: now,
        updatedAt: now
    });
    return id;
}

async function getJokesByFolder(userId, folder) {
    if (!userId) throw new Error('User ID required.');
    if (folder) {
        return userDB.jokes
            .where('ownerId').equals(userId)
            .filter(j => j.folder === folder)
            .toArray();
    }
    return userDB.jokes.where('ownerId').equals(userId).toArray();
}

async function getAllJokebookFolders(userId) {
    if (!userId) throw new Error('User ID required.');
    const jokes = await userDB.jokes.where('ownerId').equals(userId).toArray();
    const folderSet = new Set(jokes.map(j => j.folder || 'bitbuddy'));
    folderSet.add('bitbuddy');
    return Array.from(folderSet).sort();
}

async function updateJokebookJoke(jokeId, newText) {
    const ownerId = requireAuth();
    const joke = await userDB.jokes.get(jokeId);
    if (!joke || joke.ownerId !== ownerId) throw new Error('Joke not found or access denied.');
    await userDB.jokes.update(jokeId, {
        text:      newText,
        updatedAt: new Date().toISOString()
    });
}

async function deleteJokebookJoke(jokeId) {
    const ownerId = requireAuth();
    const joke = await userDB.jokes.get(jokeId);
    if (!joke || joke.ownerId !== ownerId) throw new Error('Joke not found or access denied.');
    await userDB.jokes.delete(jokeId);
}

async function moveJokeToFolder(jokeId, newFolder) {
    const ownerId = requireAuth();
    const joke = await userDB.jokes.get(jokeId);
    if (!joke || joke.ownerId !== ownerId) throw new Error('Joke not found or access denied.');
    await userDB.jokes.update(jokeId, {
        folder:    (newFolder || 'bitbuddy').trim(),
        updatedAt: new Date().toISOString()
    });
}

// ─── AI ↔ Jokebook Command Parser ──────────────────────────────────────────

function parseJokebookCommand(utterance) {
    const lower = (utterance || '').toLowerCase();
    const addMatch = /(add|save|put|store)\b/.test(lower) &&
                     /(joke\s?book|jokebook|my book|my jokes)/.test(lower);
    if (!addMatch) return null;

    let folder = 'bitbuddy';
    const folderMatch = lower.match(/(?:to|in)\s+(?:the\s+)?(\w[\w\s]*?)\s+folder/);
    if (folderMatch) {
        folder = folderMatch[1].trim();
    } else if (/bitbuddy/.test(lower)) {
        folder = 'bitbuddy';
    }
    return { folder };
}

async function addJokeToFolder(jokeText, folderName = 'bitbuddy') {
    const uid = getCurrentUserId();
    if (!uid) return { success: false, message: 'Not logged in.' };
    try {
        await addJokeToJokebook(jokeText, folderName);
        return { success: true, message: `Joke saved to "${folderName}" folder!` };
    } catch (err) {
        return { success: false, message: err.message };
    }
}
