const CACHE='hockey-duo-v5-4-direct-same-screen';
const CORE=['/','/index.html','/styles.css?v=5.4.0-direct.1','/game.js?v=5.4.0-direct.1','/motion.js?v=5.4.0-direct.1','/local-bot.js?v=5.3.0-choices.1','/engine/physics.js','/engine/geometry.js','/local-duel.js?v=5.4.0-direct.1','/peer-direct.js?v=5.4.0-direct.1','/qr-local.js?v=5.4.0-direct.1','/arena-lab.html','/manifest.webmanifest','/favicon.svg','/icon-192.png'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('hockey-duo-')&&k!==CACHE).map(k=>caches.delete(k))))]));
});
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==location.origin||url.pathname==='/ws'||url.pathname==='/health')return;
  if(req.mode==='navigate'){
    // Workers Assets redirects /index.html to /. Returning that cached
    // redirected response to a navigation fails in Chrome's offline mode.
    event.respondWith(fetch(req).catch(()=>caches.match('/')));return;
  }
  if(/\.(?:mp3|m4a|ogg|wav)$/i.test(url.pathname))return;
  if(['/game.js','/styles.css','/motion.js'].includes(url.pathname)){
    event.respondWith(fetch(req).then(response=>{
      if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(req,copy)));}
      return response;
    }).catch(()=>caches.match(req)));return;
  }
  event.respondWith(caches.match(req).then(cached=>{
    const live=fetch(req).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(req,copy));}
      return response;
    }).catch(()=>cached);
    return cached||live;
  }));
});
