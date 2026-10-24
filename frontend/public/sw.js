/* 강원랜드 서비스 워커: 앱 껍데기·화투패 이미지 캐시. 실시간 게임은 소켓이라 오프라인 플레이는 지원하지 않는다. */
const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const STATIC = `static-${VERSION}`;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // API·소켓·업로드·음원(Range 요청)은 항상 네트워크
  if (/^\/(api|socket\.io|uploads)\//.test(url.pathname) || url.pathname.endsWith('.mp3')) return;

  // 페이지 이동: 네트워크 우선, 끊기면 캐시된 껍데기
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // 해시 붙은 빌드 청크·화투패 이미지·아이콘: 캐시 우선 (내용이 바뀌면 이름이 바뀐다)
  if (/^\/(assets|pics|icons|bots)\//.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(STATIC).then((c) => c.put(req, copy));
        }
        return res;
      })),
    );
  }
});
