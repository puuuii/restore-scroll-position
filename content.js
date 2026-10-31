// Webページのスクロール位置を記憶・復元する。
(() => {
  if (window !== window.top) return; // トップフレームのみ扱う

  const SAVED_FLAG = 'scrollMemoryLoaded';

  const key = () => location.href.replace(/#.*$/, ''); // ハッシュは除外(アンカー移動だけだと保存されないようにするため)

  function save() {
    ScrollMemory.save(key(), { x: window.scrollX, y: window.scrollY });
  }

  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }

  async function restore() {
    // bfcache / バック・フォワード再訪問: ブラウザが自動で位置を復元するためスキップ
    const freshLoad = sessionStorage.getItem(SAVED_FLAG) === null;
    sessionStorage.setItem(SAVED_FLAG, '1');
    if (!freshLoad) return;

    const entry = await ScrollMemory.get(key());
    if (!entry || (entry.x === 0 && entry.y === 0)) return;

    // ページ初表示と、画像読み込みなどによるレイアウト確定後で2回適用する
    const apply = () => window.scrollTo(entry.x, entry.y);
    apply();
    if (document.readyState !== 'complete') {
      window.addEventListener('load', apply, { once: true });
    }
  }

  window.addEventListener('scroll', scheduleSave, { passive: true });
  // ページ離脱時(バック/リロード等)にも最終位置を残す
  window.addEventListener('pagehide', () => {
    clearTimeout(saveTimer);
    save();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', restore, { once: true });
  } else {
    restore();
  }
})();
