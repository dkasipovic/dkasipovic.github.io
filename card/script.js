// ── Vendor data ───────────────────────────────────────────
// prefixes: each entry is either a fixed string or { from, to, length }
// for a numeric range. groups: digit groupings for display.

const VENDORS = [
    {
        id: 'visa',
        name: 'Visa',
        brandLabel: 'VISA',
        brandClass: 'brand-visa',
        prefixes: ['4'],
        length: 16,
        cvvLen: 3,
        groups: [4, 4, 4, 4]
    },
    {
        id: 'mc',
        name: 'Mastercard',
        brandLabel: 'mc-logo',
        brandClass: 'card-brand-mc',
        prefixes: [
            '51', '52', '53', '54', '55',
            { from: 2221, to: 2720, length: 4 }
        ],
        length: 16,
        cvvLen: 3,
        groups: [4, 4, 4, 4]
    },
    {
        id: 'amex',
        name: 'Amex',
        brandLabel: 'AMERICAN EXPRESS',
        brandClass: 'brand-amex',
        prefixes: ['34', '37'],
        length: 15,
        cvvLen: 4,
        groups: [4, 6, 5]
    },
    {
        id: 'discover',
        name: 'Discover',
        brandLabel: 'DISCOVER',
        brandClass: 'brand-discover',
        prefixes: [
            '6011', '65',
            '644', '645', '646', '647', '648', '649',
            { from: 622126, to: 622925, length: 6 }
        ],
        length: 16,
        cvvLen: 3,
        groups: [4, 4, 4, 4]
    },
    {
        id: 'jcb',
        name: 'JCB',
        brandLabel: 'JCB',
        brandClass: 'brand-jcb',
        prefixes: [{ from: 3528, to: 3589, length: 4 }],
        length: 16,
        cvvLen: 3,
        groups: [4, 4, 4, 4]
    },
    {
        id: 'diners',
        name: 'Diners Club',
        brandLabel: 'DINERS CLUB',
        brandClass: 'brand-diners',
        prefixes: [
            '300', '301', '302', '303', '304', '305',
            '3095', '36', '38', '39'
        ],
        length: 14,
        cvvLen: 3,
        groups: [4, 6, 4]
    },
    {
        id: 'unionpay',
        name: 'UnionPay',
        brandLabel: 'UNIONPAY',
        brandClass: 'brand-unionpay',
        prefixes: ['62'],
        length: 16,
        cvvLen: 3,
        groups: [4, 4, 4, 4]
    }
];

const FIRST_NAMES = [
    'ALEX', 'JAMIE', 'CHRIS', 'TAYLOR', 'JORDAN', 'CASEY', 'MORGAN',
    'AVERY', 'RILEY', 'QUINN', 'PARKER', 'SAGE', 'ROWAN', 'EMERSON',
    'DAKOTA', 'KAI', 'NOA', 'ROBIN', 'SKYLAR', 'REESE'
];

const LAST_NAMES = [
    'SMITH', 'JOHNSON', 'BROWN', 'GARCIA', 'MILLER', 'DAVIS',
    'RODRIGUEZ', 'MARTINEZ', 'WILSON', 'ANDERSON', 'TAYLOR',
    'THOMAS', 'MOORE', 'JACKSON', 'WHITE', 'HARRIS', 'CLARK',
    'LEWIS', 'WALKER', 'YOUNG', 'KING', 'WRIGHT'
];

// ── DOM ───────────────────────────────────────────────────
const vendorGrid = document.getElementById('vendorGrid');
const cardEl = document.getElementById('card');
const cardStage = document.getElementById('cardStage');
const cardBrand = document.getElementById('cardBrand');
const cardBrandBack = document.getElementById('cardBrandBack');
const cardNumberEl = document.getElementById('cardNumber');
const cardNameEl = document.getElementById('cardName');
const cardExpiryEl = document.getElementById('cardExpiry');
const cardCvvEl = document.getElementById('cardCvv');
const cardSignatureEl = document.getElementById('cardSignature');
const numberValue = document.getElementById('numberValue');
const nameValue = document.getElementById('nameValue');
const expiryValue = document.getElementById('expiryValue');
const cvvValue = document.getElementById('cvvValue');
const generateBtn = document.getElementById('generateBtn');
const flipBtn = document.getElementById('flipBtn');
const generatePanel = document.getElementById('generatePanel');
const validatePanel = document.getElementById('validatePanel');
const validateInput = document.getElementById('validateInput');
const validateVendor = document.getElementById('validateVendor');
const validateLength = document.getElementById('validateLength');
const validateLuhn = document.getElementById('validateLuhn');
const validateSummary = document.getElementById('validateSummary');

let currentVendor = VENDORS[0];
let currentCard = null;
const fieldValues = {};

// ── Helpers ───────────────────────────────────────────────
function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomDigit() {
    return Math.floor(Math.random() * 10).toString();
}

function pickPrefix(vendor) {
    const choice = pick(vendor.prefixes);
    if (typeof choice === 'string') return choice;
    const n = Math.floor(Math.random() * (choice.to - choice.from + 1)) + choice.from;
    return n.toString().padStart(choice.length, '0');
}

// Luhn check digit: appended to a partial number so the full number passes Luhn.
function luhnCheckDigit(partial) {
    let sum = 0;
    let alt = true;
    for (let i = partial.length - 1; i >= 0; i--) {
        let d = parseInt(partial[i], 10);
        if (alt) {
            d *= 2;
            if (d > 9) d -= 9;
        }
        sum += d;
        alt = !alt;
    }
    return (10 - (sum % 10)) % 10;
}

function luhnIsValid(num) {
    let sum = 0;
    let alt = false;
    for (let i = num.length - 1; i >= 0; i--) {
        let d = parseInt(num[i], 10);
        if (alt) {
            d *= 2;
            if (d > 9) d -= 9;
        }
        sum += d;
        alt = !alt;
    }
    return sum % 10 === 0;
}

function detectVendor(digits) {
    for (const v of VENDORS) {
        for (const p of v.prefixes) {
            if (typeof p === 'string') {
                if (digits.startsWith(p)) return v;
            } else if (digits.length >= p.length) {
                const n = parseInt(digits.slice(0, p.length), 10);
                if (n >= p.from && n <= p.to) return v;
            }
        }
    }
    return null;
}

function generateNumber(vendor) {
    const prefix = pickPrefix(vendor);
    const targetLen = vendor.length - 1;
    let digits = prefix;
    while (digits.length < targetLen) digits += randomDigit();
    digits += luhnCheckDigit(digits).toString();
    return digits;
}

function formatNumber(num, groups) {
    const out = [];
    let i = 0;
    for (const g of groups) {
        out.push(num.slice(i, i + g));
        i += g;
    }
    return out.join(' ');
}

function generateName() {
    return pick(FIRST_NAMES) + ' ' + pick(LAST_NAMES);
}

function generateExpiry() {
    const month = Math.floor(Math.random() * 12) + 1;
    const now = new Date();
    const year = now.getFullYear() + Math.floor(Math.random() * 5) + 1;
    return String(month).padStart(2, '0') + '/' + String(year).slice(-2);
}

function generateCvv(len) {
    let s = '';
    for (let i = 0; i < len; i++) s += randomDigit();
    return s;
}

// ── Render ────────────────────────────────────────────────
function setBrand(vendor) {
    cardEl.className = 'card ' + vendor.id;
    cardBrand.className = 'card-brand';
    cardBrandBack.textContent = vendor.name;

    if (vendor.id === 'mc') {
        cardBrand.classList.add('card-brand-mc');
        cardBrand.innerHTML =
            '<span class="mc-circles">' +
                '<span class="mc-circle mc-red"></span>' +
                '<span class="mc-circle mc-yellow"></span>' +
            '</span>';
    } else {
        if (vendor.brandClass) cardBrand.classList.add(vendor.brandClass);
        cardBrand.textContent = vendor.brandLabel;
    }
}

function applyName(name) {
    const display = (name || '').trim() || 'FULL NAME';
    cardNameEl.textContent = display.toUpperCase();
    cardSignatureEl.textContent = display;
    fieldValues.name = name;
}

function render(card) {
    currentCard = card;
    setBrand(card.vendor);

    cardNumberEl.textContent = formatNumber(card.number, card.vendor.groups);
    cardExpiryEl.textContent = card.expiry;
    cardCvvEl.textContent = card.cvv;

    numberValue.textContent = card.number;
    nameValue.value = card.name;
    expiryValue.textContent = card.expiry;
    cvvValue.textContent = card.cvv;

    fieldValues.number = card.number;
    fieldValues.expiry = card.expiry;
    fieldValues.cvv = card.cvv;

    applyName(card.name);
}

function generate() {
    const number = generateNumber(currentVendor);
    if (!luhnIsValid(number)) {
        console.error('Generated invalid Luhn number:', number);
    }
    render({
        vendor: currentVendor,
        number,
        name: generateName(),
        expiry: generateExpiry(),
        cvv: generateCvv(currentVendor.cvvLen)
    });
}

// ── Vendor chips ──────────────────────────────────────────
function renderVendorChips() {
    vendorGrid.innerHTML = VENDORS.map((v, i) =>
        `<button class="vendor-chip${i === 0 ? ' active' : ''}" data-vendor="${v.id}" aria-pressed="${i === 0}">${v.name}</button>`
    ).join('');

    vendorGrid.querySelectorAll('.vendor-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const id = chip.dataset.vendor;
            const v = VENDORS.find(x => x.id === id);
            if (!v) return;
            currentVendor = v;
            vendorGrid.querySelectorAll('.vendor-chip').forEach(c => {
                c.classList.remove('active');
                c.setAttribute('aria-pressed', 'false');
            });
            chip.classList.add('active');
            chip.setAttribute('aria-pressed', 'true');
            cardEl.classList.remove('flipped');
            generate();
        });
    });
}

// ── Validator ─────────────────────────────────────────────
const ICON_OK =
    '<svg class="validate-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const ICON_BAD =
    '<svg class="validate-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

function setValidateRow(el, text, state) {
    el.className = 'validate-row-value';
    if (state === 'good') el.classList.add('is-good');
    else if (state === 'bad') el.classList.add('is-bad');
    else if (state === 'muted') el.classList.add('is-muted');

    let icon = '';
    if (state === 'good') icon = ICON_OK;
    else if (state === 'bad') icon = ICON_BAD;

    el.innerHTML = icon + '<span>' + text + '</span>';
}

function updateValidator() {
    const raw = validateInput.value || '';
    const digits = raw.replace(/\D/g, '');

    if (digits.length === 0) {
        setValidateRow(validateVendor, '—', 'muted');
        setValidateRow(validateLength, '—', 'muted');
        setValidateRow(validateLuhn, '—', 'muted');
        validateSummary.className = 'validate-summary';
        validateSummary.textContent = 'Enter a card number to validate';
        return;
    }

    const vendor = detectVendor(digits);
    const expectedLen = vendor ? vendor.length : null;

    if (vendor) {
        setValidateRow(validateVendor, vendor.name, 'good');
    } else {
        setValidateRow(validateVendor, 'Unknown', 'bad');
    }

    let lengthOk = false;
    if (expectedLen) {
        lengthOk = digits.length === expectedLen;
        setValidateRow(
            validateLength,
            digits.length + ' / ' + expectedLen,
            lengthOk ? 'good' : 'bad'
        );
    } else {
        setValidateRow(validateLength, digits.length + ' digits', 'muted');
    }

    let luhnOk = false;
    if (digits.length >= 12) {
        luhnOk = luhnIsValid(digits);
        setValidateRow(validateLuhn, luhnOk ? 'Pass' : 'Fail', luhnOk ? 'good' : 'bad');
    } else {
        setValidateRow(validateLuhn, 'Too short', 'muted');
    }

    if (vendor && lengthOk && luhnOk) {
        validateSummary.className = 'validate-summary is-good';
        validateSummary.textContent = 'Valid ' + vendor.name + ' number';
    } else {
        validateSummary.className = 'validate-summary is-bad';
        const reasons = [];
        if (!vendor) reasons.push('unknown vendor');
        if (vendor && !lengthOk) reasons.push('wrong length');
        if (digits.length >= 12 && !luhnOk) reasons.push('Luhn check failed');
        if (digits.length < 12) reasons.push('not enough digits');
        validateSummary.textContent = 'Invalid — ' + reasons.join(', ');
    }
}

// ── Mode tabs ─────────────────────────────────────────────
function setMode(mode) {
    const isGenerate = mode === 'generate';
    generatePanel.classList.toggle('hidden', !isGenerate);
    validatePanel.classList.toggle('hidden', isGenerate);
    document.querySelectorAll('.mode-tab').forEach(t => {
        const active = t.dataset.mode === mode;
        t.classList.toggle('active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (!isGenerate) {
        resetTilt();
    } else {
        recalibrateOrientation();
    }
}

document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => setMode(tab.dataset.mode));
});

// ── Parallax tilt ─────────────────────────────────────────
const MAX_TILT = 10;

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function applyTilt(rx, ry) {
    cardEl.classList.add('tilting');
    cardEl.style.transform = 'rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)';
}

function resetTilt() {
    cardEl.classList.remove('tilting');
    cardEl.style.transform = '';
}

// ── Mouse parallax (desktop / fine pointer) ───────────────
function onStageMove(e) {
    const rect = cardStage.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;  // 0..1
    const y = (e.clientY - rect.top) / rect.height;  // 0..1
    // Card follows the cursor: nearest edge tilts toward viewer.
    // CSS: +rotateX tilts top forward, +rotateY tilts right edge backward —
    // so both axes need a negative sign to "look at" the cursor.
    const rx = -(y - 0.5) * 2 * MAX_TILT;
    const ry = -(x - 0.5) * 2 * MAX_TILT;
    applyTilt(rx, ry);
}

const hasFinePointer =
    window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

if (hasFinePointer) {
    cardStage.addEventListener('mousemove', onStageMove);
    cardStage.addEventListener('mouseleave', resetTilt);
}

// ── Device orientation tilt (mobile) ──────────────────────
// Beta = front/back tilt (-180..180), gamma = left/right tilt (-90..90).
// 25° of phone movement maps to MAX_TILT degrees of card rotation.
const ORIENT_RANGE = 25;
let orientBaseline = null;
let orientAttached = false;

function onDeviceOrientation(e) {
    if (e.beta == null || e.gamma == null) return;
    // Only tilt while in Generate mode.
    if (generatePanel.classList.contains('hidden')) return;

    if (orientBaseline === null) {
        orientBaseline = { beta: e.beta, gamma: e.gamma };
        return;
    }

    const dBeta = e.beta - orientBaseline.beta;
    const dGamma = e.gamma - orientBaseline.gamma;
    const rx = clamp(-(dBeta / ORIENT_RANGE) * MAX_TILT, -MAX_TILT, MAX_TILT);
    const ry = clamp((dGamma / ORIENT_RANGE) * MAX_TILT, -MAX_TILT, MAX_TILT);
    applyTilt(rx, ry);
}

function attachDeviceOrientation() {
    if (orientAttached) return;
    orientAttached = true;
    window.addEventListener('deviceorientation', onDeviceOrientation, true);
}

function recalibrateOrientation() {
    orientBaseline = null;
    if (orientAttached) resetTilt();
}

function maybeEnableDeviceOrientation() {
    if (!('DeviceOrientationEvent' in window)) return;
    const needsPermission = typeof DeviceOrientationEvent.requestPermission === 'function';
    if (needsPermission) {
        // iOS 13+: requestPermission must be called from a user gesture.
        const trigger = () => {
            DeviceOrientationEvent.requestPermission()
                .then((result) => { if (result === 'granted') attachDeviceOrientation(); })
                .catch(() => {});
        };
        document.addEventListener('touchend', trigger, { once: true, passive: true });
        document.addEventListener('click', trigger, { once: true });
    } else {
        attachDeviceOrientation();
    }
}

if (!hasFinePointer) {
    maybeEnableDeviceOrientation();
}

// Recalibrate when device rotates or app comes back into view.
window.addEventListener('orientationchange', recalibrateOrientation);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') recalibrateOrientation();
});

// ── Wiring ────────────────────────────────────────────────
generateBtn.addEventListener('click', () => {
    cardEl.classList.remove('flipped');
    generate();
    recalibrateOrientation();
});

flipBtn.addEventListener('click', () => {
    cardEl.classList.toggle('flipped');
});

cardEl.addEventListener('click', () => {
    cardEl.classList.toggle('flipped');
});

nameValue.addEventListener('input', () => {
    applyName(nameValue.value);
});

document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
        const field = btn.dataset.field;
        const value = fieldValues[field];
        if (!value) return;
        navigator.clipboard.writeText(value).then(() => {
            btn.classList.add('copied');
            setTimeout(() => btn.classList.remove('copied'), 1500);
        });
    });
});

validateInput.addEventListener('input', updateValidator);

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (validatePanel.classList.contains('hidden') === false) return;
    if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        cardEl.classList.remove('flipped');
        generate();
        recalibrateOrientation();
    } else if (e.key === 'f' || e.key === 'F') {
        cardEl.classList.toggle('flipped');
    }
});

// ── Init ──────────────────────────────────────────────────
renderVendorChips();
generate();
updateValidator();

// Register service worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}
