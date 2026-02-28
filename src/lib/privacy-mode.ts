const BLUR = "6px";
const STORAGE_KEY = "privacy-mode";
const SPAN_CLASS = "privacy-blur";
const ATTR_MARK = "data-privacy-blur";
const STYLE_ID = "privacy-mode-css";

let active = false;
let observer: MutationObserver | null = null;
let applying = false;

const re = /[+-]?\s*\$[\d,]+(?:\.\d{0,2})?|[+-]?\d+(?:\.\d+)?%/g;
const quick = /\$\d|\d%/;

// CSS rules that kick in the instant an element is painted — no JS round-trip.
// Covers summary cards, table cells, SVG axes, and stat cards.
function injectStyleSheet() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    html.privacy .tabular-nums,
    html.privacy p.text-2xl.font-semibold,
    html.privacy .grid > .rounded-xl.border-border > p.text-lg,
    html.privacy svg text,
    html.privacy svg tspan {
      filter: blur(${BLUR}) !important;
      user-select: none !important;
    }
  `;
  document.head.appendChild(style);
}

function blurSubtree(root: Node) {
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode as Text;
    if (n.parentElement?.classList.contains(SPAN_CLASS)) continue;
    textNodes.push(n);
  }

  for (const node of textNodes) {
    const text = node.textContent;
    if (!text || !quick.test(text)) continue;

    const frag = document.createDocumentFragment();
    let last = 0;
    let m: RegExpExecArray | null;

    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last)
        frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const span = document.createElement("span");
      span.className = SPAN_CLASS;
      span.style.filter = `blur(${BLUR})`;
      span.appendChild(document.createTextNode(m[0]));
      frag.appendChild(span);
      last = m.index + m[0].length;
    }

    if (last < text.length)
      frag.appendChild(document.createTextNode(text.slice(last)));

    node.parentNode?.replaceChild(frag, node);
  }

  const el =
    root instanceof Element
      ? root
      : root.nodeType === Node.TEXT_NODE
        ? root.parentElement
        : null;
  if (!el) return;

  el.querySelectorAll<SVGElement>("svg text, svg tspan").forEach((svg) => {
    if (
      svg.textContent &&
      quick.test(svg.textContent) &&
      !svg.hasAttribute(ATTR_MARK)
    ) {
      svg.setAttribute(ATTR_MARK, "");
      svg.style.filter = `blur(${BLUR})`;
    }
  });

  el.querySelectorAll<HTMLElement>(
    ".grid > .rounded-xl.border.border-border > p.text-lg",
  ).forEach((p) => {
    if (!p.hasAttribute(ATTR_MARK)) {
      p.setAttribute(ATTR_MARK, "");
      p.style.filter = `blur(${BLUR})`;
    }
  });
}

function applyBlur() {
  applying = true;
  document.documentElement.classList.add("privacy");
  injectStyleSheet();
  blurSubtree(document.body);
  applying = false;
}

function removeBlur() {
  applying = true;
  document.documentElement.classList.remove("privacy");

  document.querySelectorAll(`.${SPAN_CLASS}`).forEach((span) => {
    const parent = span.parentNode;
    if (!parent) return;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
    parent.normalize();
  });

  document.querySelectorAll<HTMLElement>(`[${ATTR_MARK}]`).forEach((el) => {
    el.removeAttribute(ATTR_MARK);
    el.style.filter = "";
  });

  applying = false;
}

function startObserver() {
  if (observer) return;
  observer = new MutationObserver((mutations) => {
    if (!active || applying) return;
    applying = true;
    for (const mut of mutations) {
      if (mut.type === "childList") {
        for (const node of mut.addedNodes) blurSubtree(node);
      } else if (mut.type === "characterData" && mut.target.parentNode) {
        blurSubtree(mut.target.parentNode);
      }
    }
    applying = false;
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function stopObserver() {
  observer?.disconnect();
  observer = null;
}

export function isPrivacyActive(): boolean {
  return active;
}

export function togglePrivacy(): boolean {
  active = !active;
  if (active) {
    applyBlur();
    startObserver();
  } else {
    stopObserver();
    removeBlur();
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
    applyBlur();
    startObserver();
  }
  return active;
}
