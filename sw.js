// キャッシュの名前 (★ v2 に更新)
const CACHE_NAME = 'car-dispatch-app-cache-v2';

// オフライン用にキャッシュするファイルのリスト
// ★ 新しいファイル (master.html, db.js) を追加
const urlsToCache = [
  '.', // index.html (start_urlと合わせる)
  './index.html', // 明示的にindex.htmlも指定
  './master.html', // マスター管理ページ
  './db.js', // IndexedDBヘルパー
  './manual.html' // マニュアルページ
];

// 1. インストールイベント
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache:', CACHE_NAME);
        // 指定されたリソースをキャッシュに追加
        return cache.addAll(urlsToCache);
      })
  );
});

// 2. フェッチイベント
self.addEventListener('fetch', event => {
  // Tailwind CDNやPlacehold.coへのリクエストは、常にネットワークから取得します（キャッシュしない）
  if (event.request.url.includes('cdn.tailwindcss.com') || event.request.url.includes('placehold.co')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // それ以外のリクエストは「キャッシュファースト」戦略
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // キャッシュに一致するものがあれば、それを返す
        if (response) {
          return response;
        }
        // キャッシュになければ、ネットワークからフェッチして返す
        return fetch(event.request).catch(err => {
            // オフラインでキャッシュにもない場合のフォールバック
            // (今回は特に指定しないが、オフラインページを見せることも可能)
            console.error('Fetch failed; returning offline page instead.', err);
        });
      })
  );
});

// 3. アクティベートイベント
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME]; // 保持するキャッシュ名 (v2)
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // ホワイトリストに含まれていない古いキャッシュ (v1など) は削除
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

