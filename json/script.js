const input = document.getElementById('input');
const output = document.getElementById('output');
const placeholder = document.getElementById('placeholder');
const inputMeta = document.getElementById('inputMeta');
const outputMeta = document.getElementById('outputMeta');
const statusChip = document.getElementById('statusChip');
const errorBar = document.getElementById('errorBar');
const errorMsg = document.getElementById('errorMsg');
const errorSnippet = document.getElementById('errorSnippet');
const errorJump = document.getElementById('errorJump');
const indentGroup = document.getElementById('indentGroup');
const sortBtn = document.getElementById('sortBtn');
const wrapBtn = document.getElementById('wrapBtn');
const pasteBtn = document.getElementById('pasteBtn');
const sampleBtn = document.getElementById('sampleBtn');
const clearBtn = document.getElementById('clearBtn');
const copyBtn = document.getElementById('copyBtn');
const copyLabel = document.getElementById('copyLabel');
const downloadBtn = document.getElementById('downloadBtn');
const split = document.getElementById('split');
const divider = document.getElementById('divider');
const paneSwitch = document.getElementById('paneSwitch');

const SETTINGS_KEY = 'json-formatter-settings';
// Above this input size the output is rendered as plain text. Painting one span
// per token stays under ~250ms up to roughly this point; past it the browser
// spends seconds on layout, which is a bad trade for syntax colours.
const HIGHLIGHT_LIMIT = 100000;

const state = {
    indent: '2',
    sort: false,
    wrap: false,
    splitLeft: null,
    formatted: '',
    errorPos: null,
    debounce: null,
};

/* ── Parser ──
   A hand-rolled parser is used instead of JSON.parse so that number literals
   survive verbatim: JSON.parse would turn an ID like 12345678901234567890 into
   12345678901234567000, quietly corrupting whatever gets copied out. */

const WHITESPACE = { ' ': true, '\t': true, '\n': true, '\r': true };
const SIMPLE_ESCAPES = { '"': true, '\\': true, '/': true, b: true, f: true, n: true, r: true, t: true };
const NUMBER_RE = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const MAX_DEPTH = 500;

function parseJson(text) {
    let i = 0;
    let depth = 0;

    function fail(message, pos) {
        const err = new Error(message);
        err.pos = pos === undefined ? i : pos;
        throw err;
    }

    function skipWhitespace() {
        while (i < text.length && WHITESPACE[text[i]]) i++;
    }

    function readString() {
        const start = i;
        i++; // opening quote
        while (i < text.length) {
            const ch = text[i];
            if (ch === '"') {
                i++;
                return text.slice(start, i);
            }
            if (ch === '\\') {
                const esc = text[i + 1];
                if (esc === 'u') {
                    if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) {
                        fail('Invalid \\u escape sequence', i);
                    }
                    i += 6;
                    continue;
                }
                if (!SIMPLE_ESCAPES[esc]) fail(`Invalid escape sequence \\${esc || ''}`, i);
                i += 2;
                continue;
            }
            if (ch < ' ') fail('Unescaped control character in string', i);
            i++;
        }
        fail('Unterminated string', start);
    }

    function readObject() {
        if (++depth > MAX_DEPTH) fail('Structure is nested too deeply to format');
        i++; // {
        const entries = [];
        skipWhitespace();
        if (text[i] === '}') {
            i++;
            depth--;
            return { kind: 'object', entries };
        }
        for (;;) {
            skipWhitespace();
            if (text[i] !== '"') fail('Expected a quoted property name');
            const key = readString();
            skipWhitespace();
            if (text[i] !== ':') fail('Expected ":" after property name');
            i++;
            entries.push({ key, value: readValue() });
            skipWhitespace();
            if (text[i] === ',') {
                i++;
                continue;
            }
            if (text[i] === '}') {
                i++;
                depth--;
                return { kind: 'object', entries };
            }
            fail('Expected "," or "}" after property value');
        }
    }

    function readArray() {
        if (++depth > MAX_DEPTH) fail('Structure is nested too deeply to format');
        i++; // [
        const items = [];
        skipWhitespace();
        if (text[i] === ']') {
            i++;
            depth--;
            return { kind: 'array', items };
        }
        for (;;) {
            items.push(readValue());
            skipWhitespace();
            if (text[i] === ',') {
                i++;
                continue;
            }
            if (text[i] === ']') {
                i++;
                depth--;
                return { kind: 'array', items };
            }
            fail('Expected "," or "]" after array item');
        }
    }

    function readValue() {
        skipWhitespace();
        if (i >= text.length) fail('Unexpected end of input');
        const ch = text[i];
        if (ch === '{') return readObject();
        if (ch === '[') return readArray();
        if (ch === '"') return { kind: 'string', raw: readString() };
        if (ch === '-' || (ch >= '0' && ch <= '9')) {
            NUMBER_RE.lastIndex = i;
            const match = NUMBER_RE.exec(text);
            if (!match) fail('Invalid number');
            i += match[0].length;
            return { kind: 'number', raw: match[0] };
        }
        for (const word of ['true', 'false', 'null']) {
            if (text.startsWith(word, i)) {
                i += word.length;
                return { kind: 'keyword', raw: word };
            }
        }
        fail(`Unexpected character ${JSON.stringify(ch)}`);
    }

    const root = readValue();
    skipWhitespace();
    if (i < text.length) fail('Unexpected content after the JSON value');
    return root;
}

/* ── Rendering ── */

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function decodeKey(raw) {
    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
}

function sortEntries(entries) {
    return entries
        .map((entry) => ({ entry, key: decodeKey(entry.key) }))
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
        .map((wrapped) => wrapped.entry);
}

function renderNode(root, { indent, sort, highlight }) {
    const parts = [];
    const markup = highlight ? [] : null;
    const newline = indent ? '\n' : '';
    const separator = indent ? ': ' : ':';
    let keyCount = 0;

    function put(str, cls) {
        if (!str) return;
        parts.push(str);
        if (markup) {
            markup.push(cls ? `<span class="${cls}">${escapeHtml(str)}</span>` : escapeHtml(str));
        }
    }

    function pad(level) {
        return indent ? indent.repeat(level) : '';
    }

    // Punctuation and indentation are deliberately left unwrapped: the output
    // element paints them muted by default, which halves the number of spans on
    // large documents and keeps rendering responsive.
    function walk(node, level) {
        if (node.kind === 'object') {
            if (!node.entries.length) {
                put('{}');
                return;
            }
            const entries = sort ? sortEntries(node.entries) : node.entries;
            put('{');
            entries.forEach((entry, index) => {
                keyCount++;
                put(newline + pad(level + 1));
                put(entry.key, 'tok-key');
                put(separator);
                walk(entry.value, level + 1);
                if (index < entries.length - 1) put(',');
            });
            put(newline + pad(level));
            put('}');
            return;
        }

        if (node.kind === 'array') {
            if (!node.items.length) {
                put('[]');
                return;
            }
            put('[');
            node.items.forEach((item, index) => {
                put(newline + pad(level + 1));
                walk(item, level + 1);
                if (index < node.items.length - 1) put(',');
            });
            put(newline + pad(level));
            put(']');
            return;
        }

        put(node.raw, `tok-${node.kind}`);
    }

    walk(root, 0);
    return {
        text: parts.join(''),
        html: markup ? markup.join('') : null,
        keyCount,
    };
}

/* ── Helpers ── */

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function byteLength(str) {
    return new TextEncoder().encode(str).length;
}

function countLines(str) {
    let lines = 1;
    for (let i = 0; i < str.length; i++) {
        if (str[i] === '\n') lines++;
    }
    return lines;
}

function locate(text, pos) {
    const before = text.slice(0, pos);
    const lastNewline = before.lastIndexOf('\n');
    return { line: countLines(before), column: pos - lastNewline };
}

function buildSnippet(text, pos) {
    const start = text.lastIndexOf('\n', pos - 1) + 1;
    let end = text.indexOf('\n', pos);
    if (end === -1) end = text.length;

    let line = text.slice(start, end).replace(/\t/g, ' ');
    let caretOffset = pos - start;

    // Keep the offending character in view for very long lines.
    if (caretOffset > 60) {
        const trimmed = caretOffset - 40;
        line = `…${line.slice(trimmed)}`;
        caretOffset = caretOffset - trimmed + 1;
    }
    if (line.length > 120) line = `${line.slice(0, 120)}…`;

    return `${line}\n${' '.repeat(Math.max(caretOffset, 0))}^`;
}

function getIndentString() {
    if (state.indent === 'minify') return '';
    if (state.indent === 'tab') return '\t';
    return ' '.repeat(Number(state.indent));
}

/* ── Main render ── */

function update() {
    const text = input.value;
    const trimmed = text.trim();

    inputMeta.textContent = trimmed
        ? `${countLines(text).toLocaleString()} lines · ${formatBytes(byteLength(text))}`
        : '';

    if (!trimmed) {
        setOutput(null);
        hideError();
        return;
    }

    let root;
    try {
        root = parseJson(text);
    } catch (err) {
        showError(err, text);
        return;
    }

    hideError();

    const result = renderNode(root, {
        indent: getIndentString(),
        sort: state.sort,
        highlight: text.length <= HIGHLIGHT_LIMIT,
    });

    setOutput(result);
}

function setOutput(result) {
    state.formatted = result ? result.text : '';

    if (!result) {
        output.textContent = '';
        output.classList.remove('stale', 'highlighted');
        statusChip.classList.remove('stale');
        placeholder.hidden = false;
        outputMeta.textContent = '';
        statusChip.hidden = true;
        copyBtn.disabled = true;
        downloadBtn.disabled = true;
        return;
    }

    if (result.html === null) {
        output.textContent = result.text;
        output.classList.remove('highlighted');
    } else {
        output.innerHTML = result.html;
        output.classList.add('highlighted');
    }

    output.classList.remove('stale');
    placeholder.hidden = true;
    statusChip.hidden = false;
    statusChip.classList.remove('stale');
    statusChip.textContent = 'Valid';
    outputMeta.textContent =
        `${countLines(result.text).toLocaleString()} lines · ` +
        `${result.keyCount.toLocaleString()} keys · ` +
        `${formatBytes(byteLength(result.text))}` +
        (result.html === null ? ' · colours off (large document)' : '');
    copyBtn.disabled = false;
    downloadBtn.disabled = false;
}

function showError(err, text) {
    const pos = Math.min(err.pos ?? 0, Math.max(text.length - 1, 0));
    const { line, column } = locate(text, pos);
    state.errorPos = err.pos ?? 0;

    errorMsg.textContent = `${err.message} — line ${line}, column ${column}`;
    errorSnippet.textContent = buildSnippet(text, pos);
    errorBar.hidden = false;

    // The last good output stays on screen, dimmed, so it can still be copied.
    if (state.formatted) {
        output.classList.add('stale');
        statusChip.hidden = false;
        statusChip.classList.add('stale');
        statusChip.textContent = 'Outdated';
    }
}

function hideError() {
    errorBar.hidden = true;
    state.errorPos = null;
}

/* ── Clipboard ── */

async function writeClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // Fall back for browsers that block the async clipboard API.
        const scratch = document.createElement('textarea');
        scratch.value = text;
        scratch.setAttribute('readonly', '');
        scratch.style.position = 'fixed';
        scratch.style.opacity = '0';
        document.body.appendChild(scratch);
        scratch.select();
        let ok = false;
        try {
            ok = document.execCommand('copy');
        } catch {
            ok = false;
        }
        document.body.removeChild(scratch);
        return ok;
    }
}

/* ── Settings ── */

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        if (['2', '4', 'tab', 'minify'].includes(saved.indent)) state.indent = saved.indent;
        state.sort = Boolean(saved.sort);
        state.wrap = Boolean(saved.wrap);
        if (typeof saved.splitLeft === 'number') state.splitLeft = saved.splitLeft;
    } catch {
        // Ignore unreadable settings and start from the defaults.
    }
}

function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({
            indent: state.indent,
            sort: state.sort,
            wrap: state.wrap,
            splitLeft: state.splitLeft,
        }));
    } catch {
        // Storage may be unavailable in private mode — settings just won't stick.
    }
}

function applySettings() {
    indentGroup.querySelectorAll('button').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.indent === state.indent);
    });
    sortBtn.setAttribute('aria-pressed', String(state.sort));
    wrapBtn.setAttribute('aria-pressed', String(state.wrap));
    output.classList.toggle('wrap', state.wrap);
    if (state.splitLeft) {
        split.style.setProperty('--split-left', `${state.splitLeft}%`);
    }
}

/* ── Events ── */

input.addEventListener('input', () => {
    clearTimeout(state.debounce);
    state.debounce = setTimeout(update, 150);
});

indentGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-indent]');
    if (!btn) return;
    state.indent = btn.dataset.indent;
    applySettings();
    saveSettings();
    update();
});

sortBtn.addEventListener('click', () => {
    state.sort = !state.sort;
    applySettings();
    saveSettings();
    update();
});

wrapBtn.addEventListener('click', () => {
    state.wrap = !state.wrap;
    applySettings();
    saveSettings();
});

clearBtn.addEventListener('click', () => {
    input.value = '';
    update();
    showPane('input');
    input.focus();
});

sampleBtn.addEventListener('click', () => {
    input.value = JSON.stringify({
        id: 'ord_8f2c1a',
        created: '2026-07-30T09:41:12Z',
        customer: { name: 'Ada Lovelace', email: 'ada@example.com', vip: true },
        items: [
            { sku: 'KB-91', qty: 1, price: 129.99 },
            { sku: 'MS-04', qty: 2, price: 24.5 },
        ],
        total: 178.99,
        note: null,
    });
    update();
    showPane('output');
});

pasteBtn.addEventListener('click', async () => {
    try {
        const text = await navigator.clipboard.readText();
        if (!text) return;
        input.value = text;
        update();
        showPane('output');
    } catch {
        input.focus();
    }
});

copyBtn.addEventListener('click', async () => {
    if (!state.formatted) return;
    const ok = await writeClipboard(state.formatted);
    copyLabel.textContent = ok ? 'Copied!' : 'Press ⌘C';
    copyBtn.classList.toggle('copied', ok);
    setTimeout(() => {
        copyLabel.textContent = 'Copy';
        copyBtn.classList.remove('copied');
    }, 1600);
});

downloadBtn.addEventListener('click', () => {
    if (!state.formatted) return;
    const blob = new Blob([state.formatted], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'formatted.json';
    link.click();
    URL.revokeObjectURL(url);
});

errorJump.addEventListener('click', () => {
    if (state.errorPos === null) return;
    showPane('input');
    input.focus();
    input.setSelectionRange(state.errorPos, state.errorPos);
    // Scroll the caret into view by nudging the textarea's own scroll position.
    const { line } = locate(input.value, state.errorPos);
    const lineHeight = parseFloat(getComputedStyle(input).lineHeight) || 20;
    input.scrollTop = Math.max((line - 3) * lineHeight, 0);
});

function showPane(pane) {
    split.dataset.active = pane;
    paneSwitch.querySelectorAll('button').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.pane === pane);
    });
}

paneSwitch.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-pane]');
    if (btn) showPane(btn.dataset.pane);
});

/* ── Split divider ── */

divider.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    divider.setPointerCapture(e.pointerId);
    divider.classList.add('dragging');
    split.classList.add('dragging');
});

divider.addEventListener('pointermove', (e) => {
    if (!divider.hasPointerCapture(e.pointerId)) return;
    const rect = split.getBoundingClientRect();
    const percent = ((e.clientX - rect.left) / rect.width) * 100;
    state.splitLeft = Math.min(Math.max(percent, 20), 80);
    split.style.setProperty('--split-left', `${state.splitLeft}%`);
});

divider.addEventListener('pointerup', (e) => {
    divider.releasePointerCapture(e.pointerId);
    divider.classList.remove('dragging');
    split.classList.remove('dragging');
    saveSettings();
});

divider.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowLeft' ? -2 : e.key === 'ArrowRight' ? 2 : 0;
    if (!step) return;
    e.preventDefault();
    const current = state.splitLeft || 50;
    state.splitLeft = Math.min(Math.max(current + step, 20), 80);
    split.style.setProperty('--split-left', `${state.splitLeft}%`);
    saveSettings();
});

/* ── Init ── */

if (navigator.clipboard && navigator.clipboard.readText) {
    pasteBtn.hidden = false;
}

loadSettings();
applySettings();
update();

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}
