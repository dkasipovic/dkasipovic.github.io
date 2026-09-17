const urlInput = document.getElementById('urlInput');
const urlError = document.getElementById('urlError');
const labelInput = document.getElementById('labelInput');
const iconInput = document.getElementById('iconInput');
const iconPreview = document.getElementById('iconPreview');
const iconImg = document.getElementById('iconImg');
const iconPlaceholder = document.getElementById('iconPlaceholder');
const iconNote = document.getElementById('iconNote');
const faviconBtn = document.getElementById('faviconBtn');
const faviconSpinner = document.getElementById('faviconSpinner');
const faviconBtnLabel = document.getElementById('faviconBtnLabel');
const removeIconBtn = document.getElementById('removeIconBtn');
const fullScreen = document.getElementById('fullScreen');
const ignoreScope = document.getElementById('ignoreScope');
const isRemovable = document.getElementById('isRemovable');
const generateBtn = document.getElementById('generateBtn');
const altDownload = document.getElementById('altDownload');
const statusEl = document.getElementById('status');

const ICON_SIZE = 180;
// Below this the source image gets upscaled enough to look soft on a Retina
// home screen, so the user is nudged towards supplying a bigger one.
const LOW_RES_THRESHOLD = 64;
const MAX_LABEL = 30;
const MIME = 'application/x-apple-aspen-config';

/* ── Favicon sources ──
   Tried in order, first one that decodes wins. A source is only usable if it
   answers with Access-Control-Allow-Origin: an image drawn without CORS
   permission taints the canvas and toDataURL() then throws a SecurityError.
   Header check on 2026-09-17:
     icon.horse/icon/{host}          -> Access-Control-Allow-Origin: *   (kept)
     www.google.com/s2/favicons      -> 301 to t3.gstatic.com, no ACAO   (dropped)
     icons.duckduckgo.com/ip3/{host} -> no ACAO                          (dropped)
   Public CORS proxies are deliberately not an option here. */
const FAVICON_SOURCES = [
    (host) => `https://icon.horse/icon/${host}`,
];

const state = {
    url: null,
    // { base64, size, source: 'upload' | 'favicon', urlAtPull }
    icon: null,
    faviconLoading: false,
};

/* ── URL ── */

function parseUrl(raw) {
    const value = raw.trim();
    if (!value) return { ok: false, message: '' };

    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        return { ok: false, message: 'Neispravan URL.' };
    }

    if (parsed.protocol !== 'https:') {
        return { ok: false, message: 'URL mora počinjati sa https://' };
    }
    if (!parsed.hostname) {
        return { ok: false, message: 'URL nema hostname.' };
    }
    return { ok: true, url: parsed };
}

function refresh() {
    const result = parseUrl(urlInput.value);
    state.url = result.ok ? result.url : null;

    urlInput.classList.toggle('invalid', Boolean(result.message));
    urlError.hidden = !result.message;
    urlError.textContent = result.message;

    labelInput.placeholder = result.ok ? result.url.hostname : 'Ime ispod ikone';
    generateBtn.disabled = !result.ok;
    altDownload.classList.toggle('disabled', !result.ok);
    faviconBtn.disabled = !result.ok || state.faviconLoading;
}

function currentLabel() {
    const typed = labelInput.value.trim();
    if (typed) return typed.slice(0, MAX_LABEL);
    return state.url ? state.url.hostname.slice(0, MAX_LABEL) : '';
}

/* ── Icon ── */

function setIcon(icon) {
    state.icon = icon;
    if (icon) {
        iconImg.src = `data:image/png;base64,${icon.base64}`;
        iconImg.hidden = false;
        iconPlaceholder.hidden = true;
        iconPreview.dataset.empty = 'false';
        removeIconBtn.hidden = false;
    } else {
        iconImg.removeAttribute('src');
        iconImg.hidden = true;
        iconPlaceholder.hidden = false;
        iconPreview.dataset.empty = 'true';
        removeIconBtn.hidden = true;
    }
}

function setNote(message, kind) {
    iconNote.hidden = !message;
    iconNote.textContent = message || '';
    iconNote.className = `note${kind ? ` note-${kind}` : ''}`;
}

// Draws any image source into a 180x180 PNG: cover crop, centred, on white.
// The white fill matters — iOS renders a Web Clip icon without alpha, so a
// transparent PNG comes out with black edges.
function toIconBase64(source) {
    const canvas = document.createElement('canvas');
    canvas.width = ICON_SIZE;
    canvas.height = ICON_SIZE;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ICON_SIZE, ICON_SIZE);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const w = source.naturalWidth || source.width;
    const h = source.naturalHeight || source.height;

    if (!w || !h) {
        // An SVG without an intrinsic size reports 0; stretch it to the box.
        ctx.drawImage(source, 0, 0, ICON_SIZE, ICON_SIZE);
    } else {
        const scale = Math.max(ICON_SIZE / w, ICON_SIZE / h);
        const dw = w * scale;
        const dh = h * scale;
        ctx.drawImage(source, (ICON_SIZE - dw) / 2, (ICON_SIZE - dh) / 2, dw, dh);
    }

    return canvas.toDataURL('image/png').split(',')[1];
}

function loadImageElement(src, crossOrigin) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        if (crossOrigin) img.crossOrigin = crossOrigin;
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Slika se ne može učitati.'));
        img.src = src;
    });
}

async function readImageFile(file) {
    // createImageBitmap is the fast path, but Safari still refuses SVG blobs,
    // so an <img> with an object URL stays as the fallback.
    if (typeof createImageBitmap === 'function') {
        try {
            const bitmap = await createImageBitmap(file);
            try {
                return { base64: toIconBase64(bitmap), size: Math.min(bitmap.width, bitmap.height) };
            } finally {
                if (typeof bitmap.close === 'function') bitmap.close();
            }
        } catch {
            // Fall through to the <img> path.
        }
    }

    const objectUrl = URL.createObjectURL(file);
    try {
        const img = await loadImageElement(objectUrl);
        const size = Math.min(img.naturalWidth || ICON_SIZE, img.naturalHeight || ICON_SIZE);
        return { base64: toIconBase64(img), size };
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

async function loadFavicon(pageUrl) {
    const host = encodeURIComponent(new URL(pageUrl).hostname);

    for (const src of FAVICON_SOURCES) {
        try {
            const img = await loadImageElement(src(host), 'anonymous');
            const size = Math.min(img.naturalWidth, img.naturalHeight) || 0;
            return { base64: toIconBase64(img), size };
        } catch {
            // CORS, 404 or a broken image: try the next source.
        }
    }
    return null;
}

iconInput.addEventListener('change', async () => {
    const file = iconInput.files && iconInput.files[0];
    // Clearing the input lets the same file be picked again after removal.
    iconInput.value = '';
    if (!file) return;

    try {
        const { base64, size } = await readImageFile(file);
        setIcon({ base64, size, source: 'upload' });
        const lowRes = size < LOW_RES_THRESHOLD;
        setNote(
            lowRes
                ? 'Ikona je niske rezolucije i može biti mutna. Preporučujemo veću sliku.'
                : 'Ikona je spremna: 180×180 PNG.',
            lowRes ? 'warn' : 'ok'
        );
    } catch {
        setNote('Slika se ne može pročitati. Pokušaj sa PNG ili JPEG fajlom.', 'error');
    }
});

faviconBtn.addEventListener('click', async () => {
    if (!state.url || state.faviconLoading) return;

    const pulledFor = urlInput.value.trim();
    state.faviconLoading = true;
    faviconBtn.disabled = true;
    faviconSpinner.hidden = false;
    faviconBtnLabel.textContent = 'Učitavanje…';
    setNote('', null);

    try {
        const result = await loadFavicon(state.url.href);
        if (!result) {
            setNote('Favicon nije dostupan. Uploaduj ikonu ručno.', 'error');
            return;
        }
        setIcon({ base64: result.base64, size: result.size, source: 'favicon', urlAtPull: pulledFor });
        const lowRes = result.size > 0 && result.size < LOW_RES_THRESHOLD;
        setNote(
            lowRes
                ? 'Ikona je niske rezolucije i može biti mutna. Preporučujemo upload vlastite slike.'
                : 'Favicon je povučen i skaliran na 180×180.',
            lowRes ? 'warn' : 'ok'
        );
    } catch {
        setNote('Favicon nije dostupan. Uploaduj ikonu ručno.', 'error');
    } finally {
        state.faviconLoading = false;
        faviconSpinner.hidden = true;
        faviconBtnLabel.textContent = 'Povuci favicon';
        refresh();
    }
});

removeIconBtn.addEventListener('click', () => {
    setIcon(null);
    setNote('', null);
});

/* ── Profile ── */

const XML_ENTITIES = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' };

const esc = (s) =>
    s
        // Control characters are not representable in XML 1.0 at all.
        .replace(/[ --]/g, '')
        .replace(/[<>&'"]/g, (c) => XML_ENTITIES[c]);

function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID().toUpperCase();

    // crypto.randomUUID() needs a secure context; this keeps the page usable
    // when it is opened over plain http on a LAN.
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)]
        .join('-')
        .toUpperCase();
}

const bool = (value) => (value ? '<true/>' : '<false/>');
const pad = (level) => '\t'.repeat(level);

function buildProfile({ url, label, icon, options }) {
    const profileUuid = uuid();
    const clipUuid = uuid();
    const safeLabel = esc(label);
    const safeUrl = esc(url);

    const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
        '<plist version="1.0">',
        '<dict>',
        `${pad(1)}<key>PayloadType</key><string>Configuration</string>`,
        `${pad(1)}<key>PayloadVersion</key><integer>1</integer>`,
        `${pad(1)}<key>PayloadIdentifier</key><string>local.webclip.${profileUuid}</string>`,
        `${pad(1)}<key>PayloadUUID</key><string>${profileUuid}</string>`,
        `${pad(1)}<key>PayloadDisplayName</key><string>${safeLabel}</string>`,
        `${pad(1)}<key>PayloadDescription</key><string>Prečica na ${safeUrl}</string>`,
        `${pad(1)}<key>PayloadRemovalDisallowed</key><false/>`,
        `${pad(1)}<key>PayloadContent</key>`,
        `${pad(1)}<array>`,
        `${pad(2)}<dict>`,
        `${pad(3)}<key>PayloadType</key><string>com.apple.webClip.managed</string>`,
        `${pad(3)}<key>PayloadVersion</key><integer>1</integer>`,
        `${pad(3)}<key>PayloadIdentifier</key><string>local.webclip.${profileUuid}.clip</string>`,
        `${pad(3)}<key>PayloadUUID</key><string>${clipUuid}</string>`,
        `${pad(3)}<key>PayloadDisplayName</key><string>${safeLabel}</string>`,
        `${pad(3)}<key>URL</key><string>${safeUrl}</string>`,
        `${pad(3)}<key>Label</key><string>${safeLabel}</string>`,
        `${pad(3)}<key>FullScreen</key>${bool(options.fullScreen)}`,
        `${pad(3)}<key>IgnoreManifestScope</key>${bool(options.ignoreScope)}`,
        `${pad(3)}<key>IsRemovable</key>${bool(options.isRemovable)}`,
        `${pad(3)}<key>Precomposed</key><true/>`,
    ];

    if (icon) {
        const data = icon.base64.match(/.{1,76}/g).map((line) => pad(3) + line).join('\n');
        lines.push(`${pad(3)}<key>Icon</key>`, `${pad(3)}<data>`, data, `${pad(3)}</data>`);
    }

    lines.push(`${pad(2)}</dict>`, `${pad(1)}</array>`, '</dict>', '</plist>', '');
    return lines.join('\n');
}

// đ has no decomposed form, so NFKD alone would leave it in place.
const TRANSLITERATE = { č: 'c', ć: 'c', š: 's', ž: 'z', đ: 'd' };

function slugify(text) {
    const mapped = Array.from(text.toLowerCase(), (ch) => TRANSLITERATE[ch] || ch).join('');
    return (
        mapped
            .normalize('NFKD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40) || 'webclip'
    );
}

/* ── Download ── */

function base64FromString(text) {
    // btoa() on the raw string would throw on č, ć, ž and friends, so the text
    // goes through UTF-8 bytes first.
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}

function triggerDownload(href, filename) {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

function downloadViaDataUrl(xml, filename) {
    triggerDownload(`data:${MIME};base64,${base64FromString(xml)}`, filename);
}

function downloadViaBlob(xml, filename) {
    const href = URL.createObjectURL(new Blob([xml], { type: MIME }));
    triggerDownload(href, filename);
    // Safari may still be reading the blob when the click returns, so the URL
    // is released a moment later rather than immediately.
    setTimeout(() => URL.revokeObjectURL(href), 10000);
}

function setStatus(message, kind) {
    statusEl.hidden = !message;
    statusEl.textContent = message || '';
    statusEl.className = `status${kind ? ` status-${kind}` : ''}`;
}

function generate(method) {
    const result = parseUrl(urlInput.value);
    if (!result.ok) {
        refresh();
        return;
    }

    const label = currentLabel();
    const xml = buildProfile({
        url: result.url.href,
        label,
        icon: state.icon,
        options: {
            fullScreen: fullScreen.checked,
            ignoreScope: ignoreScope.checked,
            isRemovable: isRemovable.checked,
        },
    });
    const filename = `${slugify(label)}.mobileconfig`;

    try {
        if (method === 'blob') downloadViaBlob(xml, filename);
        else downloadViaDataUrl(xml, filename);
    } catch {
        setStatus('Preuzimanje nije uspjelo. Probaj alternativni način.', 'error');
        return;
    }

    setStatus(
        `${filename} je generisan. Otvori Settings → Profile Downloaded → Install. ` +
            'Ako je fajl završio u Files, tapni ga tamo.',
        'ok'
    );
}

/* ── Wiring ── */

urlInput.addEventListener('input', () => {
    // A pulled favicon belongs to the URL it was pulled for; a manual upload is
    // the user's own choice and survives URL edits.
    if (state.icon && state.icon.source === 'favicon' && state.icon.urlAtPull !== urlInput.value.trim()) {
        setIcon(null);
        setNote('URL je promijenjen, povučeni favicon je uklonjen.', null);
    }
    setStatus('', null);
    refresh();
});

labelInput.addEventListener('input', () => setStatus('', null));
generateBtn.addEventListener('click', () => generate('data'));

altDownload.addEventListener('click', (event) => {
    event.preventDefault();
    if (!state.url) return;
    generate('blob');
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}

refresh();
