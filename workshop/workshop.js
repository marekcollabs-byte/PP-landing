"use strict";
(() => {
  const modes = [...document.querySelectorAll("[data-mode]")];
  function setMode(mode) {
    const gift = mode === "darek";
    document.getElementById("ws-term-panel").hidden = gift;
    document.getElementById("ws-gift-panel").hidden = !gift;
    modes.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.mode === mode)));
  }
  modes.forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode)));
  document.querySelectorAll("[data-mode-link]").forEach(link =>
    link.addEventListener("click", () => setMode(link.dataset.modeLink))
  );
  document.getElementById("ws-year").textContent = new Date().getFullYear();
})();
