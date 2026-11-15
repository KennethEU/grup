// dida.dk's flyttesider (public/flyt-send.html, flyt-modtag.html og
// flyt-til-grup.html) skal kende Grupper's nøgler under BEGGE navne: de gamle
// (groupeng_classes, GroupEng_*) og de nye (grupdk_*). Grupper på
// www.dida.dk/grupper/?bliv=1 og dida.dk/grupper/?bliv=1 er den samme app som
// grup.dk og omdøber nøglerne dér også — kendte siderne kun de gamle navne,
// blev klasserne liggende, hvor læreren ikke længere bruger dem.
//
// Siderne er rene inline-scripts. Her køres netop dét script med et falsk
// vindue, så det er sidernes egen kode, der prøves.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PUBLIC = resolve(import.meta.dirname, '..', '..', '..', '..', 'public');

function inlineScript(file) {
    const html = readFileSync(resolve(PUBLIC, file), 'utf8');
    const m = html.match(/<script>([\s\S]*?)<\/script>/);
    if (!m) throw new Error(`intet inline-script i ${file}`);
    return m[1];
}

function fakeStorage(init) {
    const map = new Map(Object.entries(init));
    return {
        get length() { return map.size; },
        key: (i) => [...map.keys()][i] ?? null,
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => { map.set(k, String(v)); },
        removeItem: (k) => { map.delete(k); },
        dump: () => Object.fromEntries(map),
    };
}

/** Kør sidens script i et falsk vindue (en iframe, hvis parent er givet). */
function run(file, { storage, search = '', fetchImpl } = {}) {
    const listeners = [];
    const posted = [];
    const parent = { postMessage: (msg, origin) => posted.push({ msg, origin }) };
    const el = () => ({ hidden: true, textContent: '', addEventListener() {} });
    const window = {
        parent,
        addEventListener: (type, fn) => { if (type === 'message') listeners.push(fn); },
        location: { search, hash: '', replace: (url) => { window.redirectedTo = url; } },
    };
    const document = { getElementById: el };
    // Sidens script som en funktion med det falske vindue som argumenter.
    const pageScript = globalThis.Function;
    new pageScript('window', 'document', 'localStorage', 'location', 'fetch', inlineScript(file))(
        window, document, storage, window.location, fetchImpl);
    return { window, posted, send: (data, origin) => listeners.forEach(fn => fn({ data, origin, source: parent })) };
}

const OLD = {
    groupeng_classes: '[{"filename":"3a.csv"}]', 'GroupEng_Groups_3a.csv': '{}', teacherId: 'abc',
};
const NEW = {
    grupdk_classes: '[{"filename":"3a.csv"}]', 'grupdk_groups_3a.csv': '{}', teacherId: 'abc',
};

describe('flyt-send.html (www svarer dida.dk med Grupper-nøglerne)', () => {
    for (const [label, store, keys] of [
        ['de gamle navne', OLD, ['groupeng_classes', 'GroupEng_Groups_3a.csv']],
        ['de nye navne', NEW, ['grupdk_classes', 'grupdk_groups_3a.csv']],
    ]) {
        it(`sender ${label} — og intet andet`, () => {
            const page = run('flyt-send.html', { storage: fakeStorage(store) });
            page.send({ type: 'dida-fetch-grupper' }, 'https://dida.dk');
            const reply = page.posted.find(p => p.msg.type === 'dida-grupper-reply');
            expect(Object.keys(reply.msg.entries).sort()).toEqual(keys.sort());
        });
    }
});

describe('flyt-modtag.html (dida.dk tager imod fra www)', () => {
    for (const [label, entries, classesKey] of [
        ['de gamle navne', OLD, 'groupeng_classes'],
        ['de nye navne', NEW, 'grupdk_classes'],
    ]) {
        it(`lægger Grupper-nøglerne med ${label} i pakken — ikke løst i lageret`, () => {
            const storage = fakeStorage({});
            const page = run('flyt-modtag.html', { storage });
            page.send({ type: 'dida-move-data', entries }, 'https://www.dida.dk');
            const reply = page.posted.find(p => p.msg.type === 'dida-move-reply');
            expect(reply.msg.ok).toBe(true);
            expect(reply.msg.result.grupper).toBe(true);
            const stash = JSON.parse(storage.getItem('dida_grupper_from_www'));
            expect(Object.keys(stash.entries)).toContain(classesKey);
            // Kun det, der ikke er Grupper, kopieres nøgle for nøgle.
            expect(Object.keys(storage.dump()).sort()).toEqual(['dida_grupper_from_www', 'teacherId']);
        });
    }
});

describe('flyt-til-grup.html (dida.dk/grupper → grup.dk)', () => {
    for (const [label, store] of [['de gamle navne', OLD], ['de nye navne', NEW]]) {
        it(`sender klasserne med ${label} til serveren`, async () => {
            let body = null;
            const fetchImpl = async (url, opts) => {
                body = JSON.parse(opts.body);
                return { ok: true, json: async () => ({ token: 'a'.repeat(32) }) };
            };
            const page = run('flyt-til-grup.html', { storage: fakeStorage(store), fetchImpl });
            await new Promise(r => setTimeout(r, 0));
            await new Promise(r => setTimeout(r, 0));
            expect(Object.keys(body.entries).sort()).toEqual(Object.keys(store).filter(k => k !== 'teacherId').sort());
            expect(page.window.redirectedTo).toBe(`https://grup.dk/?migrate=${'a'.repeat(32)}`);
        });
    }

    // Serveren afviser, når dens lager er fuldt (503) eller grænsen er nået
    // (429) — se routes/grupper-transfer.js. Klasserne må så IKKE markeres som
    // flyttet: ellers sendes læreren forbi flytningen ved hvert senere besøg.
    for (const status of [503, 429]) {
        it(`et afslag (${status}) markerer intet som flyttet og sender ingen videre`, async () => {
            const storage = fakeStorage(NEW);
            const fetchImpl = async () => ({ ok: false, status, json: async () => ({ error: 'travlt' }) });
            const page = run('flyt-til-grup.html', { storage, fetchImpl });
            await new Promise(r => setTimeout(r, 0));
            await new Promise(r => setTimeout(r, 0));
            expect(page.window.redirectedTo).toBeUndefined();
            expect(storage.getItem('dida_grupper_migrated_to_grup')).toBeNull();
        });
    }

    // Klasser fra www.dida.dk ligger på dida.dk i én pakke (flyt-modtag.html),
    // ikke løst under grupdk_*. Før blev pakken aldrig sendt med: en lærer, der
    // havde sine klasser på www, kom til grup.dk uden dem (15/11 2026, 148.).
    const STASH = JSON.stringify({ at: '2026-11-15T10:00:00.000Z', entries: OLD });

    async function sendFrom(store) {
        const storage = fakeStorage(store);
        let body = null;
        const fetchImpl = async (url, opts) => {
            body = JSON.parse(opts.body);
            return { ok: true, json: async () => ({ token: 'b'.repeat(32) }) };
        };
        const page = run('flyt-til-grup.html', { storage, fetchImpl });
        await new Promise(r => setTimeout(r, 0));
        await new Promise(r => setTimeout(r, 0));
        return { storage, body, page };
    }

    it('kun en www-pakke på dida.dk: pakken sendes med til grup.dk', async () => {
        const { storage, body, page } = await sendFrom({ dida_grupper_from_www: STASH });
        expect(body.entries).toEqual({ dida_grupper_from_www: STASH });
        expect(page.window.redirectedTo).toBe(`https://grup.dk/?migrate=${'b'.repeat(32)}`);
        expect(storage.getItem('dida_grupper_www_sent_to_grup')).toBe('2026-11-15T10:00:00.000Z');
        // Ingen dida.dk-klasser er sendt, så de er heller ikke "flyttet".
        expect(storage.getItem('dida_grupper_migrated_to_grup')).toBeNull();
    });

    it('klasser OG en www-pakke: begge sendes', async () => {
        const { body } = await sendFrom({ ...NEW, dida_grupper_from_www: STASH });
        expect(Object.keys(body.entries).sort()).toEqual(['dida_grupper_from_www', 'grupdk_classes', 'grupdk_groups_3a.csv']);
    });

    it('allerede flyttet: kun en ny www-pakke sendes — aldrig klasserne igen', async () => {
        const { storage, body } = await sendFrom({
            ...NEW, dida_grupper_migrated_to_grup: '2026-11-04', dida_grupper_from_www: STASH,
        });
        // Sendtes grupdk_* igen, kom en klasse, læreren har slettet på grup.dk, tilbage.
        expect(body.entries).toEqual({ dida_grupper_from_www: STASH });
        expect(storage.getItem('dida_grupper_www_sent_to_grup')).toBe('2026-11-15T10:00:00.000Z');
    });

    it('en www-pakke med en tom ny liste og en fyldt gammel sendes (som flyt-modtag.html afgør det)', async () => {
        const mixed = JSON.stringify({ at: 'y', entries: { ...OLD, grupdk_classes: '[]' } });
        const { body } = await sendFrom({ dida_grupper_from_www: mixed });
        expect(body.entries).toEqual({ dida_grupper_from_www: mixed });
    });

    it('en www-pakke, der allerede er sendt, sendes ikke igen', () => {
        const page = run('flyt-til-grup.html', {
            storage: fakeStorage({ dida_grupper_from_www: STASH, dida_grupper_www_sent_to_grup: '2026-11-15T10:00:00.000Z' }),
            fetchImpl: () => { throw new Error('må ikke kaldes'); },
        });
        expect(page.window.redirectedTo).toBe('https://grup.dk/');
    });

    it('en tom eller ulæselig www-pakke sendes ikke', () => {
        for (const raw of ['{"at":"x","entries":{"groupeng_classes":"[]"}}', 'ikke json']) {
            const page = run('flyt-til-grup.html', {
                storage: fakeStorage({ dida_grupper_from_www: raw }),
                fetchImpl: () => { throw new Error('må ikke kaldes'); },
            });
            expect(page.window.redirectedTo).toBe('https://grup.dk/');
        }
    });

    it('et afslag markerer heller ikke www-pakken som sendt', async () => {
        const storage = fakeStorage({ dida_grupper_from_www: STASH });
        const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
        run('flyt-til-grup.html', { storage, fetchImpl });
        await new Promise(r => setTimeout(r, 0));
        await new Promise(r => setTimeout(r, 0));
        expect(storage.getItem('dida_grupper_www_sent_to_grup')).toBeNull();
    });

    it('uden klasser sendes intet — man sendes bare videre', () => {
        const page = run('flyt-til-grup.html', { storage: fakeStorage({ grupdk_classes: '[]' }), fetchImpl: () => { throw new Error('må ikke kaldes'); } });
        expect(page.window.redirectedTo).toBe('https://grup.dk/');
    });
});
