(function () {
    'use strict';

    // ── State ──
    var sentenceData = null;
    var availableKeys = [];

    // ── DOM ──
    var sentenceCard = document.getElementById('sentenceCard');
    var sentenceText = document.getElementById('sentenceText');
    var generateBtn = document.getElementById('generateBtn');
    var settingsBtn = document.getElementById('settingsBtn');
    var settingsPanel = document.getElementById('settingsPanel');
    var minWordsInput = document.getElementById('minWords');
    var maxWordsInput = document.getElementById('maxWords');
    var minValueDisplay = document.getElementById('minValue');
    var maxValueDisplay = document.getElementById('maxValue');

    // ── Helpers ──

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // ── Settings ──

    function applySliderBounds() {
        if (availableKeys.length === 0) return;
        var lo = availableKeys[0];
        var hi = availableKeys[availableKeys.length - 1];

        minWordsInput.min = lo;
        minWordsInput.max = hi;
        maxWordsInput.min = lo;
        maxWordsInput.max = hi;
    }

    function loadSettings() {
        var lo = availableKeys.length > 0 ? availableKeys[0] : 2;
        var hi = availableKeys.length > 0 ? availableKeys[availableKeys.length - 1] : 7;
        var defaultMin = 5;
        var defaultMax = 7;

        var saved = localStorage.getItem('vuk-settings');
        if (saved) {
            try {
                var s = JSON.parse(saved);
                defaultMin = s.min || defaultMin;
                defaultMax = s.max || defaultMax;
            } catch (e) {
                // ignore
            }
        }

        // Clamp to available range
        defaultMin = Math.max(lo, Math.min(hi, defaultMin));
        defaultMax = Math.max(lo, Math.min(hi, defaultMax));
        if (defaultMin > defaultMax) defaultMax = defaultMin;

        minWordsInput.value = defaultMin;
        maxWordsInput.value = defaultMax;
        minValueDisplay.textContent = defaultMin;
        maxValueDisplay.textContent = defaultMax;
    }

    function saveSettings() {
        localStorage.setItem('vuk-settings', JSON.stringify({
            min: parseInt(minWordsInput.value),
            max: parseInt(maxWordsInput.value)
        }));
    }

    function getMin() { return parseInt(minWordsInput.value); }
    function getMax() { return parseInt(maxWordsInput.value); }

    // ── Generation ──

    function generate() {
        if (!sentenceData) {
            sentenceText.textContent = 'Учитавање...';
            return;
        }

        var min = getMin();
        var max = getMax();
        if (min > max) max = min;

        // Collect all sentences from keys within range
        var pool = [];
        for (var i = 0; i < availableKeys.length; i++) {
            var k = availableKeys[i];
            if (k >= min && k <= max && sentenceData[k]) {
                pool = pool.concat(sentenceData[k]);
            }
        }

        if (pool.length === 0) {
            sentenceText.textContent = 'Нема реченица за овај опсег.';
            return;
        }

        sentenceText.textContent = pick(pool);
    }

    // ── Events ──

    generateBtn.addEventListener('click', generate);

    sentenceCard.addEventListener('click', function (e) {
        if (e.target.closest('.sentence-hint')) return;
        generate();
    });

    settingsBtn.addEventListener('click', function () {
        settingsPanel.classList.toggle('visible');
        settingsBtn.classList.toggle('active');
    });

    minWordsInput.addEventListener('input', function () {
        var min = getMin();
        var max = getMax();
        if (min > max) {
            maxWordsInput.value = min;
            maxValueDisplay.textContent = min;
        }
        minValueDisplay.textContent = min;
        saveSettings();
    });

    maxWordsInput.addEventListener('input', function () {
        var min = getMin();
        var max = getMax();
        if (max < min) {
            minWordsInput.value = max;
            minValueDisplay.textContent = max;
        }
        maxValueDisplay.textContent = max;
        saveSettings();
    });

    // ── Load Data & Init ──

    fetch('./sentences.json')
        .then(function (res) { return res.json(); })
        .then(function (data) {
            sentenceData = data;
            availableKeys = Object.keys(data).map(Number).sort(function (a, b) { return a - b; });
            applySliderBounds();
            loadSettings();
            generate();
        })
        .catch(function () {
            sentenceText.textContent = 'Грешка при учитавању.';
        });

    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js');
    }
})();
