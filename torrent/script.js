/* ── Torrent Player ── */
/* Streams a torrent straight into a <video> element. Everything runs in the tab:
   WebTorrent finds peers over WebRTC, and a service worker answers the range
   requests the video element makes. There is no backend. */

const WEBTORRENT_URL = 'https://cdn.jsdelivr.net/npm/webtorrent@3.0.21/dist/webtorrent.min.js';

// A browser can only announce to WebSocket trackers — udp:// and http:// trackers carried
// in a magnet link are unreachable from a tab and WebTorrent drops them.
const DEFAULT_TRACKERS = [
    'wss://tracker.webtorrent.dev',
    'wss://tracker.openwebtorrent.com',
    'wss://tracker.btorrent.xyz',
    'wss://tracker.files.fm:7073/announce',
];

// Sintel, from the WebTorrent project. It carries a web seed (ws=), so it downloads over
// plain HTTPS and plays even when no WebRTC peer is online — which makes it the one magnet
// guaranteed to demonstrate the tool.
const DEMO_MAGNET = 'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10' +
    '&dn=Sintel&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com' +
    '&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F' +
    '&xs=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2Fsintel.torrent';

const TRACKER_STORAGE_KEY = 'torrent-player-trackers';
const NO_PEERS_TIMEOUT_MS = 20000;

// Containers the browser can demux. Firefox has never shipped Matroska.
const PLAYABLE_EXT = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv', 'ogg']);
const MKV_EXT = new Set(['mkv', 'webm']);
const VIDEO_EXT = new Set([
    'mp4', 'm4v', 'mov', 'webm', 'ogv', 'ogg', 'mkv',
    'avi', 'mpeg', 'mpg', 'wmv', 'flv', 'ts', 'm2ts', 'divx', 'rmvb',
]);

const el = (id) => document.getElementById(id);

const ui = {
    unsupportedCard: el('unsupportedCard'),
    unsupportedText: el('unsupportedText'),
    sourceCard: el('sourceCard'),
    magnetInput: el('magnetInput'),
    magnetError: el('magnetError'),
    loadBtn: el('loadBtn'),
    pasteBtn: el('pasteBtn'),
    demoBtn: el('demoBtn'),
    trackerInput: el('trackerInput'),
    resetTrackersBtn: el('resetTrackersBtn'),
    statusCard: el('statusCard'),
    torrentName: el('torrentName'),
    stopBtn: el('stopBtn'),
    progressBar: el('progressBar'),
    statProgress: el('statProgress'),
    statPeers: el('statPeers'),
    statDown: el('statDown'),
    statUp: el('statUp'),
    statDownloaded: el('statDownloaded'),
    statEta: el('statEta'),
    peerNote: el('peerNote'),
    playerCard: el('playerCard'),
    player: el('player'),
    playerNote: el('playerNote'),
    filesCard: el('filesCard'),
    fileList: el('fileList'),
};

let client = null;
let torrent = null;
let activeFile = null;
let statsTimer = null;
let noPeersTimer = null;
let swRegistration = null;
let WebTorrentCtor = null;

// Other tabs of this tool announce themselves here so the startup storage sweep does not
// delete a torrent another tab is still streaming.
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('kasipovic-torrent') : null;

/* ── Formatting ── */

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

function formatSpeed(bytesPerSecond) {
    if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '0 B/s';
    return `${formatBytes(bytesPerSecond)}/s`;
}

function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '—';
    const total = Math.round(ms / 1000);
    if (total > 86400) return 'over a day';
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
    if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
    return `${s}s`;
}

function extensionOf(name) {
    const dot = name.lastIndexOf('.');
    return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

function isPlayable(name) {
    const ext = extensionOf(name);
    if (PLAYABLE_EXT.has(ext)) return true;
    // Matroska plays everywhere except Firefox, which has no demuxer for it.
    if (MKV_EXT.has(ext)) return !navigator.userAgent.includes('Firefox');
    return false;
}

/* ── Notes and errors ── */

function showNote(node, text, variant) {
    node.textContent = text;
    node.className = variant ? `note ${variant}` : 'note';
    node.hidden = false;
}

function hideNote(node) {
    node.hidden = true;
    node.textContent = '';
}

function showMagnetError(message) {
    ui.magnetError.textContent = message;
    ui.magnetError.hidden = false;
    ui.magnetInput.classList.add('invalid');
}

function clearMagnetError() {
    ui.magnetError.hidden = true;
    ui.magnetInput.classList.remove('invalid');
}

/* ── Trackers ── */

function readTrackers() {
    return ui.trackerInput.value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
}

function loadTrackers() {
    let stored = null;
    try {
        stored = localStorage.getItem(TRACKER_STORAGE_KEY);
    } catch {
        // Storage can be blocked; the defaults below are fine.
    }
    ui.trackerInput.value = (stored || DEFAULT_TRACKERS.join('\n'));
}

function saveTrackers() {
    try {
        localStorage.setItem(TRACKER_STORAGE_KEY, ui.trackerInput.value);
    } catch {
        // Not worth surfacing — the list still applies to this session.
    }
}

/* ── Storage ── */

// WebTorrent keeps pieces in the origin private file system, in a directory named after the
// torrent plus a `chunks/` sibling. `destroyStoreOnDestroy` clears those on a clean exit, but
// a tab that is killed outright never gets to run it, so sweep whatever is left at startup.
// This tool is the only thing on kasipovic.com that touches OPFS, so the whole root is ours.
async function purgeStorage() {
    try {
        if (!navigator.storage?.getDirectory) return;
        if (await otherTabIsStreaming()) return;

        const root = await navigator.storage.getDirectory();
        const names = [];
        for await (const name of root.keys()) names.push(name);
        await Promise.all(
            names.map((name) => root.removeEntry(name, { recursive: true }).catch(() => {}))
        );
    } catch {
        // OPFS is unavailable in some private-browsing modes. Nothing to clean there.
    }
}

function otherTabIsStreaming() {
    if (!channel) return Promise.resolve(false);
    return new Promise((resolve) => {
        const onMessage = (event) => {
            if (event.data === 'streaming') finish(true);
        };
        const timer = setTimeout(() => finish(false), 250);
        function finish(result) {
            clearTimeout(timer);
            channel.removeEventListener('message', onMessage);
            resolve(result);
        }
        channel.addEventListener('message', onMessage);
        channel.postMessage('who-is-streaming');
    });
}

if (channel) {
    channel.addEventListener('message', (event) => {
        if (event.data === 'who-is-streaming' && torrent) channel.postMessage('streaming');
    });
}

/* ── Client setup ── */

async function ensureClient() {
    if (client) return client;

    if (!WebTorrentCtor) {
        const module = await import(WEBTORRENT_URL);
        WebTorrentCtor = module.default;
    }

    client = new WebTorrentCtor();
    client.on('error', (err) => {
        showNote(ui.peerNote, `Torrent error: ${err.message || err}`, 'note-error');
    });

    // The video element's range requests are answered by the service worker, so the page has
    // to be under its control before streaming starts. On a first-ever visit the worker is
    // still activating, and an uncontrolled page would get an unhandled request.
    const registration = swRegistration || await navigator.serviceWorker.ready;
    await waitForController();
    client.createServer({ controller: registration });

    return client;
}

function waitForController() {
    if (navigator.serviceWorker.controller) return Promise.resolve();
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, 3000);
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            clearTimeout(timer);
            resolve();
        }, { once: true });
    });
}

/* ── Loading a torrent ── */

function normaliseTorrentId(raw) {
    const value = raw.trim();
    if (!value) return null;
    if (value.startsWith('magnet:')) return value;
    if (/^[0-9a-f]{40}$/i.test(value)) return `magnet:?xt=urn:btih:${value.toLowerCase()}`;
    if (/^[A-Z2-7]{32}$/i.test(value)) return `magnet:?xt=urn:btih:${value.toUpperCase()}`;
    return null;
}

async function loadTorrent(raw) {
    const torrentId = normaliseTorrentId(raw);
    if (!torrentId) {
        showMagnetError('That does not look like a magnet link or an info hash.');
        return;
    }

    clearMagnetError();
    resetTorrent();

    ui.loadBtn.disabled = true;
    ui.loadBtn.textContent = 'Starting…';

    let active;
    try {
        active = await ensureClient();
    } catch (err) {
        ui.loadBtn.disabled = false;
        ui.loadBtn.textContent = 'Load torrent';
        showMagnetError(`Could not load the torrent engine: ${err.message || err}`);
        return;
    }

    ui.loadBtn.disabled = false;
    ui.loadBtn.textContent = 'Load torrent';

    ui.statusCard.hidden = false;
    ui.torrentName.textContent = 'Fetching metadata…';
    showNote(ui.peerNote, 'Looking for peers over WebRTC…');

    try {
        torrent = active.add(torrentId, {
            announce: readTrackers(),
            // Nothing downloads until a file is picked, so opening a torrent to look at its
            // contents costs almost no bandwidth.
            deselect: true,
            destroyStoreOnDestroy: true,
        }, onTorrentReady);
    } catch (err) {
        showMagnetError(`Could not add that torrent: ${err.message || err}`);
        resetTorrent();
        return;
    }

    torrent.on('error', (err) => {
        showNote(ui.peerNote, `Torrent error: ${err.message || err}`, 'note-error');
    });

    startStats();
    noPeersTimer = setTimeout(reportNoPeers, NO_PEERS_TIMEOUT_MS);
}

function onTorrentReady(readyTorrent) {
    if (readyTorrent !== torrent) return;

    ui.torrentName.textContent = readyTorrent.name;
    hideNote(ui.peerNote);
    renderFiles(readyTorrent);

    // Start the largest playable file straight away — it is what someone pasting a magnet
    // for a film is after, and anything else is one tap away in the list.
    const candidate = [...readyTorrent.files]
        .filter((file) => isPlayable(file.name))
        .sort((a, b) => b.length - a.length)[0];
    if (candidate) playFile(candidate);
}

function reportNoPeers() {
    if (!torrent) return;
    if (torrent.numPeers > 0 || torrent.downloaded > 0) return;

    showNote(
        ui.peerNote,
        'No peers yet. A browser can only connect to peers over WebRTC, so a torrent seeded '
        + 'only by ordinary BitTorrent clients is unreachable from here — nothing on this page '
        + 'can change that. It will keep trying. "Try a demo" loads a torrent that is known to work.',
        'note-warn'
    );
}

/* ── Files ── */

function renderFiles(readyTorrent) {
    const files = [...readyTorrent.files].sort((a, b) => {
        const aVideo = VIDEO_EXT.has(extensionOf(a.name));
        const bVideo = VIDEO_EXT.has(extensionOf(b.name));
        if (aVideo !== bVideo) return aVideo ? -1 : 1;
        return b.length - a.length;
    });

    ui.fileList.replaceChildren();

    for (const file of files) {
        const row = document.createElement('li');
        row.className = 'file-row';

        const main = document.createElement('div');
        main.className = 'file-main';

        const name = document.createElement('span');
        name.className = 'file-name';
        name.textContent = file.name;

        const meta = document.createElement('span');
        meta.className = 'file-meta';
        const playable = isPlayable(file.name);
        const isVideo = VIDEO_EXT.has(extensionOf(file.name));
        meta.textContent = formatBytes(file.length)
            + (isVideo && !playable ? ' · this browser cannot decode this container' : '');

        main.append(name, meta);
        row.append(main);

        if (playable) {
            const play = document.createElement('button');
            play.className = 'btn btn-small';
            play.textContent = 'Play';
            play.addEventListener('click', () => playFile(file));
            row.append(play);
        }

        const save = document.createElement('a');
        save.className = 'btn btn-small btn-ghost';
        save.textContent = 'Save';
        save.download = file.name;
        save.href = file.streamURL;
        // Without this the browser would only fetch pieces as the download drains them at
        // whatever rate the disk writer asks for.
        save.addEventListener('click', () => file.select());
        row.append(save);

        row.dataset.path = file.path;
        ui.fileList.append(row);
    }

    ui.filesCard.hidden = false;
}

function playFile(file) {
    activeFile = file;
    file.select();

    for (const row of ui.fileList.children) {
        row.classList.toggle('is-active', row.dataset.path === file.path);
    }

    ui.playerCard.hidden = false;
    hideNote(ui.playerNote);
    file.streamTo(ui.player);

    const playAttempt = ui.player.play();
    if (playAttempt) playAttempt.catch(() => {
        // Autoplay with sound is blocked until the page has been interacted with. The
        // controls are right there, so this is not worth a message.
    });
}

ui.player.addEventListener('error', () => {
    if (!activeFile) return;
    showNote(
        ui.playerNote,
        `${activeFile.name} could not be decoded. The container may be fine while the codec `
        + 'inside is not — H.265 video and AC3 audio are the usual culprits. Use Save to '
        + 'download it and play it in a desktop player.',
        'note-error'
    );
});

/* ── Stats ── */

function startStats() {
    stopStats();
    // The 'download' event fires once per piece, which is far too often to touch the DOM on.
    statsTimer = setInterval(updateStats, 500);
    updateStats();
}

function stopStats() {
    if (statsTimer) clearInterval(statsTimer);
    statsTimer = null;
}

function updateStats() {
    if (!torrent) return;

    // With `deselect` the torrent-wide progress counts pieces nobody asked for, so once a
    // file is playing its own progress is the number that means anything.
    const progress = activeFile ? activeFile.progress : torrent.progress;
    const downloaded = activeFile ? activeFile.downloaded : torrent.downloaded;
    const total = activeFile ? activeFile.length : torrent.length;

    const percent = Math.min(100, Math.round((progress || 0) * 100));
    ui.progressBar.style.width = `${percent}%`;
    ui.statProgress.textContent = `${percent}%`;
    ui.statPeers.textContent = String(torrent.numPeers);
    ui.statDown.textContent = formatSpeed(torrent.downloadSpeed);
    ui.statUp.textContent = formatSpeed(torrent.uploadSpeed);
    ui.statDownloaded.textContent = total
        ? `${formatBytes(downloaded)} / ${formatBytes(total)}`
        : formatBytes(downloaded);

    const remaining = total - downloaded;
    ui.statEta.textContent = remaining <= 0
        ? 'done'
        : (torrent.downloadSpeed > 0
            ? formatDuration((remaining / torrent.downloadSpeed) * 1000)
            : '—');

    if (torrent.numPeers > 0 && ui.peerNote.classList.contains('note-warn')) {
        hideNote(ui.peerNote);
    }
}

/* ── Teardown ── */

function resetTorrent() {
    stopStats();
    if (noPeersTimer) clearTimeout(noPeersTimer);
    noPeersTimer = null;

    if (torrent && client) {
        const current = torrent;
        torrent = null;
        // destroyStore wipes the pieces this torrent wrote to OPFS.
        client.remove(current, { destroyStore: true }, () => {});
    }
    activeFile = null;

    ui.player.pause();
    ui.player.removeAttribute('src');
    ui.player.load();

    ui.statusCard.hidden = true;
    ui.filesCard.hidden = true;
    ui.playerCard.hidden = true;
    ui.fileList.replaceChildren();
    hideNote(ui.peerNote);
    hideNote(ui.playerNote);
    ui.progressBar.style.width = '0%';
}

window.addEventListener('pagehide', () => {
    // Best effort: the tab may be gone before this finishes, which is why purgeStorage()
    // sweeps leftovers on the next visit.
    if (client) client.destroy();
});

/* ── Capability gate ── */

function unsupportedReason() {
    if (!window.isSecureContext) {
        return 'This tool needs a secure context (https). Open it over https and it will work.';
    }
    if (typeof RTCPeerConnection === 'undefined') {
        return 'This browser has no WebRTC support, which is the only way a tab can reach '
            + 'torrent peers.';
    }
    if (!('serviceWorker' in navigator)) {
        return 'This browser has no service worker support, which is how video is streamed '
            + 'out of the torrent. Private browsing in some browsers disables it.';
    }
    return null;
}

/* ── Wiring ── */

function init() {
    const reason = unsupportedReason();
    if (reason) {
        ui.unsupportedText.textContent = reason;
        ui.unsupportedCard.hidden = false;
        ui.sourceCard.hidden = true;
        return;
    }

    loadTrackers();
    purgeStorage();

    navigator.serviceWorker.register('sw.js')
        .then((registration) => { swRegistration = registration; })
        .catch(() => {
            ui.unsupportedText.textContent = 'The service worker could not be registered, so '
                + 'video cannot be streamed out of the torrent. This usually means storage is '
                + 'blocked for this site.';
            ui.unsupportedCard.hidden = false;
        });

    ui.loadBtn.addEventListener('click', () => loadTorrent(ui.magnetInput.value));
    ui.magnetInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') loadTorrent(ui.magnetInput.value);
    });
    ui.magnetInput.addEventListener('input', clearMagnetError);

    ui.demoBtn.addEventListener('click', () => {
        ui.magnetInput.value = DEMO_MAGNET;
        loadTorrent(DEMO_MAGNET);
    });

    ui.stopBtn.addEventListener('click', resetTorrent);

    if (navigator.clipboard?.readText) {
        ui.pasteBtn.hidden = false;
        ui.pasteBtn.addEventListener('click', async () => {
            try {
                ui.magnetInput.value = await navigator.clipboard.readText();
                clearMagnetError();
            } catch {
                showMagnetError('Clipboard access was denied. Paste into the field instead.');
            }
        });
    }

    ui.trackerInput.addEventListener('change', saveTrackers);
    ui.resetTrackersBtn.addEventListener('click', () => {
        ui.trackerInput.value = DEFAULT_TRACKERS.join('\n');
        saveTrackers();
    });

    // Deep links use a query parameter rather than the hash, because /shared/app.js reads
    // location.hash to decide whether to draw the back arrow.
    const shared = new URLSearchParams(location.search).get('magnet');
    if (shared) {
        ui.magnetInput.value = shared;
        loadTorrent(shared);
    }
}

init();
