const RDAP_BOOTSTRAP = 'https://data.iana.org/rdap/dns.json';
const RDAP_FALLBACK = 'https://rdap.org/domain/';
const WHODAT_API = 'https://who-dat.as93.net/';

let bootstrapData = null;
let currentSource = 'rdap';
let history = [];

// Load history from localStorage
try {
  history = JSON.parse(localStorage.getItem('whois_history') || '[]');
} catch(e) { history = []; }

// DOM
const form = document.getElementById('searchForm');
const input = document.getElementById('domainInput');
const btn = document.getElementById('searchBtn');
const loader = document.getElementById('loader');
const loaderDomain = document.getElementById('loaderDomain');
const resultsEl = document.getElementById('results');
const errorMsg = document.getElementById('errorMsg');
const errorText = document.getElementById('errorText');
const historySection = document.getElementById('historySection');
const historyList = document.getElementById('historyList');

// Source chips
document.querySelectorAll('.source-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.source-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentSource = chip.dataset.source;
  });
});

// Sanitize domain
function cleanDomain(raw) {
  let d = raw.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '');
  d = d.replace(/\/.*$/, '');
  d = d.replace(/^www\./, '');
  return d;
}

// Validate domain
function isValidDomain(d) {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d);
}

// Bootstrap RDAP servers
async function getBootstrap() {
  if (bootstrapData) return bootstrapData;
  try {
    const res = await fetch(RDAP_BOOTSTRAP);
    const data = await res.json();
    bootstrapData = data;
    return data;
  } catch(e) {
    return null;
  }
}

function findRdapServer(domain, bootstrap) {
  if (!bootstrap || !bootstrap.services) return null;
  const parts = domain.split('.');
  // Try from most specific to least (e.g. co.uk then uk)
  for (let i = 1; i < parts.length; i++) {
    const tld = parts.slice(i).join('.');
    for (const [tlds, servers] of bootstrap.services) {
      if (tlds.includes(tld)) return servers[0];
    }
  }
  return null;
}

// Query RDAP
async function queryRDAP(domain) {
  const bootstrap = await getBootstrap();
  let url;
  const server = findRdapServer(domain, bootstrap);
  if (server) {
    url = server + (server.endsWith('/') ? '' : '/') + 'domain/' + domain;
  } else {
    url = RDAP_FALLBACK + domain;
  }

  const res = await fetch(url, {
    headers: { 'Accept': 'application/rdap+json, application/json' },
    redirect: 'follow'
  });

  if (res.status === 404) {
    return { _notfound: true, _domain: domain };
  }

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

// Query who-dat
async function queryWhoDat(domain) {
  const res = await fetch(WHODAT_API + domain);
  if (res.status === 404) return { _notfound: true, _domain: domain };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

// Format date
function fmtDate(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch(e) { return dateStr; }
}

// Days until expiry
function daysUntil(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return null;
    const now = new Date();
    return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
  } catch(e) { return null; }
}

// Extract RDAP fields
function parseRDAP(data) {
  const r = { raw: data };
  r.domain = data.ldhName || data.name || data.handle || '';

  // Events
  if (data.events) {
    for (const ev of data.events) {
      if (ev.eventAction === 'registration') r.created = ev.eventDate;
      if (ev.eventAction === 'last changed' || ev.eventAction === 'last update of RDAP database') r.updated = ev.eventDate;
      if (ev.eventAction === 'expiration') r.expires = ev.eventDate;
    }
  }

  // Status
  r.status = data.status || [];

  // Nameservers
  r.nameservers = [];
  if (data.nameservers) {
    r.nameservers = data.nameservers.map(ns => ns.ldhName || ns.objectClassName || '').filter(Boolean);
  }

  // Registrar - find entity with 'registrar' role
  r.registrar = null;
  r.registrarUrl = null;
  if (data.entities) {
    for (const ent of data.entities) {
      if (ent.roles && ent.roles.includes('registrar')) {
        r.registrar = ent.vcardArray?.[1]?.find(v => v[0] === 'fn')?.[3]
          || ent.handle
          || ent.publicIds?.[0]?.identifier
          || null;
        // Try to get URL
        if (ent.links) {
          const link = ent.links.find(l => l.rel === 'self' || l.type);
          if (link) r.registrarUrl = link.href;
        }
        // Get abuse contact
        if (ent.entities) {
          for (const sub of ent.entities) {
            if (sub.roles && sub.roles.includes('abuse')) {
              const vcard = sub.vcardArray?.[1];
              if (vcard) {
                const email = vcard.find(v => v[0] === 'email');
                const phone = vcard.find(v => v[0] === 'tel');
                if (email) r.abuseEmail = email[3];
                if (phone) r.abusePhone = phone[3];
              }
            }
          }
        }
        break;
      }
    }
  }

  // DNSSEC
  r.dnssec = data.secureDNS?.delegationSigned ? 'Signed' : 'Unsigned';

  return r;
}

// Extract who-dat fields
function parseWhoDat(data) {
  const r = { raw: data };
  const w = data.domain || data;
  r.domain = w.domain_name || w.name || w.domain || '';

  r.created = w.creation_date || w.created || w.create_date || null;
  r.updated = w.updated_date || w.updated || w.update_date || null;
  r.expires = w.expiration_date || w.expiry_date || w.expire_date || null;

  r.status = [];
  if (w.status) {
    r.status = Array.isArray(w.status) ? w.status : [w.status];
  }

  r.nameservers = [];
  if (w.name_servers) {
    r.nameservers = Array.isArray(w.name_servers) ? w.name_servers : [w.name_servers];
  } else if (w.nameservers) {
    r.nameservers = Array.isArray(w.nameservers) ? w.nameservers : [w.nameservers];
  }

  r.registrar = w.registrar?.name || w.registrar || null;
  r.dnssec = w.dnssec || null;
  r.abuseEmail = w.registrar?.abuse_contact_email || null;
  r.abusePhone = w.registrar?.abuse_contact_phone || null;

  return r;
}

// Render results
function renderResults(parsed, source) {
  let html = '';

  // Header
  const isRegistered = !parsed.raw._notfound;
  html += `<div class="result-header">`;
  html += `<span class="result-domain">${escHtml(parsed.domain || '')}</span>`;
  html += `<span class="result-source">${source}</span>`;
  if (isRegistered) {
    html += `<span class="result-status status-registered">Registered</span>`;
  } else {
    html += `<span class="result-status status-available">Possibly Available</span>`;
  }
  html += `</div>`;

  if (!isRegistered) {
    resultsEl.innerHTML = html;
    resultsEl.classList.add('active');
    return;
  }

  // Dates card
  const expDays = daysUntil(parsed.expires);
  let expClass = 'accent';
  if (expDays !== null) {
    if (expDays < 30) expClass = 'error';
    else if (expDays < 90) expClass = 'warn';
  }

  html += `<div class="card"><div class="card-title">Registration</div><div class="card-body">`;
  if (parsed.created) html += field('Created', fmtDate(parsed.created));
  if (parsed.updated) html += field('Updated', fmtDate(parsed.updated));
  if (parsed.expires) {
    const expStr = fmtDate(parsed.expires) + (expDays !== null ? ` (${expDays}d)` : '');
    html += field('Expires', expStr, expClass);
  }
  html += `</div></div>`;

  // Registrar card
  if (parsed.registrar) {
    html += `<div class="card"><div class="card-title">Registrar</div><div class="card-body">`;
    html += field('Name', parsed.registrar);
    if (parsed.abuseEmail) html += field('Abuse Email', parsed.abuseEmail);
    if (parsed.abusePhone) html += field('Abuse Phone', parsed.abusePhone);
    if (parsed.dnssec) html += field('DNSSEC', parsed.dnssec);
    html += `</div></div>`;
  }

  // Nameservers
  if (parsed.nameservers.length > 0) {
    html += `<div class="card"><div class="card-title">Nameservers</div><div class="ns-list">`;
    for (const ns of parsed.nameservers) {
      html += `<div class="ns-item">${escHtml(ns.toLowerCase())}</div>`;
    }
    html += `</div></div>`;
  }

  // Status
  if (parsed.status.length > 0) {
    html += `<div class="card"><div class="card-title">Status</div><div class="status-tags">`;
    for (const s of parsed.status) {
      // Clean up RDAP status URLs
      const clean = s.replace(/\s*https?:\/\/.*$/, '');
      html += `<span class="status-tag">${escHtml(clean)}</span>`;
    }
    html += `</div></div>`;
  }

  // Raw JSON toggle
  html += `<button class="raw-toggle" onclick="toggleRaw()">Show raw JSON</button>`;
  html += `<div class="raw-json" id="rawJson"><pre>${escHtml(JSON.stringify(parsed.raw, null, 2))}</pre></div>`;

  resultsEl.innerHTML = html;
  resultsEl.classList.add('active');
}

function field(label, value, cls) {
  const c = cls ? ` ${cls}` : '';
  return `<div class="field"><span class="field-label">${escHtml(label)}</span><span class="field-value${c}">${escHtml(value || '—')}</span></div>`;
}

function escHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function toggleRaw() {
  document.getElementById('rawJson')?.classList.toggle('active');
}

// Show/hide states
function showLoader(domain) {
  loader.classList.add('active');
  loaderDomain.textContent = ' ' + domain;
  resultsEl.classList.remove('active');
  errorMsg.classList.remove('active');
}

function hideLoader() {
  loader.classList.remove('active');
}

function showError(msg) {
  errorText.textContent = msg;
  errorMsg.classList.add('active');
  resultsEl.classList.remove('active');
}

// History
function addToHistory(domain) {
  history = history.filter(d => d !== domain);
  history.unshift(domain);
  history = history.slice(0, 20);
  try { localStorage.setItem('whois_history', JSON.stringify(history)); } catch(e) {}
  renderHistory();
}

function renderHistory() {
  if (history.length === 0) {
    historySection.style.display = 'none';
    return;
  }
  historySection.style.display = 'block';
  historyList.innerHTML = history.map(d =>
    `<button class="history-item" data-domain="${escHtml(d)}">${escHtml(d)}</button>`
  ).join('');

  historyList.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => {
      input.value = el.dataset.domain;
      doLookup(el.dataset.domain);
    });
  });
}

// Main lookup
async function doLookup(domain) {
  domain = cleanDomain(domain);
  if (!domain) return;

  if (!isValidDomain(domain)) {
    showError('Invalid domain name. Try something like example.com');
    return;
  }

  showLoader(domain);
  btn.disabled = true;

  try {
    let data, parsed;
    if (currentSource === 'rdap') {
      data = await queryRDAP(domain);
      if (data._notfound) {
        parsed = { domain, raw: { _notfound: true }, status: [], nameservers: [] };
      } else {
        parsed = parseRDAP(data);
      }
    } else {
      data = await queryWhoDat(domain);
      if (data._notfound) {
        parsed = { domain, raw: { _notfound: true }, status: [], nameservers: [] };
      } else {
        parsed = parseWhoDat(data);
      }
    }

    if (!parsed.domain) parsed.domain = domain;
    renderResults(parsed, currentSource.toUpperCase());
    addToHistory(domain);
  } catch (err) {
    console.error(err);
    let msg = `Lookup failed: ${err.message}`;
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      msg = 'Network error — CORS may be blocked for this TLD. Try the WHO-DAT source instead.';
    }
    showError(msg);
  } finally {
    hideLoader();
    btn.disabled = false;
  }
}

// Form submit
form.addEventListener('submit', (e) => {
  e.preventDefault();
  doLookup(input.value);
});

// Init
renderHistory();

// Pre-fetch bootstrap
getBootstrap();

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
