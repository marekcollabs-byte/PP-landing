"use strict";
(() => {
  const dates = [...document.querySelectorAll("[data-date]")];
  const modes = [...document.querySelectorAll("[data-mode]")];
  const selection = document.getElementById("ws-selection");
  const dateLabels = {
    "2027-01-08": "Pátek 8. ledna 2027 · 17:00–20:00",
    "2027-01-15": "Pátek 15. ledna 2027 · 17:00–20:00"
  };
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
  dates.forEach(button => button.addEventListener("click", () => {
    dates.forEach(item => {
      const selected = item === button;
      item.setAttribute("aria-pressed", String(selected));
      item.querySelector(".ws-select-label").textContent = selected ? "Vybráno ✓" : "Vybrat termín →";
    });
    selection.textContent = dateLabels[button.dataset.date] + " · předběžný výběr";
  }));
  document.getElementById("ws-year").textContent = new Date().getFullYear();
})();
