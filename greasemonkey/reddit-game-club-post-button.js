// ==UserScript==
// @name        PakGameDev Weekly Game Post
// @namespace   https://pakgamedev.com/gameclub
// @version     7.9
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

  const VERSION = '7.9';
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

  function getMediaHost() {
    return (
      document.querySelector('r-post-media-input#post-composer_media') ||
      document.querySelector('r-post-media-input')
    );
  }

  function mediaPreviewReady(host) {
    if (!host) return false;
    try {
      if (host._mediaController && host._mediaController.media.length > 0) {
        return true;
      }
    } catch (_) {}
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
   * Modern Reddit composer keeps type=TEXT even when the URL says type=IMAGE.
   * Media uploads then sit on a 0x0 hidden slot. Force IMAGE so the dropzone shows.
   */
  function forceImagePostTypeInPage() {
    const nonce = readPageNonce();
    if (!nonce) return Promise.reject(new Error('Could not read Reddit script nonce'));

    const eventName = 'pkgd-type-done-' + Date.now();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener(eventName, onDone);
        reject(new Error('Switching to IMAGE type timed out'));
      }, 10000);

      function onDone(ev) {
        clearTimeout(timer);
        window.removeEventListener(eventName, onDone);
        try {
          script.remove();
        } catch (_) {}
        const detail = ev.detail || {};
        if (detail.error) reject(new Error(detail.error));
        else resolve(detail);
      }

      window.addEventListener(eventName, onDone);
      const script = document.createElement('script');
      script.nonce = nonce;
      script.textContent =
        '(async function(){' +
        'var eventName=' +
        JSON.stringify(eventName) +
        ';' +
        'function done(d){window.dispatchEvent(new CustomEvent(eventName,{detail:d}));}' +
        'try{' +
        'var typeInput=document.getElementById("post-composer_type");' +
        'if(!typeInput)throw new Error("post-composer_type missing");' +
        'var desc=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value");' +
        'desc.set.call(typeInput,"IMAGE");' +
        'typeInput.dispatchEvent(new Event("input",{bubbles:true,composed:true}));' +
        'typeInput.dispatchEvent(new Event("change",{bubbles:true,composed:true}));' +
        'var host=document.querySelector("r-post-media-input#post-composer_media")||document.querySelector("r-post-media-input");' +
        'var visible=false; var h=0;' +
        'for(var i=0;i<20;i++){' +
        'await new Promise(function(r){setTimeout(r,150);});' +
        'if(typeInput.value!=="IMAGE")desc.set.call(typeInput,"IMAGE");' +
        'h=host?host.getBoundingClientRect().height:0;' +
        'if(h>40){visible=true;break;}' +
        '}' +
        'if(host)host.scrollIntoView({block:"center",behavior:"instant"});' +
        'done({ok:true,type:typeInput.value,mediaHeight:h,visible:visible});' +
        '}catch(e){done({error:String(e&&e.message?e.message:e)});}' +
        '})();';
      document.documentElement.appendChild(script);
    });
  }

  /**
   * Load the cover in page JS (Image + canvas) and call addFiles there.
   * Avoids Greasemonkey binary/File compartment issues. Uses Reddit's script nonce
   * so the inline script is allowed by CSP.
   */
  function attachCoverInPage(imageUrl) {
    const nonce = readPageNonce();
    if (!nonce) {
      return Promise.reject(new Error('Could not read Reddit script nonce'));
    }

    const eventName = 'pkgd-cover-done-' + Date.now();
    const url = imageUrl + (imageUrl.includes('?') ? '&' : '?') + 'cb=' + Date.now();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener(eventName, onDone);
        reject(new Error('Page cover attach timed out'));
      }, 25000);

      function onDone(ev) {
        clearTimeout(timer);
        window.removeEventListener(eventName, onDone);
        try {
          script.remove();
        } catch (_) {}
        const detail = ev.detail || {};
        if (detail.error) reject(new Error(detail.error));
        else if (!detail.ok) {
          reject(
            new Error(
              'Cover did not stick (ctrl=' +
                detail.afterCtrl +
                ', value=' +
                detail.hasValue +
                ', type=' +
                detail.type +
                ', mediaH=' +
                detail.mediaHeight +
                ')'
            )
          );
        } else resolve(detail);
      }

      window.addEventListener(eventName, onDone);

      const script = document.createElement('script');
      script.nonce = nonce;
      // Keep this self-contained page JS. No userscript APIs.
      script.textContent =
        '(async function(){' +
        'var eventName=' +
        JSON.stringify(eventName) +
        ';' +
        'function done(detail){window.dispatchEvent(new CustomEvent(eventName,{detail:detail}));}' +
        'try{' +
        'var url=' +
        JSON.stringify(url) +
        ';' +
        'var typeInput=document.getElementById("post-composer_type");' +
        'var desc=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value");' +
        'function forceImage(){if(!typeInput)return; desc.set.call(typeInput,"IMAGE"); typeInput.dispatchEvent(new Event("input",{bubbles:true,composed:true})); typeInput.dispatchEvent(new Event("change",{bubbles:true,composed:true}));}' +
        'forceImage();' +
        'var host=document.querySelector("r-post-media-input#post-composer_media")||document.querySelector("r-post-media-input");' +
        'if(!host||typeof host.addFiles!=="function")throw new Error("r-post-media-input.addFiles missing");' +
        'for(var wait=0; wait<20; wait++){ if(host.getBoundingClientRect().height>40)break; forceImage(); await new Promise(function(r){setTimeout(r,150);}); }' +
        'var img=new Image();' +
        'img.crossOrigin="anonymous";' +
        'await new Promise(function(res,rej){img.onload=res;img.onerror=function(){rej(new Error("Cover image failed to load"));};img.src=url;});' +
        'if(!img.naturalWidth)throw new Error("Cover image has no dimensions");' +
        'var c=document.createElement("canvas");' +
        'c.width=img.naturalWidth;c.height=img.naturalHeight;' +
        'c.getContext("2d").drawImage(img,0,0);' +
        'var blob=await new Promise(function(res,rej){c.toBlob(function(b){b?res(b):rej(new Error("toBlob failed"));},"image/png");});' +
        'var file=new File([blob],"weekly-cover.png",{type:"image/png"});' +
        'forceImage();' +
        'host.scrollIntoView({block:"center",behavior:"instant"});' +
        'var before=host._mediaController?host._mediaController.media.length:0;' +
        'if(before>0&&typeof host.clear==="function"){try{host.clear();}catch(e){} await new Promise(function(r){setTimeout(r,400);}); before=host._mediaController?host._mediaController.media.length:0;}' +
        'var ret=host.addFiles([file]);' +
        'var ready=false; var afterCtrl=0; var hasValue=false; var status="";' +
        'for(var i=0;i<60;i++){' +
        'await new Promise(function(r){setTimeout(r,250);});' +
        'forceImage();' +
        'afterCtrl=host._mediaController?host._mediaController.media.length:0;' +
        'var item=host._mediaController&&host._mediaController.media[0];' +
        'status=item&&item.status||"";' +
        'hasValue=!!(host.value&&host.value!=="[]");' +
        'if(afterCtrl>0&&(hasValue||status==="success")){ready=true;break;}' +
        'if(afterCtrl===0&&i>8)break;' +
        '}' +
        'forceImage();' +
        'var mediaHeight=host.getBoundingClientRect().height;' +
        'done({ok:ready&&mediaHeight>40,ret:!!ret,before:before,afterCtrl:afterCtrl,hasValue:hasValue,status:status,type:typeInput?typeInput.value:null,mediaHeight:mediaHeight,bytes:blob.size,w:img.naturalWidth,h:img.naturalHeight});' +
        '}catch(e){done({error:String(e&&e.message?e.message:e)});}' +
        '})();';

      document.documentElement.appendChild(script);
    });
  }

  async function attachCoverAsImageMedia(imageUrl, setStatus) {
    setStatus('Switching to IMAGE…');
    const typeInfo = await forceImagePostTypeInPage();
    console.log('[PakGameDev]', VERSION, 'type switch', typeInfo);

    setStatus('Finding uploader…');
    const host = await waitFor(getMediaHost, 'r-post-media-input');
    try {
      host.scrollIntoView({ block: 'center', behavior: 'instant' });
    } catch (_) {}
    await sleep(200);

    setStatus('Attaching cover…');
    const result = await attachCoverInPage(imageUrl);
    console.log('[PakGameDev]', VERSION, 'attach result', result);
    // Trust page-context result. Greasemonkey X-rays often hide host.value here.
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
        // Body focus can flip modern composer back to TEXT and hide the media slot.
        await forceImagePostTypeInPage();
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
