const CACHE='hockey-duo-v4-5-1-carriles-reflejados';
const CORE=['/','/index.html','/styles.css','/game.js','/manifest.webmanifest','/favicon.svg','/icon-192.png'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))]));
});
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==location.origin||url.pathname==='/ws'||url.pathname==='/health')return;
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).catch(()=>caches.match('/index.html')));return;
  }
  if(/\.(?:mp3|m4a|ogg|wav)$/i.test(url.pathname))return;
  if(['/game.js','/styles.css'].includes(url.pathname)){
    event.respondWith(fetch(req).catch(()=>caches.match(req)));return;
  }
  event.respondWith(caches.match(req).then(cached=>{
    const live=fetch(req).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(req,copy));}
      return response;
    }).catch(()=>cached);
    return cached||live;
  }));
});
