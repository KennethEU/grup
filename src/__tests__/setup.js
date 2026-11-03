/**
 * Vitest global setup
 * Provides a minimal browser-like environment for modules that expect window/DOM.
 */

// Polyfill crypto.randomUUID (not available in all jsdom versions)
if (typeof globalThis.crypto === 'undefined') {
    globalThis.crypto = {};
}
if (!globalThis.crypto.randomUUID) {
    globalThis.crypto.randomUUID = () =>
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
}

// Vitest 4 ships a stub localStorage that lacks clear()/key()/length.
// happy-dom does provide a real Storage implementation, but if vitest's
// stub wins (e.g. when --localstorage-file is auto-injected) we fall
// back to an in-memory polyfill so tests can run consistently.
function ensureWorkingLocalStorage() {
    try {
        if (typeof localStorage !== 'undefined'
            && typeof localStorage.clear === 'function') {
            return; // already working
        }
    } catch (_) { /* fall through */ }

    const store = new Map();
    const polyfill = {
        getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
        setItem: (k, v) => { store.set(String(k), String(v)); },
        removeItem: (k) => { store.delete(String(k)); },
        clear: () => { store.clear(); },
        key: (i) => Array.from(store.keys())[i] ?? null,
        get length() { return store.size; },
    };
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        writable: true,
        value: polyfill,
    });
}
ensureWorkingLocalStorage();

beforeEach(() => {
    ensureWorkingLocalStorage();
    localStorage.clear();
});
