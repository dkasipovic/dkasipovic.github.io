const textInput = document.getElementById('textInput');
const clearBtn = document.getElementById('clearBtn');
const filterGroup = document.getElementById('filterGroup');
const sortGroup = document.getElementById('sortGroup');
const resultsSection = document.getElementById('resultsSection');
const statsText = document.getElementById('statsText');
const copyTsvBtn = document.getElementById('copyTsvBtn');
const resultsBody = document.getElementById('resultsBody');
const emptyState = document.getElementById('emptyState');

const state = {
    filter: 'all',
    sort: 'count-desc',
    debounceTimer: null,
};

function processText(text) {
    const lines = text.split('\n');
    const counts = new Map();
    for (const line of lines) {
        counts.set(line, (counts.get(line) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([line, count]) => ({ line, count }));
}

function applyFilter(entries) {
    if (state.filter === 'duplicates') return entries.filter((e) => e.count > 1);
    if (state.filter === 'unique') return entries.filter((e) => e.count === 1);
    return entries;
}

function applySort(entries) {
    return entries.slice().sort((a, b) => {
        if (state.sort === 'alpha-asc') return a.line.localeCompare(b.line);
        if (state.sort === 'alpha-desc') return b.line.localeCompare(a.line);
        if (state.sort === 'count-asc') return a.count - b.count || a.line.localeCompare(b.line);
        return b.count - a.count || a.line.localeCompare(b.line); // count-desc
    });
}

const copyIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

function render() {
    const text = textInput.value;

    if (!text.trim()) {
        resultsSection.classList.remove('visible');
        emptyState.classList.remove('hidden');
        return;
    }

    const all = processText(text);
    const totalLines = text.split('\n').length;
    const uniqueCount = all.filter((e) => e.count === 1).length;
    const dupCount = all.filter((e) => e.count > 1).length;

    const visible = applySort(applyFilter(all));

    statsText.innerHTML =
        `<strong>${totalLines}</strong> total lines &middot; ` +
        `<strong>${all.length}</strong> unique &middot; ` +
        `<strong>${dupCount}</strong> duplicated`;

    resultsBody.innerHTML = visible.map(({ line, count }) => {
        const isDup = count > 1;
        const displayLine = line === '' ? '<em style="color:var(--text-muted)">empty line</em>' : escapeHtml(line);
        return `<tr class="${isDup ? 'is-duplicate' : ''}">
            <td class="col-line">${displayLine}</td>
            <td class="col-count">${count}</td>
            <td class="col-action">
                <button class="btn-copy-line" data-line="${escapeAttr(line)}" title="Copy line">${copyIcon}</button>
            </td>
        </tr>`;
    }).join('');

    resultsSection.classList.add('visible');
    emptyState.classList.add('hidden');
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function debounceRender() {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(render, 200);
}

async function copyToClipboard(text, btn) {
    try {
        await navigator.clipboard.writeText(text);
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 1500);
    } catch {
        // Clipboard unavailable — silently fail
    }
}

textInput.addEventListener('input', debounceRender);

clearBtn.addEventListener('click', () => {
    textInput.value = '';
    render();
    textInput.focus();
});

filterGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-filter]');
    if (!btn) return;
    state.filter = btn.dataset.filter;
    filterGroup.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    render();
});

sortGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-sort]');
    if (!btn) return;
    state.sort = btn.dataset.sort;
    sortGroup.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    render();
});

resultsBody.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-copy-line');
    if (!btn) return;
    copyToClipboard(btn.dataset.line, btn);
});

copyTsvBtn.addEventListener('click', () => {
    const text = textInput.value;
    if (!text.trim()) return;
    const all = processText(text);
    const visible = applySort(applyFilter(all));
    const tsv = visible.map(({ line, count }) => `${line}\t${count}`).join('\n');
    copyToClipboard(tsv, copyTsvBtn);
    const original = copyTsvBtn.innerHTML;
    copyTsvBtn.textContent = 'Copied!';
    setTimeout(() => { copyTsvBtn.innerHTML = original; }, 1500);
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}
