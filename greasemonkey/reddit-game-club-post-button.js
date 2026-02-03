// ==UserScript==
// @name         PakGameDev Custom Post Type
// @namespace    http://tampermonkey.net/
// @version      3.8
// @description  Adds a floating Showcase button that sets Title, Body, Image (Manual-Paste) from post.json
// @author       Gemini
// @match        https://www.reddit.com/r/PakGameDev/submit*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

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
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            transition: transform 0.2s;
        `;
        
        btn.innerHTML = 'Weekly Game Post';

        btn.onmouseover = () => btn.style.transform = 'scale(1.05)';
        btn.onmouseout = () => btn.style.transform = 'scale(1)';

        btn.onclick = async (e) => {
            e.preventDefault();
            console.log('[PakGameDev Script] Button clicked.');

            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('type') !== 'IMAGE') {
                urlParams.set('type', 'IMAGE');
                window.location.search = urlParams.toString();
                return;
            }

            let remoteData = { title: "", body: "", header_image: "" };
            try {
                const response = await fetch('https://pakgamedev.com/gameclubactions/reddit-auto-post/post.json');
                if (response.ok) {
                    remoteData = await response.json();
                }
            } catch (err) {
                console.error('[PakGameDev Script] Failed to fetch remote data.', err);
            }
            
            const findField = (name) => {
                let field = document.querySelector(`textarea[name="${name}"], input[name="${name}"]`);
                if (field) return field;

                const mainComposer = document.querySelector('shreddit-composer');
                if (mainComposer && mainComposer.shadowRoot) {
                    field = mainComposer.shadowRoot.querySelector(`textarea[name="${name}"], input[name="${name}"]`);
                    if (field) return field;

                    if (name === 'body') {
                        const bodyComposer = mainComposer.shadowRoot.querySelector('shreddit-composer[name="optionalBody"]') || 
                                           document.querySelector('shreddit-composer[name="optionalBody"]');
                        
                        if (bodyComposer && bodyComposer.shadowRoot) {
                            return bodyComposer.shadowRoot.querySelector('div[contenteditable="true"]');
                        }
                        return mainComposer.querySelector('div[name="body"][contenteditable="true"]');
                    }
                }
                return null;
            };

            const broadSearch = (name) => {
                const allElements = Array.from(document.querySelectorAll('*'));
                for (let el of allElements) {
                    if (el.shadowRoot) {
                        const found = el.shadowRoot.querySelector(name === 'body' ? 'div[contenteditable="true"]' : `[name="${name}"]`);
                        if (found) return found;
                    }
                }
                return document.querySelector(`div[name="${name}"][contenteditable="true"]`);
            };

            // 1. Set Title
            let titleField = findField('title') || broadSearch('title');
            if (titleField) {
                titleField.value = remoteData.title;
                titleField.dispatchEvent(new Event('input', { bubbles: true }));
            }

            // 2. Set Body (Rich Text Editor)
            let bodyField = findField('body') || broadSearch('body');
            if (bodyField) {
                const content = remoteData.body || "Check out my latest progress!";
                if (bodyField.contentEditable === 'true') {
                    bodyField.click();
                    bodyField.focus();
                    let count = 0;
                    const inject = setInterval(() => {
                        document.execCommand('selectAll', false, null);
                        document.execCommand('insertText', false, content);
                        bodyField.dispatchEvent(new Event('input', { bubbles: true }));
                        if (bodyField.innerText.trim().length > 5 || count > 5) clearInterval(inject);
                        count++;
                    }, 200);
                }
            }

            // 3. Handle Image via Clipboard + Auto-Paste
            if (remoteData.header_image) {
                try {
                    const imgResponse = await fetch(remoteData.header_image);
                    const initialBlob = await imgResponse.blob();
                    
                    const convertToPng = (blob) => {
                        return new Promise((resolve) => {
                            const img = new Image();
                            img.crossOrigin = "anonymous";
                            img.onload = () => {
                                const canvas = document.createElement('canvas');
                                canvas.width = img.width;
                                canvas.height = img.height;
                                const ctx = canvas.getContext('2d');
                                ctx.drawImage(img, 0, 0);
                                canvas.toBlob(resolve, 'image/png');
                            };
                            img.src = URL.createObjectURL(blob);
                        });
                    };

                    const pngBlob = initialBlob.type === 'image/png' ? initialBlob : await convertToPng(initialBlob);
                    
                    try {
                        const data = [new ClipboardItem({ 'image/png': pngBlob })];
                        await navigator.clipboard.write(data);
                        console.log('[PakGameDev Script] Image copied to clipboard.');
                        
                        // Auto-paste attempt
                        if (bodyField) {
                            bodyField.focus();
                            // Short delay ensures focus is set before paste command fires
                            setTimeout(() => {
                                document.execCommand('paste');
                                console.log('[PakGameDev Script] Auto-paste triggered.');
                            }, 100);
                        }
                    } catch (clipErr) {
                        console.error('[PakGameDev Script] Clipboard write failed.', clipErr);
                    }

                    // Background fallback via file input
                    const file = new File([pngBlob], "image.png", { type: "image/png" });
                    const mainComposer = document.querySelector('shreddit-composer');
                    if (mainComposer && mainComposer.shadowRoot) {
                        const mediaInput = mainComposer.shadowRoot.querySelector('shreddit-media-input');
                        const fileInput = mediaInput ? mediaInput.shadowRoot.querySelector('input[type="file"]') : 
                                         mainComposer.shadowRoot.querySelector('input[type="file"]');

                        if (fileInput) {
                            const dataTransfer = new DataTransfer();
                            dataTransfer.items.add(file);
                            fileInput.files = dataTransfer.files;
                            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                } catch (e) {
                    console.error('[PakGameDev Script] Image fetch failed.', e);
                }
            }

            // 4. Flair Logic
            const composer = document.querySelector('shreddit-composer');
            if (composer && composer.shadowRoot) {
                const flairBtn = composer.shadowRoot.querySelector('button[aria-label*="flair"]') || 
                                 composer.shadowRoot.querySelector('faceplate-tracker[noun="flair_picker"] button');
                
                if (flairBtn) {
                    flairBtn.click();
                    let attempts = 0;
                    const checkFlair = setInterval(() => {
                        const flairElements = Array.from(document.querySelectorAll('faceplate-toggle-input, li, [role="menuitem"], faceplate-chip, span'));
                        const eventFlair = flairElements.find(i => i.textContent.trim().toLowerCase() === 'event' || i.innerText.toLowerCase().includes('event'));
                        
                        if (eventFlair) {
                            const clickTarget = eventFlair.closest('faceplate-toggle-input') || eventFlair;
                            clickTarget.click();
                            clearInterval(checkFlair);
                            
                            setTimeout(() => {
                                const applyBtn = Array.from(document.querySelectorAll('button')).find(b => 
                                    b.textContent.toLowerCase().includes('apply') || 
                                    b.textContent.toLowerCase().includes('add flair')
                                );
                                if (applyBtn) applyBtn.click();
                            }, 400);
                        }
                        if (++attempts >= 30) clearInterval(checkFlair);
                    }, 200);
                }
            }

            btn.textContent = '✅ Applied!';
            setTimeout(() => { btn.innerHTML = 'Weekly Game Post'; }, 2000);
        };

        document.body.appendChild(btn);
    };

    const retry = setInterval(injectFloatingButton, 1000);
    setTimeout(() => clearInterval(retry), 10000);
})();