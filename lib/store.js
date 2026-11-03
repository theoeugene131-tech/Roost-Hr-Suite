// Simple offline-first store: localStorage + IndexedDB fallback is overkill for MVP, localStorage suffices.
// We wrap it for future IDB migration and queue sync.
export const STORAGE_KEY = "roost_state_v2";

export function loadState(storageKey = STORAGE_KEY) {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}
export function saveState(state, storageKey = STORAGE_KEY) {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey, JSON.stringify(state));
  // also try to persist for offline via service worker cache (no-op)
  if (navigator.onLine === false) {
    const queue = JSON.parse(localStorage.getItem("roost_pending") || "[]");
    queue.push({ ts: Date.now(), state });
    localStorage.setItem("roost_pending", JSON.stringify(queue.slice(-20)));
  }
}
