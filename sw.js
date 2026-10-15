// Keeps the app working with no signal. Bump VERSION whenever a file changes so phones fetch the new copy.
const VERSION = 'simple-timesheet-v3';
const FILES = [
  './', './index.html', './app.css?v=3', './core.js?v=3', './pdf.js?v=3', './store.js?v=3', './weather.js?v=3', './app.js?v=3',
  './vendor/pdf-lib.min.js', './vendor/pdfjs/pdf.min.js', './vendor/pdfjs/pdf.worker.min.js', './manifest.webmanifest', './icons/icon.svg', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // the weather goes straight to the network
  // Pages: try the network first so updates show up, and fall back to the saved copy offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put('./index.html', copy)); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
