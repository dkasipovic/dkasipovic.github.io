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
    crc32Value.textContent = '';

    try {
        // Read file in chunks with progress
        const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB
        const totalSize = file.size;
        const reader = file.stream().getReader();
        const chunks = [];
        let loaded = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.length;
            const pct = Math.round((loaded / totalSize) * 70); // reading = 0-70%
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
        const buffer = data.buffer;

        progressText.textContent = 'Calculating hashes\u2026';
        progressFill.style.width = '70%';

        // Calculate all hashes
        const [md5, sha1, sha256, crc32] = await Promise.all([
            computeMD5(data).then(r => { progressFill.style.width = '80%'; return r; }),
            computeSHA1(buffer).then(r => { progressFill.style.width = '85%'; return r; }),
            computeSHA256(buffer).then(r => { progressFill.style.width = '90%'; return r; }),
            Promise.resolve(computeCRC32(data)).then(r => { progressFill.style.width = '95%'; return r; }),
        ]);

        // Store results
        hashResults.md5 = md5;
        hashResults.sha1 = sha1;
        hashResults.sha256 = sha256;
        hashResults.crc32 = crc32;

        // Display results
        md5Value.textContent = md5;
        sha1Value.textContent = sha1;
        sha256Value.textContent = sha256;
        crc32Value.textContent = crc32;

        progressFill.style.width = '100%';
        progressText.textContent = 'Done';

        setTimeout(() => {
            progressContainer.classList.remove('visible');
            results.classList.add('visible');
        }, 400);

    } catch (err) {
        progressText.textContent = 'Error: ' + err.message;
        progressFill.style.width = '0%';
    }
}

// --- SHA-256 via Web Crypto API ---
async function computeSHA256(buffer) {
    const hash = await crypto.subtle.digest('SHA-256', buffer);
    return bufferToHex(hash);
}

// --- SHA-1 via Web Crypto API ---
async function computeSHA1(buffer) {
    const hash = await crypto.subtle.digest('SHA-1', buffer);
    return bufferToHex(hash);
}

function bufferToHex(buffer) {
    const bytes = new Uint8Array(buffer);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
}

// --- CRC-32 ---
const crc32Table = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c;
    }
    return table;
})();

function computeCRC32(data) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
        crc = crc32Table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return ((crc ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, '0');
}

// --- MD5 (pure JS implementation) ---
async function computeMD5(data) {
    // Process in chunks to avoid blocking UI on large files
    return new Promise(resolve => {
        setTimeout(() => resolve(md5(data)), 0);
    });
}

function md5(data) {
    const len = data.length;

    // Pre-processing: adding padding bits
    // Message needs to be padded to 64-byte (512-bit) blocks
    const bitLen = len * 8;
    // Append 0x80, then zeros, then 64-bit length
    const padLen = ((56 - (len + 1) % 64) + 64) % 64;
    const totalLen = len + 1 + padLen + 8;
    const buf = new Uint8Array(totalLen);
    buf.set(data);
    buf[len] = 0x80;

    // Append original length in bits as 64-bit little-endian
    const view = new DataView(buf.buffer);
    view.setUint32(totalLen - 8, bitLen & 0xFFFFFFFF, true);
    view.setUint32(totalLen - 4, Math.floor(bitLen / 0x100000000), true);

    // Initialize hash values
    let a0 = 0x67452301;
    let b0 = 0xEFCDAB89;
    let c0 = 0x98BADCFE;
    let d0 = 0x10325476;

    // Per-round shift amounts
    const s = [
        7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
        5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
        4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
        6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
    ];

    // Pre-computed constants (floor(2^32 * abs(sin(i+1))))
    const K = [
        0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee,
        0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
        0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
        0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
        0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa,
        0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
        0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed,
        0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
        0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
        0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
        0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05,
        0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
        0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039,
        0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
        0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
        0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391
    ];

    // Process each 64-byte block
    for (let offset = 0; offset < totalLen; offset += 64) {
        const M = new Uint32Array(16);
        for (let j = 0; j < 16; j++) {
            M[j] = view.getUint32(offset + j * 4, true);
        }

        let A = a0, B = b0, C = c0, D = d0;

        for (let i = 0; i < 64; i++) {
            let F, g;
            if (i < 16) {
                F = (B & C) | ((~B) & D);
                g = i;
            } else if (i < 32) {
                F = (D & B) | ((~D) & C);
                g = (5 * i + 1) % 16;
            } else if (i < 48) {
                F = B ^ C ^ D;
                g = (3 * i + 5) % 16;
            } else {
                F = C ^ (B | (~D));
                g = (7 * i) % 16;
            }

            F = (F + A + K[i] + M[g]) | 0;
            A = D;
            D = C;
            C = B;
            B = (B + ((F << s[i]) | (F >>> (32 - s[i])))) | 0;
        }

        a0 = (a0 + A) | 0;
        b0 = (b0 + B) | 0;
        c0 = (c0 + C) | 0;
        d0 = (d0 + D) | 0;
    }

    // Convert to hex (little-endian)
    function toHex(n) {
        let h = '';
        for (let i = 0; i < 4; i++) {
            h += ((n >>> (i * 8)) & 0xFF).toString(16).padStart(2, '0');
        }
        return h;
    }

    return toHex(a0) + toHex(b0) + toHex(c0) + toHex(d0);
}

// Register service worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}
