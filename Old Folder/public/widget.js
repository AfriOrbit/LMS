/*!
 * AfriOrbit widget loader
 * -----------------------------------------------------------------------------
 * One script, injected site-wide on afriorbit.space. It does two jobs:
 *
 *   1. Mounts sandboxed iframes for anything marked
 *      `data-afriorbit-widget="<name>"`, and auto-resizes them.
 *
 *   2. Resolves the visitor's access tier once per page and reveals or hides
 *      elements marked `data-afriorbit-gate="<tier>"`.
 *
 * Security posture. The tier returned here is a HINT used to choose what to
 * render. It is not the boundary. Every gated artefact — the datasheet PDF,
 * the price band, the telemetry data, the live-session booking — is served by
 * the Vercel app, which re-checks the signed grant server-side before
 * returning a single byte. Forging the value in this script gets you a page
 * that says "unlocked" above content the server will not send.
 *
 *   <div data-afriorbit-widget="coverage"></div>
 *   <div data-afriorbit-gate="1">
 *     <div data-gate-locked>…the ask…</div>
 *     <div data-gate-unlocked hidden>…the reward…</div>
 *   </div>
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

  /* Widgets and their default heights before the frame reports its own. */
  var WIDGETS = {
    coverage: { path: '/embed/coverage', height: 900 },
    groundtrack: { path: '/embed/groundtrack', height: 420 },
    'link-budget': { path: '/embed/link-budget', height: 760 },
    telemetry: { path: '/embed/telemetry', height: 720 },
    decoder: { path: '/embed/decoder', height: 680 },
    tiers: { path: '/embed/tiers', height: 260 },
    'demo-index': { path: '/embed/demo-index', height: 520 },
    'request-form': { path: '/embed/request', height: 1100 },
    catalog: { path: '/embed/catalog', height: 460 },
  };

  /* -------------------------------------------------------------------- */
  /* Widgets                                                              */
  /* -------------------------------------------------------------------- */

  function mount(host) {
    if (host.getAttribute('data-afriorbit-mounted') === '1') return;
    host.setAttribute('data-afriorbit-mounted', '1');

    var name = host.getAttribute('data-afriorbit-widget');
    var spec = WIDGETS[name];
    if (!spec) {
      host.innerHTML =
        '<p style="font:14px/1.5 system-ui;color:#c9182c">' +
        'Unknown AfriOrbit widget: ' + String(name).replace(/[<>&]/g, '') + '</p>';
      return;
    }

    var params = new URLSearchParams();
    var theme = host.getAttribute('data-theme');
    var limit = host.getAttribute('data-limit');
    var level = host.getAttribute('data-level');
    if (theme) params.set('theme', theme);
    if (limit) params.set('limit', limit);
    if (level) params.set('level', level);

    var frame = document.createElement('iframe');
    frame.src = ORIGIN + spec.path + (params.toString() ? '?' + params : '');
    frame.title = 'AfriOrbit ' + name.replace(/-/g, ' ');
    frame.loading = 'lazy';
    frame.setAttribute('scrolling', 'no');
    // No allow-same-origin: these frames hold no session and need no storage.
    frame.setAttribute(
      'sandbox',
      'allow-scripts allow-popups allow-forms allow-top-navigation-by-user-activation',
    );
    frame.style.cssText =
      'width:100%;border:0;display:block;background:transparent;' +
      'min-height:' + (host.getAttribute('data-height') || spec.height) + 'px';

    host.appendChild(frame);
    host._aoFrame = frame;
  }

  window.addEventListener('message', function (event) {
    if (event.origin !== ORIGIN) return;
    var data = event.data;
    if (!data || data.type !== 'afriorbit-embed-height') return;

    var height = parseInt(data.height, 10);
    if (isNaN(height) || height < 120 || height > 20000) return;

    var hosts = document.querySelectorAll('[data-afriorbit-widget]');
    for (var i = 0; i < hosts.length; i++) {
      var frame = hosts[i]._aoFrame;
      if (frame && frame.contentWindow === event.source) {
        frame.style.height = height + 16 + 'px';
        frame.style.minHeight = '0';
      }
    }
  });

  /* -------------------------------------------------------------------- */
  /* Access tier                                                          */
  /* -------------------------------------------------------------------- */

  function applyTier(tier) {
    document.documentElement.setAttribute('data-afriorbit-tier', String(tier));

    var gates = document.querySelectorAll('[data-afriorbit-gate]');
    for (var i = 0; i < gates.length; i++) {
      var required = parseInt(gates[i].getAttribute('data-afriorbit-gate'), 10) || 0;
      var unlocked = tier >= required;

      var lockedEl = gates[i].querySelector('[data-gate-locked]');
      var unlockedEl = gates[i].querySelector('[data-gate-unlocked]');
      if (lockedEl) lockedEl.hidden = unlocked;
      if (unlockedEl) unlockedEl.hidden = !unlocked;

      gates[i].setAttribute('data-gate-state', unlocked ? 'open' : 'locked');
    }
  }

  function resolveTier() {
    // credentials:include so the grant cookie set by learn.afriorbit.space is
    // sent. The cookie is SameSite=None; Secure; HttpOnly and readable only by
    // the app — this script never sees the token itself.
    fetch(ORIGIN + '/api/access/tier', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
      .then(function (r) { return r.ok ? r.json() : { tier: 0 }; })
      .then(function (d) { applyTier(Number(d.tier) || 0); })
      .catch(function () { applyTier(0); });
  }

  /* -------------------------------------------------------------------- */

  function init() {
    var hosts = document.querySelectorAll('[data-afriorbit-widget]');
    for (var i = 0; i < hosts.length; i++) mount(hosts[i]);

    applyTier(0); // Fail closed while the request is in flight.
    if (document.querySelector('[data-afriorbit-gate]') || hosts.length) resolveTier();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Squarespace swaps page content on client-side navigation without a full
  // load, so re-scan when the DOM changes.
  if (window.MutationObserver) {
    var pending = null;
    new MutationObserver(function () {
      clearTimeout(pending);
      pending = setTimeout(init, 120);
    }).observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
})();
