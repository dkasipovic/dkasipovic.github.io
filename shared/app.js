/* ── Kasipovic App Shell ── */
/* Shared JS for #app detection and back-button header */

(function () {
    'use strict';

    var isApp = window.location.hash === '#app';
    if (!isApp) return;

    // Inject back header
    var header = document.createElement('div');
    header.className = 'app-back-header visible';
    header.innerHTML =
        '<a href="/" class="app-back-btn">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<polyline points="15 18 9 12 15 6"/>' +
            '</svg>' +
            'Tools' +
        '</a>' +
        '<span class="app-back-title">' + document.title.replace(/ - Kasipovic$/, '') + '</span>';

    document.body.prepend(header);
    document.body.classList.add('has-app-header');
})();
