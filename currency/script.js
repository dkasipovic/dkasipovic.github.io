'use strict';

// ── API ────────────────────────────────────────────────────────────────────
// fawazahmed0 currency API: free, no key, ~170 fiat currencies, CDN-hosted.
// Currency codes are lowercase in all API responses.
const CDN     = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api';
const GEO_API = 'https://nominatim.openstreetmap.org/reverse';
const LS_KEY  = 'currency-prefs';

// Country code (uppercase) → currency code (lowercase)
const COUNTRY_CURRENCY = {
  AT:'eur', AU:'aud', AE:'aed', BA:'bam', BE:'eur', BG:'bgn', BR:'brl',
  CA:'cad', CH:'chf', CN:'cny', CY:'eur', CZ:'czk', DE:'eur', DK:'dkk',
  EE:'eur', ES:'eur', FI:'eur', FR:'eur', GB:'gbp', GR:'eur', HK:'hkd',
  HR:'eur', HU:'huf', ID:'idr', IE:'eur', IL:'ils', IN:'inr', IS:'isk',
  IT:'eur', JP:'jpy', KR:'krw', LT:'eur', LU:'eur', LV:'eur', MT:'eur',
  MX:'mxn', MY:'myr', NL:'eur', NO:'nok', NZ:'nzd', PH:'php', PL:'pln',
  PT:'eur', RO:'ron', RS:'rsd', RU:'rub', SA:'sar', SE:'sek', SG:'sgd',
  SI:'eur', SK:'eur', TH:'thb', TR:'try', UA:'uah', US:'usd', ZA:'zar',
};

// ── State ─────────────────────────────────────────────────────────────────
const pickers = {};         // from, to, histFrom, histTo
let allCurrencies   = {};   // { usd: 'US Dollar', ... } (lowercase keys)
let debounceTimer   = null;
let lastUpdated     = null;
let activePeriod    = 30;
let historyFetched  = false;

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initNavigation();
  await loadCurrencies();       // creates pickers + populates options
  const hasPrefs = loadPreferences();
  if (!hasPrefs) detectLocationCurrency();
  fetchConversion();
  bindConvertEvents();
  bindHistoryEvents();
});

// ── Navigation ────────────────────────────────────────────────────────────
function initNavigation() {
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('[data-tab]').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll(`[data-tab="${tab}"]`).forEach((b) => b.classList.add('active'));
      document.querySelectorAll('.tab-content').forEach((p) => p.classList.remove('active'));
      document.getElementById(`tab-${tab}`).classList.add('active');
      if (tab === 'history' && !historyFetched) fetchHistory();
    });
  });
}

// ── Custom Searchable Picker ───────────────────────────────────────────────
// Returns { getValue, setValue, setOptions }
// getValue() → uppercase code ('USD'), setValue/setOptions use lowercase codes.
function createPicker(hostId, onChange) {
  const host = document.getElementById(hostId);
  let currentCode = '';   // lowercase
  let allOptions  = [];   // [{ code: 'usd', name: 'US Dollar' }, ...]

  // Build DOM
  const wrap   = document.createElement('div');
  wrap.className = 'cpicker';

  const btn = document.createElement('button');
  btn.className = 'cpicker-btn';
  btn.type = 'button';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML =
    `<span class="cpicker-label">—</span>` +
    `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>`;

  const drop = document.createElement('div');
  drop.className = 'cpicker-dropdown';
  drop.hidden = true;

  const search = document.createElement('input');
  search.className = 'cpicker-search';
  search.type = 'text';
  search.placeholder = 'Search currency…';
  search.autocomplete = 'off';
  search.spellcheck = false;

  const list = document.createElement('ul');
  list.className = 'cpicker-list';
  list.setAttribute('role', 'listbox');

  drop.append(search, list);
  wrap.append(btn, drop);
  host.append(wrap);

  // ── Internal helpers ──
  function open() {
    drop.hidden = false;
    wrap.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    search.value = '';
    renderList('');
    search.focus();
    requestAnimationFrame(() => {
      list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    });
  }

  function close() {
    drop.hidden = true;
    wrap.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }

  function select(code) {
    currentCode = code;
    btn.querySelector('.cpicker-label').textContent = code.toUpperCase();
    close();
    onChange(code.toUpperCase());
  }

  function renderList(query) {
    const q = query.toLowerCase().trim();
    const filtered = q
      ? allOptions.filter((o) => o.code.startsWith(q) || o.code.includes(q) || o.name.toLowerCase().includes(q))
      : allOptions;

    if (!filtered.length) {
      list.innerHTML = `<li class="cpicker-empty">No results for "${query}"</li>`;
      return;
    }

    list.innerHTML = filtered
      .map((o) => {
        const sel = o.code === currentCode ? ' aria-selected="true"' : '';
        return `<li data-code="${o.code}" role="option" tabindex="-1"${sel}>` +
          `<span class="cpicker-code">${o.code.toUpperCase()}</span>` +
          `<span class="cpicker-name">${o.name}</span>` +
          `</li>`;
      })
      .join('');
  }

  // ── Events ──
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    drop.hidden ? open() : close();
  });

  search.addEventListener('input', () => renderList(search.value));

  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); btn.focus(); }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      list.querySelector('li[data-code]')?.focus();
    }
  });

  list.addEventListener('keydown', (e) => {
    const items = [...list.querySelectorAll('li[data-code]')];
    const idx = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[idx + 1]?.focus(); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); idx <= 0 ? search.focus() : items[idx - 1]?.focus(); }
    if (e.key === 'Enter')     { items[idx]?.click(); }
    if (e.key === 'Escape')    { close(); btn.focus(); }
  });

  list.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-code]');
    if (li) select(li.dataset.code);
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) close();
  });

  // ── Public API ──
  return {
    getValue() { return currentCode.toUpperCase(); },
    setValue(code) {
      const lc = code.toLowerCase();
      if (allOptions.some((o) => o.code === lc)) {
        currentCode = lc;
        btn.querySelector('.cpicker-label').textContent = lc.toUpperCase();
      }
    },
    setOptions(currencies) {
      // currencies: { usd: 'US Dollar', ... }
      allOptions = Object.entries(currencies)
        .map(([code, name]) => ({ code, name: name || code.toUpperCase() }))
        .sort((a, b) => a.code.localeCompare(b.code));
      // Re-apply current selection after options change
      if (currentCode && !allOptions.some((o) => o.code === currentCode)) {
        currentCode = allOptions[0]?.code || '';
      }
    },
  };
}

// ── Load Currency List ────────────────────────────────────────────────────
async function loadCurrencies() {
  try {
    const res = await fetch(`${CDN}@latest/v1/currencies.json`);
    if (!res.ok) throw new Error();
    allCurrencies = await res.json();

    // Create all four pickers.
    // Converter ↔ history are kept in sync: changing either side mirrors the
    // pair to the other side. setValue() does NOT trigger onChange, so no loops.
    pickers.from = createPicker('from-currency', () => {
      pickers.histFrom.setValue(pickers.from.getValue().toLowerCase());
      savePreferences();
      scheduleConversion();
      if (historyFetched) fetchHistory();
    });
    pickers.to = createPicker('to-currency', () => {
      pickers.histTo.setValue(pickers.to.getValue().toLowerCase());
      savePreferences();
      scheduleConversion();
      if (historyFetched) fetchHistory();
    });
    pickers.histFrom = createPicker('history-from', () => {
      pickers.from.setValue(pickers.histFrom.getValue().toLowerCase());
      savePreferences();
      scheduleConversion();
      fetchHistory();
    });
    pickers.histTo = createPicker('history-to', () => {
      pickers.to.setValue(pickers.histTo.getValue().toLowerCase());
      savePreferences();
      scheduleConversion();
      fetchHistory();
    });

    for (const p of Object.values(pickers)) {
      p.setOptions(allCurrencies);
    }
  } catch {
    showConvertError(true);
  }
}

// ── Preferences ───────────────────────────────────────────────────────────
// Returns true if saved prefs existed (suppress GPS detection), false on first visit.
function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    pickers.from.setValue(saved?.from     || 'usd');
    pickers.to.setValue(saved?.to         || 'eur');
    pickers.histFrom.setValue(saved?.histFrom || 'usd');
    pickers.histTo.setValue(saved?.histTo     || 'eur');
    return !!saved;
  } catch {
    pickers.from.setValue('usd');
    pickers.to.setValue('eur');
    pickers.histFrom.setValue('usd');
    pickers.histTo.setValue('eur');
    return false;
  }
}

function savePreferences() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      from:     pickers.from.getValue(),
      to:       pickers.to.getValue(),
      histFrom: pickers.histFrom.getValue(),
      histTo:   pickers.histTo.getValue(),
    }));
  } catch { /* quota exceeded */ }
}

// ── GPS Detection ─────────────────────────────────────────────────────────
// Only runs on first visit. Silent on any error or denial.
function detectLocationCurrency() {
  if (!navigator.geolocation) return;

  showLocationStatus('Detecting your location…');

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const res = await fetch(
          `${GEO_API}?lat=${latitude}&lon=${longitude}&format=json`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data = await res.json();
        const cc = data.address?.country_code?.toUpperCase();
        const currency = COUNTRY_CURRENCY[cc]; // lowercase, e.g. 'usd'

        if (currency && currency !== pickers.from.getValue().toLowerCase()) {
          pickers.from.setValue(currency);
          pickers.histFrom.setValue(currency);
          savePreferences();
          fetchConversion();
          showLocationStatus(`Set to ${currency.toUpperCase()} based on your location`, 3500);
        } else {
          hideLocationStatus();
        }
      } catch {
        hideLocationStatus();
      }
    },
    () => hideLocationStatus(),
    { timeout: 8000, maximumAge: 0 }
  );
}

function showLocationStatus(msg, autohideMs) {
  const el = document.getElementById('location-status');
  el.textContent = msg;
  el.style.display = 'block';
  if (autohideMs) setTimeout(hideLocationStatus, autohideMs);
}

function hideLocationStatus() {
  document.getElementById('location-status').style.display = 'none';
}

// ── Convert Tab ───────────────────────────────────────────────────────────
function bindConvertEvents() {
  document.getElementById('amount-input').addEventListener('input', scheduleConversion);
  document.getElementById('swap-btn').addEventListener('click', swapCurrencies);
}

function scheduleConversion() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fetchConversion, 300);
}

async function fetchConversion() {
  const from = pickers.from?.getValue().toLowerCase();
  const to   = pickers.to?.getValue().toLowerCase();
  if (!from || !to) return;

  const amount = parseFloat(document.getElementById('amount-input').value);

  if (from === to) {
    document.getElementById('result-value').textContent = isNaN(amount) ? '—' : formatAmount(amount);
    setRateInfo(`<span class="rate-highlight">1 ${from.toUpperCase()} = 1 ${to.toUpperCase()}</span>`);
    return;
  }

  showConvertError(false);
  setRateInfoLoading(true);

  try {
    // GET @latest/v1/currencies/{base}.json
    // Response: { date: '...', {base}: { eur: 0.912, gbp: 0.785, ... } }
    const res = await fetch(`${CDN}@latest/v1/currencies/${from}.json`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    const rate = data[from]?.[to];
    if (rate == null) throw new Error('No rate');

    lastUpdated = new Date();
    const converted = isNaN(amount) ? null : amount * rate;
    document.getElementById('result-value').textContent =
      converted !== null ? formatAmount(converted) : '—';

    setRateInfo(
      `<span class="rate-highlight">1 ${from.toUpperCase()} = ${formatAmount(rate)} ${to.toUpperCase()}</span>` +
      ` · Updated ${formatRelativeTime(lastUpdated)}`
    );
  } catch {
    setRateInfoLoading(false);
    showConvertError(true);
    document.getElementById('result-value').textContent = '—';
  }
}

function swapCurrencies() {
  const fromVal = pickers.from.getValue().toLowerCase();
  const toVal   = pickers.to.getValue().toLowerCase();
  pickers.from.setValue(toVal);
  pickers.to.setValue(fromVal);
  savePreferences();
  fetchConversion();
}

// Adaptive precision: ≥1000 → 2dp, ≥1 → 4dp, <1 → 6dp
function formatAmount(n) {
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1)    return n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return n.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

function setRateInfo(html) {
  const el = document.getElementById('rate-info');
  el.innerHTML = html;
  el.classList.remove('loading');
}

function setRateInfoLoading(on) {
  const el = document.getElementById('rate-info');
  if (on) { el.textContent = 'Loading…'; el.classList.add('loading'); }
  else { el.classList.remove('loading'); }
}

function showConvertError(show) {
  document.getElementById('convert-error').style.display = show ? 'block' : 'none';
}

function formatRelativeTime(date) {
  if (!date) return '';
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 10)   return 'just now';
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ── History Tab ───────────────────────────────────────────────────────────
function bindHistoryEvents() {
  document.querySelectorAll('.period-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activePeriod = parseInt(btn.dataset.period, 10);
      fetchHistory();
    });
  });
  // Note: history picker onChange handlers call fetchHistory() directly.
}

// Build a set of sampled dates spanning the period.
// period ≤7: every day; ≤30: every 3 days; ≤90: every 7 days; else: every 14 days.
function getSampleDates(period) {
  const step  = period <= 7 ? 1 : period <= 30 ? 3 : period <= 90 ? 7 : 14;
  const today = new Date();
  const dates = [];
  for (let i = period; i >= 0; i -= step) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  const todayStr = today.toISOString().slice(0, 10);
  if (!dates.includes(todayStr)) dates.push(todayStr);
  return [...new Set(dates)].sort();
}

async function fetchHistory() {
  const from = pickers.histFrom?.getValue().toLowerCase();
  const to   = pickers.histTo?.getValue().toLowerCase();
  if (!from || !to) return;

  const errEl = document.getElementById('history-error');

  if (from === to) {
    showHistoryLoading(false);
    showHistoryContent(false);
    errEl.textContent = 'Select different currencies to compare.';
    errEl.style.display = 'block';
    return;
  }

  showHistoryLoading(true);
  showHistoryContent(false);
  errEl.style.display = 'none';

  const todayStr = new Date().toISOString().slice(0, 10);
  const dates    = getSampleDates(activePeriod);

  try {
    // Fetch all sampled dates in parallel via fawazahmed0 CDN.
    // @latest is used for today; @YYYY-MM-DD for historical dates.
    const results = await Promise.all(
      dates.map(async (date) => {
        try {
          const tag = date === todayStr ? 'latest' : date;
          const res = await fetch(`${CDN}@${tag}/v1/currencies/${from}.json`);
          if (!res.ok) return null;
          const data = await res.json();
          const rate = data[from]?.[to];
          return rate != null ? { date, rate } : null;
        } catch { return null; }
      })
    );

    const valid = results.filter(Boolean);
    if (!valid.length) throw new Error('No data');

    const datesArr = valid.map((r) => r.date);
    const ratesArr = valid.map((r) => r.rate);

    renderChart({ dates: datesArr, rates: ratesArr, from: from.toUpperCase(), to: to.toUpperCase() });
    renderHistoryTable({ dates: datesArr, rates: ratesArr });

    historyFetched = true;
    showHistoryLoading(false);
    showHistoryContent(true);
  } catch {
    showHistoryLoading(false);
    errEl.textContent = 'Unable to fetch historical data. Check your connection.';
    errEl.style.display = 'block';
  }
}

// ── SVG Chart ─────────────────────────────────────────────────────────────
function renderChart({ dates, rates, from, to }) {
  const svg = document.getElementById('rate-chart');
  const W = 600, H = 200;
  const PAD = { top: 14, right: 16, bottom: 22, left: 58 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top  - PAD.bottom;

  const n       = dates.length;
  const minRate = Math.min(...rates);
  const maxRate = Math.max(...rates);
  const range   = maxRate - minRate || minRate * 0.01 || 1;

  const xOf = (i) => PAD.left + (i / Math.max(n - 1, 1)) * iW;
  const yOf = (r) => PAD.top  + (1 - (r - minRate) / range) * iH;

  const pts   = rates.map((r, i) => `${xOf(i).toFixed(1)},${yOf(r).toFixed(1)}`).join(' ');
  const fillD = [
    `M ${xOf(0).toFixed(1)} ${yOf(rates[0]).toFixed(1)}`,
    ...rates.slice(1).map((r, i) => `L ${xOf(i + 1).toFixed(1)} ${yOf(r).toFixed(1)}`),
    `L ${xOf(n - 1).toFixed(1)} ${(PAD.top + iH).toFixed(1)}`,
    `L ${PAD.left.toFixed(1)} ${(PAD.top + iH).toFixed(1)} Z`,
  ].join(' ');

  const yLabels = [
    { v: maxRate,                 y: PAD.top },
    { v: (minRate + maxRate) / 2, y: PAD.top + iH / 2 },
    { v: minRate,                 y: PAD.top + iH },
  ];

  svg.innerHTML = `
    <defs>
      <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="#8b5cf6" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    ${yLabels.map((l) => `
      <line x1="${PAD.left}" y1="${l.y.toFixed(1)}"
            x2="${(PAD.left + iW).toFixed(1)}" y2="${l.y.toFixed(1)}"
            stroke="#2a2a32" stroke-width="1" stroke-dasharray="4 4"/>
      <text x="${(PAD.left - 6).toFixed(1)}" y="${(l.y + 4).toFixed(1)}"
            text-anchor="end" fill="#606068" font-size="10"
            font-family="ui-monospace,monospace">${l.v.toFixed(4)}</text>
    `).join('')}
    <path d="${fillD}" fill="url(#cg)"/>
    <polyline points="${pts}" fill="none" stroke="#8b5cf6"
              stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <text x="${PAD.left}" y="${H - 4}" text-anchor="start"
          fill="#606068" font-size="10">${fmtDateShort(dates[0])}</text>
    <text x="${(PAD.left + iW).toFixed(1)}" y="${H - 4}" text-anchor="end"
          fill="#606068" font-size="10">${fmtDateShort(dates[n - 1])}</text>
  `;

  document.getElementById('chart-header').innerHTML =
    `<span>${from} → ${to}</span>` +
    `<span>Range: ${minRate.toFixed(4)} – ${maxRate.toFixed(4)}</span>`;
}

function fmtDateShort(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── History Table ─────────────────────────────────────────────────────────
function renderHistoryTable({ dates, rates }) {
  const rows = dates.map((d, i) => ({ date: d, rate: rates[i] })).reverse().slice(0, 20);

  document.getElementById('history-tbody').innerHTML = rows
    .map(({ date, rate }, idx) => {
      const prev   = idx < rows.length - 1 ? rows[idx + 1].rate : null;
      const change = prev !== null ? rate - prev : null;
      const cls    = change === null ? 'change-neutral'
                   : change > 0     ? 'change-positive'
                   : change < 0     ? 'change-negative'
                   :                  'change-neutral';
      const changeStr = change !== null ? (change >= 0 ? '+' : '') + change.toFixed(4) : '—';

      return `<tr>
        <td class="date-cell">${fmtDateDisplay(date)}</td>
        <td class="rate-cell">${rate.toFixed(4)}</td>
        <td class="${cls}">${changeStr}</td>
      </tr>`;
    })
    .join('');
}

function fmtDateDisplay(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

// ── UI Helpers ────────────────────────────────────────────────────────────
function showHistoryLoading(show) {
  document.getElementById('history-loading').style.display = show ? 'flex' : 'none';
}

function showHistoryContent(show) {
  document.getElementById('chart-container').style.display         = show ? 'block' : 'none';
  document.getElementById('history-table-container').style.display = show ? 'block' : 'none';
}
