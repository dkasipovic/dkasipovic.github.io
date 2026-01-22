// State
const state = {
    type: 'url',
    styling: { fgColor: '#000000', bgColor: '#ffffff', transparentBg: false, dotStyle: 'square', cornerSquareStyle: 'square', cornerDotStyle: 'square' },
    logo: { data: null, size: 0.3, margin: 5 },
    frame: { label: '', labelColor: '#000000', labelBg: '#ffffff' },
    settings: { size: 300, ecLevel: 'M', quietZone: 10 }
};
let qrCode = null, debounceTimer = null;

// Init
document.addEventListener('DOMContentLoaded', () => {
    // Check if library loaded
    if (typeof QRCodeStyling === 'undefined') {
        document.getElementById('qr-code').innerHTML = '<p style="color: var(--error); padding: 2rem;">Failed to load QR library. Please refresh the page.</p>';
        return;
    }
    initTheme(); initEventListeners(); loadFromURL(); generateQR(); initPWA();
});

function initTheme() {
    const saved = localStorage.getItem('qr-theme');
    if (saved) { document.documentElement.setAttribute('data-theme', saved); updateThemeIcon(saved); }
    else if (window.matchMedia('(prefers-color-scheme: light)').matches) { document.documentElement.setAttribute('data-theme', 'light'); updateThemeIcon('light'); }
}

function updateThemeIcon(theme) {
    document.querySelector('.icon-sun').classList.toggle('hidden', theme === 'light');
    document.querySelector('.icon-moon').classList.toggle('hidden', theme !== 'light');
}

function initEventListeners() {
    document.querySelectorAll('.type-btn').forEach(btn => btn.addEventListener('click', () => selectType(btn.dataset.type)));
    document.querySelectorAll('.form-content input, .form-content textarea, .form-content select').forEach(input => input.addEventListener('input', debounceGenerate));
    
    setupColorSync('fgColor', 'fgColorHex');
    setupColorSync('bgColor', 'bgColorHex');
    setupColorSync('frameLabelColor', 'frameLabelColorHex');
    setupColorSync('frameLabelBg', 'frameLabelBgHex');
    
    document.getElementById('transparentBg').addEventListener('change', e => {
        state.styling.transparentBg = e.target.checked;
        document.getElementById('qrWrapper').classList.toggle('transparent-bg', e.target.checked);
        debounceGenerate();
    });
    
    setupStyleGrid('dotStyleGrid', s => { state.styling.dotStyle = s; debounceGenerate(); });
    setupStyleGrid('cornerSquareStyleGrid', s => { state.styling.cornerSquareStyle = s; debounceGenerate(); });
    setupStyleGrid('cornerDotStyleGrid', s => { state.styling.cornerDotStyle = s; debounceGenerate(); });
    
    const logoUpload = document.getElementById('logoUpload'), logoInput = document.getElementById('logoInput');
    logoUpload.addEventListener('click', () => logoInput.click());
    logoUpload.addEventListener('dragover', e => { e.preventDefault(); logoUpload.style.borderColor = 'var(--accent)'; });
    logoUpload.addEventListener('dragleave', () => logoUpload.style.borderColor = '');
    logoUpload.addEventListener('drop', e => { e.preventDefault(); logoUpload.style.borderColor = ''; if (e.dataTransfer.files[0]) handleLogoFile(e.dataTransfer.files[0]); });
    logoInput.addEventListener('change', e => { if (e.target.files[0]) handleLogoFile(e.target.files[0]); });
    
    document.getElementById('logoSize').addEventListener('input', e => { state.logo.size = parseFloat(e.target.value); document.getElementById('logoSizeValue').textContent = Math.round(state.logo.size * 100) + '%'; debounceGenerate(); });
    document.getElementById('logoMargin').addEventListener('input', e => { state.logo.margin = parseInt(e.target.value); document.getElementById('logoMarginValue').textContent = e.target.value + 'px'; debounceGenerate(); });
    document.getElementById('frameLabel').addEventListener('input', e => { state.frame.label = e.target.value; updateFramePreview(); });
    document.getElementById('qrSize').addEventListener('input', e => { state.settings.size = parseInt(e.target.value); document.getElementById('qrSizeValue').textContent = e.target.value + 'px'; debounceGenerate(); });
    document.getElementById('ecLevel').addEventListener('change', e => { state.settings.ecLevel = e.target.value; debounceGenerate(); });
    document.getElementById('quietZone').addEventListener('input', e => { state.settings.quietZone = parseInt(e.target.value); document.getElementById('quietZoneValue').textContent = e.target.value + 'px'; debounceGenerate(); });
    
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    setupDropdown('presetsDropdown', 'presetsBtn');
    setupDropdown('brandDropdown', 'brandBtn');
    
    document.getElementById('savePresetBtn').addEventListener('click', () => { closeDropdown('presetsDropdown'); openModal('savePresetModal'); });
    document.getElementById('loadPresetBtn').addEventListener('click', () => { closeDropdown('presetsDropdown'); showPresetList(); openModal('loadPresetModal'); });
    document.getElementById('exportPresetsBtn').addEventListener('click', () => { closeDropdown('presetsDropdown'); exportPresets(); });
    document.getElementById('importPresetsBtn').addEventListener('click', () => { closeDropdown('presetsDropdown'); document.getElementById('importInput').click(); });
    document.getElementById('importInput').addEventListener('change', importPresets);
    document.getElementById('savePresetConfirm').addEventListener('click', savePreset);
    
    document.getElementById('saveBrandBtn').addEventListener('click', () => { closeDropdown('brandDropdown'); saveBrand(); });
    document.getElementById('applyBrandBtn').addEventListener('click', () => { closeDropdown('brandDropdown'); applyBrand(); });
    document.getElementById('clearBrandBtn').addEventListener('click', () => { closeDropdown('brandDropdown'); clearBrand(); });
    
    document.getElementById('shareBtn').addEventListener('click', shareLink);
    document.getElementById('copyBtn').addEventListener('click', copyToClipboard);
    document.getElementById('downloadPngBtn').addEventListener('click', () => downloadQR('png'));
    document.getElementById('downloadSvgBtn').addEventListener('click', () => downloadQR('svg'));
    
    document.querySelectorAll('.modal-overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); }));
    document.addEventListener('click', e => { if (!e.target.closest('.dropdown')) document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open')); });
    
    // Regenerate QR on resize/orientation change
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => generateQR(), 250);
    });
}

// QR Generation
function generateQR() {
    const data = getQRData();
    if (!data) return;
    const container = document.getElementById('qr-code');
    container.innerHTML = '';
    
    // Responsive size - cap at container width on mobile
    let size = state.settings.size;
    if (window.innerWidth <= 600) {
        const maxSize = Math.min(window.innerWidth - 80, 280);
        size = Math.min(size, maxSize);
    }
    
    const options = {
        width: size, height: size, data, margin: state.settings.quietZone,
        dotsOptions: { color: state.styling.fgColor, type: state.styling.dotStyle },
        backgroundOptions: { color: state.styling.transparentBg ? 'transparent' : state.styling.bgColor },
        cornersSquareOptions: { color: state.styling.fgColor, type: state.styling.cornerSquareStyle },
        cornersDotOptions: { color: state.styling.fgColor, type: state.styling.cornerDotStyle },
        qrOptions: { errorCorrectionLevel: state.settings.ecLevel }
    };
    if (state.logo.data) {
        options.image = state.logo.data;
        options.imageOptions = { crossOrigin: 'anonymous', margin: state.logo.margin, imageSize: state.logo.size };
    }
    qrCode = new QRCodeStyling(options);
    qrCode.append(container);
    updateCapacity(data);
    checkContrast();
}

function getQRData() {
    switch (state.type) {
        case 'url': return document.getElementById('url-input').value || '';
        case 'text': return document.getElementById('text-input').value || '';
        case 'vcard': return generateVCard();
        case 'wifi': return generateWiFi();
        case 'email': return generateEmail();
        case 'sms': return generateSMS();
        case 'phone': const p = document.getElementById('phone-number').value; return p ? `tel:${p}` : '';
        case 'geo': return generateGeo();
        default: return '';
    }
}

function generateVCard() {
    const fn = document.getElementById('vcard-firstname').value, ln = document.getElementById('vcard-lastname').value;
    const company = document.getElementById('vcard-company').value, title = document.getElementById('vcard-title').value;
    const phone = document.getElementById('vcard-phone').value, email = document.getElementById('vcard-email').value;
    const website = document.getElementById('vcard-website').value, address = document.getElementById('vcard-address').value;
    let v = 'BEGIN:VCARD\nVERSION:3.0\n';
    if (fn || ln) v += `N:${ln};${fn};;;\nFN:${fn} ${ln}\n`;
    if (company) v += `ORG:${company}\n`; if (title) v += `TITLE:${title}\n`;
    if (phone) v += `TEL:${phone}\n`; if (email) v += `EMAIL:${email}\n`;
    if (website) v += `URL:${website}\n`; if (address) v += `ADR:;;${address.replace(/\n/g, ';')};;;;\n`;
    return v + 'END:VCARD';
}

function generateWiFi() {
    const ssid = document.getElementById('wifi-ssid').value, pass = document.getElementById('wifi-password').value;
    const sec = document.getElementById('wifi-security').value, hidden = document.getElementById('wifi-hidden').checked;
    if (!ssid) return '';
    let w = `WIFI:T:${sec};S:${ssid};`;
    if (pass && sec !== 'nopass') w += `P:${pass};`;
    if (hidden) w += 'H:true;';
    return w + ';';
}

function generateEmail() {
    const addr = document.getElementById('email-address').value, subj = document.getElementById('email-subject').value, body = document.getElementById('email-body').value;
    if (!addr) return '';
    let e = `mailto:${addr}`, params = [];
    if (subj) params.push(`subject=${encodeURIComponent(subj)}`);
    if (body) params.push(`body=${encodeURIComponent(body)}`);
    return params.length ? e + '?' + params.join('&') : e;
}

function generateSMS() {
    const phone = document.getElementById('sms-phone').value, msg = document.getElementById('sms-message').value;
    if (!phone) return '';
    return msg ? `sms:${phone}?body=${encodeURIComponent(msg)}` : `sms:${phone}`;
}

function generateGeo() {
    const lat = document.getElementById('geo-lat').value, lng = document.getElementById('geo-lng').value, name = document.getElementById('geo-name').value;
    if (!lat || !lng) return '';
    return name ? `geo:${lat},${lng}?q=${encodeURIComponent(name)}` : `geo:${lat},${lng}`;
}

function debounceGenerate() { clearTimeout(debounceTimer); debounceTimer = setTimeout(generateQR, 150); }

// UI Helpers
function selectType(type) {
    state.type = type;
    document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
    document.querySelectorAll('.form-content').forEach(f => f.classList.add('hidden'));
    document.getElementById(`form-${type}`).classList.remove('hidden');
    debounceGenerate();
}

function toggleSection(header) { header.closest('.section').classList.toggle('open'); }

function setupColorSync(pickerId, hexId) {
    const picker = document.getElementById(pickerId), hex = document.getElementById(hexId);
    picker.addEventListener('input', e => { hex.value = e.target.value.toUpperCase(); updateColorState(pickerId, e.target.value); debounceGenerate(); });
    hex.addEventListener('input', e => {
        let v = e.target.value; if (!v.startsWith('#')) v = '#' + v;
        if (/^#[0-9A-Fa-f]{6}$/.test(v)) { picker.value = v; updateColorState(pickerId, v); debounceGenerate(); }
    });
}

function updateColorState(id, val) {
    if (id === 'fgColor') state.styling.fgColor = val;
    else if (id === 'bgColor') state.styling.bgColor = val;
    else if (id === 'frameLabelColor') { state.frame.labelColor = val; updateFramePreview(); }
    else if (id === 'frameLabelBg') { state.frame.labelBg = val; updateFramePreview(); }
}

function setupStyleGrid(gridId, cb) {
    const grid = document.getElementById(gridId);
    grid.querySelectorAll('.style-option').forEach(opt => opt.addEventListener('click', () => {
        grid.querySelectorAll('.style-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active'); cb(opt.dataset.style);
    }));
}

function setupDropdown(dropdownId, buttonId) {
    const dropdown = document.getElementById(dropdownId);
    document.getElementById(buttonId).addEventListener('click', e => {
        e.stopPropagation();
        document.querySelectorAll('.dropdown.open').forEach(d => { if (d !== dropdown) d.classList.remove('open'); });
        dropdown.classList.toggle('open');
    });
}

function closeDropdown(id) { document.getElementById(id).classList.remove('open'); }
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function toggleTheme() {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('qr-theme', next);
    updateThemeIcon(next);
}

// Logo
function handleLogoFile(file) {
    if (!file.type.startsWith('image/')) { showToast('Please upload an image file', 'error'); return; }
    const reader = new FileReader();
    reader.onload = e => {
        state.logo.data = e.target.result;
        const lu = document.getElementById('logoUpload');
        lu.classList.add('has-logo');
        lu.innerHTML = `<input type="file" id="logoInput" accept="image/*"><div class="logo-preview"><img src="${e.target.result}" alt="Logo"><div class="logo-preview-info"><div class="logo-preview-name">${file.name}</div><span class="logo-preview-remove" onclick="removeLogo(event)">Remove</span></div></div>`;
        document.getElementById('logoInput').addEventListener('change', ev => { if (ev.target.files[0]) handleLogoFile(ev.target.files[0]); });
        document.getElementById('logoSizeField').classList.remove('hidden');
        document.getElementById('logoMarginField').classList.remove('hidden');
        if (state.settings.ecLevel === 'L' || state.settings.ecLevel === 'M') {
            state.settings.ecLevel = 'Q'; document.getElementById('ecLevel').value = 'Q';
            showToast('Error correction increased for better logo scanning', 'success');
        }
        debounceGenerate();
    };
    reader.readAsDataURL(file);
}

function removeLogo(e) {
    e.stopPropagation(); state.logo.data = null;
    const lu = document.getElementById('logoUpload');
    lu.classList.remove('has-logo');
    lu.innerHTML = `<input type="file" id="logoInput" accept="image/*"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><p>Click or drag to upload logo</p>`;
    document.getElementById('logoInput').addEventListener('change', ev => { if (ev.target.files[0]) handleLogoFile(ev.target.files[0]); });
    document.getElementById('logoSizeField').classList.add('hidden');
    document.getElementById('logoMarginField').classList.add('hidden');
    debounceGenerate();
}

function updateFramePreview() {
    const preview = document.getElementById('frameLabelPreview');
    if (state.frame.label) {
        preview.textContent = state.frame.label;
        preview.style.color = state.frame.labelColor;
        preview.style.background = state.frame.labelBg;
        preview.classList.remove('hidden');
    } else preview.classList.add('hidden');
}

// Status
function updateCapacity(data) {
    const maxCap = { L: 2953, M: 2331, Q: 1663, H: 1273 };
    const pct = Math.min(100, Math.round((data.length / maxCap[state.settings.ecLevel]) * 100));
    document.getElementById('capacityLabel').textContent = `Capacity: ${pct}%`;
    const fill = document.getElementById('capacityFill');
    fill.style.width = pct + '%';
    fill.className = 'capacity-bar-fill' + (pct > 90 ? ' error' : pct > 70 ? ' warning' : '');
}

function checkContrast() {
    const fg = state.styling.fgColor, bg = state.styling.transparentBg ? '#ffffff' : state.styling.bgColor;
    const lum = c => { const rgb = [parseInt(c.slice(1,3),16), parseInt(c.slice(3,5),16), parseInt(c.slice(5,7),16)].map(v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }); return 0.2126*rgb[0] + 0.7152*rgb[1] + 0.0722*rgb[2]; };
    const l1 = lum(fg), l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const status = document.getElementById('contrastStatus');
    if (ratio < 3) { status.className = 'status-item status-error'; status.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg><span>Poor contrast - may not scan</span>'; }
    else if (ratio < 4.5) { status.className = 'status-item status-warning'; status.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span>Low contrast</span>'; }
    else { status.className = 'status-item status-ok'; status.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><span>Good contrast</span>'; }
}

// Download & Share
async function downloadQR(type) {
    if (!qrCode) return;
    const ext = type === 'svg' ? 'svg' : 'png';
    qrCode.download({ name: `qr-code-${Date.now()}`, extension: ext });
    showToast(`QR code downloaded as ${ext.toUpperCase()}`, 'success');
}

async function copyToClipboard() {
    if (!qrCode) return;
    try {
        const canvas = document.querySelector('#qr-code canvas');
        if (!canvas) { showToast('Generate a QR code first', 'error'); return; }
        const blob = await new Promise(r => canvas.toBlob(r));
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showToast('Copied to clipboard', 'success');
    } catch { showToast('Failed to copy', 'error'); }
}

function shareLink() {
    const config = { t: state.type, s: state.styling, st: state.settings, f: state.frame };
    const hash = btoa(JSON.stringify(config));
    const url = `${location.origin}${location.pathname}#${hash}`;
    navigator.clipboard.writeText(url).then(() => showToast('Share link copied!', 'success')).catch(() => showToast('Failed to copy link', 'error'));
}

function loadFromURL() {
    if (!location.hash) return;
    try {
        const config = JSON.parse(atob(location.hash.slice(1)));
        if (config.t) { state.type = config.t; selectType(config.t); }
        if (config.s) { Object.assign(state.styling, config.s); applyStyleToUI(); }
        if (config.st) { Object.assign(state.settings, config.st); applySettingsToUI(); }
        if (config.f) { Object.assign(state.frame, config.f); applyFrameToUI(); }
    } catch {}
}

function applyStyleToUI() {
    document.getElementById('fgColor').value = state.styling.fgColor;
    document.getElementById('fgColorHex').value = state.styling.fgColor;
    document.getElementById('bgColor').value = state.styling.bgColor;
    document.getElementById('bgColorHex').value = state.styling.bgColor;
    document.getElementById('transparentBg').checked = state.styling.transparentBg;
    document.querySelectorAll('#dotStyleGrid .style-option').forEach(o => o.classList.toggle('active', o.dataset.style === state.styling.dotStyle));
    document.querySelectorAll('#cornerSquareStyleGrid .style-option').forEach(o => o.classList.toggle('active', o.dataset.style === state.styling.cornerSquareStyle));
    document.querySelectorAll('#cornerDotStyleGrid .style-option').forEach(o => o.classList.toggle('active', o.dataset.style === state.styling.cornerDotStyle));
}

function applySettingsToUI() {
    document.getElementById('qrSize').value = state.settings.size;
    document.getElementById('qrSizeValue').textContent = state.settings.size + 'px';
    document.getElementById('ecLevel').value = state.settings.ecLevel;
    document.getElementById('quietZone').value = state.settings.quietZone;
    document.getElementById('quietZoneValue').textContent = state.settings.quietZone + 'px';
}

function applyFrameToUI() {
    document.getElementById('frameLabel').value = state.frame.label;
    document.getElementById('frameLabelColor').value = state.frame.labelColor;
    document.getElementById('frameLabelColorHex').value = state.frame.labelColor;
    document.getElementById('frameLabelBg').value = state.frame.labelBg;
    document.getElementById('frameLabelBgHex').value = state.frame.labelBg;
    updateFramePreview();
}

// Presets
function getPresets() { return JSON.parse(localStorage.getItem('qr-presets') || '[]'); }
function savePresets(p) { localStorage.setItem('qr-presets', JSON.stringify(p)); }

function savePreset() {
    const name = document.getElementById('presetName').value.trim();
    if (!name) { showToast('Please enter a preset name', 'error'); return; }
    const presets = getPresets();
    presets.push({ id: Date.now().toString(), name, type: state.type, styling: {...state.styling}, settings: {...state.settings}, frame: {...state.frame}, logo: state.logo.data ? { size: state.logo.size, margin: state.logo.margin } : null });
    savePresets(presets);
    closeModal('savePresetModal');
    document.getElementById('presetName').value = '';
    showToast('Preset saved!', 'success');
}

function showPresetList() {
    const list = document.getElementById('presetList'), presets = getPresets();
    if (!presets.length) { list.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg><p>No presets saved yet</p></div>'; return; }
    list.innerHTML = presets.map(p => `<div class="preset-item" onclick="loadPreset('${p.id}')"><div class="preset-preview">📱</div><div class="preset-info"><div class="preset-name">${p.name}</div><div class="preset-type">${p.type}</div></div><button class="preset-delete" onclick="deletePreset(event, '${p.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div>`).join('');
}

function loadPreset(id) {
    const preset = getPresets().find(p => p.id === id);
    if (!preset) return;
    state.type = preset.type; state.styling = {...preset.styling}; state.settings = {...preset.settings}; state.frame = {...preset.frame};
    selectType(preset.type); applyStyleToUI(); applySettingsToUI(); applyFrameToUI();
    closeModal('loadPresetModal');
    generateQR();
    showToast('Preset loaded!', 'success');
}

function deletePreset(e, id) {
    e.stopPropagation();
    savePresets(getPresets().filter(p => p.id !== id));
    showPresetList();
    showToast('Preset deleted', 'success');
}

function exportPresets() {
    const data = JSON.stringify({ presets: getPresets(), brand: getBrand() }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'qr-studio-backup.json'; a.click();
    showToast('Presets exported!', 'success');
}

function importPresets(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        try {
            const data = JSON.parse(ev.target.result);
            if (data.presets) savePresets([...getPresets(), ...data.presets]);
            if (data.brand) saveBrandData(data.brand);
            showToast('Import successful!', 'success');
        } catch { showToast('Invalid file format', 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// Brand Kit
function getBrand() { return JSON.parse(localStorage.getItem('qr-brand') || 'null'); }
function saveBrandData(b) { localStorage.setItem('qr-brand', JSON.stringify(b)); }

function saveBrand() {
    saveBrandData({ fgColor: state.styling.fgColor, bgColor: state.styling.bgColor, logo: state.logo.data, logoSize: state.logo.size, logoMargin: state.logo.margin });
    showToast('Brand kit saved!', 'success');
}

function applyBrand() {
    const brand = getBrand();
    if (!brand) { showToast('No brand kit saved', 'error'); return; }
    state.styling.fgColor = brand.fgColor; state.styling.bgColor = brand.bgColor;
    if (brand.logo) { state.logo.data = brand.logo; state.logo.size = brand.logoSize; state.logo.margin = brand.logoMargin; }
    applyStyleToUI();
    if (brand.logo) {
        document.getElementById('logoSizeField').classList.remove('hidden');
        document.getElementById('logoMarginField').classList.remove('hidden');
        document.getElementById('logoSize').value = brand.logoSize;
        document.getElementById('logoSizeValue').textContent = Math.round(brand.logoSize * 100) + '%';
        document.getElementById('logoMargin').value = brand.logoMargin;
        document.getElementById('logoMarginValue').textContent = brand.logoMargin + 'px';
    }
    generateQR();
    showToast('Brand applied!', 'success');
}

function clearBrand() { localStorage.removeItem('qr-brand'); showToast('Brand kit cleared', 'success'); }

// Toast
function showToast(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = type === 'success' ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><span>${msg}</span>` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg><span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// PWA
let deferredPrompt = null;
function initPWA() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault(); deferredPrompt = e;
        if (!localStorage.getItem('pwa-dismissed')) document.getElementById('installBanner').classList.add('show');
    });
    document.getElementById('installBtn').addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        document.getElementById('installBanner').classList.remove('show');
    });
    document.getElementById('dismissInstall').addEventListener('click', () => {
        document.getElementById('installBanner').classList.remove('show');
        localStorage.setItem('pwa-dismissed', 'true');
    });
}
