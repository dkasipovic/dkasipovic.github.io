(function () {
    'use strict';

    // ── Sentence Cores ──
    // Each core is a semantically valid mini-sentence.
    // s=subject, v=verb, o=object (optional)

    var cores = [
        // People — intransitive
        { s: 'мама', v: 'пева' },
        { s: 'тата', v: 'ради' },
        { s: 'баба', v: 'кува' },
        { s: 'деда', v: 'хода' },
        { s: 'дете', v: 'скаче' },
        { s: 'дете', v: 'плаче' },
        { s: 'дете', v: 'спава' },
        { s: 'сестра', v: 'трчи' },
        { s: 'брат', v: 'игра' },
        { s: 'девојчица', v: 'пева' },
        { s: 'дечак', v: 'трчи' },
        { s: 'бебе', v: 'спава' },
        { s: 'бебе', v: 'плаче' },

        // People — transitive
        { s: 'мама', v: 'чита', o: 'књигу' },
        { s: 'мама', v: 'прави', o: 'колач' },
        { s: 'мама', v: 'пере', o: 'судове' },
        { s: 'мама', v: 'воли', o: 'дете' },
        { s: 'тата', v: 'вози', o: 'ауто' },
        { s: 'тата', v: 'чита', o: 'новине' },
        { s: 'тата', v: 'прави', o: 'кућицу' },
        { s: 'тата', v: 'воли', o: 'маму' },
        { s: 'баба', v: 'плете', o: 'шал' },
        { s: 'баба', v: 'прави', o: 'палачинке' },
        { s: 'баба', v: 'сади', o: 'цвеће' },
        { s: 'деда', v: 'чита', o: 'новине' },
        { s: 'деда', v: 'ради', o: 'у башти' },
        { s: 'дете', v: 'једе', o: 'јабуку' },
        { s: 'дете', v: 'пије', o: 'сок' },
        { s: 'дете', v: 'црта', o: 'слику' },
        { s: 'дете', v: 'чита', o: 'књигу' },
        { s: 'дете', v: 'баца', o: 'лопту' },
        { s: 'дете', v: 'носи', o: 'торбу' },
        { s: 'дете', v: 'воли', o: 'чоколаду' },
        { s: 'дечак', v: 'једе', o: 'хлеб' },
        { s: 'дечак', v: 'хвата', o: 'лопту' },
        { s: 'дечак', v: 'баца', o: 'лопту' },
        { s: 'дечак', v: 'пише', o: 'домаћи' },
        { s: 'дечак', v: 'гледа', o: 'птицу' },
        { s: 'девојчица', v: 'црта', o: 'цвет' },
        { s: 'девојчица', v: 'чита', o: 'причу' },
        { s: 'девојчица', v: 'једе', o: 'сладолед' },
        { s: 'девојчица', v: 'носи', o: 'торбу' },
        { s: 'девојчица', v: 'плете', o: 'венац' },
        { s: 'сестра', v: 'чита', o: 'књигу' },
        { s: 'сестра', v: 'слуша', o: 'песму' },
        { s: 'брат', v: 'воли', o: 'фудбал' },
        { s: 'брат', v: 'једе', o: 'колач' },

        // Animals — intransitive
        { s: 'мачка', v: 'спава' },
        { s: 'мачка', v: 'седи' },
        { s: 'мачка', v: 'скаче' },
        { s: 'пас', v: 'трчи' },
        { s: 'пас', v: 'лаје' },
        { s: 'пас', v: 'скаче' },
        { s: 'зека', v: 'скаче' },
        { s: 'зека', v: 'трчи' },
        { s: 'птица', v: 'лети' },
        { s: 'птица', v: 'пева' },
        { s: 'риба', v: 'плива' },
        { s: 'коњ', v: 'трчи' },
        { s: 'жаба', v: 'скаче' },
        { s: 'медвед', v: 'спава' },
        { s: 'лав', v: 'спава' },

        // Animals — transitive
        { s: 'мачка', v: 'пије', o: 'млеко' },
        { s: 'мачка', v: 'лови', o: 'миша' },
        { s: 'пас', v: 'једе', o: 'кост' },
        { s: 'пас', v: 'чува', o: 'кућу' },
        { s: 'пас', v: 'носи', o: 'лопту' },
        { s: 'зека', v: 'једе', o: 'траву' },
        { s: 'зека', v: 'једе', o: 'шаргарепу' },
        { s: 'птица', v: 'прави', o: 'гнездо' },
        { s: 'крава', v: 'једе', o: 'траву' },
        { s: 'медвед', v: 'једе', o: 'мед' },
        { s: 'медвед', v: 'лови', o: 'рибу' },
    ];

    // ── Subject Adjectives ──
    // Grouped by subject category for semantic compatibility.

    var adjectives = {
        people: ['мали', 'добар', 'весел', 'храбар', 'паметан', 'вредан', 'леп', 'тих'],
        animals: ['мали', 'велики', 'брз', 'добар', 'црн', 'бео', 'леп', 'дебео', 'храбар']
    };

    var peopleNouns = ['мама', 'тата', 'баба', 'деда', 'дете', 'сестра', 'брат', 'бебе', 'девојчица', 'дечак'];

    function getSubjectCategory(noun) {
        return peopleNouns.indexOf(noun) !== -1 ? 'people' : 'animals';
    }

    // ── Adverbs (safe with any verb) ──
    var adverbs = ['брзо', 'полако', 'тихо', 'гласно', 'лепо', 'весело', 'увек', 'опет'];

    // ── Time words (safe at start or end of any sentence) ──
    var times = ['данас', 'сутра', 'увек', 'ујутру', 'увече', 'сваки дан'];

    // ── Locations (preposition + noun, always safe at end) ──
    var locations = [
        'у парку', 'у кући', 'у школи', 'у башти', 'у соби', 'у дворишту',
        'на ливади', 'на сунцу', 'на столу', 'на трави',
        'код куће', 'код баке', 'код деде',
        'поред реке', 'поред куће', 'поред дрвета',
        'испод дрвета', 'иза куће', 'испред куће', 'кроз шуму'
    ];

    // ── Helpers ──

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    function countWords(arr) {
        var n = 0;
        for (var i = 0; i < arr.length; i++) {
            // Location phrases like "у парку" count as 2 words
            n += arr[i].split(' ').length;
        }
        return n;
    }

    function generateSentence(minWords, maxWords) {
        var target = minWords + Math.floor(Math.random() * (maxWords - minWords + 1));

        // For long sentences (8+), try a compound sentence: two cores joined by "и" or "а"
        if (target >= 8) {
            return generateCompound(target);
        }

        return generateSimple(target);
    }

    function generateSimple(target) {
        var core = pick(cores);
        var parts = [core.s, core.v];
        if (core.o) parts.push(core.o);

        var hasAdj = false;
        var hasAdv = false;
        var hasLoc = false;
        var hasTime = false;

        // Decorate until we reach target word count
        var attempts = 0;
        while (countWords(parts) < target && attempts < 20) {
            attempts++;
            var deficit = target - countWords(parts);

            // Try adding an adjective before subject (adds 1 word)
            if (!hasAdj && deficit >= 1) {
                var cat = getSubjectCategory(core.s);
                parts.splice(0, 0, pick(adjectives[cat]));
                hasAdj = true;
                continue;
            }

            // Try adding a location at the end (adds 2 words)
            if (!hasLoc && deficit >= 2) {
                parts.push(pick(locations));
                hasLoc = true;
                continue;
            }

            // Try adding an adverb after the verb (adds 1 word)
            if (!hasAdv && deficit >= 1) {
                // Insert adverb after verb
                var verbIdx = hasAdj ? 2 : 1;
                parts.splice(verbIdx + 1, 0, pick(adverbs));
                hasAdv = true;
                continue;
            }

            // Try adding a time word at the start (adds 1 word)
            if (!hasTime && deficit >= 1) {
                parts.splice(0, 0, pick(times));
                hasTime = true;
                continue;
            }

            // If we still need more, add another adverb or break
            if (deficit >= 1) {
                parts.push(pick(adverbs));
            } else {
                break;
            }
        }

        parts[0] = capitalize(parts[0]);
        return parts.join(' ') + '.';
    }

    function generateCompound(target) {
        // Pick two different cores
        var core1 = pick(cores);
        var core2 = pick(cores);
        // Make sure they have different subjects for variety
        var attempts = 0;
        while (core2.s === core1.s && attempts < 10) {
            core2 = pick(cores);
            attempts++;
        }

        var connector = pick(['и', 'а', 'па']);

        var parts1 = [core1.s, core1.v];
        if (core1.o) parts1.push(core1.o);

        var parts2 = [core2.s, core2.v];
        if (core2.o) parts2.push(core2.o);

        // Base word count: parts1 + connector + parts2
        var baseCount = countWords(parts1) + 1 + countWords(parts2);

        // Decorate first half
        if (baseCount + 1 <= target) {
            var cat1 = getSubjectCategory(core1.s);
            parts1.splice(0, 0, pick(adjectives[cat1]));
            baseCount++;
        }

        // Decorate second half
        if (baseCount + 1 <= target) {
            var cat2 = getSubjectCategory(core2.s);
            parts2.splice(0, 0, pick(adjectives[cat2]));
            baseCount++;
        }

        // Add adverb to first half
        if (baseCount + 1 <= target) {
            parts1.splice(parts1.indexOf(core1.v) + 1, 0, pick(adverbs));
            baseCount++;
        }

        // Add location to second half
        if (baseCount + 2 <= target) {
            parts2.push(pick(locations));
            baseCount += 2;
        }

        // Add adverb to second half
        if (baseCount + 1 <= target) {
            parts2.splice(parts2.indexOf(core2.v) + 1, 0, pick(adverbs));
            baseCount++;
        }

        parts1[0] = capitalize(parts1[0]);
        var sentence = parts1.join(' ') + ' ' + connector + ' ' + parts2.join(' ') + '.';
        return sentence;
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
