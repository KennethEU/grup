import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    checkForNewBuild, isChunkLoadError, watchForNewBuild,
    NEW_BUILD_MESSAGE, PART_UNAVAILABLE_MESSAGE, EXCEL_UNAVAILABLE_MESSAGE, reportPartUnavailable,
} from './newBuild.js';

// happy-dom prøver at hente et indsat <script> og skriver en lang fejl i
// loggen, når det ikke må. Her skal tagget bare stå der.
if (window.happyDOM) window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;

// Siden, som fanen kører: en hovedfil med et hash i navnet, som i drift.
function setOwnEntry(src) {
    document.head.innerHTML = src ? `<script type="module" src="${src}"></script>` : '';
}

function htmlResponse(entry, extra = {}) {
    return {
        ok: true,
        redirected: false,
        headers: { get: () => 'text/html; charset=UTF-8' },
        text: async () => `<!doctype html><html><head><script type="module" crossorigin src="${entry}"></script></head><body></body></html>`,
        ...extra,
    };
}

describe('checkForNewBuild', () => {
    beforeEach(() => setOwnEntry('./assets/index-OLD.js'));
    afterEach(() => {
        vi.restoreAllMocks();
        setOwnEntry(null);
    });

    it('svarer ja, når den serverede index.html peger på en anden indgangsfil', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(htmlResponse('./assets/index-NEW.js'));
        expect(await checkForNewBuild()).toBe(true);
        // index.html må aldrig komme fra browserens cache — så ser vi kun os selv.
        expect(fetchSpy.mock.calls[0][1]).toEqual({ cache: 'no-store' });
        expect(fetchSpy.mock.calls[0][0]).toMatch(/index\.html$/);
    });

    it('svarer nej, når den serverede indgangsfil er vores egen', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(htmlResponse('./assets/index-OLD.js'));
        expect(await checkForNewBuild()).toBe(false);
    });

    it('svarer nej offline, ved omdirigering eller uden HTML — kun en SET ny udgave tæller', async () => {
        const spy = vi.spyOn(globalThis, 'fetch');
        spy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        expect(await checkForNewBuild()).toBe(false);
        // En 302 til forsiden giver 200 med en anden hovedfil — ikke en ny udgave.
        spy.mockResolvedValueOnce(htmlResponse('/other.js', { redirected: true }));
        expect(await checkForNewBuild()).toBe(false);
        spy.mockResolvedValueOnce(htmlResponse('./assets/index-NEW.js', { ok: false }));
        expect(await checkForNewBuild()).toBe(false);
        spy.mockResolvedValueOnce(htmlResponse('./assets/index-NEW.js', { headers: { get: () => 'text/plain' } }));
        expect(await checkForNewBuild()).toBe(false);
    });

    it('svarer null uden et indgangsscript, så kalderne ikke skal vente', () => {
        setOwnEntry(null);
        const spy = vi.spyOn(globalThis, 'fetch');
        expect(checkForNewBuild()).toBeNull();
        expect(spy).not.toHaveBeenCalled();
    });

    it('deler én forespørgsel mellem kaldere, der spørger samtidig', async () => {
        const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(htmlResponse('./assets/index-NEW.js'));
        const [a, b] = await Promise.all([checkForNewBuild(), checkForNewBuild()]);
        expect([a, b]).toEqual([true, true]);
        expect(spy).toHaveBeenCalledTimes(1);
        // Og den næste spørger forfra.
        await checkForNewBuild();
        expect(spy).toHaveBeenCalledTimes(2);
    });
});

describe('watchForNewBuild', () => {
    let listeners;
    beforeEach(() => {
        setOwnEntry('./assets/index-OLD.js');
        window.notifyError = vi.fn();
        listeners = [];
        const realAdd = window.addEventListener.bind(window);
        vi.spyOn(window, 'addEventListener').mockImplementation((type, fn, opts) => {
            if (type === 'vite:preloadError') listeners.push(fn);
            return realAdd(type, fn, opts);
        });
        watchForNewBuild();
    });
    afterEach(() => {
        for (const fn of listeners) window.removeEventListener('vite:preloadError', fn);
        vi.restoreAllMocks();
        setOwnEntry(null);
    });

    function firePreloadError(err) {
        const event = new Event('vite:preloadError', { cancelable: true });
        event.payload = err;
        window.dispatchEvent(event);
        return event;
    }

    it('beder læreren genindlæse, når en manglende del skyldes en ny udgave', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(htmlResponse('./assets/index-NEW.js'));
        const err = new Error('Unable to preload CSS for ./assets/PageLayout-X.css');
        const event = firePreloadError(err);
        // Fejlen skal stadig nå kaldstedet — ellers får en side `undefined`.
        expect(event.defaultPrevented).toBe(false);
        expect(isChunkLoadError(err)).toBe(true);
        await vi.waitFor(() => expect(window.notifyError).toHaveBeenCalledWith(NEW_BUILD_MESSAGE));
    });

    it('er tavs, når udgaven er den samme (kalderen har sin egen besked)', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(htmlResponse('./assets/index-OLD.js'));
        firePreloadError(new Error('Failed to fetch dynamically imported module'));
        await new Promise(r => setTimeout(r, 0));
        await new Promise(r => setTimeout(r, 0));
        expect(window.notifyError).not.toHaveBeenCalled();
    });

    it('mærker ikke almindelige fejl som chunk-fejl', () => {
        expect(isChunkLoadError(new Error('boom'))).toBe(false);
        expect(isChunkLoadError(null)).toBe(false);
    });
});

describe('beskederne, når en del ikke kan hentes', () => {
    // Safari husker en fejlet hentning og spørger aldrig serveren igen i den
    // samme fane (målt 4/11 2026). "Prøv igen" virker derfor ikke dér — kun
    // en genindlæsning gør.
    it('beder om en genindlæsning, ikke om at prøve igen', () => {
        for (const msg of [NEW_BUILD_MESSAGE, PART_UNAVAILABLE_MESSAGE, EXCEL_UNAVAILABLE_MESSAGE]) {
            expect(msg).toMatch(/Genindlæs siden|genindlæs siden/);
            expect(msg).toContain('Cmd+R');
            expect(msg).not.toMatch(/prøv igen/i);
        }
    });
});

describe('reportPartUnavailable', () => {
    let listeners;
    beforeEach(() => {
        setOwnEntry('./assets/index-OLD.js');
        window.notifyError = vi.fn();
        listeners = [];
        const realAdd = window.addEventListener.bind(window);
        vi.spyOn(window, 'addEventListener').mockImplementation((type, fn, opts) => {
            if (type === 'vite:preloadError') listeners.push(fn);
            return realAdd(type, fn, opts);
        });
        watchForNewBuild();
    });
    afterEach(() => {
        for (const fn of listeners) window.removeEventListener('vite:preloadError', fn);
        vi.restoreAllMocks();
        setOwnEntry(null);
    });

    /** Som Vites hjælper: hændelsen først, så kastes den samme fejl videre. */
    function chunkError() {
        const err = new Error('Failed to fetch dynamically imported module');
        const event = new Event('vite:preloadError', { cancelable: true });
        event.payload = err;
        window.dispatchEvent(event);
        return err;
    }

    it('er tavs ved en ny udgave — lytteren har allerede bedt om en genindlæsning', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(htmlResponse('./assets/index-NEW.js'));
        const shown = await reportPartUnavailable(chunkError(), EXCEL_UNAVAILABLE_MESSAGE);
        expect(shown).toBeNull();
        await vi.waitFor(() => expect(window.notifyError).toHaveBeenCalledWith(NEW_BUILD_MESSAGE));
        expect(window.notifyError).toHaveBeenCalledTimes(1);
    });

    it('siger sin egen besked, når udgaven er den samme', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(htmlResponse('./assets/index-OLD.js'));
        const shown = await reportPartUnavailable(chunkError(), EXCEL_UNAVAILABLE_MESSAGE);
        expect(shown).toBe(EXCEL_UNAVAILABLE_MESSAGE);
        expect(window.notifyError).toHaveBeenCalledWith(EXCEL_UNAVAILABLE_MESSAGE);
        expect(window.notifyError).toHaveBeenCalledTimes(1);
    });

    it('spørger ikke serveren om en almindelig fejl', async () => {
        const spy = vi.spyOn(globalThis, 'fetch');
        expect(await reportPartUnavailable(new Error('boom'), EXCEL_UNAVAILABLE_MESSAGE)).toBe(EXCEL_UNAVAILABLE_MESSAGE);
        expect(spy).not.toHaveBeenCalled();
    });
});
