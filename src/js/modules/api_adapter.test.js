// api_adapter.test.js
// Klassernes /api/-ruter svarer med det samme fra localStorage, og fejlveje
// giver ærlige svar. (Indtil 3/11 2026 prøvede filen også gruppedannelsens
// job til den gamle Python-motor; den del er fjernet sammen med motoren.)

import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock af pyBridge-singleton'en — factory må ikke referere ydre variabler
// (vi.mock hoistes), så vi henter mocken via import bagefter.
vi.mock('./py_bridge.js', () => {
    return {
        pyBridge: {
            isReady: true,
            getClasses: () => [{ filename: '2a.csv', name: '2a', last_modified: '2026-07-19' }],
            getClass: () => null,
        },
    };
});

import { pyBridge } from './py_bridge.js';
import { initApiAdapter } from './api_adapter.js';

beforeAll(() => {
    initApiAdapter();
});

describe('api_adapter — klasserne svarer med det samme', () => {

    it('klasse-listen svarer med det samme selvom Python-motoren ikke er klar', async () => {
        pyBridge.isReady = false;
        pyBridge.ready = new Promise(() => {}); // "henter stadig" — løses aldrig

        // Med den gamle kode hang dette kald i 30s og fejlede så.
        const data = await Promise.race([
            fetch('/api/classes').then(r => r.json()),
            new Promise((_, rej) => setTimeout(
                () => rej(new Error('HANG: /api/classes ventede på Python-motoren')), 1000)),
        ]);

        expect(data).toHaveLength(1);
        expect(data[0].name).toBe('2a');
    });

});

describe('api_adapter — fejlveje', () => {

    const post = (url, body) => fetch(url, { method: 'POST', body });

    it('en ukendt API-rute giver en ærlig 404 (ikke 200)', async () => {
        const res = await fetch('/api/findes-ikke', { method: 'PATCH' });
        expect(res.status).toBe(404);
        expect((await res.json()).error).toContain('/api/findes-ikke');
    });

    it('en ødelagt JSON-krop giver 500 med dansk besked i stedet for at kaste', async () => {
        const res = await post('/api/classes/paste', '{ikke json');
        expect(res.status).toBe(500);
        expect((await res.json()).error).toMatch(/^Intern fejl/);
    });

    it('sletning videregiver pyBridges fejl-objekt som det er (ikke pakket ind i success)', async () => {
        pyBridge.deleteClass = () => ({ error: 'Klassen findes ikke' });
        const data = await (await fetch('/api/classes/x.csv', { method: 'DELETE' })).json();
        delete pyBridge.deleteClass;
        expect(data.error).toBe('Klassen findes ikke');
        expect(data.success).toBeUndefined();
    });

    it('omdøbning med fejl giver status 400', async () => {
        pyBridge.renameClass = () => ({ error: 'Navnet er i brug' });
        const res = await post('/api/classes/x.csv/rename', JSON.stringify({ name: 'y' }));
        delete pyBridge.renameClass;
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('Navnet er i brug');
    });

});

