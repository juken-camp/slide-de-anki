'use strict';
(() => {
  function baseURL(value) {
    if (!value) return '';
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new Error('画像の公開URLは、認証情報・?・#を含まないHTTPSのURLにしてください。');
    }
    return url.href.replace(/\/?$/, '/');
  }
  const base = baseURL(window.NEKO_ASSET_BASE);
  window.NekoImageURL = path => {
    if (!base || !/^(?:assets|images_\d+)\//.test(path)) return path;
    return new URL(path, base).href;
  };
})();
