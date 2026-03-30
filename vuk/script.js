(function () {
    'use strict';

    // ── State ──
    var sentenceData = null;
    var availableKeys = [];
    var trackScoreEnabled = false;
    var sentenceDisplayedAt = null;
    var scoreData = { correct: 0, total: 0, totalTime: 0 };

    // ── DOM ──
    var sentenceCard = document.getElementById('sentenceCard');
    var sentenceText = document.getElementById('sentenceText');
    var sentenceHint = document.getElementById('sentenceHint');
    var generateBtn = document.getElementById('generateBtn');
    var settingsBtn = document.getElementById('settingsBtn');
    var settingsPanel = document.getElementById('settingsPanel');
    var minWordsInput = document.getElementById('minWords');
    var maxWordsInput = document.getElementById('maxWords');
    var minValueDisplay = document.getElementById('minValue');
    var maxValueDisplay = document.getElementById('maxValue');
    var scoreBar = document.getElementById('scoreBar');
    var scoreCorrectEl = document.getElementById('scoreCorrect');
    var scoreTotalEl = document.getElementById('scoreTotal');
    var scoreAvgEl = document.getElementById('scoreAvg');
    var scoreButtons = document.getElementById('scoreButtons');
    var btnCorrect = document.getElementById('btnCorrect');
    var btnWrong = document.getElementById('btnWrong');
    var trackScoreToggle = document.getElementById('trackScoreToggle');
    var resetBtn = document.getElementById('resetBtn');

    // ── Helpers ──

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // ── Score ──

    function loadScore() {
        try {
            var saved = localStorage.getItem('vuk-score');
            if (saved) {
                scoreData = JSON.parse(saved);
            }
        } catch (e) { /* ignore */ }
        updateScoreDisplay();
    }

    function saveScore() {
        localStorage.setItem('vuk-score', JSON.stringify(scoreData));
    }

    function updateScoreDisplay() {
        scoreCorrectEl.textContent = scoreData.correct;
        scoreTotalEl.textContent = scoreData.total;
        var avg = scoreData.total > 0 ? (scoreData.totalTime / scoreData.total / 1000) : 0;
        scoreAvgEl.textContent = avg.toFixed(1);
    }

    // ── Track Score Mode ──

    function setTrackScore(enabled) {
        trackScoreEnabled = enabled;
        trackScoreToggle.setAttribute('aria-checked', enabled ? 'true' : 'false');

        if (enabled) {
            scoreBar.classList.add('visible');
            scoreButtons.classList.add('visible');
            generateBtn.style.display = 'none';
            sentenceCard.classList.add('no-click');
            sentenceHint.textContent = '';
        } else {
            scoreBar.classList.remove('visible');
            scoreButtons.classList.remove('visible');
            generateBtn.style.display = '';
            sentenceCard.classList.remove('no-click');
            sentenceHint.textContent = 'додирни за нову реченицу';
        }
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
        var defaultTrack = false;

        var saved = localStorage.getItem('vuk-settings');
        if (saved) {
            try {
                var s = JSON.parse(saved);
                defaultMin = s.min || defaultMin;
                defaultMax = s.max || defaultMax;
                defaultTrack = !!s.trackScore;
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

        setTrackScore(defaultTrack);
    }

    function saveSettings() {
        localStorage.setItem('vuk-settings', JSON.stringify({
            min: parseInt(minWordsInput.value),
            max: parseInt(maxWordsInput.value),
            trackScore: trackScoreEnabled
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
        sentenceDisplayedAt = Date.now();
    }

    // ── Events ──

    generateBtn.addEventListener('click', generate);

    sentenceCard.addEventListener('click', function (e) {
        if (e.target.closest('.sentence-hint')) return;
        if (trackScoreEnabled) return;
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

    trackScoreToggle.addEventListener('click', function () {
        setTrackScore(!trackScoreEnabled);
        saveSettings();
    });

    btnCorrect.addEventListener('click', function () {
        var elapsed = Date.now() - (sentenceDisplayedAt || Date.now());
        scoreData.correct++;
        scoreData.total++;
        scoreData.totalTime += elapsed;
        saveScore();
        updateScoreDisplay();
        generate();
    });

    btnWrong.addEventListener('click', function () {
        var elapsed = Date.now() - (sentenceDisplayedAt || Date.now());
        scoreData.total++;
        scoreData.totalTime += elapsed;
        saveScore();
        updateScoreDisplay();
        generate();
    });

    resetBtn.addEventListener('click', function () {
        scoreData = { correct: 0, total: 0, totalTime: 0 };
        saveScore();
        updateScoreDisplay();

        minWordsInput.value = 5;
        maxWordsInput.value = 7;
        minValueDisplay.textContent = 5;
        maxValueDisplay.textContent = 7;

        setTrackScore(false);
        saveSettings();

        // Close settings panel after reset
        settingsPanel.classList.remove('visible');
        settingsBtn.classList.remove('active');

        generate();
    });

    // ── Load Data & Init ──

    fetch('./sentences.json')
        .then(function (res) { return res.json(); })
        .then(function (data) {
            sentenceData = data;
            availableKeys = Object.keys(data).map(Number).sort(function (a, b) { return a - b; });
            applySliderBounds();
            loadSettings();
            loadScore();
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
