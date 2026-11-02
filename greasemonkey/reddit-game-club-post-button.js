// ==UserScript==
// @name         PakGameDev Weekly Game Post
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  Fills weekly Game Dev Club Reddit IMAGE post from post.json (title, optional body, cover as IMAGE media — not inline body paste)
// @author       PakGameDev
// @match        https://www.reddit.com/r/PakGameDev/submit*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const POST_JSON =
    'https://pakgamedev.com/gameclubactions/reddit-auto-post/post.json';

  function deepQueryAll(root, selector) {
    const out = [];
    const visit = (node) => {
      if (!node) return;
      if (node.querySelectorAll) {
        try {
          out.push(...node.querySelectorAll(selector));
        } catch (_) {}
      }
      const children = node.children || [];
      for (const el of children) {
        if (el.shadowRoot) visit(el.shadowRoot);
        visit(el);
      }
      // Also walk open shadow hosts found via querySelectorAll('*')
      if (node.querySelectorAll) {
        for (const el of node.querySelectorAll('*')) {
          if (el.shadowRoot) visit(el.shadowRoot);
        }
      }
    };
    visit(root);
    return out;
  }

  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function findTitleField() {
    const faceplate = document.querySelector('faceplate-textarea-input[name="title"]');
    if (faceplate?.shadowRoot) {
      const inner =
        faceplate.shadowRoot.querySelector('#innerTextArea') ||
        faceplate.shadowRoot.querySelector('textarea');
      if (inner) return inner;
    }
    const direct = deepQueryAll(document, 'textarea[name="title"], input[name="title"]');
    return direct[0] || null;
  }

  function findBodyField() {
    // Optional caption/body on IMAGE posts — keep text only, never paste images here
    const named = deepQueryAll(
      document,
      'div[name="body"][contenteditable="true"], div[contenteditable="true"][role="textbox"]'
    );
    // Prefer optionalBody / caption-like fields if present
    for (const el of named) {
      const host = el.getRootNode()?.host;
      if (host?.getAttribute?.('name') === 'optionalBody') return el;
    }
    return named.find((el) => el.getAttribute('name') === 'body') || named[0] || null;
  }

  function findImageFileInput() {
    const inputs = deepQueryAll(document, 'input[type="file"]');
    const imageInputs = inputs.filter((input) => {
      const accept = (input.getAttribute('accept') || '').toLowerCase();
      return (
        !accept ||
        accept.includes('image') ||
        accept.includes('png') ||
        accept.includes('jpeg') ||
        accept.includes('*')
      );
    });
    // Prefer media-uploader hosts
    for (const input of imageInputs) {
      let node = input;
      for (let i = 0; i < 8 && node; i++) {
        const host = node.getRootNode?.()?.host;
        const tag = (host?.tagName || node.tagName || '').toLowerCase();
        if (
          tag.includes('media') ||
          tag.includes('upload') ||
          tag === 'r-post-media-input' ||
          tag === 'shreddit-media-input'
        ) {
          return input;
        }
        node = host || node.parentElement;
      }
    }
    return imageInputs[0] || null;
  }

  async function clickImagesTab() {
    const candidates = [
      ...deepQueryAll(document, 'button, a, faceplate-tab'),
      ...document.querySelectorAll('button, a'),
    ];
    for (const el of candidates) {
      const label = `${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`.toLowerCase();
      if (
        (label.includes('image') && label.includes('video')) ||
        label.trim() === 'images & video' ||
        label.includes('images and video')
      ) {
        el.click();
        await new Promise((r) => setTimeout(r, 400));
        return true;
      }
    }
    return false;
  }

  async function blobToPngFile(blob, filename) {
    if (blob.type === 'image/png') {
      return new File([blob], filename, { type: 'image/png' });
    }
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    const pngBlob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/png')
    );
    return new File([pngBlob], filename, { type: 'image/png' });
  }

  function assignFileToInput(input, file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    // Some Reddit components listen for these
    input.dispatchEvent(
      new CustomEvent('files-changed', { bubbles: true, detail: { files: dt.files } })
    );
  }

  async function uploadCoverAsImagePost(imageUrl) {
    await clickImagesTab();

    const res = await fetch(imageUrl, { mode: 'cors' });
    if (!res.ok) throw new Error(`Cover fetch failed: ${res.status}`);
    const blob = await res.blob();
    const file = await blobToPngFile(blob, 'weekly-cover.png');

    // Wait briefly for IMAGE composer media input to mount
    let fileInput = null;
    for (let i = 0; i < 20; i++) {
      fileInput = findImageFileInput();
      if (fileInput) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!fileInput) {
      throw new Error('Could not find Reddit IMAGE file input (media uploader)');
    }

    assignFileToInput(fileInput, file);
    console.log('[PakGameDev] Assigned cover to media file input', fileInput);
    return true;
  }

  async function fillText(remoteData) {
    const titleField = findTitleField();
    if (titleField) {
      titleField.focus();
      setNativeValue(titleField, remoteData.title || '');
      // Lexical / React sometimes need insertText
      if (!titleField.value && titleField.contentEditable === 'true') {
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, remoteData.title || '');
      }
    }

    const bodyField = findBodyField();
    if (bodyField && remoteData.body) {
      bodyField.focus();
      if (bodyField.tagName === 'TEXTAREA' || bodyField.tagName === 'INPUT') {
        setNativeValue(bodyField, remoteData.body);
      } else {
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, remoteData.body);
        bodyField.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  function tryEventFlair() {
    const flairBtns = deepQueryAll(
      document,
      'button[aria-label*="flair" i], button[aria-label*="Flair"]'
    );
    const flairBtn =
      flairBtns[0] ||
      Array.from(document.querySelectorAll('button')).find((b) =>
        (b.getAttribute('aria-label') || b.textContent || '')
          .toLowerCase()
          .includes('flair')
      );
    if (!flairBtn) return;
    flairBtn.click();
    let attempts = 0;
    const timer = setInterval(() => {
      const items = deepQueryAll(
        document,
        'faceplate-tracker, faceplate-radio-input, li, [role="menuitem"], label, span, button'
      );
      const eventFlair = items.find((i) =>
        (i.textContent || '').trim().toLowerCase().includes('event')
      );
      if (eventFlair) {
        (eventFlair.closest('label') || eventFlair).click();
        clearInterval(timer);
        setTimeout(() => {
          const applyBtn = Array.from(
            deepQueryAll(document, 'button')
          ).find((b) =>
            /apply|add flair|save/i.test(b.textContent || '')
          );
          applyBtn?.click();
        }, 300);
      }
      if (++attempts >= 25) clearInterval(timer);
    }, 200);
  }

  const injectFloatingButton = () => {
    if (document.getElementById('custom-pkgd-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'custom-pkgd-btn';
    btn.type = 'button';
    btn.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 9999;
      cursor: pointer;
      padding: 12px 20px;
      border-radius: 999px;
      border: none;
      background: #FF4500;
      color: white;
      font-weight: bold;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      font-size: 14px;
    `;
    btn.textContent = 'Weekly Game Post';

    btn.onclick = async (e) => {
      e.preventDefault();
      btn.textContent = 'Working…';

      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('type') !== 'IMAGE') {
        urlParams.set('type', 'IMAGE');
        window.location.search = urlParams.toString();
        return;
      }

      let remoteData = {};
      try {
        const response = await fetch(POST_JSON);
        if (!response.ok) throw new Error(`post.json HTTP ${response.status}`);
        remoteData = await response.json();
      } catch (err) {
        console.error('[PakGameDev] Failed to fetch post.json', err);
        btn.textContent = 'Fetch failed';
        setTimeout(() => { btn.textContent = 'Weekly Game Post'; }, 2000);
        return;
      }

      const imageUrl = remoteData.cover_image || remoteData.header_image;

      try {
        // IMAGE media first — do NOT clipboard-paste into body
        if (imageUrl) {
          await uploadCoverAsImagePost(imageUrl);
        } else {
          console.warn('[PakGameDev] No cover_image/header_image in post.json');
        }

        await fillText(remoteData);
        tryEventFlair();

        btn.textContent = '✅ Applied!';
      } catch (err) {
        console.error('[PakGameDev] Fill failed', err);
        btn.textContent = 'Image failed — see console';
        // Still fill text so the post isn't empty
        try {
          await fillText(remoteData);
        } catch (_) {}
      }

      setTimeout(() => {
        btn.textContent = 'Weekly Game Post';
      }, 2500);
    };

    document.body.appendChild(btn);
  };

  const retry = setInterval(injectFloatingButton, 1000);
  setTimeout(() => clearInterval(retry), 15000);
})();
