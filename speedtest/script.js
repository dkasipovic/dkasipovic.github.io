// ===== STATE =====
let speedTest = null;
let isRunning = false;
let currentResults = null;
let deviceInfo = {};
let editingId = null;
let map = null;
let chart = null;
let mapInitialized = false;

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initNavigation();
  await detectDeviceInfo();
  renderHistory();
});

// ===== THEME =====
function initTheme() {
  const saved = localStorage.getItem('speedtest-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeButton(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('speedtest-theme', next);
  updateThemeButton(next);
}

function updateThemeButton(theme) {
  const btn = document.querySelector('.theme-toggle');
  btn.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
}

// ===== NAVIGATION =====
function initNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.getElementById(`tab-${tab}`).classList.add('active');
      
      if (tab === 'map') {
        setTimeout(() => initMap(), 100);
      } else if (tab === 'charts') {
        setTimeout(() => initChart(), 100);
      }
    });
  });
}

// ===== DEVICE DETECTION =====
async function detectDeviceInfo() {
  const ua = navigator.userAgent;
  
  // Device type
  const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
  const isTablet = /iPad|Android(?!.*Mobile)/i.test(ua);
  deviceInfo.deviceType = isTablet ? 'Tablet' : isMobile ? 'Mobile' : 'Desktop';
  
  // Parse user agent for brand and model
  const deviceDetails = parseUserAgent(ua);
  deviceInfo.deviceBrand = deviceDetails.brand;
  deviceInfo.deviceModel = deviceDetails.model;
  deviceInfo.os = deviceDetails.os;
  deviceInfo.browser = deviceDetails.browser;
  
  // Screen
  deviceInfo.screenResolution = `${window.screen.width}×${window.screen.height}`;
  
  // Network Information API
  if (navigator.connection) {
    deviceInfo.connectionType = navigator.connection.type || 'Unknown';
    deviceInfo.effectiveType = navigator.connection.effectiveType || 'Unknown';
  } else {
    deviceInfo.connectionType = 'N/A';
    deviceInfo.effectiveType = 'N/A';
  }
  
  // Update UI
  updateDeviceUI();
  
  // Async operations
  await Promise.all([
    fetchExternalIP(),
    fetchInternalIP(),
    fetchLocation()
  ]);
}

function parseUserAgent(ua) {
  let brand = 'Unknown';
  let model = 'Unknown';
  let os = 'Unknown';
  let browser = 'Unknown';
  
  // OS Detection
  if (/Windows NT 10/.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT 6.3/.test(ua)) os = 'Windows 8.1';
  else if (/Windows NT 6.2/.test(ua)) os = 'Windows 8';
  else if (/Windows NT 6.1/.test(ua)) os = 'Windows 7';
  else if (/Mac OS X ([\d_]+)/.test(ua)) {
    const ver = ua.match(/Mac OS X ([\d_]+)/)[1].replace(/_/g, '.');
    os = `macOS ${ver}`;
  }
  else if (/iPhone OS ([\d_]+)/.test(ua)) {
    const ver = ua.match(/iPhone OS ([\d_]+)/)[1].replace(/_/g, '.');
    os = `iOS ${ver}`;
  }
  else if (/Android ([\d.]+)/.test(ua)) {
    const ver = ua.match(/Android ([\d.]+)/)[1];
    os = `Android ${ver}`;
  }
  else if (/Linux/.test(ua)) os = 'Linux';
  else if (/CrOS/.test(ua)) os = 'Chrome OS';
  
  // Browser Detection
  if (/Edg\/([\d.]+)/.test(ua)) {
    browser = `Edge ${ua.match(/Edg\/([\d.]+)/)[1]}`;
  } else if (/Chrome\/([\d.]+)/.test(ua) && !/Chromium/.test(ua)) {
    browser = `Chrome ${ua.match(/Chrome\/([\d.]+)/)[1].split('.')[0]}`;
  } else if (/Firefox\/([\d.]+)/.test(ua)) {
    browser = `Firefox ${ua.match(/Firefox\/([\d.]+)/)[1].split('.')[0]}`;
  } else if (/Safari\/([\d.]+)/.test(ua) && !/Chrome/.test(ua)) {
    const safariVer = ua.match(/Version\/([\d.]+)/);
    browser = safariVer ? `Safari ${safariVer[1]}` : 'Safari';
  } else if (/Opera|OPR\/([\d.]+)/.test(ua)) {
    browser = `Opera ${ua.match(/(?:Opera|OPR)\/([\d.]+)/)?.[1] || ''}`;
  }
  
  // Device Brand & Model (mostly for mobile)
  if (/iPhone/.test(ua)) {
    brand = 'Apple';
    model = 'iPhone';
  } else if (/iPad/.test(ua)) {
    brand = 'Apple';
    model = 'iPad';
  } else if (/Macintosh/.test(ua)) {
    brand = 'Apple';
    model = 'Mac';
  } else if (/Samsung|SM-[A-Z0-9]+/.test(ua)) {
    brand = 'Samsung';
    const match = ua.match(/SM-[A-Z0-9]+/);
    model = match ? match[0] : 'Galaxy';
  } else if (/Pixel/.test(ua)) {
    brand = 'Google';
    const match = ua.match(/Pixel\s*\d*/);
    model = match ? match[0] : 'Pixel';
  } else if (/Huawei|HUAWEI/.test(ua)) {
    brand = 'Huawei';
    model = 'Huawei Device';
  } else if (/Xiaomi|Mi\s|Redmi/.test(ua)) {
    brand = 'Xiaomi';
    model = 'Xiaomi Device';
  } else if (/OnePlus/.test(ua)) {
    brand = 'OnePlus';
    model = 'OnePlus Device';
  } else if (/Windows/.test(ua)) {
    brand = 'PC';
    model = 'Windows PC';
  } else if (/Linux/.test(ua) && !/Android/.test(ua)) {
    brand = 'PC';
    model = 'Linux PC';
  }
  
  return { brand, model, os, browser };
}

async function fetchExternalIP() {
  try {
    // Try Cloudflare first
    const response = await fetch('https://cloudflare.com/cdn-cgi/trace');
    const text = await response.text();
    const ipMatch = text.match(/ip=(.+)/);
    if (ipMatch) {
      deviceInfo.externalIp = ipMatch[1];
    } else {
      throw new Error('No IP found');
    }
  } catch {
    try {
      // Fallback to ipify
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      deviceInfo.externalIp = data.ip;
    } catch {
      deviceInfo.externalIp = 'Unavailable';
    }
  }
  document.getElementById('info-external-ip').textContent = deviceInfo.externalIp;
  document.getElementById('info-external-ip').classList.remove('loading');
}

async function fetchInternalIP() {
  try {
    const pc = new RTCPeerConnection({ iceServers: [] });
    pc.createDataChannel('');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    await new Promise((resolve) => {
      pc.onicecandidate = (e) => {
        if (!e.candidate) {
          resolve();
          return;
        }
        const match = e.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
        if (match && !deviceInfo.internalIp) {
          deviceInfo.internalIp = match[1];
        }
      };
      setTimeout(resolve, 2000);
    });
    
    pc.close();
    
    if (!deviceInfo.internalIp) {
      deviceInfo.internalIp = 'Unavailable';
    }
  } catch {
    deviceInfo.internalIp = 'Unavailable';
  }
  document.getElementById('info-internal-ip').textContent = deviceInfo.internalIp;
  document.getElementById('info-internal-ip').classList.remove('loading');
}

async function fetchLocation() {
  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000
      });
    });
    deviceInfo.coordinates = {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    };
    document.getElementById('info-lat').textContent = deviceInfo.coordinates.lat.toFixed(6);
    document.getElementById('info-lng').textContent = deviceInfo.coordinates.lng.toFixed(6);
  } catch (err) {
    deviceInfo.coordinates = null;
    document.getElementById('info-lat').textContent = 'Denied';
    document.getElementById('info-lng').textContent = 'Denied';
  }
  document.getElementById('info-lat').classList.remove('loading');
  document.getElementById('info-lng').classList.remove('loading');
}

function updateDeviceUI() {
  document.getElementById('info-device-type').textContent = deviceInfo.deviceType;
  document.getElementById('info-device-brand').textContent = deviceInfo.deviceBrand;
  document.getElementById('info-device-model').textContent = deviceInfo.deviceModel;
  document.getElementById('info-os').textContent = deviceInfo.os;
  document.getElementById('info-browser').textContent = deviceInfo.browser;
  document.getElementById('info-screen').textContent = deviceInfo.screenResolution;
  document.getElementById('info-connection').textContent = deviceInfo.connectionType;
  document.getElementById('info-effective-type').textContent = deviceInfo.effectiveType;
}

// ===== SPEED TEST =====
async function toggleTest() {
  if (isRunning) {
    stopTest();
  } else {
    startTest();
  }
}

async function startTest() {
  // Wait for SpeedTest to be available
  if (!window.SpeedTest) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (!window.SpeedTest) {
      alert('Speed test module not loaded. Please refresh the page.');
      return;
    }
  }
  
  isRunning = true;
  currentResults = null;
  
  const btn = document.getElementById('start-btn');
  btn.textContent = 'Stop Test';
  btn.classList.add('running');
  
  document.getElementById('results-grid').style.display = 'none';
  resetStatusIcons();
  
  speedTest = new window.SpeedTest({
    autoStart: false,
    measurements: [
      { type: 'latency', numPackets: 20 },
      { type: 'download', bytes: 1e5, count: 1 },
      { type: 'download', bytes: 1e6, count: 8 },
      { type: 'download', bytes: 1e7, count: 6 },
      { type: 'upload', bytes: 1e5, count: 1 },
      { type: 'upload', bytes: 1e6, count: 6 },
      { type: 'upload', bytes: 1e7, count: 4 },
    ]
  });

  speedTest.onRunningChange = (running) => {
    if (!running && isRunning) {
      onTestComplete();
    }
  };

  speedTest.onResultsChange = ({ type }) => {
    updateTestUI();
  };

  speedTest.play();
}

function stopTest() {
  if (speedTest) {
    speedTest.pause();
  }
  isRunning = false;
  
  const btn = document.getElementById('start-btn');
  btn.textContent = 'Start Test';
  btn.classList.remove('running');
  
  document.getElementById('gauge-label').textContent = 'Stopped';
}

function resetStatusIcons() {
  ['latency', 'download', 'upload', 'jitter'].forEach(id => {
    document.getElementById(`status-${id}`).classList.remove('active', 'done');
    document.getElementById(`value-${id}`).textContent = '--';
  });
  updateGauge(0, 'Ready');
}

function updateTestUI() {
  if (!speedTest) return;
  
  const results = speedTest.results;
  
  // Latency
  const latency = results.getUnloadedLatency();
  if (latency) {
    document.getElementById('value-latency').textContent = `${latency.toFixed(0)} ms`;
    document.getElementById('status-latency').classList.add('done');
  }
  
  // Jitter
  const jitter = results.getUnloadedJitter();
  if (jitter) {
    document.getElementById('value-jitter').textContent = `${jitter.toFixed(1)} ms`;
    document.getElementById('status-jitter').classList.add('done');
  }
  
  // Download
  const download = results.getDownloadBandwidth();
  if (download) {
    const dlMbps = download / 1e6;
    document.getElementById('value-download').textContent = `${dlMbps.toFixed(1)} Mbps`;
    if (!results.getUploadBandwidth()) {
      updateGauge(dlMbps, 'Download');
      document.getElementById('status-download').classList.add('active');
      document.getElementById('status-latency').classList.remove('active');
    } else {
      document.getElementById('status-download').classList.remove('active');
      document.getElementById('status-download').classList.add('done');
    }
  }
  
  // Upload
  const upload = results.getUploadBandwidth();
  if (upload) {
    const ulMbps = upload / 1e6;
    document.getElementById('value-upload').textContent = `${ulMbps.toFixed(1)} Mbps`;
    updateGauge(ulMbps, 'Upload');
    document.getElementById('status-upload').classList.add('active');
    document.getElementById('status-download').classList.remove('active');
    document.getElementById('status-download').classList.add('done');
  }
}

function updateGauge(value, label) {
  const maxSpeed = 500;
  const percentage = Math.min(value / maxSpeed, 1);
  const circumference = 2 * Math.PI * 90; // 565.48
  const offset = circumference * (1 - percentage * 0.75); // 75% of circle
  
  const gaugeFill = document.getElementById('gauge-fill');
  gaugeFill.style.strokeDashoffset = offset;
  
  // Color based on speed
  if (value < 10) {
    gaugeFill.style.stroke = 'var(--danger)';
  } else if (value < 50) {
    gaugeFill.style.stroke = 'var(--warning)';
  } else if (value < 100) {
    gaugeFill.style.stroke = '#22d3ee';
  } else {
    gaugeFill.style.stroke = 'var(--success)';
  }
  
  document.getElementById('gauge-value').textContent = value.toFixed(1);
  document.getElementById('gauge-label').textContent = label;
}

function onTestComplete() {
  isRunning = false;
  
  const btn = document.getElementById('start-btn');
  btn.textContent = 'Start Test';
  btn.classList.remove('running');
  
  document.querySelectorAll('.status-icon').forEach(el => {
    el.classList.remove('active');
    el.classList.add('done');
  });
  
  const results = speedTest.results;
  const summary = results.getSummary();
  
  currentResults = {
    download: summary.download / 1e6,
    upload: summary.upload / 1e6,
    latency: summary.latency,
    jitter: summary.jitter || 0
  };
  
  // Update results grid
  document.getElementById('result-download').textContent = currentResults.download.toFixed(1);
  document.getElementById('result-upload').textContent = currentResults.upload.toFixed(1);
  document.getElementById('result-latency').textContent = currentResults.latency.toFixed(0);
  document.getElementById('result-jitter').textContent = currentResults.jitter.toFixed(1);
  document.getElementById('results-grid').style.display = 'grid';
  
  document.getElementById('gauge-label').textContent = 'Complete';
  
  // Show save modal
  showSaveModal();
}

// ===== SAVE MODAL =====
function showSaveModal() {
  const defaultName = generateDefaultName();
  document.getElementById('test-name-input').value = defaultName;
  document.getElementById('save-modal').classList.add('active');
  document.getElementById('test-name-input').focus();
}

function closeSaveModal() {
  document.getElementById('save-modal').classList.remove('active');
}

function generateDefaultName() {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return `Speed Test - ${time}`;
}

function saveTestResult() {
  const name = document.getElementById('test-name-input').value.trim() || generateDefaultName();
  
  const entry = {
    id: crypto.randomUUID(),
    name: name,
    timestamp: new Date().toISOString(),
    download: currentResults.download,
    upload: currentResults.upload,
    latency: currentResults.latency,
    jitter: currentResults.jitter,
    coordinates: deviceInfo.coordinates,
    externalIp: deviceInfo.externalIp,
    internalIp: deviceInfo.internalIp,
    connectionType: deviceInfo.connectionType,
    effectiveType: deviceInfo.effectiveType,
    deviceType: deviceInfo.deviceType,
    deviceBrand: deviceInfo.deviceBrand,
    deviceModel: deviceInfo.deviceModel,
    os: deviceInfo.os,
    browser: deviceInfo.browser,
    screenResolution: deviceInfo.screenResolution
  };
  
  const history = getHistory();
  history.unshift(entry);
  localStorage.setItem('speedtest-history', JSON.stringify(history));
  
  closeSaveModal();
  renderHistory();
}

// ===== HISTORY =====
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem('speedtest-history') || '[]');
  } catch {
    return [];
  }
}

function renderHistory() {
  const history = getHistory();
  const tbody = document.getElementById('history-tbody');
  const empty = document.getElementById('history-empty');
  
  if (history.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  
  empty.style.display = 'none';
  
  tbody.innerHTML = history.map(entry => `
    <tr>
      <td>
        <div class="history-name">${escapeHtml(entry.name)}</div>
      </td>
      <td>
        <div class="history-date">${formatDate(entry.timestamp)}</div>
      </td>
      <td>
        <span class="history-speed download">${entry.download.toFixed(1)} Mbps</span>
      </td>
      <td>
        <span class="history-speed upload">${entry.upload.toFixed(1)} Mbps</span>
      </td>
      <td>${entry.latency.toFixed(0)} ms</td>
      <td>${entry.deviceType}</td>
      <td>
        <div class="history-actions-cell">
          <button class="icon-btn" onclick="viewDetail('${entry.id}')" title="View Details">👁️</button>
          <button class="icon-btn" onclick="editEntry('${entry.id}')" title="Rename">✏️</button>
          <button class="icon-btn danger" onclick="deleteEntry('${entry.id}')" title="Delete">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function viewDetail(id) {
  const history = getHistory();
  const entry = history.find(e => e.id === id);
  if (!entry) return;
  
  document.getElementById('detail-title').textContent = entry.name;
  document.getElementById('detail-content').innerHTML = `
    <div class="info-section">
      <div class="info-section-title">Test Results</div>
      <div class="info-row">
        <span class="info-label">Download</span>
        <span class="info-value quality-excellent">${entry.download.toFixed(1)} Mbps</span>
      </div>
      <div class="info-row">
        <span class="info-label">Upload</span>
        <span class="info-value">${entry.upload.toFixed(1)} Mbps</span>
      </div>
      <div class="info-row">
        <span class="info-label">Latency</span>
        <span class="info-value">${entry.latency.toFixed(0)} ms</span>
      </div>
      <div class="info-row">
        <span class="info-label">Jitter</span>
        <span class="info-value">${entry.jitter.toFixed(1)} ms</span>
      </div>
    </div>
    <div class="info-section">
      <div class="info-section-title">Device</div>
      <div class="info-row">
        <span class="info-label">Type</span>
        <span class="info-value">${entry.deviceType}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Brand</span>
        <span class="info-value">${entry.deviceBrand}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Model</span>
        <span class="info-value">${entry.deviceModel}</span>
      </div>
      <div class="info-row">
        <span class="info-label">OS</span>
        <span class="info-value">${entry.os}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Browser</span>
        <span class="info-value">${entry.browser}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Screen</span>
        <span class="info-value">${entry.screenResolution}</span>
      </div>
    </div>
    <div class="info-section">
      <div class="info-section-title">Network</div>
      <div class="info-row">
        <span class="info-label">External IP</span>
        <span class="info-value">${entry.externalIp || 'N/A'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Internal IP</span>
        <span class="info-value">${entry.internalIp || 'N/A'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Connection</span>
        <span class="info-value">${entry.connectionType || 'N/A'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Effective Type</span>
        <span class="info-value">${entry.effectiveType || 'N/A'}</span>
      </div>
    </div>
    <div class="info-section">
      <div class="info-section-title">Location</div>
      <div class="info-row">
        <span class="info-label">Coordinates</span>
        <span class="info-value">${entry.coordinates ? `${entry.coordinates.lat.toFixed(6)}, ${entry.coordinates.lng.toFixed(6)}` : 'N/A'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Date</span>
        <span class="info-value">${formatDate(entry.timestamp)}</span>
      </div>
    </div>
  `;
  document.getElementById('detail-modal').classList.add('active');
}

function closeDetailModal() {
  document.getElementById('detail-modal').classList.remove('active');
}

function editEntry(id) {
  const history = getHistory();
  const entry = history.find(e => e.id === id);
  if (!entry) return;
  
  editingId = id;
  document.getElementById('edit-name-input').value = entry.name;
  document.getElementById('edit-modal').classList.add('active');
  document.getElementById('edit-name-input').focus();
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('active');
  editingId = null;
}

function updateTestName() {
  if (!editingId) return;
  
  const newName = document.getElementById('edit-name-input').value.trim();
  if (!newName) return;
  
  const history = getHistory();
  const entry = history.find(e => e.id === editingId);
  if (entry) {
    entry.name = newName;
    localStorage.setItem('speedtest-history', JSON.stringify(history));
    renderHistory();
  }
  
  closeEditModal();
}

function deleteEntry(id) {
  if (!confirm('Are you sure you want to delete this entry?')) return;
  
  const history = getHistory().filter(e => e.id !== id);
  localStorage.setItem('speedtest-history', JSON.stringify(history));
  renderHistory();
}

function clearHistory() {
  if (!confirm('Are you sure you want to delete ALL history? This cannot be undone.')) return;
  
  localStorage.removeItem('speedtest-history');
  renderHistory();
}

function exportHistory() {
  const history = getHistory();
  const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `speedtest-history-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importHistory() {
  document.getElementById('import-input').click();
}

document.getElementById('import-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    
    if (!Array.isArray(imported)) {
      throw new Error('Invalid format');
    }
    
    const existing = getHistory();
    const existingIds = new Set(existing.map(e => e.id));
    const newEntries = imported.filter(e => !existingIds.has(e.id));
    
    const merged = [...newEntries, ...existing];
    localStorage.setItem('speedtest-history', JSON.stringify(merged));
    renderHistory();
    
    alert(`Imported ${newEntries.length} new entries (${imported.length - newEntries.length} duplicates skipped)`);
  } catch (err) {
    alert('Failed to import: Invalid file format');
  }
  
  e.target.value = '';
});

// ===== MAP =====
function initMap() {
  if (mapInitialized && map) {
    map.invalidateSize();
    return;
  }
  
  const history = getHistory().filter(e => e.coordinates);
  
  // Default center (world view or first entry)
  let center = [20, 0];
  let zoom = 2;
  
  if (history.length > 0) {
    center = [history[0].coordinates.lat, history[0].coordinates.lng];
    zoom = 10;
  }
  
  map = L.map('history-map').setView(center, zoom);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);
  
  // Add markers
  history.forEach(entry => {
    const color = getSpeedColor(entry.download);
    const marker = L.circleMarker([entry.coordinates.lat, entry.coordinates.lng], {
      radius: 10,
      fillColor: color,
      color: '#fff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8
    }).addTo(map);
    
    marker.bindPopup(`
      <div class="map-popup">
        <div class="map-popup-title">${escapeHtml(entry.name)}</div>
        <div class="map-popup-date">${formatDate(entry.timestamp)}</div>
        <div class="map-popup-speeds">
          <div class="map-popup-speed">
            <div class="map-popup-speed-value" style="color: #22c55e;">⬇️ ${entry.download.toFixed(1)}</div>
            <div class="map-popup-speed-label">Mbps Down</div>
          </div>
          <div class="map-popup-speed">
            <div class="map-popup-speed-value" style="color: #3b82f6;">⬆️ ${entry.upload.toFixed(1)}</div>
            <div class="map-popup-speed-label">Mbps Up</div>
          </div>
        </div>
      </div>
    `);
  });
  
  // Fit bounds if multiple points
  if (history.length > 1) {
    const bounds = history.map(e => [e.coordinates.lat, e.coordinates.lng]);
    map.fitBounds(bounds, { padding: [50, 50] });
  }
  
  mapInitialized = true;
}

function getSpeedColor(speed) {
  if (speed >= 100) return '#22c55e'; // Green - Excellent
  if (speed >= 50) return '#22d3ee'; // Cyan - Good
  if (speed >= 25) return '#eab308'; // Yellow - Fair
  return '#ef4444'; // Red - Poor
}

// ===== CHARTS =====
function initChart() {
  const history = getHistory().slice().reverse(); // Oldest first
  
  if (history.length === 0) {
    return;
  }
  
  const labels = history.map(e => {
    const date = new Date(e.timestamp);
    return date.toLocaleDateString();
  });
  
  const downloadData = history.map(e => e.download);
  const uploadData = history.map(e => e.upload);
  
  const ctx = document.getElementById('speed-chart').getContext('2d');
  
  if (chart) {
    chart.destroy();
  }
  
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const textColor = isDark ? '#94a3b8' : '#64748b';
  
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Download (Mbps)',
          data: downloadData,
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6
        },
        {
          label: 'Upload (Mbps)',
          data: uploadData,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: textColor
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: gridColor
          },
          ticks: {
            color: textColor
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: gridColor
          },
          ticks: {
            color: textColor,
            callback: (value) => value + ' Mbps'
          }
        }
      }
    }
  });
}

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', (e) => {
  // Close modals on Escape
  if (e.key === 'Escape') {
    closeSaveModal();
    closeEditModal();
    closeDetailModal();
  }
  
  // Enter to save in modals
  if (e.key === 'Enter') {
    if (document.getElementById('save-modal').classList.contains('active')) {
      saveTestResult();
    } else if (document.getElementById('edit-modal').classList.contains('active')) {
      updateTestName();
    }
  }
});
