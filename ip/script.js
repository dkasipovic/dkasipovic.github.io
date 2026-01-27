// State
let scanning = false;
let abortController = null;
let scanResults = {}; // { 'ip': { port: 'pending'|'alive'|'dead'|'scanning' } }
let stats = { alive: 0, dead: 0, pending: 0, total: 0 };

// DOM Elements
const startIpInput = document.getElementById('startIp');
const endIpInput = document.getElementById('endIp');
const portsInput = document.getElementById('ports');
const timeoutInput = document.getElementById('timeout');
const concurrencyInput = document.getElementById('concurrency');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const detectBtn = document.getElementById('detectBtn');
const progressSection = document.getElementById('progressSection');
const progressText = document.getElementById('progressText');
const progressFill = document.getElementById('progressFill');
const aliveCount = document.getElementById('aliveCount');
const deadCount = document.getElementById('deadCount');
const pendingCount = document.getElementById('pendingCount');
const emptyState = document.getElementById('emptyState');
const resultsTable = document.getElementById('resultsTable');
const tableHead = document.getElementById('tableHead');
const tableBody = document.getElementById('tableBody');
const toast = document.getElementById('toast');
const filterAllBtn = document.getElementById('filterAll');
const filterAliveBtn = document.getElementById('filterAlive');
const exportBtn = document.getElementById('exportBtn');

// Current filter state
let currentFilter = 'all';
let currentIps = [];
let currentPorts = [];

// Utility functions
function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = 'toast visible' + (type !== 'info' ? ' ' + type : '');
    setTimeout(() => toast.classList.remove('visible'), 3000);
}

function ipToInt(ip) {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function intToIp(int) {
    return [
        (int >>> 24) & 255,
        (int >>> 16) & 255,
        (int >>> 8) & 255,
        int & 255
    ].join('.');
}

function isValidIp(ip) {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    return parts.every(part => {
        const num = parseInt(part, 10);
        return !isNaN(num) && num >= 0 && num <= 255 && part === num.toString();
    });
}

function generateIpRange(startIp, endIp) {
    const start = ipToInt(startIp);
    const end = ipToInt(endIp);
    const ips = [];
    for (let i = start; i <= end; i++) {
        ips.push(intToIp(i));
    }
    return ips;
}

function parsePorts(portsStr) {
    return portsStr
        .split(',')
        .map(p => parseInt(p.trim(), 10))
        .filter(p => !isNaN(p) && p > 0 && p <= 65535);
}

// Local IP detection using WebRTC
async function detectLocalIp() {
    return new Promise((resolve, reject) => {
        const pc = new RTCPeerConnection({ iceServers: [] });
        const ips = new Set();

        pc.createDataChannel('');

        pc.onicecandidate = (event) => {
            if (!event.candidate) {
                pc.close();
                const localIps = Array.from(ips).filter(ip =>
                    ip.startsWith('192.168.') ||
                    ip.startsWith('10.') ||
                    ip.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)
                );
                if (localIps.length > 0) {
                    resolve(localIps[0]);
                } else {
                    reject(new Error('No local IP found'));
                }
                return;
            }

            const candidate = event.candidate.candidate;
            const ipMatch = candidate.match(/(\d{1,3}\.){3}\d{1,3}/);
            if (ipMatch) {
                ips.add(ipMatch[0]);
            }
        };

        pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .catch(reject);

        // Timeout after 3 seconds
        setTimeout(() => {
            pc.close();
            reject(new Error('Timeout detecting IP'));
        }, 3000);
    });
}

// Build/update table
function buildTable(ips, ports) {
    currentIps = ips;
    currentPorts = ports;

    // Build header
    tableHead.innerHTML = `
        <tr>
            <th>IP Address</th>
            ${ports.map(p => `<th>:${p}</th>`).join('')}
        </tr>
    `;

    // Build body
    tableBody.innerHTML = ips.map(ip => `
        <tr data-ip="${ip}">
            <td>${ip}</td>
            ${ports.map(port => `
                <td class="status-cell" data-ip="${ip}" data-port="${port}" onclick="openHost('${ip}', ${port})">
                    <span class="status-badge status-pending" id="cell-${ip.replace(/\./g, '-')}-${port}">—</span>
                </td>
            `).join('')}
        </tr>
    `).join('');

    emptyState.style.display = 'none';
    resultsTable.style.display = 'table';
}

// Filter table rows
function applyFilter(filter) {
    currentFilter = filter;
    const rows = tableBody.querySelectorAll('tr');

    rows.forEach(row => {
        const ip = row.dataset.ip;
        if (filter === 'all') {
            row.style.display = '';
        } else if (filter === 'alive') {
            // Check if any port for this IP is alive
            const hasAlive = scanResults[ip] &&
                Object.values(scanResults[ip]).some(status => status === 'alive');
            row.style.display = hasAlive ? '' : 'none';
        }
    });

    // Update button states
    filterAllBtn.classList.toggle('active', filter === 'all');
    filterAliveBtn.classList.toggle('active', filter === 'alive');
}

// Export to CSV
function exportToCsv() {
    if (currentIps.length === 0 || currentPorts.length === 0) {
        showToast('No data to export', 'error');
        return;
    }

    // Build CSV header
    let csv = 'IP Address,' + currentPorts.map(p => `Port ${p}`).join(',') + '\n';

    // Build CSV rows
    currentIps.forEach(ip => {
        // Apply current filter
        if (currentFilter === 'alive') {
            const hasAlive = scanResults[ip] &&
                Object.values(scanResults[ip]).some(status => status === 'alive');
            if (!hasAlive) return;
        }

        const row = [ip];
        currentPorts.forEach(port => {
            const status = scanResults[ip]?.[port] || 'pending';
            row.push(status);
        });
        csv += row.join(',') + '\n';
    });

    // Download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `ip-scan-${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('CSV exported successfully', 'success');
}

function updateCell(ip, port, status) {
    const cellId = `cell-${ip.replace(/\./g, '-')}-${port}`;
    const cell = document.getElementById(cellId);
    if (cell) {
        cell.className = `status-badge status-${status}`;
        cell.textContent = status === 'alive' ? '✓' : status === 'dead' ? '✗' : status === 'scanning' ? '…' : '—';
    }
}

function updateProgress() {
    const scanned = stats.alive + stats.dead;
    const total = stats.total;
    const percent = total > 0 ? (scanned / total * 100) : 0;

    progressText.textContent = `Scanning... ${scanned} / ${total}`;
    progressFill.style.width = `${percent}%`;
    aliveCount.textContent = stats.alive;
    deadCount.textContent = stats.dead;
    pendingCount.textContent = stats.pending;
}

function openHost(ip, port) {
    const protocol = port === 80 ? 'http' : 'https';
    window.open(`${protocol}://${ip}:${port}`, '_blank');
}

// Scan a single IP:port:
async function scanHost(ip, port, timeout, signal) {
    const url = `https://${ip}:${port}/`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);

    // Link to main abort signal
    if (signal) {
        signal.addEventListener('abort', () => controller.abort());
    }

    try {
        updateCell(ip, port, 'scanning');

        await fetch(url, {
            mode: 'no-cors',
            signal: controller.signal
        });

        // If we get here, host is alive (got some response)
        clearTimeout(timeoutId);
        return 'alive';
    } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            // Check if it's our timeout or user abort
            if (signal && signal.aborted) {
                return 'pending'; // User cancelled
            }
            return 'dead'; // Timeout
        }

        // Any other error (CORS, SSL, connection refused) means host is alive
        return 'alive';
    }
}

// Main scan function with concurrency control
async function startScan() {
    const startIp = startIpInput.value.trim();
    const endIp = endIpInput.value.trim();
    const ports = parsePorts(portsInput.value);
    const timeout = parseInt(timeoutInput.value, 10) || 5;
    const concurrency = parseInt(concurrencyInput.value, 10) || 15;

    // Validation
    if (!isValidIp(startIp)) {
        showToast('Invalid start IP address', 'error');
        return;
    }
    if (!isValidIp(endIp)) {
        showToast('Invalid end IP address', 'error');
        return;
    }
    if (ipToInt(startIp) > ipToInt(endIp)) {
        showToast('Start IP must be less than or equal to End IP', 'error');
        return;
    }
    if (ports.length === 0) {
        showToast('Please specify at least one valid port', 'error');
        return;
    }

    const ips = generateIpRange(startIp, endIp);

    if (ips.length > 1000) {
        showToast('Range too large (max 1000 IPs)', 'error');
        return;
    }

    // Initialize
    scanning = true;
    abortController = new AbortController();
    scanResults = {};
    stats = { alive: 0, dead: 0, pending: ips.length * ports.length, total: ips.length * ports.length };

    // UI updates
    startBtn.disabled = true;
    stopBtn.disabled = false;
    detectBtn.disabled = true;
    progressSection.classList.add('visible');
    updateProgress();

    // Build table
    buildTable(ips, ports);

    // Initialize results
    ips.forEach(ip => {
        scanResults[ip] = {};
        ports.forEach(port => {
            scanResults[ip][port] = 'pending';
        });
    });

    // Create task queue
    const tasks = [];
    ips.forEach(ip => {
        ports.forEach(port => {
            tasks.push({ ip, port });
        });
    });

    // Process with concurrency limit
    let index = 0;
    const workers = [];

    async function worker() {
        while (index < tasks.length && !abortController.signal.aborted) {
            const taskIndex = index++;
            const task = tasks[taskIndex];

            const result = await scanHost(task.ip, task.port, timeout, abortController.signal);

            if (abortController.signal.aborted) break;

            scanResults[task.ip][task.port] = result;
            updateCell(task.ip, task.port, result);

            if (result === 'alive') {
                stats.alive++;
            } else if (result === 'dead') {
                stats.dead++;
            }
            stats.pending--;
            updateProgress();
        }
    }

    // Start workers
    for (let i = 0; i < concurrency; i++) {
        workers.push(worker());
    }

    await Promise.all(workers);

    // Cleanup
    scanning = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    detectBtn.disabled = false;

    if (abortController.signal.aborted) {
        progressText.textContent = `Scan stopped. ${stats.alive + stats.dead} / ${stats.total} scanned`;
        showToast('Scan stopped', 'info');
    } else {
        // Count unique IPs that have at least one alive port
        const aliveHosts = Object.keys(scanResults).filter(ip =>
            Object.values(scanResults[ip]).some(status => status === 'alive')
        ).length;
        progressText.textContent = `Scan complete. ${stats.alive + stats.dead} / ${stats.total}`;
        showToast(`Scan complete! Found ${aliveHosts} alive host${aliveHosts !== 1 ? 's' : ''}`, 'success');
    }
}

function stopScan() {
    if (abortController) {
        abortController.abort();
    }
}

// Event listeners
startBtn.addEventListener('click', startScan);
stopBtn.addEventListener('click', stopScan);

detectBtn.addEventListener('click', async () => {
    detectBtn.disabled = true;
    detectBtn.textContent = '...';

    try {
        const ip = await detectLocalIp();
        const parts = ip.split('.');
        parts[3] = '1';
        startIpInput.value = parts.join('.');
        parts[3] = '254';
        endIpInput.value = parts.join('.');
        showToast(`Detected local network: ${ip}`, 'success');
    } catch (error) {
        showToast('Could not detect local IP. Please enter manually.', 'error');
    }

    detectBtn.disabled = false;
    detectBtn.textContent = 'Detect';
});

// Filter button listeners
filterAllBtn.addEventListener('click', () => applyFilter('all'));
filterAliveBtn.addEventListener('click', () => applyFilter('alive'));

// Export button listener
exportBtn.addEventListener('click', exportToCsv);

// Auto-fill end IP when typing start IP
startIpInput.addEventListener('input', () => {
    const value = startIpInput.value.trim();
    const parts = value.split('.');

    // Only auto-fill if we have a valid-looking IP with 4 parts
    if (parts.length === 4 && parts.every(p => p !== '' && !isNaN(parseInt(p, 10)))) {
        if (isValidIp(value)) {
            parts[3] = '254';
            endIpInput.value = parts.join('.');
        }
    }
});

// Auto-detect on page load
window.addEventListener('load', async () => {
    try {
        const ip = await detectLocalIp();
        const parts = ip.split('.');
        parts[3] = '1';
        startIpInput.value = parts.join('.');
        parts[3] = '254';
        endIpInput.value = parts.join('.');
    } catch (e) {
        // Silent fail, user can enter manually
    }
});
