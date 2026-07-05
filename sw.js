const CACHE = 'selfmade-v5'
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './js/db.js',
  './js/auth.js',
  './js/sync.js',
  './js/app.js',
  './js/notifications.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
]

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(ASSETS.map(url => cache.add(url)))
    ).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  if (url.hostname.includes('googleapis') || url.hostname.includes('accounts.google')) {
    return
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached
      return fetch(e.request).then(resp => {
        if (resp.ok && url.origin === self.location.origin) {
          caches.open(CACHE).then(c => c.put(e.request, resp.clone()))
        }
        return resp
      }).catch(() => cached)
    })
  )
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) return client.focus()
      }
      return clients.openWindow('./')
    })
  )
})
