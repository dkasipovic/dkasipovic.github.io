// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileMeta = document.getElementById('fileMeta');
const loadNewBtn = document.getElementById('loadNewBtn');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const results = document.getElementById('results');
const md5Value = document.getElementById('md5Value');
const sha1Value = document.getElementById('sha1Value');
const sha256Value = document.getElementById('sha256Value');
const sha384Value = document.getElementById('sha384Value');
const sha512Value = document.getElementById('sha512Value');
const crc32Value = document.getElementById('crc32Value');

// Hash results storage for copy buttons
const hashResults = {};

// Event Listeners
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);
loadNewBtn.addEventListener('click', resetView);

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
});

// Copy buttons
document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
        const hashType = btn.dataset.hash;
        const value = hashResults[hashType];
        if (!value) return;

        navigator.clipboard.writeText(value).then(() => {
            btn.classList.add('copied');
            setTimeout(() => btn.classList.remove('copied'), 1500);
        });
    });
});

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) processFile(file);
}

function resetView() {
    dropZone.classList.remove('hidden');
    fileInfo.classList.remove('visible');
    progressContainer.classList.remove('visible');
    results.classList.remove('visible');
    fileInput.value = '';
    progressFill.style.width = '0%';
    progressFill.classList.remove('indeterminate');
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

async function processFile(file) {
    // Show file info
    dropZone.classList.add('hidden');
    fileInfo.classList.add('visible');
    fileName.textContent = file.name;
    fileMeta.textContent = formatFileSize(file.size) + ' \u2022 ' + (file.type || 'Unknown type');

    // Show progress
    progressContainer.classList.add('visible');
    results.classList.remove('visible');
    progressFill.style.width = '0%';
    progressText.textContent = 'Reading file\u2026';

    // Clear previous results
    md5Value.textContent = '';
    sha1Value.textContent = '';
    sha256Value.textContent = '';
    sha384Value.textContent = '';
    sha512Value.textContent = '';
    crc32Value.textContent = '';

    try {
        // Read file in chunks with progress (0-100%)
        const totalSize = file.size;
        const reader = file.stream().getReader();
        const chunks = [];
        let loaded = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.length;
            const pct = Math.round((loaded / totalSize) * 100);
            progressFill.style.width = pct + '%';
            progressText.textContent = 'Reading file\u2026 ' + formatFileSize(loaded) + ' / ' + formatFileSize(totalSize);
        }

        // Combine chunks into a single buffer
        const data = new Uint8Array(totalSize);
        let offset = 0;
        for (const chunk of chunks) {
            data.set(chunk, offset);
            offset += chunk.length;
        }

        // Switch to indeterminate animation for hash calculation
        progressFill.classList.add('indeterminate');
        progressText.textContent = 'Calculating hashes\u2026';

        // Offload hash computation to Web Worker
        const result = await computeHashesInWorker(data.buffer);

        // Store results
        hashResults.md5 = result.md5;
        hashResults.sha1 = result.sha1;
        hashResults.sha256 = result.sha256;
        hashResults.sha384 = result.sha384;
        hashResults.sha512 = result.sha512;
        hashResults.crc32 = result.crc32;

        // Display results
        md5Value.textContent = result.md5;
        sha1Value.textContent = result.sha1;
        sha256Value.textContent = result.sha256;
        sha384Value.textContent = result.sha384;
        sha512Value.textContent = result.sha512;
        crc32Value.textContent = result.crc32;

        // Stop indeterminate animation and show complete
        progressFill.classList.remove('indeterminate');
        progressFill.style.width = '100%';
        progressText.textContent = 'Done';

        setTimeout(() => {
            progressContainer.classList.remove('visible');
            results.classList.add('visible');
        }, 400);

    } catch (err) {
        progressFill.classList.remove('indeterminate');
        progressText.textContent = 'Error: ' + err.message;
        progressFill.style.width = '0%';
    }
}

function computeHashesInWorker(buffer) {
    return new Promise((resolve, reject) => {
        const worker = new Worker('worker.js');
        worker.onmessage = (e) => {
            worker.terminate();
            if (e.data.error) {
                reject(new Error(e.data.error));
            } else {
                resolve(e.data);
            }
        };
        worker.onerror = (err) => {
            worker.terminate();
            reject(new Error('Worker failed'));
        };
        // Transfer the buffer to avoid copying
        worker.postMessage(buffer, [buffer]);
    });
}

// Register service worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}
