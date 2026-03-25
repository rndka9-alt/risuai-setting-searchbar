import type { IndexEntry } from './types';

const NAV_WAIT_MS = 150;
const CONTENT_APPEAR_POLL_MS = 50;
const CONTENT_APPEAR_TIMEOUT_MS = 2000;

function wait(ms: number): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, ms)));
}

/** Wait for `.rs-setting-cont-4` to appear in the DOM (for mobile navigation). */
function waitForContent(): Promise<Element | null> {
  const existing = document.querySelector('.rs-setting-cont-4');
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const start = Date.now();
    const id = setInterval(() => {
      const el = document.querySelector('.rs-setting-cont-4');
      if (el) {
        clearInterval(id);
        resolve(el);
      } else if (Date.now() - start > CONTENT_APPEAR_TIMEOUT_MS) {
        clearInterval(id);
        resolve(null);
      }
    }, CONTENT_APPEAR_POLL_MS);
  });
}

function getMenuButtons(sidebar: Element): HTMLButtonElement[] {
  const all = sidebar.querySelectorAll<HTMLButtonElement>('button');
  return [...all].filter((b) => {
    const span = b.querySelector('span');
    return span && span.textContent?.trim();
  });
}

function getSubmenuButtons(content: Element): HTMLButtonElement[] {
  const container = content.querySelector(
    '.flex.rounded-md.border.border-darkborderc',
  );
  if (!container) return [];
  return [...container.querySelectorAll<HTMLButtonElement>('button')];
}

function getPageRoot(contentWrapper: Element): Element {
  return (
    contentWrapper.firstElementChild?.firstElementChild ||
    contentWrapper.firstElementChild ||
    contentWrapper
  );
}

// ─── Highlighting ───

const HIGHLIGHT_CLASS = 'ssb-highlight';

/** Highlight the exact element matching `displayText` with a pulse animation. */
export function highlightExact(displayText: string): void {
  const contentWrapper = document.querySelector('.rs-setting-cont-4');
  if (!contentWrapper) return;

  const target = displayText.trim().toLowerCase();
  if (!target) return;

  const candidates = contentWrapper.querySelectorAll(
    'h2, h3, span, label, [class*="text-textcolor"]',
  );

  for (const el of candidates) {
    if ((el as Element).closest('button')) continue;
    if ((el as Element).closest('.flex.rounded-md.border.border-darkborderc')) continue;
    if (el.children.length > 3) continue;

    const text = el.textContent?.trim().toLowerCase() || '';
    if (text === target) {
      el.classList.add(HIGHLIGHT_CLASS);
      el.addEventListener('animationend', () => {
        el.classList.remove(HIGHLIGHT_CLASS);
      }, { once: true });
      break; // Pin-point: only the first exact match
    }
  }
}

/** Remove all highlights */
export function clearHighlights(): void {
  document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => {
    el.classList.remove(HIGHLIGHT_CLASS);
  });
}

/** Scroll to the first highlighted element */
export function scrollToFirstHighlight(): void {
  const first = document.querySelector(`.${HIGHLIGHT_CLASS}`);
  if (first) {
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// ─── Navigation ───

/**
 * Navigate to a specific setting:
 * 1. Click the sidebar button
 * 2. Click the submenu tab (if applicable)
 * 3. Highlight matching text
 * 4. Scroll to first match
 */
export async function navigateTo(entry: IndexEntry): Promise<void> {
  const sidebar = document.querySelector('.rs-setting-cont-3');
  if (!sidebar) return;

  const menuButtons = getMenuButtons(sidebar);
  const btn = menuButtons[entry.menuButtonIdx];
  if (!btn) return;

  clearHighlights();

  // Click the sidebar button first. On mobile (<700px), this sets
  // SettingsMenuIndex which hides the sidebar and renders the content area.
  btn.click();
  await wait(NAV_WAIT_MS);

  // Wait for content area — on mobile it appears after Svelte re-renders.
  const contentWrapper = await waitForContent();
  if (!contentWrapper) return;

  const pageRoot = getPageRoot(contentWrapper);

  if (entry.subIdx >= 0) {
    const subButtons = getSubmenuButtons(pageRoot);
    const subBtn = subButtons[entry.subIdx];
    if (subBtn) {
      subBtn.click();
      await wait(NAV_WAIT_MS);
    }
  }

  // Extra wait for Svelte to finish rendering tab content
  await wait(NAV_WAIT_MS);
  highlightExact(entry.displayText);
  scrollToFirstHighlight();
}
