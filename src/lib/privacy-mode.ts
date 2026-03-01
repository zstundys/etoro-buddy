const BLUR = "6px";
const STORAGE_KEY = "privacy-mode";
const STYLE_ID = "privacy-mode-css";

let active = false;
let svgObserver: MutationObserver | null = null;

function injectStyleSheet() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    html.privacy [data-private] {
      filter: blur(${BLUR}) !important;
      user-select: none !important;
    }
  `;
  document.head.appendChild(style);
}

const dollarRe = /\$/;

function tagSvgDollarNodes(root: Node) {
  const el =
    root instanceof Element
      ? root
      : root.nodeType === Node.TEXT_NODE
        ? root.parentElement
        : null;
  if (!el) return;

  el.querySelectorAll<SVGElement>("svg text, svg tspan").forEach((node) => {
    if (
      node.textContent &&
      dollarRe.test(node.textContent) &&
      !node.hasAttribute("data-private")
    ) {
      node.setAttribute("data-private", "");
    }
  });
}

function startSvgObserver() {
  if (svgObserver) return;
  tagSvgDollarNodes(document.body);
  svgObserver = new MutationObserver((mutations) => {
    for (const mut of mutations) {
      if (mut.type === "childList") {
        for (const node of mut.addedNodes) tagSvgDollarNodes(node);
      }
    }
  });
  svgObserver.observe(document.body, { childList: true, subtree: true });
}

function stopSvgObserver() {
  svgObserver?.disconnect();
  svgObserver = null;
}

function enable() {
  document.documentElement.classList.add("privacy");
  injectStyleSheet();
  startSvgObserver();
}

function disable() {
  document.documentElement.classList.remove("privacy");
  stopSvgObserver();
}

export function isPrivacyActive(): boolean {
  return active;
}

export function togglePrivacy(): boolean {
  active = !active;
  if (active) {
    enable();
  } else {
    disable();
  }
  try {
    localStorage.setItem(STORAGE_KEY, active ? "1" : "0");
  } catch {}
  return active;
}

export function initPrivacy(): boolean {
  try {
    active = localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    active = false;
  }
  if (active) {
    enable();
  }
  return active;
}
