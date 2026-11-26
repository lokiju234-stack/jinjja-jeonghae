// 얘들아 이제는 진짜 정해야해 — 서비스 워커
// 항상 네트워크를 먼저 쓰고(최신 화면 보장), 인터넷이 끊겼을 때만 저장해 둔 화면을 보여 줍니다.
// 로그인·데이터 요청(supabase.co)은 건드리지 않습니다.
const CACHE = 'eb-shell-v1';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('/') : Response.error())))
  );
});
