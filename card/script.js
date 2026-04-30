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
    // Reset classes
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

function render(card) {
    currentCard = card;
    setBrand(card.vendor);

    cardNumberEl.textContent = formatNumber(card.number, card.vendor.groups);
    cardNameEl.textContent = card.name;
    cardExpiryEl.textContent = card.expiry;
    cardCvvEl.textContent = card.cvv;
    cardSignatureEl.textContent = card.name;

    numberValue.textContent = card.number;
    nameValue.textContent = card.name;
    expiryValue.textContent = card.expiry;
    cvvValue.textContent = card.cvv;

    fieldValues.number = card.number;
    fieldValues.name = card.name;
    fieldValues.expiry = card.expiry;
    fieldValues.cvv = card.cvv;
}

function generate() {
    const number = generateNumber(currentVendor);
    if (!luhnIsValid(number)) {
        // Should never happen — guard for safety
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
        `<button class="vendor-chip${i === 0 ? ' active' : ''}" data-vendor="${v.id}">${v.name}</button>`
    ).join('');

    vendorGrid.querySelectorAll('.vendor-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const id = chip.dataset.vendor;
            const v = VENDORS.find(x => x.id === id);
            if (!v) return;
            currentVendor = v;
            vendorGrid.querySelectorAll('.vendor-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            // Un-flip if showing back when switching vendors
            cardEl.classList.remove('flipped');
            generate();
        });
    });
}

// ── Wiring ────────────────────────────────────────────────
generateBtn.addEventListener('click', () => {
    cardEl.classList.remove('flipped');
    generate();
});

flipBtn.addEventListener('click', () => {
    cardEl.classList.toggle('flipped');
});

cardEl.addEventListener('click', () => {
    cardEl.classList.toggle('flipped');
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

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        cardEl.classList.remove('flipped');
        generate();
    } else if (e.key === 'f' || e.key === 'F') {
        cardEl.classList.toggle('flipped');
    }
});

// ── Init ──────────────────────────────────────────────────
renderVendorChips();
generate();

// Register service worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}
