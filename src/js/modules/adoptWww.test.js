// Klasser flyttet med fra www.dida.dk (se adoptWww.js). Pakken laves her
// præcis som modtagersiden (public/flyt-modtag.html) laver den: alle
// Grupper-nøgler fra www-lageret, samlet i én nøgle.
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { initApiAdapter } from './api_adapter.js';
import { pyBridge } from './py_bridge.js';
import { readClassExtras } from './storage.js';
import {
    adoptFromWww, adoptWwwEntries, countWwwClasses, WWW_STASH_KEY, wwwSettled,
} from './adoptWww.js';
import { fetchWwwGrupperEntries } from './wwwCheck.js';

beforeAll(() => initApiAdapter());

// På www ligger nøglerne under de GAMLE navne — www kører aldrig den nye
// kode. Klassen bygges her med appens egne funktioner (nye navne) og
// omdøbes så til det, www har.
const WWW_NAMES = [
    ['grupdk_classes', 'groupeng_classes'],
    ['grupdk_groups_', 'GroupEng_Groups_'],
    ['grupdk_topics_', 'GroupEng_Topics_'],
    ['grupdk_history_', 'GroupEng_History_'],
    ['grupdk_session_', 'GroupEng_Session_'],
];
const asOnWww = (key) => {
    for (const [now, then] of WWW_NAMES) if (key.startsWith(now)) return then + key.slice(now.length);
    return null;
};

/**
 * Byg "www-lageret" med fn(), pak det som modtagersiden gør, og ryd op.
 * newNames: www, hvor læreren har åbnet Grupper med ?bliv=1 efter 3/11 2026 —
 * så har appen dér selv givet nøglerne de nye navne.
 */
function stashFromWww(fn, { newNames = false } = {}) {
    localStorage.clear();
    pyBridge._invalidateClassesCache();
    fn();
    const entries = {};
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (asOnWww(k)) entries[newNames ? k : asOnWww(k)] = localStorage.getItem(k);
    }
    localStorage.clear();
    pyBridge._invalidateClassesCache();
    return JSON.stringify({ at: '2026-09-12T10:00:00.000Z', entries });
}

/** En klasse med grupper, emne og én gemt session. */
function classWithEverything(name, csv) {
    pyBridge.createClass(name, csv, true);
    const file = pyBridge.getClasses().find(c => c.name === name).filename;
    localStorage.setItem(`grupdk_groups_${file}`, JSON.stringify({
        standard: [{ name: 'Group 1', members: ['r1', 'r2'], locked: false }], matrix: null,
    }));
    localStorage.setItem(`grupdk_topics_${file}`, JSON.stringify({ 'S_Group 1': 'Liberalisme' }));
    localStorage.setItem(`grupdk_history_${file}`, JSON.stringify([
        { id: 'sess-1', date: new Date().toISOString(), name: 'Modul 1', type: 'STANDARD_ONLY' },
    ]));
    localStorage.setItem('grupdk_session_sess-1', JSON.stringify({
        id: 'sess-1', name: 'Modul 1', groups: [{ name: 'Group 1', members: [{ id: 'r1', name: 'Anna' }] }],
    }));
    return file;
}

const names = (cls) => cls.content.data.map(r => r.Navn);

/** Hvor mange tegn lageret bruger — nøgler og værdier, som browserens loft tæller. */
function usedChars() {
    let n = 0;
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        n += k.length + (localStorage.getItem(k) || '').length;
    }
    return n;
}

/**
 * Kør fn med et lager, der har et loft — som browserens (ca. 5 MB), bare i
 * tegn og lille, så testen er hurtig. happy-dom's eget lager har intet loft.
 */
async function withStorageBudget(budget, fn) {
    const store = new Map();
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        store.set(k, localStorage.getItem(k));
    }
    const used = () => [...store].reduce((n, [k, v]) => n + k.length + v.length, 0);
    const limited = {
        getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
        setItem: (k, v) => {
            const key = String(k);
            const value = String(v);
            const old = store.has(key) ? key.length + store.get(key).length : 0;
            if (used() - old + key.length + value.length > budget) {
                const err = new Error('The quota has been exceeded.');
                err.name = 'QuotaExceededError';
                throw err;
            }
            store.set(key, value);
        },
        removeItem: (k) => { store.delete(String(k)); },
        clear: () => { store.clear(); },
        key: (i) => [...store.keys()][i] ?? null,
        get length() { return store.size; },
    };
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: limited });
    try {
        return await fn();
    } finally {
        if (original) Object.defineProperty(globalThis, 'localStorage', original);
        else delete globalThis.localStorage;
        pyBridge._invalidateClassesCache();
    }
}

beforeEach(() => {
    localStorage.clear();
    pyBridge._invalidateClassesCache();
    window.notifyError = vi.fn();
    window.notifyInfo = vi.fn();
    window.notifySuccess = vi.fn();
});

describe('adoptFromWww — klasser flyttet med fra www.dida.dk', () => {
    it('gør ingenting, når der ikke er flyttet noget', async () => {
        pyBridge.createClass('3a', 'Navn\nAnna\n', true);
        expect(await adoptFromWww()).toBeNull();
        expect(pyBridge.getClasses()).toHaveLength(1);
        expect(window.notifySuccess).not.toHaveBeenCalled();
    });

    it('henter en klasse ind med grupper, emner og gemte sessioner', async () => {
        const stash = stashFromWww(() => classWithEverything('1bms SA', 'Navn\nAnna\nBo\n'));
        localStorage.setItem(WWW_STASH_KEY, stash);

        const res = await adoptFromWww();

        expect(res.written).toBe(1);
        const [cls] = pyBridge.getClasses();
        expect(cls.name).toBe('1bms SA');
        expect(names(cls)).toEqual(['Anna', 'Bo']);
        const extras = readClassExtras(cls.filename);
        expect(extras.groups.standard[0].members).toEqual(['r1', 'r2']);
        expect(extras.groupTopics['S_Group 1']).toBe('Liberalisme');
        expect(extras.history).toHaveLength(1);
        expect(Object.values(extras.sessions)[0].name).toBe('Modul 1');
        // Pakken er brugt og fjernet — ellers kom klassen igen ved næste start.
        expect(localStorage.getItem(WWW_STASH_KEY)).toBeNull();
        expect(window.notifySuccess).toHaveBeenCalledWith(expect.stringContaining('1 klasse er hentet fra www.dida.dk'));
    });

    it('beholder begge, når en ANDEN klasse hedder det samme på dida.dk', async () => {
        const stash = stashFromWww(() => classWithEverything('1bms SA', 'Navn\nAnna\nBo\n'));
        pyBridge.createClass('1bms SA', 'Navn\nCecilie\n', true);
        const hereFile = pyBridge.getClasses()[0].filename;
        localStorage.setItem(WWW_STASH_KEY, stash);

        const res = await adoptFromWww();

        expect(res.written).toBe(1);
        const classes = pyBridge.getClasses();
        expect(classes).toHaveLength(2);
        const here = classes.find(c => c.filename === hereFile);
        const moved = classes.find(c => c.filename !== hereFile);
        // Klassen på dida.dk er urørt …
        expect(here.name).toBe('1bms SA');
        expect(names(here)).toEqual(['Cecilie']);
        // … og den fra www står ved siden af, tydeligt mærket, med sine grupper.
        expect(moved.name).toBe('1bms SA (fra www.dida.dk)');
        expect(names(moved)).toEqual(['Anna', 'Bo']);
        expect(readClassExtras(moved.filename).groups.standard).toHaveLength(1);
    });

    it('lægger ikke en klasse ind to gange, når den allerede er her', async () => {
        const stash = stashFromWww(() => pyBridge.createClass('3a', 'Navn\nAnna\nBo\n', true));
        // Samme klasse, samme elever — fx lagt ind med en backup i mellemtiden.
        localStorage.setItem('grupdk_classes', JSON.parse(stash).entries.groupeng_classes);
        pyBridge._invalidateClassesCache();
        localStorage.setItem(WWW_STASH_KEY, stash);

        const res = await adoptFromWww();

        expect(res.written).toBe(0);
        expect(res.alreadyHere).toBe(1);
        expect(pyBridge.getClasses()).toHaveLength(1);
        expect(localStorage.getItem(WWW_STASH_KEY)).toBeNull();
        expect(window.notifySuccess).not.toHaveBeenCalled();
    });

    // Forsidens vej: svaret fra www.dida.dk/flyt-send.html hentes direkte ind,
    // uden en pakke i lageret.
    it('henter svaret fra www direkte ind (forsidens "Hent dem")', async () => {
        const entries = JSON.parse(stashFromWww(() => {
            classWithEverything('1bms SA', 'Navn\nAnna\nBo\n');
            pyBridge.createClass('2bms SA', 'Navn\nCecilie\n', true);
        })).entries;
        expect(countWwwClasses(entries)).toBe(2);

        const res = await adoptWwwEntries(entries);

        expect(res.written).toBe(2);
        expect(pyBridge.getClasses().map(c => c.name).sort()).toEqual(['1bms SA', '2bms SA']);
        expect(localStorage.getItem(WWW_STASH_KEY)).toBeNull();
    });

    it('henter også klasser, som www allerede har givet de nye navne (?bliv=1)', async () => {
        const entries = JSON.parse(stashFromWww(() => classWithEverything('1bms SA', 'Navn\nAnna\nBo\n'), { newNames: true })).entries;
        expect(Object.keys(entries).some(k => k.startsWith('grupdk_groups_'))).toBe(true);
        expect(countWwwClasses(entries)).toBe(1);

        const res = await adoptWwwEntries(entries);

        expect(res.written).toBe(1);
        const moved = pyBridge.getClasses()[0];
        expect(names(moved)).toEqual(['Anna', 'Bo']);
        expect(readClassExtras(moved.filename).groups.standard).toHaveLength(1);
        expect(readClassExtras(moved.filename).history).toHaveLength(1);
    });

    it('tæller ingen klasser i et tomt eller ulæseligt svar', () => {
        expect(countWwwClasses(null)).toBe(0);
        expect(countWwwClasses({})).toBe(0);
        expect(countWwwClasses({ groupeng_classes: '[]' })).toBe(0);
        expect(countWwwClasses({ groupeng_classes: '{ikke json' })).toBe(0);
    });

    // Tjekket må aldrig åbne en iframe mod det rigtige www.dida.dk, når
    // appen kører lokalt, i Vite eller i en test.
    it('spørger ikke www, når appen ikke kører på https://dida.dk', async () => {
        const before = document.querySelectorAll('iframe').length;
        expect(await fetchWwwGrupperEntries()).toBeNull();
        expect(document.querySelectorAll('iframe').length).toBe(before);
    });

    // Pakken er en fuld kopi af www-klasserne. Lå den stadig i lageret, mens
    // klasserne blev skrevet, skulle lageret rumme dem to gange på én gang —
    // og en lærer med meget historik fik "kunne IKKE hentes" af den grund.
    it('fjerner pakken, før klasserne skrives — lageret skal ikke rumme dem to gange', async () => {
        const csv = 'Navn\n' + Array.from({ length: 300 }, (_, i) => `Elev nummer ${i}`).join('\n') + '\n';
        const stash = stashFromWww(() => classWithEverything('1bms SA', csv));

        // Hvor meget fylder klassen, når den er hentet ind? Målt uden loft.
        localStorage.setItem(WWW_STASH_KEY, stash);
        await adoptFromWww();
        const copy = usedChars();
        localStorage.clear();
        pyBridge._invalidateClassesCache();

        // Loftet giver plads til pakken ELLER den hentede klasse — ikke begge.
        const budget = Math.max(copy, WWW_STASH_KEY.length + stash.length) + 2000;
        const res = await withStorageBudget(budget, async () => {
            localStorage.setItem(WWW_STASH_KEY, stash);
            return adoptFromWww();
        });

        expect(res.error).toBeUndefined();
        expect(res.failed).toEqual([]);
        expect(res.partial).toEqual([]);
        expect(res.written).toBe(1);
    });

    // Forsiden tilbyder www's klasser, når Grupper står tom. Uden et mærke kom
    // tilbuddet igen, hver gang læreren havde slettet sine klasser her — www
    // ryddes aldrig, så de gamle klasser lå der stadig.
    it('husker, at www-klasserne er hentet, så forsiden ikke tilbyder dem igen', async () => {
        const entries = JSON.parse(stashFromWww(() => pyBridge.createClass('3a', 'Navn\nAnna\n', true))).entries;
        expect(wwwSettled()).toBe(false);

        await adoptWwwEntries(entries);

        expect(wwwSettled()).toBe(true);
    });

    it('husker det ikke, når klasserne ikke kunne hentes', async () => {
        await adoptWwwEntries({ groupeng_classes: '{ikke json' });
        expect(wwwSettled()).toBe(false);
    });

    it('siger fra og rydder op, når pakken ikke kan læses', async () => {
        localStorage.setItem(WWW_STASH_KEY, '{ikke json');

        const res = await adoptFromWww();

        expect(res.error).toBeTruthy();
        expect(localStorage.getItem(WWW_STASH_KEY)).toBeNull();
        expect(window.notifyError).toHaveBeenCalledWith(expect.stringContaining('?bliv=1'));
    });
});
