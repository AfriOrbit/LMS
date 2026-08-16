/*!
 * AfriOrbit Learning — embeddable catalogue widget
 *
 * Drop this on afriorbit.space (Squarespace code block, WordPress, plain HTML):
 *
 *   <div data-afriorbit-catalog
 *        data-limit="6"
 *        data-level=""
 *        data-theme="dark"></div>
 *   <script src="https://learn.afriorbit.space/embed.js" async></script>
 *
 * It injects an iframe pointing at /embed/catalog and auto-resizes it from a
 * postMessage the frame sends. The host page never sees a session cookie and
 * cannot reach anything authenticated: the app sets frame-ancestors 'none' on
 * every route except /embed.
 */
(function () {
  'use strict';

  var SCRIPT = document.currentScript;
  var ORIGIN = (function () {
    try {
      return new URL(SCRIPT.src).origin;
    } catch {
      return 'https://learn.afriorbit.space';
    }
  })();

  function mount(host) {
    if (host.getAttribute('data-afriorbit-mounted') === '1') return;
    host.setAttribute('data-afriorbit-mounted', '1');

    var params = new URLSearchParams();
    var limit = host.getAttribute('data-limit');
    var level = host.getAttribute('data-level');
    var theme = host.getAttribute('data-theme');
    if (limit) params.set('limit', limit);
    if (level) params.set('level', level);
    if (theme) params.set('theme', theme);

    var iframe = document.createElement('iframe');
    iframe.src = ORIGIN + '/embed/catalog' + (params.toString() ? '?' + params : '');
    iframe.title = 'AfriOrbit course catalogue';
    iframe.loading = 'lazy';
    iframe.setAttribute('scrolling', 'no');
    // No allow-same-origin: the frame needs no storage or cookies at all.
    iframe.setAttribute('sandbox', 'allow-scripts allow-popups allow-top-navigation-by-user-activation');
    iframe.style.width = '100%';
    iframe.style.border = '0';
    iframe.style.display = 'block';
    iframe.style.minHeight = '420px';
    iframe.style.colorScheme = 'normal';

    host.appendChild(iframe);

    window.addEventListener('message', function (event) {
      if (event.origin !== ORIGIN) return;
      var data = event.data;
      if (!data || data.type !== 'afriorbit-embed-height') return;
      var height = parseInt(data.height, 10);
      if (!isNaN(height) && height > 100 && height < 20000) {
        iframe.style.height = height + 24 + 'px';
      }
    });
  }

  function init() {
    var hosts = document.querySelectorAll('[data-afriorbit-catalog]');
    for (var i = 0; i < hosts.length; i++) mount(hosts[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
