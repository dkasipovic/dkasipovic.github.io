(function () {
    'use strict';

    var STORAGE_KEY = 'geo-settings';
    var DEFAULTS = { continent: 'europe', mode: 'learn' };
    var MAX_ZOOM = 60;
    var TAP_SLOP_PX = 8;
    var DOT_SCREEN_R = 5;   // px — visible microstate marker
    var TAP_SCREEN_R = 22;  // px — invisible tap target (~44px diameter)

    // ── State ──
    var data = null;
    var countriesByCode = {};
    var countriesByContinent = {};
    var svgCache = {};
    var settings = { continent: DEFAULTS.continent, mode: DEFAULTS.mode };
    var selectedCode = null;

    // ── Camera ──
    var svgEl = null;
    var base = null;     // full-map viewBox {x, y, w, h}
    var view = null;     // current viewBox (aspect always equals base's)
    var markers = [];    // [{el, tap}] dot/tap circles, kept at constant screen size
    var animToken = 0;   // bumping this cancels a running viewBox animation

    // ── DOM ──
    var countryName = document.getElementById('countryName');
    var capitalName = document.getElementById('capitalName');
    var capitalCover = document.getElementById('capitalCover');
    var mapHost = document.getElementById('mapHost');
    var randomBtn = document.getElementById('randomBtn');
    var resetViewBtn = document.getElementById('resetViewBtn');
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

    // ── Camera helpers ──

    // preserveAspectRatio letterboxes the viewBox inside the svg's client box.
    // Because view keeps base's aspect ratio, the letterbox offsets are constant
    // and screen px per svg unit is simply K / view.w.
    function metrics() {
        var r = svgEl.getBoundingClientRect();
        var K = Math.min(r.width, r.height * base.w / base.h);
        return {
            rect: r,
            K: K,
            ox: (r.width - K) / 2,
            oy: (r.height - K * base.h / base.w) / 2
        };
    }

    function toSvgPoint(clientX, clientY) {
        var m = metrics();
        return {
            x: (clientX - m.rect.left - m.ox) * view.w / m.K + view.x,
            y: (clientY - m.rect.top - m.oy) * view.w / m.K + view.y
        };
    }

    function clampView(v) {
        var w = Math.min(base.w, Math.max(base.w / MAX_ZOOM, v.w));
        var h = w * base.h / base.w;
        var x = Math.min(base.x + base.w - w, Math.max(base.x, v.x));
        var y = Math.min(base.y + base.h - h, Math.max(base.y, v.y));
        return { x: x, y: y, w: w, h: h };
    }

    function applyView(v) {
        view = clampView(v);
        svgEl.setAttribute('viewBox', view.x + ' ' + view.y + ' ' + view.w + ' ' + view.h);
        var unitsPerPx = view.w / metrics().K;
        for (var i = 0; i < markers.length; i++) {
            var target = markers[i].tap ? TAP_SCREEN_R : DOT_SCREEN_R;
            markers[i].el.setAttribute('r', target * unitsPerPx);
        }
        resetViewBtn.hidden = view.w > base.w * 0.999;
    }

    function animateView(target, duration) {
        var token = ++animToken;
        var from = { x: view.x, y: view.y, w: view.w, h: view.h };
        var to = clampView(target);
        var start = null;

        function ease(t) {
            return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        }

        function step(ts) {
            if (token !== animToken || !svgEl) return;
            if (start === null) start = ts;
            var t = Math.min(1, (ts - start) / duration);
            var k = ease(t);
            applyView({
                x: from.x + (to.x - from.x) * k,
                y: from.y + (to.y - from.y) * k,
                w: from.w + (to.w - from.w) * k,
                h: from.h + (to.h - from.h) * k
            });
            if (t < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    function zoomAt(clientX, clientY, factor) {
        var p = toSvgPoint(clientX, clientY);
        var w = Math.min(base.w, Math.max(base.w / MAX_ZOOM, view.w * factor));
        var k = w / view.w;
        applyView({
            x: p.x - (p.x - view.x) * k,
            y: p.y - (p.y - view.y) * k,
            w: w,
            h: w * base.h / base.w
        });
    }

    function zoomToCountry(code) {
        var nodes = svgEl.querySelectorAll('.country[data-code="' + code + '"], .dot[data-code="' + code + '"]');
        if (nodes.length === 0) return;
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (var i = 0; i < nodes.length; i++) {
            var b = nodes[i].getBBox();
            if (b.width === 0 && b.height === 0) continue;
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.width);
            maxY = Math.max(maxY, b.y + b.height);
        }
        if (minX === Infinity) return;

        var bw = maxX - minX;
        var bh = maxY - minY;
        // pad ~60% per side, keep a minimum window so microstates show context
        var w = Math.max(bw * 2.2, bh * 2.2 * base.w / base.h, base.w * 0.09, 90);
        var h = w * base.h / base.w;
        animateView({
            x: (minX + maxX) / 2 - w / 2,
            y: (minY + maxY) / 2 - h / 2,
            w: w,
            h: h
        }, 500);
    }

    function resetCamera(animate) {
        if (!svgEl) return;
        if (animate) {
            animateView({ x: base.x, y: base.y, w: base.w, h: base.h }, 500);
        } else {
            animToken++;
            applyView({ x: base.x, y: base.y, w: base.w, h: base.h });
        }
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
        zoomToCountry(code);
    }

    // ── Map ──

    function loadContinent(continent, done) {
        var render = function (svgText) {
            mapHost.innerHTML = svgText;
            svgEl = mapHost.querySelector('svg');
            var vb = svgEl.getAttribute('viewBox').split(/\s+/).map(Number);
            base = { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
            markers = [];
            var circles = svgEl.querySelectorAll('circle');
            for (var i = 0; i < circles.length; i++) {
                markers.push({ el: circles[i], tap: circles[i].classList.contains('tap') });
            }
            resetCamera(false);
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
                svgEl = null;
                countryName.textContent = 'Грешка при учитавању карте';
            });
    }

    // ── Pointer gestures: tap to select, drag to pan, pinch to zoom ──

    var pointers = {};       // pointerId -> {x, y}
    var pointerCount = 0;
    var tapTarget = null;    // element under the first pointer at pointerdown
    var gestureMoved = 0;    // cumulative movement in px
    var multiTouch = false;
    var prevPinch = null;    // {dist, midX, midY}

    mapHost.addEventListener('pointerdown', function (e) {
        if (!svgEl) return;
        animToken++; // stop any running animation
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        pointerCount++;
        if (pointerCount === 1) {
            tapTarget = e.target.closest ? e.target.closest('[data-code]') : null;
            gestureMoved = 0;
            multiTouch = false;
        } else {
            multiTouch = true;
            tapTarget = null;
        }
        prevPinch = null;
        mapHost.setPointerCapture(e.pointerId);
    });

    mapHost.addEventListener('pointermove', function (e) {
        var p = pointers[e.pointerId];
        if (!p || !svgEl) return;

        if (pointerCount === 1) {
            var dx = e.clientX - p.x;
            var dy = e.clientY - p.y;
            gestureMoved += Math.abs(dx) + Math.abs(dy);
            if (gestureMoved > TAP_SLOP_PX) {
                var m = metrics();
                applyView({
                    x: view.x - dx * view.w / m.K,
                    y: view.y - dy * view.w / m.K,
                    w: view.w,
                    h: view.h
                });
            }
            p.x = e.clientX;
            p.y = e.clientY;
        } else if (pointerCount === 2) {
            p.x = e.clientX;
            p.y = e.clientY;
            var ids = Object.keys(pointers);
            var a = pointers[ids[0]], b = pointers[ids[1]];
            var dist = Math.hypot(a.x - b.x, a.y - b.y);
            var midX = (a.x + b.x) / 2;
            var midY = (a.y + b.y) / 2;
            if (prevPinch && prevPinch.dist > 0 && dist > 0) {
                zoomAt(midX, midY, prevPinch.dist / dist);
                var m2 = metrics();
                applyView({
                    x: view.x - (midX - prevPinch.midX) * view.w / m2.K,
                    y: view.y - (midY - prevPinch.midY) * view.w / m2.K,
                    w: view.w,
                    h: view.h
                });
            }
            prevPinch = { dist: dist, midX: midX, midY: midY };
        }
    });

    function pointerEnd(e) {
        if (!pointers[e.pointerId]) return;
        delete pointers[e.pointerId];
        pointerCount--;
        prevPinch = null;
        if (pointerCount === 0) {
            if (!multiTouch && gestureMoved <= TAP_SLOP_PX && tapTarget) {
                var code = tapTarget.getAttribute('data-code');
                if (code !== selectedCode) select(code);
            }
            tapTarget = null;
        }
    }

    mapHost.addEventListener('pointerup', pointerEnd);
    mapHost.addEventListener('pointercancel', pointerEnd);

    mapHost.addEventListener('wheel', function (e) {
        if (!svgEl) return;
        e.preventDefault();
        animToken++;
        zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0015));
    }, { passive: false });

    resetViewBtn.addEventListener('click', function () {
        resetCamera(true);
    });

    window.addEventListener('resize', function () {
        if (svgEl) applyView(view);
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
