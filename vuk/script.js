(function () {
    'use strict';

    // ── Word Banks ──

    var imenice = [
        'мама', 'тата', 'баба', 'деда', 'сестра', 'брат', 'бебе', 'дете',
        'мачка', 'пас', 'зека', 'птица', 'риба', 'коњ', 'крава', 'овца', 'миш', 'жаба', 'медвед', 'лав',
        'кућа', 'школа', 'парк', 'башта', 'соба', 'сто', 'столица', 'прозор', 'врата',
        'дрво', 'цвет', 'трава', 'река', 'сунце', 'месец', 'звезда', 'облак', 'киша', 'снег',
        'лопта', 'књига', 'торба', 'оловка', 'боја', 'слика', 'песма', 'играчка',
        'хлеб', 'млеко', 'вода', 'сок', 'јабука', 'колач', 'чоколада', 'сладолед',
        'ауто', 'воз', 'бицикл', 'авион', 'брод'
    ];

    var glagoli = [
        'иде', 'трчи', 'скаче', 'хода', 'лети', 'плива',
        'једе', 'пије', 'спава', 'седи', 'стоји', 'лежи',
        'пева', 'игра', 'црта', 'чита', 'пише', 'учи',
        'воли', 'гледа', 'слуша', 'прича', 'смеје', 'плаче',
        'носи', 'баца', 'хвата', 'отвара', 'затвара',
        'зове', 'тражи', 'налази', 'даје', 'узима', 'прави'
    ];

    var pridevi = [
        'велики', 'мали', 'леп', 'добар', 'нов', 'стар',
        'брз', 'спор', 'тих', 'гласан', 'весел', 'тужан',
        'црвен', 'плав', 'зелен', 'жут', 'бео', 'црн',
        'топал', 'хладан', 'мек', 'тврд', 'сладак', 'кисео',
        'храбар', 'паметан', 'јак', 'висок', 'низак', 'дебео', 'танак'
    ];

    var prilozi = [
        'брзо', 'полако', 'тихо', 'гласно', 'лепо', 'весело',
        'данас', 'сутра', 'увек', 'овде', 'тамо', 'горе', 'доле',
        'опет', 'много', 'мало', 'заједно', 'напоље', 'унутра'
    ];

    var veznici = ['и', 'а', 'па', 'али', 'или', 'јер', 'кад'];

    var predlozi = ['у', 'на', 'из', 'са', 'код', 'поред', 'испод', 'изнад', 'испред', 'иза', 'кроз', 'око'];

    // ── Sentence Templates ──
    // Each template is an array of word-type tokens.
    // Types: N=noun, V=verb, A=adjective, D=adverb, P=preposition, C=conjunction

    var templates = [
        ['A', 'N', 'V'],                    // Велики пас трчи.
        ['N', 'V', 'D'],                    // Мачка спава тихо.
        ['N', 'V', 'N'],                    // Мама чита књигу.
        ['A', 'N', 'V', 'N'],              // Мали зека једе траву.
        ['N', 'V', 'P', 'N'],              // Деда иде у парк.
        ['N', 'C', 'N', 'V'],              // Брат и сестра играју.
        ['A', 'N', 'V', 'D'],              // Весел дете скаче високо.
        ['N', 'V', 'A', 'N'],              // Баба прави сладак колач.
        ['N', 'D', 'V', 'P', 'N'],         // Тата полако иде у кућу.
        ['A', 'N', 'V', 'P', 'A', 'N'],   // Мали миш живи у старој кући.
        ['N', 'C', 'N', 'V', 'D'],         // Мама и тата певају весело.
        ['A', 'N', 'V', 'N', 'P', 'N'],   // Добар пас носи лопту у башту.
        ['D', 'N', 'V', 'A', 'N'],         // Данас дете црта лепу слику.
        ['N', 'V', 'C', 'N', 'V'],         // Птица пева а жаба скаче.
        ['P', 'N', 'V', 'A', 'N'],         // У школи учи паметан дечак.
        ['N', 'D', 'V', 'N', 'C', 'N'],   // Сестра лепо црта цвет и сунце.
        ['A', 'A', 'N', 'V', 'D'],         // Мали црвен ауто иде брзо.
        ['N', 'V', 'P', 'A', 'N'],         // Зека скаче кроз зелену траву.
    ];

    // ── Helpers ──

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function wordForType(type) {
        switch (type) {
            case 'N': return pick(imenice);
            case 'V': return pick(glagoli);
            case 'A': return pick(pridevi);
            case 'D': return pick(prilozi);
            case 'P': return pick(predlozi);
            case 'C': return pick(veznici);
            default:  return pick(imenice);
        }
    }

    function generateSentence(minWords, maxWords) {
        var target = minWords + Math.floor(Math.random() * (maxWords - minWords + 1));

        // Find templates that match the target length, or pick closest
        var matching = templates.filter(function (t) { return t.length === target; });
        if (matching.length === 0) {
            // Find closest templates and pad/trim
            var sorted = templates.slice().sort(function (a, b) {
                return Math.abs(a.length - target) - Math.abs(b.length - target);
            });
            matching = [sorted[0]];
        }

        var template = pick(matching).slice();

        // Pad with extra words if template is shorter than target
        while (template.length < target) {
            var extras = ['D', 'A', 'C', 'N'];
            var pos = Math.floor(Math.random() * (template.length + 1));
            template.splice(pos, 0, pick(extras));
        }

        // Trim if template is longer than target
        while (template.length > target) {
            var removeIdx = Math.floor(Math.random() * template.length);
            template.splice(removeIdx, 1);
        }

        var words = template.map(wordForType);

        // Capitalize first letter
        words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);

        return words.join(' ') + '.';
    }

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

    // ── Settings ──

    function loadSettings() {
        var saved = localStorage.getItem('vuk-settings');
        if (saved) {
            try {
                var s = JSON.parse(saved);
                minWordsInput.value = s.min || 5;
                maxWordsInput.value = s.max || 7;
            } catch (e) {
                // ignore
            }
        }
        minValueDisplay.textContent = minWordsInput.value;
        maxValueDisplay.textContent = maxWordsInput.value;
    }

    function saveSettings() {
        localStorage.setItem('vuk-settings', JSON.stringify({
            min: parseInt(minWordsInput.value),
            max: parseInt(maxWordsInput.value)
        }));
    }

    function getMin() { return parseInt(minWordsInput.value); }
    function getMax() { return parseInt(maxWordsInput.value); }

    // ── Events ──

    function generate() {
        var min = getMin();
        var max = getMax();
        if (min > max) max = min;
        sentenceText.textContent = generateSentence(min, max);
    }

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

    // ── Init ──

    loadSettings();
    generate();

    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js');
    }
})();
