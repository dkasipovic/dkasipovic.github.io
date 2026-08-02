/* ── Kamere ──
 * Camera stills must never be served from a cache: a stale border-crossing
 * photo is worse than no photo. Every load goes out with a fresh cache-busting
 * query param, and the markup ships with `data-src` so the browser cannot
 * paint a cached frame before this script runs.
 *
 * Each camera keeps two stacked <img> elements. A refresh loads into the
 * hidden one and only swaps it in once it has decoded, so the visible frame
 * never blanks out — and each refresh costs exactly one request.
 */

(function () {
    'use strict';

    var REFRESH_MS = 30 * 1000;

    function freshUrl(base) {
        var url = base.split('#')[0]
            .replace(/[?&]t=\d+/g, '')
            .replace(/[?&]$/, '');
        return url + (url.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now();
    }

    function stamp(cam) {
        if (!cam.time) return;
        cam.time.textContent = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    function buildCamera(img) {
        var figure = img.parentNode;

        var frame = document.createElement('div');
        frame.className = 'cam-frame is-loading is-initial';
        figure.insertBefore(frame, img);
        frame.appendChild(img);

        var buffer = img.cloneNode(false);
        frame.appendChild(buffer);

        var spinner = document.createElement('div');
        spinner.className = 'cam-spinner';
        spinner.setAttribute('aria-hidden', 'true');
        frame.appendChild(spinner);

        var error = document.createElement('div');
        error.className = 'cam-error';
        error.textContent = 'Slika nije dostupna';
        frame.appendChild(error);

        var time = null;
        var caption = figure.querySelector('figcaption');
        if (caption) {
            time = document.createElement('span');
            time.className = 'cam-time';
            caption.appendChild(time);
        }

        return {
            frame: frame,
            layers: [img, buffer],
            shown: -1,
            pending: false,
            src: img.dataset.src,
            time: time
        };
    }

    function load(cam) {
        if (cam.pending) return;
        cam.pending = true;

        cam.frame.classList.add('is-loading');
        cam.frame.classList.remove('is-error');

        var next = cam.shown === 0 ? 1 : 0;
        var target = cam.layers[next];

        target.onload = function () {
            cam.pending = false;
            cam.shown = next;
            cam.layers[next].classList.add('is-shown');
            cam.layers[next === 0 ? 1 : 0].classList.remove('is-shown');
            cam.frame.classList.remove('is-loading', 'is-initial', 'is-error');
            stamp(cam);
        };

        target.onerror = function () {
            cam.pending = false;
            cam.frame.classList.remove('is-loading');
            cam.frame.classList.add('is-error');
        };

        target.src = freshUrl(cam.src);
    }

    var cameras = [];

    function reloadAll() {
        cameras.forEach(load);
    }

    document.querySelectorAll('img[data-src]').forEach(function (img) {
        cameras.push(buildCamera(img));
    });

    reloadAll();

    var timer = setInterval(reloadAll, REFRESH_MS);

    function restart() {
        clearInterval(timer);
        reloadAll();
        timer = setInterval(reloadAll, REFRESH_MS);
    }

    // Coming back to the tab (or restoring it from the back/forward cache)
    // means whatever is on screen is old — refresh immediately.
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) restart();
    });

    window.addEventListener('pageshow', function (event) {
        if (event.persisted) restart();
    });

    window.addEventListener('online', restart);
})();
