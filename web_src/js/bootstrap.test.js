import {appendAssetVersionToAssetUrl, initWebpackChunkCacheBusting, showGlobalErrorMessage} from './bootstrap.js';

test('showGlobalErrorMessage', () => {
  document.body.innerHTML = '<div class="page-content"></div>';
  showGlobalErrorMessage('test msg 1');
  showGlobalErrorMessage('test msg 2');
  showGlobalErrorMessage('test msg 1'); // duplicated

  expect(document.body.innerHTML).toContain('>test msg 1 (2)<');
  expect(document.body.innerHTML).toContain('>test msg 2<');
  expect(document.querySelectorAll('.js-global-error').length).toEqual(2);
});

test('appendAssetVersionToAssetUrl appends version before url hash', () => {
  expect(appendAssetVersionToAssetUrl('js/datahub-pull-page.14ed060c.js', 'v1')).toEqual('js/datahub-pull-page.14ed060c.js?v=v1');
  expect(appendAssetVersionToAssetUrl('js/chunk.js?lang=en#section', 'v1')).toEqual('js/chunk.js?lang=en&v=v1#section');
  expect(appendAssetVersionToAssetUrl('js/chunk.js?v=v1', 'v2')).toEqual('js/chunk.js?v=v1');
});

test('initWebpackChunkCacheBusting adds asset version to async js and css chunks', () => {
  const runtime = {
    u: (chunkId) => `js/${chunkId}.abcdef12.js`,
    miniCssF: (chunkId) => `css/${chunkId}.abcdef12.css`,
  };

  initWebpackChunkCacheBusting(runtime, 'asset-version');

  expect(runtime.u('datahub-pull-page')).toEqual('js/datahub-pull-page.abcdef12.js?v=asset-version');
  expect(runtime.miniCssF('datahub-pull-page')).toEqual('css/datahub-pull-page.abcdef12.css?v=asset-version');
});
