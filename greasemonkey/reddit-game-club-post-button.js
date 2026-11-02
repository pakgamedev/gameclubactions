// ==UserScript==
// @name         PakGameDev Weekly Game Post
// @namespace    http://tampermonkey.net/
// @version      5.1
// @description  Fills weekly Game Dev Club Reddit IMAGE post from post.json (title/body text + cover as IMAGE media)
// @author       PakGameDev
// @match        https://www.reddit.com/r/PakGameDev/submit*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const POST_JSON =
    'https://pakgamedev.com/gameclubactions/reddit-auto-post/post.json';

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** One-pass shadow walk with visited set — does not re-scan every subtree. */
  function queryAllDeep(selector, root = document) {
    const results = [];
    const seen = new Set();
    const stack = [root];

    while (stack.length) {
      const node = stack.pop();
      if (!node || seen.has(node)) continue;
      seen.add(node);

      try {
        if (node.querySelectorAll) {
          node.querySelectorAll(selector).forEach((el) => results.push(el));
          node.querySelectorAll('*').forEach((el) => {
            if (el.shadowRoot && !seen.has(el.shadowRoot)) {
              stack.push(el.shadowRoot);
            }
          });
        }
      } catch (_) {}

      if (node.shadowRoot && !seen.has(node.shadowRoot)) {
        stack.push(node.shadowRoot);
      }
    }
    return results;
  }

  function setNativeValue(el, value) {
    const proto =
      el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function findTitleField() {
    const faceplate = document.querySelector(
      'faceplate-textarea-input[name="title"]'
    );
    if (faceplate?.shadowRoot) {
      return (
        faceplate.shadowRoot.querySelector('#innerTextArea') ||
        faceplate.shadowRoot.querySelector('textarea')
      );
    }
    return (
      document.querySelector('textarea[name="title"]') ||
      queryAllDeep('textarea[name="title"]')[0] ||
      null
    );
  }

  function findBodyField() {
    // Optional caption on IMAGE posts
    const optional = document.querySelector(
      'shreddit-composer[name="optionalBody"]'
    );
    if (optional?.shadowRoot) {
      const ed = optional.shadowRoot.querySelector(
        'div[contenteditable="true"]'
      );
      if (ed) return ed;
    }
    return (
      document.querySelector('div[name="body"][contenteditable="true"]') ||
      queryAllDeep('div[name="body"][contenteditable="true"]')[0] ||
      null
    );
  }

  function findImageFileInput() {
    // Prefer known media hosts first (cheap)
    const hosts = [
      ...document.querySelectorAll(
        'r-post-media-input, shreddit-media-input, faceplate-file-input'
      ),
    ];
    for (const host of hosts) {
      const input =
        host.shadowRoot?.querySelector('input[type="file"]') ||
        host.querySelector?.('input[type="file"]');
      if (input) return input;
    }

    // Fallback: one deep pass for file inputs that accept images
    const inputs = queryAllDeep('input[type="file"]');
    return (
      inputs.find((input) => {
        const accept = (input.getAttribute('accept') || '').toLowerCase();
        return (
          !accept ||
          accept.includes('image') ||
          accept.includes('png') ||
          accept.includes('jpeg') ||
          accept.includes('*')
        );
      }) || null
    );
  }

  async function ensureImageTab() {
    // Already on IMAGE submit URL — only click tab if needed
    const tabs = [
      ...document.querySelectorAll('button, a, [role="tab"]'),
    ];
    for (const el of tabs) {
      const label = `${el.getAttribute('aria-label') || ''} ${
        el.textContent || ''
      }`
        .trim()
        .toLowerCase();
      if (
        label === 'images & video' ||
        label === 'image & video' ||
        (label.includes('images') && label.includes('video'))
      ) {
        const selected =
          el.getAttribute('aria-selected') === 'true' ||
          el.getAttribute('aria-current') === 'page';
        if (!selected) {
          el.click();
          await sleep(500);
        }
        return;
      }
    }
  }

  async function toPngFile(blob, name) {
    if (blob.type === 'image/png') {
      return new File([blob], name, { type: 'image/png' });
    }
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    canvas.getContext('2d').drawImage(bmp, 0, 0);
    const png = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/png')
    );
    return new File([png], name, { type: 'image/png' });
  }

  function assignFile(input, file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function uploadCover(imageUrl, onStatus) {
    onStatus?.('Fetching cover…');
    const res = await fetch(imageUrl, { mode: 'cors' });
    if (!res.ok) throw new Error(`Cover fetch HTTP ${res.status}`);
    const file = await toPngFile(await res.blob(), 'weekly-cover.png');

    onStatus?.('Looking for uploader…');
    await ensureImageTab();

    let input = null;
    for (let i = 0; i < 15; i++) {
      input = findImageFileInput();
      if (input) break;
      await sleep(250);
    }
    if (!input) {
      throw new Error('IMAGE media file input not found');
    }

    onStatus?.('Attaching cover…');
    assignFile(input, file);
    console.log('[PakGameDev] Cover assigned to', input);
  }

  async function fillText(data) {
    const title = findTitleField();
    if (title) {
      title.focus();
      if (title.tagName === 'TEXTAREA' || title.tagName === 'INPUT') {
        setNativeValue(title, data.title || '');
      } else {
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, data.title || '');
      }
    }

    const body = findBodyField();
    if (body && data.body) {
      body.focus();
      if (body.tagName === 'TEXTAREA' || body.tagName === 'INPUT') {
        setNativeValue(body, data.body);
      } else {
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, data.body);
        body.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  function injectButton() {
    if (document.getElementById('custom-pkgd-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'custom-pkgd-btn';
    btn.type = 'button';
    btn.textContent = 'Weekly Game Post';
    btn.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 9999;
      cursor: pointer; padding: 12px 20px; border-radius: 999px; border: none;
      background: #FF4500; color: #fff; font-weight: bold; font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;

    btn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const params = new URLSearchParams(location.search);
      if (params.get('type') !== 'IMAGE') {
        params.set('type', 'IMAGE');
        location.search = params.toString();
        return;
      }

      const setStatus = (t) => {
        btn.textContent = t;
      };

      try {
        setStatus('Loading…');
        const res = await fetch(POST_JSON);
        if (!res.ok) throw new Error(`post.json HTTP ${res.status}`);
        const data = await res.json();
        const imageUrl = data.cover_image || data.header_image;

        // Upload media first (never paste image into body)
        if (imageUrl) {
          await uploadCover(imageUrl, setStatus);
        }

        setStatus('Filling text…');
        await fillText(data);

        setStatus('✅ Done');
      } catch (err) {
        console.error('[PakGameDev]', err);
        setStatus('Failed — see console');
      }

      setTimeout(() => {
        btn.textContent = 'Weekly Game Post';
      }, 2500);
    };

    document.body.appendBtn
      ? document.body.appendChild(btn)
      : document.documentElement.appendChild(btn);
  }

  const id = setInterval(injectButton, 1000);
  setTimeout(() => clearInterval(id), 12000);
  injectButton();
})();
