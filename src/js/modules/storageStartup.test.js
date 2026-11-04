import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// storageStartup.js kører startStorage(), når den importeres. Hver test
// sætter adressen og svaret op FØRST og importerer så modulet forfra.

const TOKEN = 'a'.repeat(32);

function fakeXhr(status, responseText) {
    return class {
        open() {}
        send() { this.status = status; this.responseText = responseText; }
    };
}

describe('receiveTransfer (?migrate=<token> fra dida.dk/grupper)', () => {
    let realXhr;
    beforeEach(() => {
        vi.resetModules();
        localStorage.clear();
        realXhr = window.XMLHttpRequest;
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        window.XMLHttpRequest = realXhr;
        window.history.replaceState(null, '', '/');
        vi.restoreAllMocks();
    });

    it('lægger pakken i lageret og fjerner tokenet fra adressen', async () => {
        window.history.replaceState(null, '', `/?migrate=${TOKEN}&x=1#top`);
        const classes = JSON.stringify([{ filename: '3b.csv', name: '3.b' }]);
        window.XMLHttpRequest = fakeXhr(200, JSON.stringify({ entries: { grupdk_classes: classes } }));
        await import('./storageStartup.js');
        expect(localStorage.getItem('grupdk_classes')).toBe(classes);
        expect(window.location.search).toBe('?x=1');
        expect(window.location.hash).toBe('#top');
    });

    it('fjerner tokenet, også når svaret ikke er JSON (fx en fejlside)', async () => {
        window.history.replaceState(null, '', `/?migrate=${TOKEN}`);
        window.XMLHttpRequest = fakeXhr(200, '<!doctype html><title>Fejl</title>');
        await import('./storageStartup.js');
        expect(window.location.search).toBe('');
        expect(localStorage.getItem('grupdk_classes')).toBeNull();
    });

    it('fjerner tokenet, når det er brugt (404)', async () => {
        window.history.replaceState(null, '', `/?migrate=${TOKEN}`);
        window.XMLHttpRequest = fakeXhr(404, '{"error":"ukendt"}');
        await import('./storageStartup.js');
        expect(window.location.search).toBe('');
    });

    it('lader en adresse uden token være', async () => {
        window.history.replaceState(null, '', '/?x=1');
        const spy = vi.fn();
        window.XMLHttpRequest = class { open() { spy(); } send() {} };
        await import('./storageStartup.js');
        expect(spy).not.toHaveBeenCalled();
        expect(window.location.search).toBe('?x=1');
    });
});
