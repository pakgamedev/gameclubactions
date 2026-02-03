// ==UserScript==
// @name         Itch Scrape Button
// @namespace    itch-scrape
// @version      1.2
// @description  Add a itch-style scrape button
// @match        https://*.itch.io/*
// @grant        none
// ==/UserScript==

(function () {
  const BUTTON_ID = "gameclub-btn";

  function createButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const userTools = document.querySelector(
      '.add_to_collection_btn'
    ).parentElement;
    if (!userTools) return;

    const btn = userTools.cloneNode(true);
    btn.firstElementChild.id = BUTTON_ID;
    btn.firstElementChild.href = "gameclub://add?source=itch&url=" + encodeURIComponent(location.href);
    btn.firstElementChild.className = "action_btn";
    btn.firstElementChild.querySelector("span").textContent = "Add to Game Club";

    // 👇 tiny left margin
    //btn.style.marginLeft = "4px";

    userTools.parentElement.insertBefore(btn, userTools.parentElement.firstElementChild);
  }

  const observer = new MutationObserver(createButton);
  observer.observe(document.body, { childList: true, subtree: true });

  createButton();
})();
