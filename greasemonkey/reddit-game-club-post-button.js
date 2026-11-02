// ==UserScript==
// @name        PakGameDev Weekly Game Post
// @namespace   https://pakgamedev.com/gameclub
// @version     7.6
// @description Fills weekly Game Dev Club Reddit IMAGE post via r-post-media-input.addFiles
// @author      PakGameDev
// @match       https://www.reddit.com/r/PakGameDev/submit*
// @grant       GM.xmlHttpRequest
// @connect     pakgamedev.com
// @connect     github.com
// @connect     raw.githubusercontent.com
// @connect     shared.fastly.steamstatic.com
// @run-at      document-idle
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '7.6';
  const POST_JSON =
    'https://pakgamedev.com/gameclubactions/reddit-auto-post/post.json';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function gmXhr() {
    if (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function') {
      return GM.xmlHttpRequest;
    }
    if (typeof GM_xmlhttpRequest === 'function') return GM_xmlhttpRequest;
    return null;
  }

  function gmRequest(details) {
    const req = gmXhr();
    if (!req) {
      return Promise.reject(
        new Error(
          'GM.xmlHttpRequest missing. Script header must include @grant GM.xmlHttpRequest and must NOT include @grant none. Delete and reinstall the local .user.js.'
        )
      );
    }
    return new Promise((resolve, reject) => {
      req({
        method: details.method || 'GET',
        url: details.url,
        headers: details.headers,
        responseType: details.responseType,
        overrideMimeType: details.overrideMimeType,
        onload: (res) => resolve(res),
        onerror: () => reject(new Error('GM request failed for ' + details.url)),
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

  function toArrayBuffer(res) {
    if (res.response instanceof ArrayBuffer && res.response.byteLength) {
      return res.response;
    }
    if (typeof res.responseText === 'string' && res.responseText.length) {
      const s = res.responseText;
      const buf = new ArrayBuffer(s.length);
      const view = new Uint8Array(buf);
      for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xff;
      return buf;
    }
    return null;
  }

  async function loadCoverBuffer(url) {
    const res = await gmRequest({
      url,
      responseType: 'arraybuffer',
      overrideMimeType: 'text/plain; charset=x-user-defined',
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error('Cover HTTP ' + res.status + ' for ' + url);
    }
    const buf = toArrayBuffer(res);
    if (!buf || buf.byteLength < 100) {
      throw new Error(
        'Cover download empty/invalid (' +
          (buf ? buf.byteLength : 0) +
          ' bytes). Greasemonkey may have blocked the request.'
      );
    }
    const lower = url.toLowerCase();
    const type =
      lower.includes('.jpg') || lower.includes('.jpeg')
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
    return { buf, type, name, bytes: buf.byteLength };
  }

  function arrayBufferToBase64(buf) {
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(
        null,
        bytes.subarray(i, Math.min(i + chunk, bytes.length))
      );
    }
    return btoa(binary);
  }

  function getMediaHost() {
    return (
      document.querySelector('r-post-media-input#post-composer_media') ||
      document.querySelector('r-post-media-input')
    );
  }

  function mediaPreviewReady(host) {
    if (!host) return false;
    if (typeof host.mediaLength === 'number' && host.mediaLength > 0) return true;
    const root = host.shadowRoot;
    if (!root) return false;
    if ([...root.querySelectorAll('img')].some((i) => i.src?.startsWith('blob:'))) {
      return true;
    }
    const text = (root.textContent || '').toLowerCase();
    return text.includes('remove media');
  }

  function readPageNonce() {
    for (const s of document.querySelectorAll('script')) {
      if (s.nonce) return s.nonce;
    }
    return null;
  }

  /**
   * Reddit CSP blocks eval/Function and sandboxed File fails addFiles.
   * Reuse the page script nonce so an inline script can call addFiles in page JS.
   */
  function attachViaNonceScript(b64, name, type) {
    const nonce = readPageNonce();
    if (!nonce) {
      return Promise.reject(new Error('Could not read Reddit script nonce'));
    }

    const eventName = 'pkgd-cover-done-' + Date.now();
    const holderId = 'pkgd-cover-b64-' + Date.now();

    return new Promise((resolve, reject) => {
      const holder = document.createElement('textarea');
      holder.id = holderId;
      holder.style.display = 'none';
      holder.value = b64;
      document.documentElement.appendChild(holder);

      const cleanup = () => {
        try {
          holder.remove();
        } catch (_) {}
        try {
          script.remove();
        } catch (_) {}
      };

      const timer = setTimeout(() => {
        window.removeEventListener(eventName, onDone);
        cleanup();
        reject(new Error('Nonce script timed out'));
      }, 8000);

      function onDone(ev) {
        clearTimeout(timer);
        window.removeEventListener(eventName, onDone);
        cleanup();
        const detail = ev.detail || {};
        if (detail.error) reject(new Error(detail.error));
        else if (!detail.ok) reject(new Error('addFiles returned false from page script'));
        else resolve(detail);
      }

      window.addEventListener(eventName, onDone);

      const script = document.createElement('script');
      script.nonce = nonce;
      script.textContent =
        '(function(){try{' +
        'var b64=document.getElementById("' +
        holderId +
        '").value;' +
        'var name=' +
        JSON.stringify(name) +
        ';' +
        'var type=' +
        JSON.stringify(type) +
        ';' +
        'var bin=atob(b64);' +
        'var arr=new Uint8Array(bin.length);' +
        'for(var i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);' +
        'var file=new File([arr],name,{type:type});' +
        'var host=document.querySelector("r-post-media-input#post-composer_media")||document.querySelector("r-post-media-input");' +
        'if(!host||typeof host.addFiles!=="function")throw new Error("r-post-media-input.addFiles missing");' +
        'if(typeof host.clear==="function"&&host.mediaLength>0){try{host.clear();}catch(e){}}' +
        'var before=typeof host.mediaLength==="number"?host.mediaLength:0;' +
        'var ret=host.addFiles([file]);' +
        'var after=typeof host.mediaLength==="number"?host.mediaLength:before;' +
        'var ok=ret===true||after>before;' +
        'window.dispatchEvent(new CustomEvent("' +
        eventName +
        '",{detail:{ok:ok,before:before,after:after}}));' +
        '}catch(e){window.dispatchEvent(new CustomEvent("' +
        eventName +
        '",{detail:{error:String(e&&e.message?e.message:e)}}));}})();';

      document.documentElement.appendChild(script);
    });
  }

  async function attachCoverAsImageMedia(imageUrl, setStatus) {
    setStatus('Loading cover…');
    const { buf, type, name, bytes } = await loadCoverBuffer(imageUrl);
    console.log('[PakGameDev]', VERSION, 'cover bytes', bytes);

    setStatus('Finding uploader…');
    const host = await waitFor(getMediaHost, 'r-post-media-input');
    host.scrollIntoView({ block: 'center', behavior: 'instant' });
    await sleep(300);

    setStatus('Attaching cover…');
    const b64 = arrayBufferToBase64(buf);
    const result = await attachViaNonceScript(b64, name, type);
    console.log('[PakGameDev]', VERSION, 'attach result', result);

    await waitFor(() => mediaPreviewReady(host), 'media preview after addFiles', {
      timeout: 8000,
      interval: 250,
    });
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
        alert(
          '[PakGameDev v' +
            VERSION +
            '] ' +
            (err && err.message ? err.message : err)
        );
      }

      setTimeout(() => {
        btn.textContent = 'Weekly Game Post v' + VERSION;
      }, 6000);
    });

    document.body.appendChild(btn);
  }

  const id = setInterval(injectButton, 800);
  setTimeout(() => clearInterval(id), 15000);
  injectButton();
})();
