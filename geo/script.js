(function () {
    'use strict';

    var STORAGE_KEY = 'geo-settings';
    var DEFAULTS = { continent: 'europe', mode: 'learn' };

    // ── State ──
    var data = null;
    var countriesByCode = {};
    var countriesByContinent = {};
    var svgCache = {};
    var settings = { continent: DEFAULTS.continent, mode: DEFAULTS.mode };
    var selectedCode = null;

    // ── DOM ──
    var countryName = document.getElementById('countryName');
    var capitalName = document.getElementById('capitalName');
    var capitalCover = document.getElementById('capitalCover');
    var mapHost = document.getElementById('mapHost');
    var randomBtn = document.getElementById('randomBtn');
    var settingsBtn = document.getElementById('settingsBtn');
    var settingsOverlay = document.getElementById('settingsOverlay');
    var settingsClose = document.getElementById('settingsClose');
    var continentGrid = document.getElementById('continentGrid');
    var modeToggle = document.getElementById('modeToggle');

    // ── Settings ──

    function loadSettings() {
        try {
            var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (saved && typeof saved === 'object') {
                if (typeof saved.continent === 'string') settings.continent = saved.continent;
                if (saved.mode === 'learn' || saved.mode === 'game') settings.mode = saved.mode;
            }
        } catch (e) { /* ignore */ }
    }

    function saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (e) { /* ignore */ }
    }

    // ── Display ──

    function setIdle() {
        selectedCode = null;
        countryName.textContent = 'Додирни државу на карти';
        countryName.classList.add('placeholder');
        countryName.classList.remove('active');
        capitalName.textContent = '—';
        capitalName.classList.add('placeholder');
        capitalCover.hidden = true;
    }

    function applyReveal() {
        if (!selectedCode) return;
        var country = countriesByCode[selectedCode];
        capitalName.textContent = country.capital;
        capitalName.classList.remove('placeholder');
        capitalCover.hidden = settings.mode !== 'game';
    }

    function select(code) {
        var country = countriesByCode[code];
        if (!country) return;

        var prev = mapHost.querySelectorAll('.selected');
        for (var i = 0; i < prev.length; i++) prev[i].classList.remove('selected');
        var nodes = mapHost.querySelectorAll('.country[data-code="' + code + '"], .dot[data-code="' + code + '"]');
        for (var j = 0; j < nodes.length; j++) nodes[j].classList.add('selected');

        selectedCode = code;
        countryName.textContent = country.name;
        countryName.classList.remove('placeholder');
        countryName.classList.add('active');
        applyReveal();
    }

    // ── Map ──

    function loadContinent(continent, done) {
        var render = function (svgText) {
            mapHost.innerHTML = svgText;
            setIdle();
            if (done) done();
        };
        if (svgCache[continent]) {
            render(svgCache[continent]);
            return;
        }
        fetch('./maps/' + continent + '.svg')
            .then(function (r) { return r.text(); })
            .then(function (text) {
                svgCache[continent] = text;
                render(text);
            })
            .catch(function () {
                mapHost.innerHTML = '';
                countryName.textContent = 'Грешка при учитавању карте';
            });
    }

    mapHost.addEventListener('click', function (e) {
        var target = e.target.closest ? e.target.closest('[data-code]') : null;
        if (!target) return;
        var code = target.getAttribute('data-code');
        if (code === selectedCode) return;
        select(code);
    });

    // ── Game mode reveal ──

    capitalCover.addEventListener('click', function () {
        capitalCover.hidden = true;
    });

    // ── Random ──

    randomBtn.addEventListener('click', function () {
        var pool = countriesByContinent[settings.continent] || [];
        if (pool.length === 0) return;
        var candidates = pool.filter(function (c) { return c.code !== selectedCode; });
        if (candidates.length === 0) candidates = pool;
        var pick = candidates[Math.floor(Math.random() * candidates.length)];
        select(pick.code);
    });

    // ── Settings UI ──

    function syncSettingsUI() {
        var buttons = continentGrid.querySelectorAll('button');
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].classList.toggle('active', buttons[i].getAttribute('data-continent') === settings.continent);
        }
        var modes = modeToggle.querySelectorAll('button');
        for (var j = 0; j < modes.length; j++) {
            modes[j].classList.toggle('active', modes[j].getAttribute('data-mode') === settings.mode);
        }
    }

    function buildContinentGrid() {
        var keys = Object.keys(data.continents);
        for (var i = 0; i < keys.length; i++) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.setAttribute('data-continent', keys[i]);
            btn.textContent = data.continents[keys[i]].name;
            continentGrid.appendChild(btn);
        }
    }

    continentGrid.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('button[data-continent]') : null;
        if (!btn) return;
        var continent = btn.getAttribute('data-continent');
        if (continent === settings.continent) return;
        settings.continent = continent;
        saveSettings();
        syncSettingsUI();
        loadContinent(continent);
        closeSettings();
    });

    modeToggle.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('button[data-mode]') : null;
        if (!btn) return;
        var mode = btn.getAttribute('data-mode');
        if (mode === settings.mode) return;
        settings.mode = mode;
        saveSettings();
        syncSettingsUI();
        // Re-apply reveal rules to the current selection:
        // switching to game re-obscures, switching to learn reveals.
        applyReveal();
    });

    function openSettings() {
        settingsOverlay.hidden = false;
    }

    function closeSettings() {
        settingsOverlay.hidden = true;
    }

    settingsBtn.addEventListener('click', openSettings);
    settingsClose.addEventListener('click', closeSettings);
    settingsOverlay.addEventListener('click', function (e) {
        if (e.target === settingsOverlay) closeSettings();
    });

    // ── Init ──

    loadSettings();

    fetch('./data.json')
        .then(function (r) { return r.json(); })
        .then(function (json) {
            data = json;
            for (var i = 0; i < data.countries.length; i++) {
                var c = data.countries[i];
                countriesByCode[c.code] = c;
                (countriesByContinent[c.continent] = countriesByContinent[c.continent] || []).push(c);
            }
            if (!data.continents[settings.continent]) settings.continent = DEFAULTS.continent;
            buildContinentGrid();
            syncSettingsUI();
            loadContinent(settings.continent);
        })
        .catch(function () {
            countryName.textContent = 'Грешка при учитавању података';
        });

    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(function () {});
    }
})();
