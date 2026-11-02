// ==UserScript==
// @name        PakGameDev Weekly Game Post
// @namespace   https://pakgamedev.com/gameclub
// @version     7.3
// @description Fills weekly Game Dev Club Reddit IMAGE post (cover drop onto r-post-media-input)
// @author      PakGameDev
// @match       https://www.reddit.com/r/PakGameDev/submit*
// @grant       GM.xmlHttpRequest
// @connect     pakgamedev.com
// @connect     github.com
// @connect     raw.githubusercontent.com
// @run-at      document-idle
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '7.3';
  const POST_JSON =
    'https://pakgamedev.com/gameclubactions/reddit-auto-post/post.json';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Greasemonkey 4: GM.xmlHttpRequest (cross-origin; page XHR is blocked). */
  function gmRequest(details) {
    const req =
      typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function'
        ? GM.xmlHttpRequest
        : typeof GM_xmlhttpRequest === 'function'
          ? GM_xmlhttpRequest
          : null;
    if (!req) {
      return Promise.reject(
        new Error(
          'GM.xmlHttpRequest missing. In Greasemonkey, edit the script header so it has: // @grant GM.xmlHttpRequest (and remove @grant none). Then reinstall.'
        )
      );
    }
    return new Promise((resolve, reject) => {
      req({
        ...details,
        onload: (res) => resolve(res),
        onerror: (res) =>
          reject(
            new Error(
              'GM request failed' +
                (res && res.status ? ' HTTP ' + res.status : '') +
                ' for ' +
                details.url
            )
          ),
        ontimeout: () => reject(new Error('GM request timeout for ' + details.url)),
      });
    });
  }

  function waitFor(getter, label, { timeout = 15000, interval = 200 } = {}) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      (function tick() {
        let v = null;
        try {
          v = getter();
        } catch (_) {}
        if (v) return resolve(v);
        if (Date.now() - start > timeout) {
          return reject(new Error('Timed out: ' + label));
        }
        setTimeout(tick, interval);
      })();
    });
  }

  async function gmJson(url) {
    const res = await gmRequest({
      method: 'GET',
      url,
      headers: { Accept: 'application/json' },
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error('HTTP ' + res.status + ' for ' + url);
    }
    try {
      return JSON.parse(res.responseText);
    } catch (_) {
      throw new Error('Invalid JSON from ' + url);
    }
  }

  async function loadCoverFile(url) {
    const res = await gmRequest({
      method: 'GET',
      url,
      responseType: 'arraybuffer',
      overrideMimeType: 'text/plain; charset=x-user-defined',
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error('Cover HTTP ' + res.status + ' for ' + url);
    }
    const buf = res.response;
    if (!buf || !(buf instanceof ArrayBuffer) || buf.byteLength < 100) {
      throw new Error('Cover download empty/invalid (' + (buf && buf.byteLength) + ' bytes)');
    }
    const lower = url.toLowerCase();
    const type = lower.includes('.jpg') || lower.includes('.jpeg')
      ? 'image/jpeg'
      : lower.includes('.webp')
        ? 'image/webp'
        : 'image/png';
    const name =
      type === 'image/jpeg'
        ? 'weekly-cover.jpg'
        : type === 'image/webp'
          ? 'weekly-cover.webp'
          : 'weekly-cover.png';
    return new File([buf], name, { type });
  }

  function makeDataTransfer(file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    return dt;
  }

  /** Force dataTransfer onto the event; constructor args are often ignored. */
  function dispatchDrop(el, file) {
    const dt = makeDataTransfer(file);
    for (const type of ['dragenter', 'dragover', 'drop']) {
      let ev;
      try {
        ev = new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
        });
      } catch (_) {
        ev = new Event(type, { bubbles: true, cancelable: true, composed: true });
      }
      try {
        Object.defineProperty(ev, 'dataTransfer', {
          configurable: true,
          get: () => dt,
        });
      } catch (_) {}
      el.dispatchEvent(ev);
    }
  }

  function assignInputFiles(input, file) {
    const dt = makeDataTransfer(file);
    try {
      input.files = dt.files;
    } catch (_) {}
    try {
      Object.defineProperty(input, 'files', {
        configurable: true,
        get: () => dt.files,
      });
    } catch (_) {}
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  function mediaAttached(root) {
    if (!root) return false;
    if ([...root.querySelectorAll('img')].some((i) => i.src?.startsWith('blob:'))) {
      return true;
    }
    const text = (root.textContent || '').toLowerCase();
    if (text.includes('remove media') || text.includes('edit media')) return true;
    const input = root.querySelector('input.file-input, input[type=file]');
    return !!(input && input.files && input.files.length);
  }

  async function attachCoverAsImageMedia(imageUrl, setStatus) {
    setStatus('Loading cover…');
    const file = await loadCoverFile(imageUrl);
    console.log('[PakGameDev]', VERSION, 'cover bytes', file.size);

    setStatus('Finding uploader…');
    const host = await waitFor(
      () =>
        document.querySelector('r-post-media-input#post-composer_media') ||
        document.querySelector('r-post-media-input'),
      'r-post-media-input (scroll down if needed: media dropzone under the body)'
    );
    host.scrollIntoView({ block: 'center', behavior: 'instant' });
    await sleep(350);

    const root = host.shadowRoot;
    if (!root) throw new Error('r-post-media-input has no shadowRoot');

    const dropTarget =
      root.querySelector('#fileInputInnerWrapper') ||
      root.querySelector('#inputInfo') ||
      root.querySelector('button.upload-media') ||
      host;
    const fileInput = root.querySelector('input.file-input, input[type="file"]');

    setStatus('Attaching cover…');

    dispatchDrop(dropTarget, file);
    await sleep(500);
    if (mediaAttached(root)) return;

    if (fileInput) {
      assignInputFiles(fileInput, file);
      await sleep(500);
      if (mediaAttached(root)) return;
    }

    dispatchDrop(host, file);
    await sleep(500);
    if (mediaAttached(root)) return;

    const uploadBtn = root.querySelector('#device-upload-button, button.upload-media');
    if (uploadBtn && fileInput) {
      uploadBtn.click();
      await sleep(200);
      assignInputFiles(fileInput, file);
      await sleep(700);
      if (mediaAttached(root)) return;
    }

    try {
      await waitFor(() => mediaAttached(root), 'media preview', {
        timeout: 4000,
        interval: 250,
      });
    } catch (_) {
      throw new Error(
        'Cover did not stick on the IMAGE media slot. Confirm URL has type=IMAGE and you can see “Drag and Drop or upload media” under the body.'
      );
    }
  }

  function getTitleTextarea() {
    return (
      document
        .querySelector('post-composer-title[name="title"]')
        ?.shadowRoot?.querySelector('textarea') ||
      document
        .querySelector('faceplate-textarea-input[name="title"]')
        ?.shadowRoot?.querySelector('textarea#innerTextArea, textarea') ||
      document
        .querySelector('faceplate-textarea-input')
        ?.shadowRoot?.querySelector('textarea#innerTextArea, textarea') ||
      document.querySelector('textarea[name="title"]')
    );
  }

  function getBodyEditor() {
    return (
      document
        .querySelector('shreddit-composer[name="optionalBody"]')
        ?.querySelector('div[contenteditable="true"]') ||
      document
        .querySelector('shreddit-composer[name="body"]')
        ?.querySelector('div[contenteditable="true"]') ||
      document.querySelector('div[name="body"][contenteditable="true"]')
    );
  }

  function setNativeValue(el, value) {
    const proto =
      el.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
    if (el.value !== value) el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function fillText(data) {
    const title = await waitFor(getTitleTextarea, 'title field', {
      timeout: 8000,
    }).catch(() => null);
    if (title) {
      title.focus();
      setNativeValue(title, (data.title || '').slice(0, 300));
    }

    const body = getBodyEditor();
    if (body && data.body) {
      body.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, data.body);
      body.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function injectButton() {
    if (document.getElementById('custom-pkgd-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'custom-pkgd-btn';
    btn.type = 'button';
    btn.title = 'PakGameDev Weekly Game Post v' + VERSION;
    btn.textContent = 'Weekly Game Post v' + VERSION;
    btn.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 99999;
      cursor: pointer; padding: 12px 20px; border-radius: 999px; border: none;
      background: #FF4500; color: #fff; font-weight: bold; font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.35);
    `;

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const params = new URLSearchParams(location.search);
      if ((params.get('type') || '').toUpperCase() !== 'IMAGE') {
        params.set('type', 'IMAGE');
        location.search = params.toString();
        return;
      }

      const setStatus = (t) => {
        btn.textContent = t;
      };

      try {
        setStatus('Loading…');
        const data = await gmJson(POST_JSON + '?cb=' + Date.now());
        const imageUrl = data.cover_image || data.header_image;
        if (!imageUrl) throw new Error('No cover_image in post.json');

        await attachCoverAsImageMedia(imageUrl, setStatus);
        setStatus('Filling text…');
        await fillText(data);
        setStatus('Done - review & post');
      } catch (err) {
        console.error('[PakGameDev]', err);
        setStatus('Failed - see console');
        alert('[PakGameDev v' + VERSION + '] ' + (err && err.message ? err.message : err));
      }

      setTimeout(() => {
        btn.textContent = 'Weekly Game Post v' + VERSION;
      }, 5000);
    });

    document.body.appendChild(btn);
  }

  const id = setInterval(injectButton, 800);
  setTimeout(() => clearInterval(id), 15000);
  injectButton();
})();
