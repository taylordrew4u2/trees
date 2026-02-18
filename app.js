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
        alert('Microphone access is required. Please allow microphone access in your browser settings.');
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
        case 'home':           renderHome();                              break;
        case 'jokes':          renderJokes();                             break;
        case 'joke-form':      renderJokeForm(currentParams.id);         break;
        case 'setlists':       renderSetLists();                          break;
        case 'setlist-detail': renderSetListDetail(currentParams.id);    break;
        case 'create-setlist': renderCreateSetList(currentParams.id);    break;
        case 'recordings':     renderRecordings();                        break;
        case 'recording-detail': renderRecordingDetail(currentParams.id); break;
        case 'record-set':     renderRecordSet(currentParams.id);        break;
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
    const addBtn = document.getElementById('add-joke-btn');

    function renderJokesList(filter = '') {
        const lower = filter.toLowerCase();
        const filtered = jokes.filter(j =>
            j.title.toLowerCase().includes(lower) ||
            (j.body && j.body.toLowerCase().includes(lower))
        );

        if (filtered.length === 0) {
            container.innerHTML = `<p class="empty">${filter ? 'No jokes match your search.' : 'No jokes yet. Add your first one!'}</p>`;
            return;
        }

        container.innerHTML = filtered.map(j => `
            <div class="list-item" data-id="${j.id}">
                <h3>${escapeHTML(j.title)}</h3>
                <p>${escapeHTML((j.body || '').slice(0, 100))}${j.body && j.body.length > 100 ? '…' : ''}</p>
                <small style="color:var(--text-secondary);">Updated: ${new Date(j.updatedAt).toLocaleDateString()}</small>
            </div>
        `).join('');

        container.querySelectorAll('.list-item').forEach(el => {
            el.addEventListener('click', () => navigateTo('joke-form', { id: el.dataset.id }));
        });
    }

    renderJokesList();
    searchInput.addEventListener('input', e => renderJokesList(e.target.value));
    addBtn.addEventListener('click', () => navigateTo('joke-form'));
}

function renderJokeForm(id) {
    const isEdit = !!id;
    const titleEl     = document.getElementById('joke-form-title');
    const titleInput  = document.getElementById('joke-title');
    const bodyInput   = document.getElementById('joke-body');
    const cancelBtn   = document.getElementById('cancel-joke-btn');
    const deleteBtn   = document.getElementById('delete-joke-btn');
    const form        = document.getElementById('joke-form');

    if (isEdit) {
        const joke = getJokes().find(j => j.id === id);
        if (!joke) { navigateTo('jokes'); return; }
        titleEl.textContent   = 'Edit Joke';
        titleInput.value      = joke.title;
        bodyInput.value       = joke.body || '';
        deleteBtn.style.display = 'inline-block';
    } else {
        titleEl.textContent     = 'Add Joke';
        titleInput.value        = '';
        bodyInput.value         = '';
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
        const body = bodyInput.value;
        if (isEdit) {
            updateJoke(id, { title, body });
        } else {
            addJoke({ title, body });
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

function renderRecordSet(setListId) {
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

// ---------- Bootstrap ----------
window.addEventListener('load', async () => {
    initStorage();
    await openDB();

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
