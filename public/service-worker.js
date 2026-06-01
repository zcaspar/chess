// Service Worker for Chess App PWA
// Bump CACHE_NAME on any caching-behavior change to drop stale caches on activate.
const CACHE_NAME = 'chess-app-v2';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/logo192.png',
  '/logo512.png'
];

// Install event - cache resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.log('Cache install error:', err);
      })
  );
  // Skip waiting to activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// Fetch event
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const url = event.request.url;

  // Skip API requests (let them go to network)
  if (url.includes('/api/') ||
      url.includes('chess-production') ||
      url.includes('googleapis') ||
      url.includes('firebase')) {
    return;
  }

  // Network-first for navigations (the HTML app shell): always try the network so
  // a new deploy is picked up immediately; fall back to cache only when offline.
  // (Cache-first here was serving a stale index.html that pointed at old JS, so
  // deploys never reached returning users.)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('/', copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(event.request).then(r => r || caches.match('/')))
    );
    return;
  }

  // Cache-first for other same-origin assets. CRA static assets are
  // content-hashed, so a new build produces new URLs — caching them is safe.
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }

        return fetch(event.request.clone()).then(response => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              if (url.startsWith(self.location.origin)) {
                cache.put(event.request, responseToCache);
              }
            });

          return response;
        });
      })
  );
});

// Background sync for game moves
self.addEventListener('sync', event => {
  if (event.tag === 'sync-moves') {
    event.waitUntil(syncGameMoves());
  }
});

async function syncGameMoves() {
  // This would sync any offline moves when connection is restored
  console.log('Syncing game moves...');
  // Implementation would depend on your offline storage strategy
}

// Push notifications for game invites
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'New game invitation!',
    icon: '/logo192.png',
    badge: '/logo192.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'View Game',
        icon: '/logo192.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/logo192.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Chess App', options)
  );
});