// ==UserScript==
// @name         Steam Scrape Button (Community Hub Area)
// @namespace    steam-scrape
// @version      1.2
// @description  Add a Steam-style scrape button next to Community Hub
// @match        https://store.steampowered.com/app/*
// @grant        none
// ==/UserScript==

(function () {
  const BUTTON_ID = "gameclub-btn";

  function createButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const hubBtn = document.querySelector(
      '.apphub_OtherSiteInfo .btnv6_blue_hoverfade'
    );
    if (!hubBtn) return;

    const btn = hubBtn.cloneNode(true);
    btn.id = BUTTON_ID;
    btn.href = "gameclub://add?source=steam&url=" + encodeURIComponent(location.href);
    btn.querySelector("span").textContent = "Add to Game Club";

    // 👇 tiny left margin
    btn.style.marginLeft = "4px";

    hubBtn.parentElement.insertBefore(btn, hubBtn.nextSibling);
  }

  const observer = new MutationObserver(createButton);
  observer.observe(document.body, { childList: true, subtree: true });

  createButton();
})();
