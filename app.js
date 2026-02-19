// app.js – Comedy Set Organizer Web App

// ---------- Data Layer ----------
// Jokes and SetLists stored in localStorage
// Recordings stored in IndexedDB (audio blobs + metadata)

const STORAGE_KEYS = {
    JOKES: 'comedy_jokes',
    SETLISTS: 'comedy_setlists',
};

// Initialize default data if empty
function initStorage() {
    if (!localStorage.getItem(STORAGE_KEYS.JOKES)) {
        localStorage.setItem(STORAGE_KEYS.JOKES, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SETLISTS)) {
        localStorage.setItem(STORAGE_KEYS.SETLISTS, JSON.stringify([]));
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
        navigateTo('home');
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
    }
}

// ---------- View Renderers ----------

function renderHome() {
    document.querySelectorAll('.home-button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const view = e.currentTarget.dataset.view;
            if (view) navigateTo(view);
        });
    });
}

function renderJokes() {
    const jokes = getJokes();
    const container = document.getElementById('jokes-list');
    const searchInput = document.getElementById('joke-search');
    const sortSelect = document.getElementById('joke-sort');
    const statusFilter = document.getElementById('joke-filter-status');
    const categoryFilter = document.getElementById('joke-filter-category');
    const addBtn = document.getElementById('add-joke-btn');

    function renderJokesList() {
        const search = (searchInput.value || '').toLowerCase();
        const status = statusFilter.value;
        const category = (categoryFilter.value || '').toLowerCase();
        const sortBy = sortSelect.value;

        let filtered = jokes.filter(j => {
            const matchSearch = !search ||
                j.title.toLowerCase().includes(search) ||
                (j.setup && j.setup.toLowerCase().includes(search)) ||
                (j.punchline && j.punchline.toLowerCase().includes(search)) ||
                (j.body && j.body.toLowerCase().includes(search));
            const matchStatus = !status || j.status === status;
            const matchCategory = !category || (j.category && j.category.toLowerCase().includes(category));
            return matchSearch && matchStatus && matchCategory;
        });

        // Sort
        filtered.sort((a, b) => {
            switch (sortBy) {
                case 'oldest':  return new Date(a.createdAt) - new Date(b.createdAt);
                case 'title':   return (a.title || '').localeCompare(b.title || '');
                case 'rating':  return (b.rating || 0) - (a.rating || 0);
                case 'newest':
                default:        return new Date(b.createdAt) - new Date(a.createdAt);
            }
        });

        if (filtered.length === 0) {
            container.innerHTML = `<p class="empty">${search || status || category ? 'No jokes match your filters.' : 'No jokes yet. Add your first one!'}</p>`;
            return;
        }

        const statusLabels = { idea: '💡 Idea', draft: '✏️ Draft', 'stage-ready': '🎤 Stage Ready', retired: '📦 Retired' };

        container.innerHTML = filtered.map(j => {
            const stars = j.rating ? '★'.repeat(j.rating) + '☆'.repeat(5 - j.rating) : '';
            const statusBadge = j.status ? `<span class="joke-status joke-status--${j.status}">${statusLabels[j.status] || j.status}</span>` : '';
            const preview = j.setup || j.body || '';
            return `
            <div class="list-item" data-id="${j.id}">
                <h3>${escapeHTML(j.title)}${statusBadge}</h3>
                <p>${escapeHTML(preview.slice(0, 120))}${preview.length > 120 ? '…' : ''}</p>
                ${stars ? `<span class="joke-rating-stars">${stars}</span>` : ''}
                <small>Updated: ${new Date(j.updatedAt).toLocaleDateString()}${j.category ? ' • ' + escapeHTML(j.category) : ''}</small>
            </div>
        `;
        }).join('');

        container.querySelectorAll('.list-item').forEach(el => {
            el.addEventListener('click', () => navigateTo('joke-form', { id: el.dataset.id }));
        });
    }

    renderJokesList();
    searchInput.addEventListener('input', renderJokesList);
    sortSelect.addEventListener('change', renderJokesList);
    statusFilter.addEventListener('change', renderJokesList);
    categoryFilter.addEventListener('input', renderJokesList);
    addBtn.addEventListener('click', () => navigateTo('joke-form'));
}

function renderJokeForm(id) {
    const isEdit = !!id;
    const titleEl       = document.getElementById('joke-form-title');
    const titleInput    = document.getElementById('joke-title');
    const setupInput    = document.getElementById('joke-setup');
    const punchInput    = document.getElementById('joke-punchline');
    const bodyInput     = document.getElementById('joke-body');
    const statusSelect  = document.getElementById('joke-status');
    const categoryInput = document.getElementById('joke-category');
    const tagsInput     = document.getElementById('joke-tags');
    const ratingEl      = document.getElementById('joke-rating');
    const cancelBtn     = document.getElementById('cancel-joke-btn');
    const deleteBtn     = document.getElementById('delete-joke-btn');
    const form          = document.getElementById('joke-form');

    let currentRating = 0;

    // Star rating interaction
    function updateStars(value) {
        currentRating = value;
        ratingEl.querySelectorAll('.star').forEach(s => {
            s.classList.toggle('active', parseInt(s.dataset.value) <= value);
        });
    }
    ratingEl.querySelectorAll('.star').forEach(s => {
        s.addEventListener('click', () => updateStars(parseInt(s.dataset.value)));
    });

    // Pre-fill if editing or if there's notepad text for export
    if (isEdit) {
        const joke = getJokes().find(j => j.id === id);
        if (!joke) { navigateTo('jokes'); return; }
        titleEl.textContent     = 'Edit Joke';
        titleInput.value        = joke.title || '';
        setupInput.value        = joke.setup || '';
        punchInput.value        = joke.punchline || '';
        bodyInput.value         = joke.body || '';
        statusSelect.value      = joke.status || 'idea';
        categoryInput.value     = joke.category || '';
        tagsInput.value         = (joke.tags || []).join(', ');
        updateStars(joke.rating || 0);
        deleteBtn.style.display = 'inline-block';
    } else {
        titleEl.textContent     = 'Add Joke';
        // Check for notepad export text
        const exportText = sessionStorage.getItem('notepad_export_text');
        if (exportText) {
            setupInput.value = exportText;
            sessionStorage.removeItem('notepad_export_text');
        }
        deleteBtn.style.display = 'none';
    }

    cancelBtn.addEventListener('click', () => navigateTo('jokes'));

    form.addEventListener('submit', e => {
        e.preventDefault();
        const title = titleInput.value.trim();
        if (!title || title.length > 20) {
            alert('Title must be 1-20 characters');
            return;
        }
        const jokeData = {
            title,
            setup: setupInput.value,
            punchline: punchInput.value,
            body: bodyInput.value,
            status: statusSelect.value,
            category: categoryInput.value.trim(),
            tags: tagsInput.value.split(',').map(t => t.trim()).filter(Boolean),
            rating: currentRating,
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

// ---------- Password Gate ----------
const CORRECT_PASSWORD = '69240';

function initPasswordGate() {
    // Already authenticated this session?
    if (sessionStorage.getItem('comedy_auth') === '1') {
        unlockApp();
        return;
    }

    const gate       = document.getElementById('password-gate');
    const form       = document.getElementById('password-form');
    const input      = document.getElementById('password-input');
    const errorMsg   = document.getElementById('password-error');

    gate.style.display = 'flex';

    form.addEventListener('submit', e => {
        e.preventDefault();
        if (input.value === CORRECT_PASSWORD) {
            sessionStorage.setItem('comedy_auth', '1');
            gate.style.animation = 'fadeOut 0.25s forwards';
            setTimeout(unlockApp, 250);
        } else {
            errorMsg.style.display = 'block';
            input.value = '';
            input.classList.add('input-error');
            setTimeout(() => input.classList.remove('input-error'), 400);
            input.focus();
        }
    });
}

function unlockApp() {
    document.getElementById('password-gate').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
}

// ---------- Bootstrap ----------
window.addEventListener('load', async () => {
    initPasswordGate();
    initStorage();
    await openDB();
    initMenuControls();
    initSettingsModal();

    // Parse initial hash
    const hash = window.location.hash.slice(1) || 'home';
    const [view, id] = hash.split('/');
    navigateTo(view || 'home', id ? { id } : {});

    // Top-level nav buttons
    document.querySelectorAll('nav button[data-view]').forEach(btn => {
        btn.addEventListener('click', () => navigateTo(btn.dataset.view));
    });

    // Browser back/forward support
    window.addEventListener('popstate', () => {
        const h = window.location.hash.slice(1) || 'home';
        const [v, i] = h.split('/');
        currentView   = v || 'home';
        currentParams = i ? { id: i } : {};
        renderView();
    });
});
