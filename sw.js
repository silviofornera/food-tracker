/* Food Tracker service worker: app shell cached for offline use.
   Same-origin GETs are served cache-first and refreshed in the background
   (stale-while-revalidate), so a new deploy shows up on the second launch.
   Bump VERSION to force-drop old caches. API calls (other origins) are never touched. */
var VERSION = 'ft-r3';
var SHELL = ['./', 'index.html', 'css/app.css', 'js/nutrition.js', 'js/foods-data.js', 'js/store.js', 'js/api.js', 'js/drive.js', 'js/cloud.js', 'js/app.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(VERSION).then(function (cache) {
    return cache.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(function () { return hit; });
      return hit || net;
    });
  }));
});
