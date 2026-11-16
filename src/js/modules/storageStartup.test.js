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

    // Klasser fra www.dida.dk, der lå i en pakke på dida.dk (15/11 2026, 148.).
    // Pakken lægges i lageret, og adoptFromWww() (AppTopbar) henter den ind
    // med omdøbning ved sammenfald — som på dida.dk.
    it('lægger en medsendt www-pakke, hvor adoptFromWww() finder den', async () => {
        window.history.replaceState(null, '', `/?migrate=${TOKEN}`);
        const stash = JSON.stringify({ at: 'x', entries: { groupeng_classes: '[{"filename":"3a.csv"}]' } });
        window.XMLHttpRequest = fakeXhr(200, JSON.stringify({ entries: { dida_grupper_from_www: stash } }));
        await import('./storageStartup.js');
        expect(localStorage.getItem('dida_grupper_from_www')).toBe(stash);
        // Pakkens indhold lægges IKKE løst i lageret.
        expect(localStorage.getItem('grupdk_classes')).toBeNull();
    });

    it('overskriver ikke en www-pakke, der allerede ligger på grup.dk', async () => {
        window.history.replaceState(null, '', `/?migrate=${TOKEN}`);
        localStorage.setItem('dida_grupper_from_www', 'den gamle');
        window.XMLHttpRequest = fakeXhr(200, JSON.stringify({ entries: { dida_grupper_from_www: 'den nye' } }));
        await import('./storageStartup.js');
        expect(localStorage.getItem('dida_grupper_from_www')).toBe('den gamle');
    });

    it('et fuldt lager taber ikke www-pakken i stilhed: læreren får at vide, hvor klasserne er', async () => {
        window.history.replaceState(null, '', `/?migrate=${TOKEN}`);
        window.XMLHttpRequest = fakeXhr(200, JSON.stringify({ entries: { dida_grupper_from_www: '{"at":"x"}' } }));
        const realSet = localStorage.setItem.bind(localStorage);
        vi.spyOn(localStorage, 'setItem').mockImplementation((k, v) => {
            if (k === 'dida_grupper_from_www') throw Object.assign(new Error('fuldt'), { name: 'QuotaExceededError' });
            return realSet(k, v);
        });
        const mod = await import('./storageStartup.js');
        window.notifyError = vi.fn();
        mod.reportStorageMigration();
        expect(window.notifyError).toHaveBeenCalledWith(expect.stringContaining('www.dida.dk/grupper/?bliv=1'));
        expect(localStorage.getItem('dida_grupper_from_www')).toBeNull();
        delete window.notifyError;
    });

    // 163. gennemsyn (16/11): har grup.dk allerede klasser, kommer pakkens
    // ikke med — og før fik læreren intet at vide, mens dida.dk havde mærket
    // dem som sendt.
    it('har grup.dk klasser, lægges pakken ikke ind, og læreren får at vide, hvor klasserne er', async () => {
        window.history.replaceState(null, '', `/?migrate=${TOKEN}`);
        const mine = JSON.stringify([{ filename: '3b.csv', name: '3.b her' }]);
        localStorage.setItem('grupdk_classes', mine);
        const theirs = JSON.stringify([{ filename: '3b.csv', name: '3.b der' }, { filename: '2c.csv', name: '2.c' }]);
        window.XMLHttpRequest = fakeXhr(200, JSON.stringify({ entries: {
            groupeng_classes: theirs, 'GroupEng_Groups_3b.csv': 'grupper fra dida.dk',
        } }));
        const mod = await import('./storageStartup.js');
        expect(localStorage.getItem('grupdk_classes')).toBe(mine);
        expect(localStorage.getItem('grupdk_groups_3b.csv')).toBeNull();
        window.notifyError = vi.fn();
        mod.reportStorageMigration();
        expect(window.notifyError).toHaveBeenCalledWith(expect.stringMatching(/^2 klasser fra dida\.dk\/grupper .*dida\.dk\/grupper\/\?bliv=1.*"Importér som kopi"/));
        // Siges én gang.
        window.notifyError.mockClear();
        mod.reportStorageMigration();
        expect(window.notifyError).not.toHaveBeenCalled();
        delete window.notifyError;
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
