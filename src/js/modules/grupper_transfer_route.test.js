// @vitest-environment node
// routes/grupper-transfer.js: flytningen af klasserne fra dida.dk/grupper til
// grup.dk. Lageret ligger i serverens hukommelse, som ALLE dida.dk's værktøjer
// deler, så det skal have et loft (146. gennemsyn, 15/11 2026). Før:
// hastighedsgrænsen fik "max" i stedet for "limit" og afviste aldrig noget, og
// der var intet samlet loft over 10 MB-pakkerne.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { request } from 'node:http';
import { Buffer } from 'node:buffer';

const routeURL = new URL('../../../../routes/grupper-transfer.js', import.meta.url);
const require = createRequire(routeURL);
const express = require('express');
const grupperTransferRoutes = require(routeURL.pathname);
const { createTransferStore, cleanEntries } = grupperTransferRoutes;

describe('lageret', () => {
    it('et token kan kun hentes én gang', () => {
        const store = createTransferStore();
        const token = store.put({ grupdk_classes: '[]' });
        expect(token).toMatch(/^[0-9a-f]{32}$/);
        expect(store.take(token)).toEqual({ grupdk_classes: '[]' });
        expect(store.take(token)).toBeNull();
        expect(store.totalChars).toBe(0);
    });

    it('et for gammelt token kan ikke hentes — heller ikke før oprydningen', () => {
        let t = 0;
        const store = createTransferStore({ now: () => t, ttlMs: 1000 });
        const token = store.put({ grupdk_classes: '[]' });
        t = 1001;
        expect(store.take(token)).toBeNull();
    });

    it('det samlede loft: en pakke, der ikke er plads til, afvises', () => {
        const store = createTransferStore({ maxChars: 100 });
        const a = store.put({ grupdk_a: 'x'.repeat(80) }); // 88 tegn
        expect(a).not.toBeNull();
        expect(store.put({ grupdk_b: 'x'.repeat(10) })).toBeNull(); // 88 + 18 > 100
        // Når den første er hentet, er der plads igen.
        store.take(a);
        expect(store.put({ grupdk_b: 'x'.repeat(10) })).not.toBeNull();
    });

    it('loftet over antallet af pakker', () => {
        const store = createTransferStore({ maxTokens: 2 });
        expect(store.put({})).not.toBeNull();
        expect(store.put({})).not.toBeNull();
        expect(store.put({})).toBeNull();
    });

    it('gamle pakker ryddes, før loftet tjekkes', () => {
        let t = 0;
        const store = createTransferStore({ now: () => t, ttlMs: 1000, maxTokens: 1 });
        store.put({ grupdk_a: '1' });
        t = 2000;
        expect(store.put({ grupdk_b: '1' })).not.toBeNull();
        expect(store.size).toBe(1);
    });

    it('kun strenge under Grupper-nøgler kommer med', () => {
        expect(cleanEntries({
            grupdk_classes: '[]', GroupEng_Groups_3a: '{}', teacherId: 'abc', grupdk_x: 5,
        })).toEqual({ grupdk_classes: '[]', GroupEng_Groups_3a: '{}' });
    });
});

describe('over HTTP', () => {
    let server, origin;

    function call(method, path, body) {
        return new Promise((resolve, reject) => {
            const data = body === undefined ? null : JSON.stringify(body);
            const req = request(`${origin}${path}`, {
                method,
                headers: { Connection: 'close', ...(data ? { 'Content-Type': 'application/json' } : {}) },
            }, res => {
                const chunks = [];
                res.on('data', c => chunks.push(c));
                res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString() || 'null') }));
                res.on('error', reject);
            });
            req.on('error', reject);
            if (data) req.write(data);
            req.end();
        });
    }

    beforeEach(async () => {
        const app = express();
        app.use('/api/grupper-transfer', grupperTransferRoutes({ maxChars: 1000 }));
        await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
        origin = `http://127.0.0.1:${server.address().port}`;
    });
    afterEach(() => new Promise(r => server.close(r)));

    it('sender og henter — og kun Grupper-nøglerne kommer med', async () => {
        const sent = await call('POST', '/api/grupper-transfer', { entries: { grupdk_classes: '[{"filename":"3a.csv"}]', teacherId: 'x' } });
        expect(sent.status).toBe(200);
        const got = await call('GET', `/api/grupper-transfer/${sent.body.token}`);
        expect(got.body.entries).toEqual({ grupdk_classes: '[{"filename":"3a.csv"}]' });
        expect((await call('GET', `/api/grupper-transfer/${sent.body.token}`)).status).toBe(404);
    });

    it('hastighedsgrænsen: det 11. kald i minuttet afvises', async () => {
        const codes = [];
        for (let i = 0; i < 11; i++) codes.push((await call('POST', '/api/grupper-transfer', { entries: {} })).status);
        expect(codes.slice(0, 10)).toEqual(Array(10).fill(200));
        expect(codes[10]).toBe(429);
    });

    it('fuldt lager giver 503 med en dansk besked — ikke et token', async () => {
        const res = await call('POST', '/api/grupper-transfer', { entries: { grupdk_a: 'x'.repeat(2000) } });
        expect(res.status).toBe(503);
        expect(res.body.token).toBeUndefined();
        expect(res.body.error).toMatch(/Prøv igen/);
    });

    it('forkerte data giver 400', async () => {
        expect((await call('POST', '/api/grupper-transfer', { entries: [] })).status).toBe(400);
        expect((await call('GET', '/api/grupper-transfer/ikke-et-token')).status).toBe(400);
    });
});

// Flyttesiderne må ikke kunne nås på grup.dk (147. gennemsyn, 15/11 2026):
// grup.dk/flyt-send.html gav dida.dk alle grup.dk's klasser, og
// grup.dk/flyt-modtag.html tog imod en klassepakke fra http://dida.dk.
describe('flyttesiderne på grup.dk', () => {
    const { flytPageGuard } = grupperTransferRoutes;
    let server, origin;

    function get(path, host) {
        return new Promise((resolve, reject) => {
            const req = request(`${origin}${path}`, { headers: { Host: host, Connection: 'close' } }, res => {
                res.resume();
                res.on('end', () => resolve(res.statusCode));
            });
            req.on('error', reject);
            req.end();
        });
    }

    beforeEach(async () => {
        const app = express();
        app.set('trust proxy', true);
        app.use(flytPageGuard('grup.dk'));
        // Som app.js: siden har sin egen rute (der ikke skelner mellem store
        // og små bogstaver), og alt andet svarer "ok".
        app.get('/flyt-send.html', (req, res) => res.send('send'));
        app.use((req, res) => res.send('ok'));
        await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
        origin = `http://127.0.0.1:${server.address().port}`;
    });
    afterEach(() => new Promise(r => server.close(r)));

    it('giver 404 på grup.dk — også med andre bogstaver, kodet navn eller skråstreg til sidst', async () => {
        for (const p of ['/flyt-send.html', '/flyt-modtag.html', '/flyt-til-dida.html', '/flyt-til-grup.html',
            '/FLYT-SEND.html', '/flyt%2Dsend.html', '/flyt-send.html/', '/Flyt-Modtag.HTML']) {
            expect(await get(p, 'grup.dk'), p).toBe(404);
        }
    });

    it('rører ikke dida.dk og www.dida.dk, og grup.dk har sine andre filer', async () => {
        expect(await get('/flyt-send.html', 'www.dida.dk')).toBe(200);
        expect(await get('/flyt-modtag.html', 'dida.dk')).toBe(200);
        expect(await get('/', 'grup.dk')).toBe(200);
        expect(await get('/fonts/fonts.css', 'grup.dk')).toBe(200);
        expect(await get('/flyt.html', 'grup.dk')).toBe(200);
    });
});
