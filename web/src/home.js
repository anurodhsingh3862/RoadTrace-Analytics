// UI glue for the landing page (index.html). Deliberately tiny: this page
// has no camera, no detector, nothing to wire up beyond the language picker
// (shared pattern with camera.html/dashboard.html) and a small, clearly
// labeled "Example output" demo readout that cycles through a few fixed,
// realistic numbers — it is NOT live data (this page has no camera running)
// and is never presented as such.
import {
  SUPPORTED_LANGUAGES, t, getLanguage, setLanguage, detectInitialLanguage,
} from "./i18n.js";

const langRow = document.getElementById("lang-row");
for (const [code, label] of Object.entries(SUPPORTED_LANGUAGES)) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "chip lang-chip";
  chip.textContent = label;
  chip.dataset.lang = code;
  chip.addEventListener("click", () => applyLanguage(code));
  langRow.appendChild(chip);
}

function updateLangChipState() {
  const current = getLanguage();
  for (const chip of langRow.querySelectorAll(".lang-chip")) {
    chip.classList.toggle("active", chip.dataset.lang === current);
  }
}

function localizeStaticText() {
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
  document.title = t("doc_title");
  document.documentElement.lang = getLanguage();
}

function applyLanguage(code) {
  setLanguage(code);
  localizeStaticText();
  updateLangChipState();
}

applyLanguage(detectInitialLanguage());

// --- Example-output demo card --------------------------------------------
// A handful of fixed, plausible readouts (not randomly generated each load,
// so they can't drift into something nonsensical) cycled on a timer, purely
// to give the hero section some life. Clearly labeled "Example output" in
// the markup so it is never mistaken for a real live camera reading.
const EXAMPLES = [
  { speed: 52, pct: 44 },
  { speed: 61, pct: 51 },
  { speed: 47, pct: 39 },
  { speed: 58, pct: 48 },
];
let exampleIndex = 0;

function renderExample() {
  const { speed, pct } = EXAMPLES[exampleIndex];
  const valueEl = document.getElementById("demo-speed-value");
  const barEl = document.getElementById("demo-speed-bar");
  if (valueEl) valueEl.textContent = speed;
  if (barEl) barEl.style.width = `${pct}%`;
  exampleIndex = (exampleIndex + 1) % EXAMPLES.length;
}
renderExample();
setInterval(renderExample, 2600);
