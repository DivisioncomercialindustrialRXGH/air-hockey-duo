/** Air Hockey DUO 5.5 CROSS BETA · PWA app-shell offline support.
 * Cache ONLY the essential engine and UI. Online rooms still need Cloudflare.
 * Local LAN (with PC) is served by its own local Wi-Fi origin.
 */
const CACHE='hockey-duo-v5-5-0-cross-beta';
const CORE=[
  '/', '/styles.css?v=5.5.0-cross-beta.1', '/game.js?v=5.5.0-cross-beta.1',
  '/motion.js?v=5.5.0-cross-beta.1', '/local-bot.js?v=5.3.0-choices.1',
  '/local-duel.js?v=5.4.0-direct.1', '/peer-direct.js?v=5.4.0-direct.1',
  '/qr-local.js?v=5.4.0-direct.1', '/engine/physics.js',
  '/engine/geometry.js', '/engine/cross.js?v=5.5.0-cross.1', '/cross-view.js?v=5.5.0-cross.1', '/manifest.webmanifest', '/favicon.svg',
  '/icon-192.png', '/icon-512.png', '/icon-180.png', '/arena-lab.html'
];
self.addEventListener('install',event=>{
  // If even one mandatory asset is unavailable, installation fails and the
  // previous working service worker remains. No half-installed offline build.
  event.waitUntil(caches.open(CACHE)
    .then(cache=>cache.addAll(CORE))
    .then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(keys=>Promise.all(keys
      .filter(key=>key.startsWith('hockey-duo-') && key!==CACHE)
      .map(key=>caches.delete(key))))
  ]));
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin || url.pathname==='/ws' || url.pathname==='/health')return;
  // Media playback may issue Safari Range requests; never cache partial files.
  if(req.headers.has('range') || /\.(?:mp3|m4a|ogg|wav)$/i.test(url.pathname))return;
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).then(response=>{
      if(response.ok)return response;
      if(response.status>=500)return caches.match('/').then(cached=>cached||response);
      return response;
    }).catch(()=>caches.match('/').then(cached=>cached||Response.error())));
    return;
  }
  // Atomic versioned app shell is cache-first. Never mix newer JavaScript with
  // an old locally cached engine during a currently-running offline match.
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req)
    .then(response=>{
      if(response.ok && response.status===200 && response.type!=='opaque'){
        const clone=response.clone();
        event.waitUntil(caches.open(CACHE).then(cache=>cache.put(req,clone)));
      }
      return response;
    })));
});
