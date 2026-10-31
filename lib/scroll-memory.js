// スクロール位置の記憶・復元を扱う共有ヘルパー。
// コンテンツスクリプト(lib を js 配列に含める)とビューアページ(<script> で含める)で共用する。
(() => {
  const STORAGE_KEY = 'scrollPositions';
  const MAX_ENTRIES = 300;

  function prune(map) {
    const entries = Object.entries(map);
    if (entries.length <= MAX_ENTRIES) return map;
    return Object.fromEntries(
      entries.sort((a, b) => b[1].ts - a[1].ts).slice(0, MAX_ENTRIES)
    );
  }

  globalThis.ScrollMemory = {
    async get(url) {
      try {
        const map = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || {};
        return map[url];
      } catch {
        return undefined;
      }
    },
    async save(url, position) {
      try {
        const map = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || {};
        const next = prune({ ...map, [url]: { ...position, ts: Date.now() } });
        await chrome.storage.local.set({ [STORAGE_KEY]: next });
      } catch (e) {
        console.warn('Failed to save scroll position:', e);
      }
    },
  };
})();
