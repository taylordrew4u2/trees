// app.js – Comedy Set Organizer Web App

// ---------- Data Layer ----------
// Jokes and SetLists stored in localStorage
// Recordings stored in IndexedDB (audio blobs + metadata)

const STORAGE_KEYS = {
    JOKES: 'comedy_jokes',
    SETLISTS: 'comedy_setlists',
    FOLDERS: 'comedy_folders',
    OPENAI_KEY: 'openai_api_key',
};

// Initialize default data if empty
function initStorage() {
    if (!localStorage.getItem(STORAGE_KEYS.JOKES)) {
        localStorage.setItem(STORAGE_KEYS.JOKES, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SETLISTS)) {
        localStorage.setItem(STORAGE_KEYS.SETLISTS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.FOLDERS)) {
        localStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify([]));
    }
}

// Jokes CRUD
function getJokes() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.JOKES)) || [];
}

function saveJokes(jokes) {
    localStorage.setItem(STORAGE_KEYS.JOKES, JSON.stringify(jokes));
}

function addJoke(joke) {
    const jokes = getJokes();
    joke.id = crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random();
    joke.createdAt = new Date().toISOString();
    joke.updatedAt = joke.createdAt;
    jokes.push(joke);
    saveJokes(jokes);
    return joke;
}

function updateJoke(id, updates) {
    const jokes = getJokes();
    const index = jokes.findIndex(j => j.id === id);
    if (index !== -1) {
        jokes[index] = { ...jokes[index], ...updates, updatedAt: new Date().toISOString() };
        saveJokes(jokes);
        return jokes[index];
    }
    return null;
}

function deleteJoke(id) {
    let jokes = getJokes();
    jokes = jokes.filter(j => j.id !== id);
    saveJokes(jokes);
    // Set lists reference jokes by id; missing jokes are shown as warnings in the UI.
}

// Folders CRUD
function getFolders() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.FOLDERS)) || [];
}

function saveFolders(folders) {
    localStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(folders));
}

function addFolder(name) {
    const folders = getFolders();
    const normalized = name.trim();
    if (!normalized) return null;
    if (folders.some(f => f.name.toLowerCase() === normalized.toLowerCase())) return null;
    const folder = {
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random(),
        name: normalized,
        createdAt: new Date().toISOString(),
    };
    folders.push(folder);
    saveFolders(folders);
    return folder;
}

function deleteFolder(id) {
    const folders = getFolders().filter(f => f.id !== id);
    saveFolders(folders);
    // Clear folder assignment from jokes
    const jokes = getJokes().map(j => j.folderId === id ? { ...j, folderId: '' } : j);
    saveJokes(jokes);
}

function getApiKey() {
    return localStorage.getItem(STORAGE_KEYS.OPENAI_KEY) || '';
}

function saveApiKey(key) {
    localStorage.setItem(STORAGE_KEYS.OPENAI_KEY, key.trim());
}

// SetLists CRUD
function getSetLists() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.SETLISTS)) || [];
}

function saveSetLists(lists) {
    localStorage.setItem(STORAGE_KEYS.SETLISTS, JSON.stringify(lists));
}

function addSetList(setList) {
    const lists = getSetLists();
    setList.id = crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random();
    setList.createdAt = new Date().toISOString();
    setList.updatedAt = setList.createdAt;
    setList.lastPerformedAt = null;
    setList.notes = setList.notes || '';
    lists.push(setList);
    saveSetLists(lists);
    return setList;
}

function updateSetList(id, updates) {
    const lists = getSetLists();
    const index = lists.findIndex(s => s.id === id);
    if (index !== -1) {
        lists[index] = { ...lists[index], ...updates, updatedAt: new Date().toISOString() };
        saveSetLists(lists);
        return lists[index];
    }
    return null;
}

function deleteSetList(id) {
    let lists = getSetLists();
    lists = lists.filter(s => s.id !== id);
    saveSetLists(lists);
    // Recordings remain (they reference setListId)
}

// ---------- IndexedDB for Recordings ----------
const DB_NAME = 'ComedyRecordingsDB';
const DB_VERSION = 1;
const STORE_NAME = 'recordings';

let db = null;

function openDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('setListId', 'setListId', { unique: false });
                store.createIndex('createdAt', 'createdAt', { unique: false });
            }
        };
    });
}

async function addRecording(recording) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        recording.id = crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random();
        recording.createdAt = new Date().toISOString();
        const request = store.add(recording);
        request.onsuccess = () => resolve(recording);
        request.onerror = () => reject(request.error);
    });
}

async function getAllRecordings() {
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
            const recordings = request.result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            resolve(recordings);
        };
        request.onerror = () => reject(request.error);
    });
}

async function getRecording(id) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function updateRecording(id, updates) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const getRequest = store.get(id);
        getRequest.onsuccess = () => {
            const recording = getRequest.result;
            if (!recording) {
                reject('Recording not found');
                return;
            }
            Object.assign(recording, updates);
            const putRequest = store.put(recording);
            putRequest.onsuccess = () => resolve(recording);
            putRequest.onerror = () => reject(putRequest.error);
        };
        getRequest.onerror = () => reject(getRequest.error);
    });
}

async function deleteRecording(id) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// ---------- Recording Manager (MediaRecorder) ----------
let mediaRecorder = null;
let audioChunks = [];
let recordingTimerInterval = null;
let recordingStartTime = null;
let recordingPausedTime = 0;
let pauseStartTime = null;
let currentRecordingSetListId = null;
let currentRecordingSetListName = '';

// UI element references (populated when recording view is rendered)
let timerElement, startBtn, pauseBtn, resumeBtn, stopBtn, cancelRecordingBtn;
let recordSetlistNameSpan, recordingSetlistJokesList;

async function setupRecordingUI() {
    timerElement = document.getElementById('recording-timer');
    startBtn = document.getElementById('start-record-btn');
    pauseBtn = document.getElementById('pause-record-btn');
    resumeBtn = document.getElementById('resume-record-btn');
    stopBtn = document.getElementById('stop-record-btn');
    cancelRecordingBtn = document.getElementById('cancel-recording-btn');
    recordSetlistNameSpan = document.getElementById('record-setlist-name');
    recordingSetlistJokesList = document.getElementById('recording-setlist-jokes');

    if (!startBtn) return;

    startBtn.addEventListener('click', startRecording);
    pauseBtn.addEventListener('click', pauseRecording);
    resumeBtn.addEventListener('click', resumeRecording);
    stopBtn.addEventListener('click', stopRecording);
    cancelRecordingBtn.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            if (confirm('Discard recording?')) {
                mediaRecorder.onstop = null; // prevent save handler
                mediaRecorder.stop();
                mediaRecorder.stream.getTracks().forEach(track => track.stop());
                clearInterval(recordingTimerInterval);
                recordingTimerInterval = null;
                navigateTo('setlist-detail', { id: currentRecordingSetListId });
            }
        } else {
            navigateTo('setlist-detail', { id: currentRecordingSetListId });
        }
    });
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Prefer a widely supported MIME type
        const mimeType = getSupportedMimeType();
        const options = mimeType ? { mimeType } : {};
        mediaRecorder = new MediaRecorder(stream, options);
        audioChunks = [];

        mediaRecorder.ondataavailable = event => {
            if (event.data && event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            const finalMime = mediaRecorder.mimeType || 'audio/webm';
            const audioBlob = new Blob(audioChunks, { type: finalMime });
            const extension = finalMime.includes('ogg') ? 'ogg' : finalMime.includes('mp4') ? 'mp4' : 'webm';
            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10);
            const timeStr = now.toTimeString().slice(0, 5).replace(':', '-');
            const duration = Math.floor(elapsedSeconds());

            const recording = {
                setListId: currentRecordingSetListId,
                setListName: currentRecordingSetListName,
                durationSec: duration,
                audioBlob: audioBlob,
                notes: '',
                fileName: `${currentRecordingSetListName} - ${dateStr} ${timeStr}.${extension}`
            };

            try {
                await addRecording(recording);
                const setList = getSetLists().find(s => s.id === currentRecordingSetListId);
                if (setList) {
                    updateSetList(setList.id, { lastPerformedAt: new Date().toISOString() });
                }
                alert('Recording saved!');
            } catch (e) {
                console.error('Failed to save recording', e);
                alert('Error saving recording: ' + e.message);
            }

            stream.getTracks().forEach(track => track.stop());
            clearInterval(recordingTimerInterval);
            recordingTimerInterval = null;
            navigateTo('recordings');
        };

        mediaRecorder.start(1000); // collect data every second
        recordingStartTime = Date.now();
        recordingPausedTime = 0;
        pauseStartTime = null;
        startTimer();

        startBtn.style.display = 'none';
        pauseBtn.style.display = 'inline-block';
        stopBtn.style.display = 'inline-block';
    } catch (err) {
        console.error('Microphone error:', err);
        let alertMsg;
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            showMicStatus('denied', '🚫 Microphone access was denied. To enable it:', [
                'Click the 🔒 lock icon in your browser address bar',
                'Find "Microphone" and set it to Allow',
                'Refresh this page and try again',
            ]);
            alertMsg = 'Microphone access was denied.\n\nTo fix this:\n' +
                '1. Click the 🔒 icon in your browser address bar\n' +
                '2. Set Microphone to "Allow"\n' +
                '3. Refresh the page and try again.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            showMicStatus('denied', '🎙️ No microphone detected. Please connect a microphone and try again.');
            alertMsg = 'No microphone was found. Please connect a microphone and try again.';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
            showMicStatus('denied', '🎙️ Microphone is in use by another app. Close other apps and try again.');
            alertMsg = 'Your microphone is in use by another application. Close it and try again.';
        } else {
            showMicStatus('denied', '🚫 Could not access microphone: ' + err.message);
            alertMsg = 'Could not access microphone: ' + err.message;
        }
        if (startBtn) startBtn.disabled = false; // let them retry
        alert(alertMsg);
    }
}

function getSupportedMimeType() {
    const types = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
    ];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
}

function elapsedSeconds() {
    if (!recordingStartTime) return 0;
    return (Date.now() - recordingStartTime - recordingPausedTime) / 1000;
}

function pauseRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.pause();
        pauseStartTime = Date.now();
        clearInterval(recordingTimerInterval);
        recordingTimerInterval = null;
        pauseBtn.style.display = 'none';
        resumeBtn.style.display = 'inline-block';
    }
}

function resumeRecording() {
    if (mediaRecorder && mediaRecorder.state === 'paused') {
        if (pauseStartTime) {
            recordingPausedTime += Date.now() - pauseStartTime;
            pauseStartTime = null;
        }
        mediaRecorder.resume();
        startTimer();
        resumeBtn.style.display = 'none';
        pauseBtn.style.display = 'inline-block';
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
}

function startTimer() {
    recordingTimerInterval = setInterval(() => {
        updateTimerDisplay(Math.floor(elapsedSeconds()));
    }, 500);
}

function resetRecordingUI() {
    if (recordingTimerInterval) {
        clearInterval(recordingTimerInterval);
        recordingTimerInterval = null;
    }
    if (timerElement) timerElement.textContent = '00:00';
    if (startBtn) startBtn.style.display = 'inline-block';
    if (pauseBtn) pauseBtn.style.display = 'none';
    if (resumeBtn) resumeBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'none';
}

function updateTimerDisplay(totalSeconds) {
    if (!timerElement) return;
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    timerElement.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ---------- Router & View Management ----------
let currentView = 'home';
let currentParams = {};

const VIEW_THEMES = {
    home: { title: 'The Bit Binder', accent: '#7db4ff', accent2: '#4f7dff' },
    notepad: { title: 'Notepad', accent: '#7db4ff', accent2: '#4f7dff' },
    jokes: { title: 'Jokes', accent: '#ffb454', accent2: '#ff8f3f' },
    setlists: { title: 'Set Lists', accent: '#b08bff', accent2: '#7c5cff' },
    recordings: { title: 'Recordings', accent: '#ff7a7a', accent2: '#ff4d6d' },
    notebook: { title: 'Notebook', accent: '#d2a679', accent2: '#b07a4f' },
};

function hexToRgba(hex, alpha) {
    const clean = hex.replace('#', '');
    const bigint = parseInt(clean, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function applyTheme(view) {
    const alias = view === 'joke-form' || view === 'joke-folders' ? 'jokes'
        : (view === 'setlist-detail' || view === 'create-setlist' ? 'setlists'
            : (view === 'recording-detail' || view === 'record-set' ? 'recordings'
                : (view === 'notebook-entry' ? 'notebook' : view)));
    const theme = VIEW_THEMES[alias] || VIEW_THEMES.home;
    document.documentElement.style.setProperty('--accent', theme.accent);
    document.documentElement.style.setProperty('--accent-2', theme.accent2);
    document.documentElement.style.setProperty('--accent-soft', hexToRgba(theme.accent, 0.12));
    document.documentElement.style.setProperty('--accent-shadow', hexToRgba(theme.accent, 0.35));
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) pageTitle.textContent = theme.title;
}

function navigateTo(view, params = {}) {
    currentView = view;
    currentParams = params;
    const hash = view + (params.id ? '/' + params.id : '');
    // Update hash without triggering hashchange re-render
    history.replaceState(null, '', '#' + hash);
    renderView();
}

function renderView() {
    const main = document.getElementById('main-content');
    const template = document.getElementById(`${currentView}-view`);
    if (!template) {
        console.error('View not found:', currentView);
        navigateTo('notepad');
        return;
    }

    // Clone template content
    const content = template.cloneNode(true);
    content.style.display = 'block';
    main.innerHTML = '';
    main.appendChild(content);

    // Update active nav button
    document.querySelectorAll('nav button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.view === currentView) btn.classList.add('active');
    });

    // Update active side menu item
    document.querySelectorAll('.side-menu-item[data-view]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === currentView);
    });

    applyTheme(currentView);

    // Dispatch to view-specific render function
    switch (currentView) {
        case 'home':             renderHome();                              break;
        case 'jokes':            renderJokes();                             break;
        case 'joke-form':        renderJokeForm(currentParams.id);         break;
        case 'setlists':         renderSetLists();                          break;
        case 'setlist-detail':   renderSetListDetail(currentParams.id);    break;
        case 'create-setlist':   renderCreateSetList(currentParams.id);    break;
        case 'recordings':       renderRecordings();                        break;
        case 'recording-detail': renderRecordingDetail(currentParams.id); break;
        case 'record-set':       renderRecordSet(currentParams.id);        break;
        case 'notepad':          renderNotepad();                           break;
        case 'notebook':         renderNotebook();                          break;
        case 'notebook-entry':   renderNotebookEntry(currentParams.id);    break;
        case 'joke-folders':     renderJokeFolders();                       break;
    }
}

// ---------- View Renderers ----------

function renderHome() {
    // Personalize jokebook button
    const jbLabel = document.getElementById('jokebook-btn-label');
    const jbBtn   = document.getElementById('jokebook-home-btn');
    const uid = getCurrentUserId();
    if (uid && jbLabel) {
        const uname = getCurrentUsername();
        jbLabel.textContent = uname ? `${uname}'s jokebook` : 'my jokebook';
        if (jbBtn) jbBtn.style.display = '';
    } else if (jbBtn) {
        jbBtn.style.display = 'none';
    }

    document.querySelectorAll('.home-card, .home-button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const view = e.currentTarget.dataset.view;
            const action = e.currentTarget.dataset.action;
            if (view) navigateTo(view);
            if (action === 'open-jokebook') openJokebookModal();
            else if (action) handleFabAction(action);
        });
    });
}

function renderJokes() {
    const jokes = getJokes();
    const container = document.getElementById('jokes-list');
    const searchInput = document.getElementById('joke-search');
    const sortSelect = document.getElementById('joke-sort');
    const addBtn = document.getElementById('add-joke-btn');
    const manageFoldersBtn = document.getElementById('manage-folders-btn');
    const autoOrganizeBtn = document.getElementById('auto-organize-btn');
    const folderBar = document.getElementById('folder-bar');

    let activeFolderId = '';

    function renderFolderBar() {
        if (!folderBar) return;
        const folders = getFolders();
        const chips = [
            `<button class="folder-chip ${activeFolderId ? '' : 'active'}" data-folder="">All</button>`,
            ...folders.map(f => `<button class="folder-chip ${activeFolderId === f.id ? 'active' : ''}" data-folder="${f.id}">${escapeHTML(f.name)}</button>`)
        ];
        folderBar.innerHTML = chips.join('');
        folderBar.querySelectorAll('.folder-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                activeFolderId = btn.dataset.folder || '';
                renderFolderBar();
                renderJokesList();
            });
        });
    }

    function renderJokesList() {
        const search = (searchInput.value || '').toLowerCase();
        const sortBy = sortSelect.value;

        let filtered = jokes.filter(j => {
            const matchSearch = !search ||
                j.title.toLowerCase().includes(search) ||
                (j.text && j.text.toLowerCase().includes(search)) ||
                (j.setup && j.setup.toLowerCase().includes(search)) ||
                (j.body && j.body.toLowerCase().includes(search));
            const matchFolder = !activeFolderId || j.folderId === activeFolderId;
            return matchSearch && matchFolder;
        });

        // Sort
        filtered.sort((a, b) => {
            switch (sortBy) {
                case 'oldest':  return new Date(a.createdAt) - new Date(b.createdAt);
                case 'title':   return (a.title || '').localeCompare(b.title || '');
                case 'newest':
                default:        return new Date(b.createdAt) - new Date(a.createdAt);
            }
        });

        if (filtered.length === 0) {
            container.innerHTML = `<p class="empty">${search ? 'No jokes match your search.' : 'No jokes yet. Add your first one!'}</p>`;
            return;
        }

        container.innerHTML = filtered.map(j => {
            const preview = j.text || j.setup || j.body || '';
            return `
            <div class="list-item" data-id="${j.id}">
                <h3>${escapeHTML(j.title)}</h3>
                <p>${escapeHTML(preview.slice(0, 120))}${preview.length > 120 ? '…' : ''}</p>
                <small>Updated: ${new Date(j.updatedAt).toLocaleDateString()}</small>
            </div>
        `;
        }).join('');

        container.querySelectorAll('.list-item').forEach(el => {
            el.addEventListener('click', () => navigateTo('joke-form', { id: el.dataset.id }));
        });
    }

    renderJokesList();
    renderFolderBar();
    searchInput.addEventListener('input', renderJokesList);
    sortSelect.addEventListener('change', renderJokesList);
    addBtn.addEventListener('click', () => navigateTo('joke-form'));
    if (manageFoldersBtn) manageFoldersBtn.addEventListener('click', () => navigateTo('joke-folders'));
    if (autoOrganizeBtn) autoOrganizeBtn.addEventListener('click', autoOrganizeJokes);
}

function renderJokeForm(id) {
    const isEdit = !!id;
    const titleEl       = document.getElementById('joke-form-title');
    const titleInput    = document.getElementById('joke-title');
    const textInput     = document.getElementById('joke-text');
    const cancelBtn     = document.getElementById('cancel-joke-btn');
    const deleteBtn     = document.getElementById('delete-joke-btn');
    const form          = document.getElementById('joke-form');

    // Pre-fill if editing or if there's notepad text for export
    if (isEdit) {
        const joke = getJokes().find(j => j.id === id);
        if (!joke) { navigateTo('jokes'); return; }
        titleEl.textContent     = 'Edit Joke';
        titleInput.value        = joke.title || '';
        textInput.value         = joke.text || joke.setup || joke.body || '';
        deleteBtn.style.display = 'inline-block';
    } else {
        titleEl.textContent     = 'Add Joke';
        // Check for notepad export text
        const exportText = sessionStorage.getItem('notepad_export_text');
        if (exportText) {
            textInput.value = exportText;
            sessionStorage.removeItem('notepad_export_text');
        }
        deleteBtn.style.display = 'none';
    }

    cancelBtn.addEventListener('click', () => navigateTo('jokes'));

    form.addEventListener('submit', e => {
        e.preventDefault();
        const title = titleInput.value.trim();
        if (!title || title.length > 30) {
            alert('Title must be 1-30 characters');
            return;
        }
        const jokeData = {
            title,
            text: textInput.value,
        };
        if (isEdit) {
            updateJoke(id, jokeData);
        } else {
            addJoke(jokeData);
        }
        navigateTo('jokes');
    });

    deleteBtn.addEventListener('click', () => {
        if (confirm('Delete this joke? It will be removed from any set lists that include it.')) {
            deleteJoke(id);
            navigateTo('jokes');
        }
    });
}

function renderJokeFolders() {
    const list = document.getElementById('folders-list');
    const backBtn = document.getElementById('back-from-folders');
    const createBtn = document.getElementById('create-folder-btn');
    const input = document.getElementById('new-folder-name');

    function renderList() {
        const folders = getFolders();
        const jokes = getJokes();
        if (!list) return;
        if (folders.length === 0) {
            list.innerHTML = '<p class="empty-state"><span class="empty-icon">📁</span>No folders yet.</p>';
            return;
        }
        list.innerHTML = folders.map(f => {
            const count = jokes.filter(j => j.folderId === f.id).length;
            return `
                <div class="folder-list-item" data-id="${f.id}">
                    <div>
                        <div class="folder-name">${escapeHTML(f.name)}</div>
                        <div class="folder-count">${count} joke${count !== 1 ? 's' : ''}</div>
                    </div>
                    <div class="folder-actions">
                        <button class="btn btn-danger btn-sm" data-delete="${f.id}">Delete</button>
                    </div>
                </div>
            `;
        }).join('');

        list.querySelectorAll('[data-delete]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.delete;
                if (confirm('Delete this folder? Jokes will be moved to "No folder".')) {
                    deleteFolder(id);
                    renderList();
                }
            });
        });
    }

    if (backBtn) backBtn.addEventListener('click', () => navigateTo('jokes'));
    if (createBtn && input) {
        createBtn.addEventListener('click', () => {
            const folder = addFolder(input.value);
            if (!folder) {
                alert('Enter a unique folder name.');
                return;
            }
            input.value = '';
            renderList();
        });
    }

    renderList();
}

function renderSetLists() {
    const lists = getSetLists();
    const container = document.getElementById('setlists-list');

    // Wire up the "+ New Set List" button in the view header
    const newBtn = document.querySelector('#setlists-view .view-header button[data-view="create-setlist"]');
    if (newBtn) {
        newBtn.addEventListener('click', () => navigateTo('create-setlist'));
    }

    if (lists.length === 0) {
        container.innerHTML = '<p class="empty">No set lists yet. Create one!</p>';
        return;
    }

    container.innerHTML = lists.map(s => {
        const count = s.jokeOrder ? s.jokeOrder.length : 0;
        const last = s.lastPerformedAt ? new Date(s.lastPerformedAt).toLocaleDateString() : 'Never';
        return `
            <div class="list-item" data-id="${s.id}">
                <h3>${escapeHTML(s.name)}</h3>
                <p>${count} joke${count !== 1 ? 's' : ''} • Last performed: ${last}</p>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.list-item').forEach(el => {
        el.addEventListener('click', () => navigateTo('setlist-detail', { id: el.dataset.id }));
    });
}

function renderSetListDetail(id) {
    const setList = getSetLists().find(s => s.id === id);
    if (!setList) { navigateTo('setlists'); return; }

    const jokes   = getJokes();
    const jokeMap = new Map(jokes.map(j => [j.id, j]));

    document.getElementById('setlist-name').textContent = setList.name;

    const notesArea = document.getElementById('setlist-notes');
    notesArea.value = setList.notes || '';
    notesArea.addEventListener('input', e => updateSetList(id, { notes: e.target.value }));

    const jokesList = document.getElementById('setlist-jokes-list');
    if (setList.jokeOrder && setList.jokeOrder.length) {
        jokesList.innerHTML = setList.jokeOrder.map((jid, i) => {
            const joke = jokeMap.get(jid);
            return joke
                ? `<li>${i + 1}. ${escapeHTML(joke.title)}</li>`
                : `<li class="missing-joke">⚠️ Missing joke</li>`;
        }).join('');
    } else {
        jokesList.innerHTML = '<li>No jokes in this set.</li>';
    }

    document.getElementById('record-set-btn').addEventListener('click', () =>
        navigateTo('record-set', { id })
    );
    document.getElementById('edit-order-btn').addEventListener('click', () =>
        navigateTo('create-setlist', { id })
    );
    document.getElementById('rename-setlist-btn').addEventListener('click', () => {
        const newName = prompt('Enter new name:', setList.name);
        if (newName && newName.trim()) {
            updateSetList(id, { name: newName.trim().slice(0, 50) });
            navigateTo('setlist-detail', { id }); // refresh
        }
    });
    document.getElementById('delete-setlist-btn').addEventListener('click', () => {
        if (confirm('Delete this set list? Recordings linked to it will remain.')) {
            deleteSetList(id);
            navigateTo('setlists');
        }
    });
    document.getElementById('back-from-setlist').addEventListener('click', () =>
        navigateTo('setlists')
    );
}

function renderCreateSetList(editId) {
    const isEdit = !!editId;
    let setList = null;
    if (isEdit) {
        setList = getSetLists().find(s => s.id === editId);
        if (!setList) { navigateTo('setlists'); return; }
    }

    document.getElementById('create-setlist-title').textContent = isEdit ? 'Edit Set List' : 'Create Set List';

    const nameInput = document.getElementById('setlist-name-input');
    nameInput.value = setList ? setList.name : '';

    const jokes              = getJokes();
    const availableContainer = document.getElementById('available-jokes-list');
    const selectedContainer  = document.getElementById('selected-jokes-list');

    let selectedJokeIds = isEdit && setList.jokeOrder ? [...setList.jokeOrder] : [];

    function renderJokePicker() {
        // Available jokes (not yet selected)
        const available = jokes.filter(j => !selectedJokeIds.includes(j.id));

        if (available.length === 0) {
            availableContainer.innerHTML = '<p style="color:var(--text-secondary);font-size:0.9rem;padding:8px;">All jokes added to set.</p>';
        } else {
            availableContainer.innerHTML = available.map(j =>
                `<div class="joke-item" data-id="${j.id}">${escapeHTML(j.title)}</div>`
            ).join('');
            availableContainer.querySelectorAll('.joke-item').forEach(el => {
                el.addEventListener('click', () => {
                    selectedJokeIds.push(el.dataset.id);
                    renderJokePicker();
                });
            });
        }

        // Selected jokes (drag-to-reorder)
        if (selectedJokeIds.length === 0) {
            selectedContainer.innerHTML = '<li style="color:var(--text-secondary);font-size:0.9rem;cursor:default;">No jokes selected yet.</li>';
        } else {
            selectedContainer.innerHTML = selectedJokeIds.map(jid => {
                const joke = jokes.find(j => j.id === jid);
                return `<li draggable="true" data-id="${jid}">
                    <span>☰ ${joke ? escapeHTML(joke.title) : '⚠️ Missing joke'}</span>
                    <button class="remove-joke" data-id="${jid}" title="Remove">✕</button>
                </li>`;
            }).join('');

            // Drag-and-drop reorder
            let dragSrcId = null;
            selectedContainer.querySelectorAll('li[draggable]').forEach(item => {
                item.addEventListener('dragstart', e => {
                    dragSrcId = item.dataset.id;
                    e.dataTransfer.effectAllowed = 'move';
                    item.style.opacity = '0.4';
                });
                item.addEventListener('dragend', () => {
                    item.style.opacity = '1';
                });
                item.addEventListener('dragover', e => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                });
                item.addEventListener('drop', e => {
                    e.preventDefault();
                    const dropId = item.dataset.id;
                    if (dragSrcId && dragSrcId !== dropId) {
                        const from = selectedJokeIds.indexOf(dragSrcId);
                        const to   = selectedJokeIds.indexOf(dropId);
                        selectedJokeIds.splice(from, 1);
                        selectedJokeIds.splice(to, 0, dragSrcId);
                        renderJokePicker();
                    }
                });
            });

            // Remove buttons
            selectedContainer.querySelectorAll('.remove-joke').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    selectedJokeIds = selectedJokeIds.filter(id => id !== btn.dataset.id);
                    renderJokePicker();
                });
            });
        }
    }

    renderJokePicker();

    document.getElementById('cancel-create-setlist').addEventListener('click', () => {
        navigateTo(isEdit ? 'setlist-detail' : 'setlists', isEdit ? { id: editId } : {});
    });

    document.getElementById('create-setlist-form').addEventListener('submit', e => {
        e.preventDefault();
        const name = nameInput.value.trim();
        if (!name || name.length > 50) { alert('Name must be 1-50 characters'); return; }
        if (selectedJokeIds.length === 0) { alert('Select at least one joke'); return; }

        if (isEdit) {
            updateSetList(editId, { name, jokeOrder: selectedJokeIds });
            navigateTo('setlist-detail', { id: editId });
        } else {
            addSetList({ name, jokeOrder: selectedJokeIds, notes: '' });
            navigateTo('setlists');
        }
    });
}

async function renderRecordings() {
    const recordings  = await getAllRecordings();
    const container   = document.getElementById('recordings-list');

    if (recordings.length === 0) {
        container.innerHTML = '<p class="empty">No recordings yet. Record a set to get started!</p>';
        return;
    }

    // Group by local date
    const groups = {};
    recordings.forEach(r => {
        const date = new Date(r.createdAt).toLocaleDateString();
        if (!groups[date]) groups[date] = [];
        groups[date].push(r);
    });

    let html = '';
    for (const [date, recs] of Object.entries(groups)) {
        html += `<h3>${date}</h3>`;
        recs.forEach(r => {
            html += `
                <div class="list-item" data-id="${r.id}">
                    <h3>${escapeHTML(r.fileName || 'Recording')}</h3>
                    <p>${formatDuration(r.durationSec)} • Set: ${escapeHTML(r.setListName || 'Unknown')}</p>
                </div>
            `;
        });
    }
    container.innerHTML = html;

    container.querySelectorAll('.list-item').forEach(el => {
        el.addEventListener('click', () => navigateTo('recording-detail', { id: el.dataset.id }));
    });
}

function formatDuration(sec) {
    if (!sec && sec !== 0) return '0:00';
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function renderRecordingDetail(id) {
    const recording = await getRecording(id);
    if (!recording) { navigateTo('recordings'); return; }

    document.getElementById('recording-name').textContent     = recording.fileName || 'Recording';
    document.getElementById('recording-duration').textContent = formatDuration(recording.durationSec);

    const audio  = document.getElementById('recording-audio');
    const blobUrl = URL.createObjectURL(recording.audioBlob);
    audio.src    = blobUrl;

    const notesArea = document.getElementById('recording-notes');
    notesArea.value = recording.notes || '';
    notesArea.addEventListener('input', async e => {
        await updateRecording(id, { notes: e.target.value });
    });

    document.getElementById('export-recording-btn').addEventListener('click', () => {
        const a    = document.createElement('a');
        a.href     = blobUrl;
        a.download = recording.fileName || 'recording.webm';
        a.click();
    });

    document.getElementById('delete-recording-btn').addEventListener('click', async () => {
        if (confirm('Delete this recording? This cannot be undone.')) {
            await deleteRecording(id);
            URL.revokeObjectURL(blobUrl);
            navigateTo('recordings');
        }
    });

    document.getElementById('back-from-recording').addEventListener('click', () => {
        URL.revokeObjectURL(blobUrl);
        navigateTo('recordings');
    });
}

async function renderRecordSet(setListId) {
    const setList = getSetLists().find(s => s.id === setListId);
    if (!setList) { navigateTo('setlists'); return; }

    currentRecordingSetListId   = setListId;
    currentRecordingSetListName = setList.name;

    // These must be queried after the DOM snapshot is rendered
    timerElement             = document.getElementById('recording-timer');
    startBtn                 = document.getElementById('start-record-btn');
    pauseBtn                 = document.getElementById('pause-record-btn');
    resumeBtn                = document.getElementById('resume-record-btn');
    stopBtn                  = document.getElementById('stop-record-btn');
    cancelRecordingBtn       = document.getElementById('cancel-recording-btn');
    recordSetlistNameSpan    = document.getElementById('record-setlist-name');
    recordingSetlistJokesList = document.getElementById('recording-setlist-jokes');

    recordSetlistNameSpan.textContent = setList.name;

    const jokes   = getJokes();
    const jokeMap = new Map(jokes.map(j => [j.id, j]));
    recordingSetlistJokesList.innerHTML = (setList.jokeOrder || []).map((jid, i) => {
        const joke = jokeMap.get(jid);
        return `<li>${i + 1}. ${joke ? escapeHTML(joke.title) : '⚠️ Missing joke'}</li>`;
    }).join('');

    setupRecordingUI();
    resetRecordingUI();
    await checkMicPermission();
}

// ---------- Microphone Permission Helpers ----------

function showMicStatus(type, message, steps) {
    const el = document.getElementById('mic-status');
    if (!el) return;
    el.className = `mic-status mic-status--${type}`;
    el.innerHTML = escapeHTML(message) +
        (steps ? `<ul class="mic-fix-steps">${steps.map(s => `<li>${escapeHTML(s)}</li>`).join('')}</ul>` : '');
}

function applyMicPermissionState(state) {
    if (state === 'granted') {
        showMicStatus('granted', '🎙️ Microphone ready');
        if (startBtn) startBtn.disabled = false;
    } else if (state === 'denied') {
        showMicStatus('denied', '🚫 Microphone access is blocked. To enable it:', [
            'Click the 🔒 lock icon in your browser address bar',
            'Find "Microphone" and set it to Allow',
            'Refresh this page and try again',
        ]);
        if (startBtn) startBtn.disabled = true;
    } else {
        // 'prompt' – user hasn't decided yet
        showMicStatus('prompt', '🎙️ Tap Start — your browser will ask for microphone permission.');
        if (startBtn) startBtn.disabled = false;
    }
}

async function checkMicPermission() {
    // Check if MediaRecorder is available at all
    if (!window.MediaRecorder || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showMicStatus('denied', '🚫 Audio recording is not supported in this browser.', [
            'Use Chrome, Edge, Firefox, or Safari 14.1+',
        ]);
        if (startBtn) startBtn.disabled = true;
        return;
    }

    try {
        const perm = await navigator.permissions.query({ name: 'microphone' });
        applyMicPermissionState(perm.state);
        // React to user granting/revoking permission live
        perm.onchange = () => applyMicPermissionState(perm.state);
    } catch {
        // Permissions API not available (some Safari versions) — show neutral hint
        showMicStatus('prompt', '🎙️ Tap Start — your browser will ask for microphone permission.');
    }
}

// ---------- Notepad ----------
const NOTEPAD_KEY = 'comedy_notepad';

function renderNotepad() {
    const textarea   = document.getElementById('notepad-text');
    const exportBtn  = document.getElementById('export-to-joke-btn');
    const clearBtn   = document.getElementById('clear-notepad-btn');
    const speechBtn  = document.getElementById('speech-notepad-btn');

    // Load saved text
    textarea.value = localStorage.getItem(NOTEPAD_KEY) || '';

    // Auto-save on every keystroke
    textarea.addEventListener('input', () => {
        localStorage.setItem(NOTEPAD_KEY, textarea.value);
    });

    // Export to joke: store text in session, navigate to joke-form
    exportBtn.addEventListener('click', () => {
        const text = textarea.value.trim();
        if (!text) {
            alert('Write something first before exporting to a joke.');
            return;
        }
        sessionStorage.setItem('notepad_export_text', text);
        navigateTo('joke-form');
    });

    // Clear notepad
    clearBtn.addEventListener('click', () => {
        if (!textarea.value.trim() || confirm('Clear all notepad text?')) {
            textarea.value = '';
            localStorage.setItem(NOTEPAD_KEY, '');
        }
    });

    if (speechBtn) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;

        speechBtn.addEventListener('click', () => {
            speechBtn.classList.add('listening');
            recognition.start();
        });

        recognition.onresult = (event) => {
            const transcript = Array.from(event.results).map(r => r[0].transcript).join(' ');
            textarea.value = `${textarea.value}\n${transcript}`.trim();
            localStorage.setItem(NOTEPAD_KEY, textarea.value);
        };
        recognition.onend = () => speechBtn.classList.remove('listening');
        recognition.onerror = () => speechBtn.classList.remove('listening');
    }
}

// ---------- Notebook ----------
const NOTEBOOK_KEY = 'comedy_notebook';

function getNotebookEntries() {
    return JSON.parse(localStorage.getItem(NOTEBOOK_KEY)) || [];
}

function saveNotebookEntries(entries) {
    localStorage.setItem(NOTEBOOK_KEY, JSON.stringify(entries));
}

function renderNotebook() {
    const container    = document.getElementById('notebook-list');
    const searchInput  = document.getElementById('notebook-search');
    const addBtn       = document.getElementById('add-notebook-entry-btn');

    function renderList() {
        const query   = (searchInput.value || '').toLowerCase();
        const entries = getNotebookEntries()
            .filter(e =>
                !query ||
                (e.title && e.title.toLowerCase().includes(query)) ||
                (e.content && e.content.toLowerCase().includes(query))
            )
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        if (entries.length === 0) {
            container.innerHTML = `<p class="empty">${query ? 'No entries match your search.' : 'No notebook entries yet. Create one!'}</p>`;
            return;
        }

        container.innerHTML = entries.map(e => {
            const preview = (e.content || '').slice(0, 100);
            return `
            <div class="list-item" data-id="${e.id}">
                <h3>${escapeHTML(e.title || 'Untitled')}</h3>
                <p>${escapeHTML(preview)}${preview.length >= 100 ? '…' : ''}</p>
                <small>Updated: ${new Date(e.updatedAt).toLocaleDateString()}</small>
            </div>
            `;
        }).join('');

        container.querySelectorAll('.list-item').forEach(el => {
            el.addEventListener('click', () => navigateTo('notebook-entry', { id: el.dataset.id }));
        });
    }

    renderList();
    searchInput.addEventListener('input', renderList);
    addBtn.addEventListener('click', () => navigateTo('notebook-entry'));
}

function renderNotebookEntry(id) {
    const isEdit      = !!id;
    const titleEl     = document.getElementById('notebook-entry-form-title');
    const titleInput  = document.getElementById('entry-title');
    const contentInput = document.getElementById('entry-content');
    const cancelBtn   = document.getElementById('cancel-notebook-entry-btn');
    const deleteBtn   = document.getElementById('delete-notebook-entry-btn');
    const form        = document.getElementById('notebook-entry-form');

    if (isEdit) {
        const entry = getNotebookEntries().find(e => e.id === id);
        if (!entry) { navigateTo('notebook'); return; }
        titleEl.textContent     = 'Edit Entry';
        titleInput.value        = entry.title || '';
        contentInput.value      = entry.content || '';
        deleteBtn.style.display = 'inline-block';
    } else {
        titleEl.textContent     = 'New Entry';
        titleInput.value        = '';
        contentInput.value      = '';
        deleteBtn.style.display = 'none';
    }

    cancelBtn.addEventListener('click', () => navigateTo('notebook'));

    form.addEventListener('submit', e => {
        e.preventDefault();
        const title = titleInput.value.trim();
        if (!title) { alert('Please enter a title.'); return; }

        const entries = getNotebookEntries();
        if (isEdit) {
            const idx = entries.findIndex(e => e.id === id);
            if (idx !== -1) {
                entries[idx] = { ...entries[idx], title, content: contentInput.value, updatedAt: new Date().toISOString() };
            }
        } else {
            entries.push({
                id: crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random(),
                title,
                content: contentInput.value,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }
        saveNotebookEntries(entries);
        navigateTo('notebook');
    });

    deleteBtn.addEventListener('click', () => {
        if (confirm('Delete this notebook entry?')) {
            const entries = getNotebookEntries().filter(e => e.id !== id);
            saveNotebookEntries(entries);
            navigateTo('notebook');
        }
    });
}

// ---------- FAB + AI + Voice ----------
function initFabMenu() {
    const fab = document.getElementById('fab');
    const menu = document.getElementById('fab-menu');
    if (!fab || !menu) return;

    const closeMenu = () => menu.classList.remove('open');
    const toggleMenu = () => menu.classList.toggle('open');

    fab.addEventListener('click', toggleMenu);
    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && !fab.contains(e.target)) closeMenu();
    });

    menu.querySelectorAll('.fab-menu-item').forEach(btn => {
        btn.addEventListener('click', () => {
            closeMenu();
            handleFabAction(btn.dataset.action);
        });
    });
}

function handleFabAction(action) {
    switch (action) {
        case 'add-joke':
            navigateTo('joke-form');
            break;
        case 'ai-generate':
            openModal('ai-modal');
            break;
        case 'voice-joke':
            openModal('voice-modal');
            break;
        case 'quick-note':
            navigateTo('notepad');
            break;
        default:
            break;
    }
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('open');
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('open');
}

function initAiModal() {
    const modal = document.getElementById('ai-modal');
    const closeBtn = document.getElementById('close-ai-modal');
    const generateBtn = document.getElementById('ai-generate-btn');
    const topicInput = document.getElementById('ai-topic');
    const results = document.getElementById('ai-results');
    const styleGrid = document.getElementById('ai-style-grid');
    const agentToggle = document.getElementById('ai-agent-toggle');

    if (!modal || !generateBtn || !topicInput || !results || !styleGrid) return;

    let activeStyle = 'observational';

    styleGrid.querySelectorAll('.ai-style-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            styleGrid.querySelectorAll('.ai-style-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            activeStyle = chip.dataset.style || 'observational';
        });
    });

    const run = async () => {
        const topic = topicInput.value.trim();
        if (!topic) {
            alert('Add a topic or premise first.');
            return;
        }
        results.innerHTML = '<div class="ai-loading"><div class="spinner"></div>Generating…</div>';
        const jokes = await generateAiJokes(topic, activeStyle);
        renderAiResults(jokes, results, !!agentToggle?.checked);
    };

    generateBtn.addEventListener('click', run);
    closeBtn?.addEventListener('click', () => closeModal('ai-modal'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal('ai-modal');
    });
}

function renderAiResults(jokes, container, autoAdd) {
    if (!jokes.length) {
        container.innerHTML = '<p class="empty-state">No ideas generated. Try a new prompt.</p>';
        return;
    }

    container.innerHTML = jokes.map((j, idx) => {
        const title = escapeHTML(j.title || `Joke ${idx + 1}`);
        const jokeText = escapeHTML(j.text || j.setup || '');
        return `
            <div class="ai-result-card">
                <h4>${title}</h4>
                <p>${jokeText}</p>
                <div class="ai-result-actions">
                    <button class="btn btn-primary btn-sm" data-add="${idx}">Add to Jokes</button>
                    <button class="btn btn-secondary btn-sm" data-jb="${idx}">📖 Jokebook</button>
                    <button class="btn btn-secondary btn-sm" data-edit="${idx}">Open Editor</button>
                </div>
            </div>
        `;
    }).join('');

    // Track last generated joke for AI voice command parsing
    const lastJoke = jokes[jokes.length - 1];
    _lastGeneratedJoke = lastJoke ? (lastJoke.text || [lastJoke.setup, lastJoke.punchline].filter(Boolean).join(' — ')) : '';

    const addToJokes = (joke) => {
        const fullText = joke.text || [joke.setup, joke.punchline].filter(Boolean).join('\n\n');
        addJoke({
            title: joke.title || 'New Joke',
            text: fullText,
        });
    };

    if (autoAdd) {
        jokes.forEach(addToJokes);
        // Also add to jokebook (IndexedDB) 
        jokes.forEach(j => {
            const fullText = j.text || [j.setup, j.punchline].filter(Boolean).join(' — ');
            if (fullText) addJokeToFolder(fullText, 'bitbuddy');
        });
        container.insertAdjacentHTML('afterbegin', '<p class="api-status connected">Agent mode: jokes added to your jokebook.</p>');
    }

    container.querySelectorAll('[data-add]').forEach(btn => {
        btn.addEventListener('click', () => {
            const joke = jokes[parseInt(btn.dataset.add, 10)];
            addToJokes(joke);
            navigateTo('jokes');
        });
    });
    // Jokebook quick-add buttons
    container.querySelectorAll('[data-jb]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const joke = jokes[parseInt(btn.dataset.jb, 10)];
            const fullText = joke.text || [joke.setup, joke.punchline].filter(Boolean).join(' — ');
            const result = await addJokeToFolder(fullText, 'bitbuddy');
            if (result.success) {
                btn.textContent = '✓ Saved';
                btn.disabled = true;
            } else {
                alert(result.message);
            }
        });
    });
    container.querySelectorAll('[data-edit]').forEach(btn => {
        btn.addEventListener('click', () => {
            const joke = jokes[parseInt(btn.dataset.edit, 10)];
            sessionStorage.setItem('notepad_export_text', joke.text || joke.setup || joke.body || '');
            navigateTo('joke-form');
        });
    });
}

async function generateAiJokes(topic, style) {
    const key = getApiKey();
    if (!key) return generateFallbackJokes(topic, style);
    try {
        const prompt = `You are a comedy writing assistant. Return a JSON array of 3 jokes. Each object should have "title" (short name) and "text" (the full joke). Topic: "${topic}". Style: "${style}".`;
        const content = await callOpenAI(prompt, key);
        const data = safeJsonParse(content);
        if (Array.isArray(data)) return data;
    } catch (err) {
        console.error('AI error', err);
    }
    return generateFallbackJokes(topic, style);
}

function generateFallbackJokes(topic, style) {
    const base = `(${style}) ${topic}`;
    return [
        { title: `${base} #1`, text: `So I've been thinking about ${topic}... Turns out ${topic} thinks about me too.` },
        { title: `${base} #2`, text: `The wild thing about ${topic} is... it makes me look organized by comparison.` },
        { title: `${base} #3`, text: `I tried to fix my ${topic} problem... Now it has my number.` },
    ];
}

// ---------- Jokebook Modal ----------
let _lastGeneratedJoke = '';  // Track last AI-generated joke for "add to jokebook" commands

function openJokebookModal() {
    const modal = document.getElementById('jokebook-modal');
    if (modal) {
        modal.classList.add('open');
        refreshJokebook();
    }
}

async function refreshJokebook() {
    const uid = getCurrentUserId();
    if (!uid) return;

    // Update title
    const titleEl = document.getElementById('jokebook-modal-title');
    const uname = getCurrentUsername();
    if (titleEl) titleEl.textContent = uname ? `${uname}'s Jokebook` : 'My Jokebook';

    // Render folder bar
    const folderBar = document.getElementById('jb-folder-bar');
    const targetSelect = document.getElementById('jb-target-folder');
    const folders = await getAllJokebookFolders(uid);

    if (folderBar) {
        const activeFolder = folderBar.dataset.active || '';
        folderBar.innerHTML =
            `<button class="jb-folder-chip ${!activeFolder ? 'active' : ''}" data-folder="">All</button>` +
            folders.map(f =>
                `<button class="jb-folder-chip ${activeFolder === f ? 'active' : ''}" data-folder="${escapeHTML(f)}">${escapeHTML(f)}</button>`
            ).join('');

        folderBar.querySelectorAll('.jb-folder-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                folderBar.dataset.active = chip.dataset.folder;
                refreshJokebook();
            });
        });
    }

    // Populate target folder dropdown
    if (targetSelect) {
        targetSelect.innerHTML = folders.map(f =>
            `<option value="${escapeHTML(f)}">${escapeHTML(f)}</option>`
        ).join('');
    }

    // Render jokes
    const activeFolder = folderBar?.dataset.active || '';
    const jokes = await getJokesByFolder(uid, activeFolder || null);
    const listEl = document.getElementById('jb-jokes-list');
    if (!listEl) return;

    if (jokes.length === 0) {
        listEl.innerHTML = '<div class="jb-empty">No jokes here yet. Add one above!</div>';
        return;
    }

    // Sort newest first
    jokes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    listEl.innerHTML = jokes.map(j => `
        <div class="jb-joke-card" data-id="${j.id}">
            <div class="jb-joke-text">${escapeHTML(j.text)}</div>
            <div class="jb-joke-meta">
                <span class="jb-joke-folder-tag">${escapeHTML(j.folder)}</span>
                <span class="jb-joke-date">${new Date(j.createdAt).toLocaleDateString()}</span>
                <div class="jb-joke-actions">
                    <button class="btn btn-ghost btn-sm jb-edit-btn" data-id="${j.id}" title="Edit">✏️</button>
                    <button class="btn btn-ghost btn-sm jb-move-btn" data-id="${j.id}" title="Move">📁</button>
                    <button class="btn btn-ghost btn-sm jb-delete-btn" data-id="${j.id}" title="Delete">🗑️</button>
                </div>
            </div>
        </div>
    `).join('');

    // Edit buttons
    listEl.querySelectorAll('.jb-edit-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = Number(btn.dataset.id);
            const joke = await userDB.jokes.get(id);
            if (!joke) return;
            const newText = prompt('Edit joke:', joke.text);
            if (newText !== null && newText.trim()) {
                await updateJokebookJoke(id, newText.trim());
                refreshJokebook();
            }
        });
    });

    // Move buttons
    listEl.querySelectorAll('.jb-move-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = Number(btn.dataset.id);
            const folders = await getAllJokebookFolders(uid);
            const dest = prompt(`Move to folder:\n(${folders.join(', ')})\nOr type a new name:`);
            if (dest !== null && dest.trim()) {
                await moveJokeToFolder(id, dest.trim());
                refreshJokebook();
            }
        });
    });

    // Delete buttons
    listEl.querySelectorAll('.jb-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = Number(btn.dataset.id);
            if (confirm('Delete this joke?')) {
                await deleteJokebookJoke(id);
                refreshJokebook();
            }
        });
    });
}

function initJokebookModal() {
    const modal = document.getElementById('jokebook-modal');
    const closeBtn = document.getElementById('close-jokebook-modal');
    const addBtn = document.getElementById('jb-add-joke-btn');
    const createFolderBtn = document.getElementById('jb-create-folder-btn');

    if (!modal) return;

    closeBtn?.addEventListener('click', () => closeModal('jokebook-modal'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal('jokebook-modal');
    });

    // Add joke
    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            const textarea = document.getElementById('jb-new-joke');
            const folderSelect = document.getElementById('jb-target-folder');
            const text = textarea?.value.trim();
            if (!text) { alert('Write a joke first!'); return; }
            const folder = folderSelect?.value || 'bitbuddy';
            try {
                await addJokeToJokebook(text, folder);
                textarea.value = '';
                refreshJokebook();
            } catch (err) {
                alert(err.message);
            }
        });
    }

    // Create new folder inline
    if (createFolderBtn) {
        createFolderBtn.addEventListener('click', async () => {
            const input = document.getElementById('jb-new-folder-name');
            const name = input?.value.trim();
            if (!name) return;
            // Adding a dummy joke forces the folder to exist, but simpler:
            // just add to the select and clear input
            const select = document.getElementById('jb-target-folder');
            // Check if already exists
            const existing = Array.from(select?.options || []).some(o => o.value.toLowerCase() === name.toLowerCase());
            if (!existing) {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                select.appendChild(opt);
            }
            select.value = name;
            input.value = '';
        });
    }
}

function safeJsonParse(text) {
    try { return JSON.parse(text); } catch { /* ignore */ }
    const match = text.match(/```json([\s\S]*?)```/i) || text.match(/```([\s\S]*?)```/i);
    if (match) {
        try { return JSON.parse(match[1].trim()); } catch { /* ignore */ }
    }
    return null;
}

async function callOpenAI(prompt, apiKey) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.8,
        }),
    });
    if (!response.ok) throw new Error('OpenAI request failed');
    const json = await response.json();
    return json.choices?.[0]?.message?.content || '';
}

function initVoiceModal() {
    const modal = document.getElementById('voice-modal');
    const closeBtn = document.getElementById('close-voice-modal');
    const recordBtn = document.getElementById('voice-record-btn');
    const status = document.getElementById('voice-status');
    const textArea = document.getElementById('voice-text');
    const saveBtn = document.getElementById('voice-save-btn');

    if (!modal || !recordBtn || !textArea || !saveBtn) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = SpeechRecognition ? new SpeechRecognition() : null;
    let listening = false;

    if (recognition) {
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.onresult = (event) => {
            const transcript = Array.from(event.results).map(r => r[0].transcript).join(' ');
            textArea.value = transcript;

            // Check if user said "add that to my jokebook" etc.
            if (event.results[0]?.isFinal) {
                const cmd = parseJokebookCommand(transcript);
                if (cmd && _lastGeneratedJoke) {
                    addJokeToFolder(_lastGeneratedJoke, cmd.folder).then(result => {
                        if (result.success) {
                            if (status) status.textContent = `✓ Saved to ${cmd.folder}!`;
                        }
                    });
                }
            }
        };
        recognition.onend = () => {
            listening = false;
            recordBtn.classList.remove('listening');
            if (status) status.textContent = 'Tap to start';
        };
    }

    recordBtn.addEventListener('click', () => {
        if (!recognition) {
            alert('Speech recognition is not supported in this browser.');
            return;
        }
        if (!listening) {
            listening = true;
            recordBtn.classList.add('listening');
            if (status) status.textContent = 'Listening...';
            recognition.start();
        } else {
            recognition.stop();
        }
    });

    saveBtn.addEventListener('click', () => {
        const text = textArea.value.trim();
        if (!text) { alert('Say something first.'); return; }
        addJoke({
            title: text.slice(0, 30),
            text: text,
        });
        closeModal('voice-modal');
        navigateTo('jokes');
    });

    closeBtn?.addEventListener('click', () => closeModal('voice-modal'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal('voice-modal');
    });
}

async function autoOrganizeJokes() {
    const jokes = getJokes();
    if (!jokes.length) {
        alert('Add a few jokes first.');
        return;
    }

    const key = getApiKey();
    if (key) {
        try {
            const payload = jokes.map(j => ({ id: j.id, title: j.title, text: j.text || j.setup || '' }));
            const prompt = `You are organizing jokes into folders. Return JSON array of objects with id and folder. Use 3-6 folder names. Data: ${JSON.stringify(payload)}`;
            const content = await callOpenAI(prompt, key);
            const data = safeJsonParse(content);
            if (Array.isArray(data)) {
                applyFolderAssignments(data);
                alert('Auto-organized using AI.');
                renderView();
                return;
            }
        } catch (err) {
            console.error('Auto-organize error', err);
        }
    }

    // Fallback heuristic
    const assignments = jokes.map(j => ({
        id: j.id,
        folder: guessFolderFromText(`${j.title} ${j.text || j.setup || ''}`),
    }));
    applyFolderAssignments(assignments);
    alert('Auto-organized with built-in rules.');
    renderView();
}

function guessFolderFromText(text) {
    const t = text.toLowerCase();
    if (t.match(/date|love|relationship|marriage|breakup/)) return 'Relationships';
    if (t.match(/travel|airport|flight|hotel|vacation/)) return 'Travel';
    if (t.match(/work|boss|office|meeting|job/)) return 'Work';
    if (t.match(/family|mom|dad|kids|parents/)) return 'Family';
    if (t.match(/tech|phone|app|internet|ai/)) return 'Tech';
    return 'Misc';
}

function applyFolderAssignments(assignments) {
    const folders = getFolders();
    const folderMap = new Map(folders.map(f => [f.name.toLowerCase(), f]));
    const ensureFolder = (name) => {
        const key = name.toLowerCase();
        if (folderMap.has(key)) return folderMap.get(key);
        const folder = addFolder(name);
        if (folder) folderMap.set(key, folder);
        return folder;
    };

    const jokes = getJokes();
    const updates = new Map(assignments.map(a => [a.id, a.folder]));
    const next = jokes.map(j => {
        if (!updates.has(j.id)) return j;
        const folder = ensureFolder(updates.get(j.id) || 'Misc');
        return { ...j, folderId: folder ? folder.id : '' };
    });
    saveJokes(next);
}

function initApiKeyControls() {
    const input = document.getElementById('openai-key-input');
    const status = document.getElementById('api-status');
    const saveBtn = document.getElementById('save-api-key-btn');

    if (!input || !status || !saveBtn) return;

    const refresh = () => {
        const key = getApiKey();
        status.textContent = key ? 'API key set — using OpenAI' : 'No API key set — using built-in engine';
        status.classList.toggle('connected', !!key);
        status.classList.toggle('disconnected', !key);
        input.value = key ? '••••••••••••••••' : '';
    };

    saveBtn.addEventListener('click', () => {
        if (input.value && !input.value.startsWith('•')) {
            saveApiKey(input.value);
        }
        refresh();
    });

    refresh();
}

// ---------- Menu + Settings ----------
function initMenuControls() {
    const menuBtn = document.getElementById('menu-btn');
    const menu = document.getElementById('side-menu');
    const overlay = document.getElementById('menu-overlay');
    const closeBtn = document.getElementById('close-menu-btn');

    if (!menuBtn || !menu || !overlay || !closeBtn) return;

    const openMenu = () => {
        menu.classList.add('open');
        overlay.classList.add('open');
    };
    const closeMenu = () => {
        menu.classList.remove('open');
        overlay.classList.remove('open');
    };

    menuBtn.addEventListener('click', openMenu);
    closeBtn.addEventListener('click', closeMenu);
    overlay.addEventListener('click', closeMenu);

    menu.querySelectorAll('.side-menu-item[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            closeMenu();
            navigateTo(btn.dataset.view);
        });
    });
}

function initSettingsModal() {
    const settingsModal = document.getElementById('settings-modal');
    const openBtn = document.getElementById('open-settings-btn');
    const closeBtn = document.getElementById('close-settings-modal');

    if (!settingsModal || !openBtn || !closeBtn) return;

    const openModal = () => {
        settingsModal.classList.add('open');
        updatePermissionStatuses();
    };
    const closeModal = () => settingsModal.classList.remove('open');

    openBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    settingsModal.addEventListener('click', e => {
        if (e.target === settingsModal) closeModal();
    });

    initPermissionButtons();
    initApiKeyControls();
}

// ---------- Web Permissions (Equivalents) ----------
function setPermStatus(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

async function updatePermissionStatuses() {
    try {
        if (navigator.permissions?.query) {
            const mic = await navigator.permissions.query({ name: 'microphone' });
            setPermStatus('perm-mic-status', mic.state);
        } else {
            setPermStatus('perm-mic-status', 'Unknown');
        }
    } catch {
        setPermStatus('perm-mic-status', 'Unknown');
    }

    try {
        if (navigator.permissions?.query) {
            const cam = await navigator.permissions.query({ name: 'camera' });
            setPermStatus('perm-camera-status', cam.state);
        } else {
            setPermStatus('perm-camera-status', 'Unknown');
        }
    } catch {
        setPermStatus('perm-camera-status', 'Unknown');
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setPermStatus('perm-speech-status', SpeechRecognition ? 'Supported' : 'Unsupported');
    setPermStatus('perm-photo-status', 'User Prompt');
}

function initPermissionButtons() {
    const micBtn = document.getElementById('perm-mic-btn');
    const camBtn = document.getElementById('perm-camera-btn');
    const photoBtn = document.getElementById('perm-photo-btn');
    const speechBtn = document.getElementById('perm-speech-btn');
    const photoInput = document.getElementById('perm-photo-input');

    if (micBtn) {
        micBtn.addEventListener('click', async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(track => track.stop());
                setPermStatus('perm-mic-status', 'granted');
            } catch (err) {
                setPermStatus('perm-mic-status', err.name === 'NotAllowedError' ? 'denied' : 'error');
            }
        });
    }

    if (camBtn) {
        camBtn.addEventListener('click', async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                stream.getTracks().forEach(track => track.stop());
                setPermStatus('perm-camera-status', 'granted');
            } catch (err) {
                setPermStatus('perm-camera-status', err.name === 'NotAllowedError' ? 'denied' : 'error');
            }
        });
    }

    if (photoBtn && photoInput) {
        photoBtn.addEventListener('click', () => photoInput.click());
        photoInput.addEventListener('change', () => {
            setPermStatus('perm-photo-status', photoInput.files?.length ? 'granted' : 'user prompt');
            photoInput.value = '';
        });
    }

    if (speechBtn) {
        speechBtn.addEventListener('click', () => {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                setPermStatus('perm-speech-status', 'Unsupported');
                return;
            }
            try {
                const recognition = new SpeechRecognition();
                recognition.continuous = false;
                recognition.interimResults = false;
                recognition.onstart = () => setPermStatus('perm-speech-status', 'prompt');
                recognition.onresult = () => setPermStatus('perm-speech-status', 'granted');
                recognition.onerror = () => setPermStatus('perm-speech-status', 'denied');
                recognition.onend = () => {
                    // Leave last known status
                };
                recognition.start();
                setTimeout(() => {
                    try { recognition.stop(); } catch { /* ignore */ }
                }, 2000);
            } catch {
                setPermStatus('perm-speech-status', 'error');
            }
        });
    }
}

// ---------- Utility ----------
function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ---------- Chat Panel ----------
function initChatPanel() {
    const clownBtn  = document.getElementById('clown-chat-btn');
    const panel     = document.getElementById('chat-panel');
    const closeBtn  = document.getElementById('chat-close-btn');
    const voiceBtn  = document.getElementById('chat-voice-btn');
    const form      = document.getElementById('chat-form');
    const input     = document.getElementById('chat-input');
    const messages  = document.getElementById('chat-messages');
    const widget    = document.querySelector('elevenlabs-convai');

    if (!clownBtn || !panel) return;

    let chatHistory = [
        { role: 'system', content: 'You are BitBuddy, a funny clown comedy assistant. You help comedians write jokes, brainstorm material, and give feedback on bits. Keep answers concise and witty. Use humor when appropriate.' }
    ];

    // Toggle chat panel
    clownBtn.addEventListener('click', () => {
        const isOpen = panel.classList.contains('open');
        if (isOpen) {
            panel.classList.remove('open');
        } else {
            panel.classList.add('open');
            if (widget) widget.classList.remove('voice-active');
            input.focus();
        }
    });

    closeBtn.addEventListener('click', () => {
        panel.classList.remove('open');
    });

    // Voice button — activate ElevenLabs widget
    voiceBtn.addEventListener('click', () => {
        if (widget) {
            widget.classList.toggle('voice-active');
            // Try to click the widget's internal button
            const shadowBtn = widget.shadowRoot?.querySelector('button');
            if (shadowBtn) shadowBtn.click();
        }
    });

    function addMessage(text, role) {
        const div = document.createElement('div');
        div.className = `chat-msg chat-msg--${role}`;
        div.textContent = text;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
        return div;
    }

    // Send message
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;

        addMessage(text, 'user');
        input.value = '';

        chatHistory.push({ role: 'user', content: text });

        const typingEl = addMessage('thinking...', 'typing');

        const key = getApiKey();
        let reply = '';
        if (key) {
            try {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${key}`,
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages: chatHistory,
                        temperature: 0.9,
                        max_tokens: 300,
                    }),
                });
                if (response.ok) {
                    const json = await response.json();
                    reply = json.choices?.[0]?.message?.content || '';
                }
            } catch (err) {
                console.error('Chat error', err);
            }
        }

        if (!reply) {
            // Fallback responses when no API key
            const fallbacks = [
                "Add your OpenAI key in Settings to unlock my full brain! 🧠",
                "I'm funnier with an API key... hint hint! 🤡",
                "My comedy circuits need an API key to boot up! ⚡",
                "Set up an OpenAI key in ⚙️ Settings and I'll be your writing partner!",
            ];
            reply = fallbacks[Math.floor(Math.random() * fallbacks.length)];
        }

        typingEl.remove();
        addMessage(reply, 'bot');
        chatHistory.push({ role: 'assistant', content: reply });

        // Keep history reasonable
        if (chatHistory.length > 20) {
            chatHistory = [chatHistory[0], ...chatHistory.slice(-10)];
        }
    });
}


// ---------- Bootstrap ----------
window.addEventListener('load', async () => {
    initStorage();
    await openDB();

    // ── Auth gate: block app until user logs in ──
    const launchEl = document.getElementById('launch-screen');
    const authed = initAuthGate();

    // Hide launch screen after animation, then show auth gate if needed
    setTimeout(() => {
        if (launchEl) launchEl.style.display = 'none';
        const gate = document.getElementById('auth-gate');
        if (!authed && gate) gate.style.display = 'flex';
    }, 1400);

    // If not authenticated, don't init the rest yet — auth gate will reload on success
    if (!authed) return;

    // ── Authenticated: boot the app ──
    initMenuControls();
    initSettingsModal();
    initFabMenu();
    initAiModal();
    initVoiceModal();
    initJokebookModal();
    initUserFilesForm();
    renderUserFilesPanel();
    initChatPanel();

    // Parse initial hash
    const hash = window.location.hash.slice(1) || 'notepad';
    const [view, id] = hash.split('/');
    navigateTo(view || 'notepad', id ? { id } : {});

    // Top-level nav buttons
    document.querySelectorAll('nav button[data-view]').forEach(btn => {
        btn.addEventListener('click', () => navigateTo(btn.dataset.view));
    });

    // Browser back/forward support
    window.addEventListener('popstate', () => {
        const h = window.location.hash.slice(1) || 'notepad';
        const [v, i] = h.split('/');
        currentView   = v || 'notepad';
        currentParams = i ? { id: i } : {};
        renderView();
    });
});
