/* ── Kasipovic App Shell ── */
/* Shared JS for app titlebar injection on all tool pages */

(function () {
    'use strict';

    var isApp = window.location.hash === '#app';
    var title = document.title.replace(/ - Kasipovic$/, '');

    // Inject app titlebar
    var bar = document.createElement('div');
    bar.className = 'app-titlebar';
    bar.innerHTML =
        (isApp
            ? '<a href="/" class="app-back-btn" aria-label="Back to Tools">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                    '<polyline points="15 18 9 12 15 6"/>' +
                '</svg>' +
              '</a>'
            : '') +
        '<span class="app-titlebar-title">' + title + '</span>';

    document.body.prepend(bar);
    document.body.classList.add('has-app-bar');
})();
