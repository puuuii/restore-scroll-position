// PDF の表示を自前ビューア(viewer/viewer.html)に置き換え、位置記憶を有効にする。
// Chrome 内蔵 PDF ビューアはクロースオリジンのためコンテンツスクリプトから操作不可。

// ローカルファイル(file://)のPDFのみを対象とする
function isPdfUrl(url) {
  if (!/^file:/i.test(url)) return false;
  try {
    const pathname = new URL(url).pathname;
    return \.pdf$/i.test(pathname);
  } catch {
    return false;
  }
}

chrome.webNavigation.onCompleted.addListener(
  (details) => {
    if (details.frameId !== 0) return;
    const url = details.frameUrl || details.url;
    if (!url || !isPdfUrl(url)) return;

    // リダイクトループ防止(自前ビューアは chrome-extension:// なので本来到達しない)
    if (url.startsWith(chrome.runtime.getURL('viewer/'))) return;

    const viewerUrl =
      chrome.runtime.getURL('viewer/viewer.html') +
      '?src=' + encodeURIComponent(url);
    chrome.tabs.update(details.tabId, { url: viewerUrl }).catch((e) => {
      console.warn('Redirect to PDF viewer failed:', e);
    });
  },
  { type: 'document' }
);
