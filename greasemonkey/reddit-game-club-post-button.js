// ==UserScript==
// @name         PakGameDev Weekly Game Post
// @namespace    http://tampermonkey.net/
// @version      7.2
// @description  Fills weekly Game Dev Club Reddit IMAGE post (cover drop onto r-post-media-input)
// @author       PakGameDev
// @match        https://www.reddit.com/r/PakGameDev/submit*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '7.2';
  const POST_JSON =
    'https://pakgamedev.com/gameclubactions/reddit-auto-post/post.json';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  /** Reddit patches fetch(); XHR still works for CORS JSON. */
  function xhrJson(url) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.responseType = 'json';
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
          resolve(xhr.response);
        } else reject(new Error('HTTP ' + xhr.status + ' for ' + url));
      };
      xhr.onerror = () => reject(new Error('Network error for ' + url));
      xhr.send();
    });
  }

  /** Reddit patches fetch(); Image+canvas bypasses that for the cover. */
  async function loadCoverFile(url) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Cover image failed to load (CORS/network)'));
      img.src = url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now();
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
    });
    return new File([blob], 'weekly-cover.png', { type: 'image/png' });
  }

  function makeDataTransfer(file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    return dt;
  }

  /** Force dataTransfer onto the event — constructor args are often ignored. */
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
      'r-post-media-input (scroll down if needed — media dropzone under the body)'
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
        const data = await xhrJson(POST_JSON + '?cb=' + Date.now());
        const imageUrl = data.cover_image || data.header_image;
        if (!imageUrl) throw new Error('No cover_image in post.json');

        await attachCoverAsImageMedia(imageUrl, setStatus);
        setStatus('Filling text…');
        await fillText(data);
        setStatus('✅ Done — review & post');
      } catch (err) {
        console.error('[PakGameDev]', err);
        setStatus('Failed — see console');
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
