// ==UserScript==
// @name         PakGameDev Weekly Game Post
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  Fills weekly Game Dev Club Reddit IMAGE post: title/body text + cover via r-post-media-input (not body paste)
// @author       PakGameDev
// @match        https://www.reddit.com/r/PakGameDev/submit*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const POST_JSON =
    'https://pakgamedev.com/gameclubactions/reddit-auto-post/post.json';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function waitFor(getter, { timeout = 12000, interval = 200 } = {}) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        let value;
        try {
          value = getter();
        } catch (_) {
          value = null;
        }
        if (value) return resolve(value);
        if (Date.now() - start > timeout) {
          return reject(new Error('waitFor timed out'));
        }
        setTimeout(tick, interval);
      };
      tick();
    });
  }

  async function clickImagesAndVideoTab() {
    // Proven path from MultiPost: r-post-type-select → tablist → 2nd tab
    const select = document.querySelector('r-post-type-select');
    const tablist = select?.shadowRoot?.querySelector('div[role="tablist"]');
    const trackers = tablist?.querySelectorAll('faceplate-tracker');
    if (trackers && trackers.length > 1) {
      const btn = trackers[1].querySelector('button');
      if (btn) {
        btn.click();
        await sleep(800);
        return true;
      }
    }

    // Fallback: visible tab buttons
    for (const el of document.querySelectorAll('button,[role="tab"]')) {
      const label = `${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`
        .trim()
        .toLowerCase();
      if (label.includes('image') && label.includes('video')) {
        el.click();
        await sleep(800);
        return true;
      }
    }
    return false;
  }

  function getMediaFileInput() {
    // MultiPost path — host is in light DOM, input in open shadowRoot
    const host = document.querySelector('r-post-media-input');
    const input = host?.shadowRoot?.querySelector('input[type="file"], input');
    if (input) return input;

    const alt = document.querySelector('shreddit-media-input, faceplate-file-input');
    return (
      alt?.shadowRoot?.querySelector('input[type="file"], input') || null
    );
  }

  function getTitleTextarea() {
    const modern =
      document
        .querySelector('post-composer-title[name="title"]')
        ?.shadowRoot?.querySelector('textarea') ||
      document
        .querySelector('faceplate-textarea-input[name="title"]')
        ?.shadowRoot?.querySelector('textarea#innerTextArea, textarea') ||
      document
        .querySelector('faceplate-textarea-input')
        ?.shadowRoot?.querySelector('textarea#innerTextArea, textarea');
    return modern || document.querySelector('textarea[name="title"]');
  }

  function getOptionalBodyEditor() {
    // IMAGE posts often have an optional caption composer — text only
    return (
      document
        .querySelector('shreddit-composer[name="optionalBody"]')
        ?.querySelector('div[contenteditable="true"]') ||
      document
        .querySelector('shreddit-composer[name="optionalBody"]')
        ?.shadowRoot?.querySelector('div[contenteditable="true"]') ||
      document.querySelector(
        'faceplate-form-section[name="type"] shreddit-composer[name="body"] div[contenteditable="true"]'
      ) ||
      null
    );
  }

  function setInputValue(el, value) {
    const proto =
      el.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    desc?.set?.call(el, value);
    if (el.value !== value) el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function fetchCoverFile(url) {
    const res = await fetch(url, { mode: 'cors', cache: 'no-cache' });
    if (!res.ok) throw new Error(`Cover fetch failed: HTTP ${res.status}`);
    const blob = await res.blob();
    // Keep original type when possible; Reddit accepts png/jpeg
    const type = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/png';
    const ext = type.includes('jpeg') || type.includes('jpg') ? 'jpg' : 'png';
    if (type === 'image/png' || type === 'image/jpeg' || type === 'image/jpg') {
      return new File([blob], `weekly-cover.${ext}`, { type: type === 'image/jpg' ? 'image/jpeg' : type });
    }
    // Convert odd types to PNG
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    canvas.getContext('2d').drawImage(bmp, 0, 0);
    const png = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    return new File([png], 'weekly-cover.png', { type: 'image/png' });
  }

  function assignFiles(input, file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function dropFileOnMediaHost(file) {
    const host =
      document.querySelector('r-post-media-input') ||
      document.querySelector('[data-testid="media-input"]') ||
      document.querySelector('shreddit-media-input');
    if (!host) return false;

    const dt = new DataTransfer();
    dt.items.add(file);
    for (const type of ['dragenter', 'dragover', 'drop']) {
      host.dispatchEvent(
        new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        })
      );
    }
    return true;
  }

  async function uploadCover(imageUrl, setStatus) {
    setStatus('Images tab…');
    await clickImagesAndVideoTab();

    setStatus('Fetching cover…');
    const file = await fetchCoverFile(imageUrl);

    setStatus('Waiting for uploader…');
    const input = await waitFor(getMediaFileInput, {
      timeout: 15000,
      interval: 250,
    });

    setStatus('Attaching cover…');
    assignFiles(input, file);

    // Give Reddit a moment; if preview never appears, try drop fallback
    await sleep(600);
    const preview =
      document.querySelector('img[alt*="uploaded" i], img[src^="blob:"], shreddit-aspect-ratio img') ||
      document.querySelector('r-post-media-input img');
    if (!preview) {
      console.warn('[PakGameDev] No preview yet — trying drop event fallback');
      await dropFileOnMediaHost(file);
      await sleep(600);
    }
  }

  async function fillTitleAndBody(data) {
    const title = await waitFor(getTitleTextarea, { timeout: 8000 }).catch(
      () => null
    );
    if (title) {
      title.focus();
      setInputValue(title, (data.title || '').slice(0, 300));
    } else {
      console.warn('[PakGameDev] Title field not found');
    }

    // Optional caption — TEXT ONLY. Never paste image blobs here.
    const body = getOptionalBodyEditor();
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
    btn.textContent = 'Weekly Game Post';
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
        const res = await fetch(POST_JSON, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`post.json HTTP ${res.status}`);
        const data = await res.json();
        const imageUrl = data.cover_image || data.header_image;
        if (!imageUrl) throw new Error('No cover_image in post.json');

        await uploadCover(imageUrl, setStatus);
        setStatus('Filling text…');
        await fillTitleAndBody(data);
        setStatus('✅ Done — review & post');
      } catch (err) {
        console.error('[PakGameDev]', err);
        setStatus('Failed — see console');
      }

      setTimeout(() => {
        btn.textContent = 'Weekly Game Post';
      }, 4000);
    });

    document.body.appendChild(btn);
  }

  const id = setInterval(injectButton, 800);
  setTimeout(() => clearInterval(id), 15000);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButton);
  } else {
    injectButton();
  }
})();
