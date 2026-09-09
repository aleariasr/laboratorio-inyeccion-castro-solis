const SIDEBAR_SCROLL_STORAGE_KEY = "lics.nav.sidebarScrollTop";

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage;
}

export function readSidebarScrollTop(): number {
  const raw = getStorage()?.getItem(SIDEBAR_SCROLL_STORAGE_KEY);
  const parsed = raw ? Number(raw) : 0;

  return Number.isFinite(parsed) ? parsed : 0;
}

export function writeSidebarScrollTop(scrollTop: number): void {
  getStorage()?.setItem(SIDEBAR_SCROLL_STORAGE_KEY, String(scrollTop));
}
