// Flytningen fra de gamle nøglenavne (groupeng_classes, GroupEng_…) til de
// nye (grupdk_…). Lærerens klasser findes KUN i browseren, så testene her
// prøver især det, der kan gå galt: fuldt lager, en fane der lukkes midt i,
// begge navne på én gang, et lager der lyver eller kaster, og en gammel fane,
// der skriver videre under de gamle navne — også én, der lægger en klasse
// ind igen, efter at den rigtige er flyttet.
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    migrateLegacyStorage, migrateLegacySession, currentKeyFor, toCurrentEntries,
    adoptTransferEntries, planClassLists, hasLegacyData,
} from './migrateStorage.js';
import { pyBridge } from './py_bridge.js';
import * as storage from './storage.js';

/**
 * Et lager som browserens, med de svagheder vi skal kunne tåle:
 *  - quota:        loft i tegn (nøgler + værdier), som browserens ca. 5 MB
 *  - throws:       alt kaster (privat vindue, blokeret lager)
 *  - ignoreWrites: setItem siger ja, men gemmer intet for nøgler, der matcher
 *  - fullFor:      setItem melder fuldt lager for nøgler, der matcher
 *  - failAt:       setItem nummer N (fra 1) melder fuldt lager — én gang
 *  - onSet:        kaldes efter hver vellykket setItem (en anden fane, der
 *                  skriver midt i)
 * Hver ændring gemmes som et øjebliksbillede, så en afbrudt kørsel kan
 * genskabes fra ethvert punkt.
 */
function fakeStorage(init = {}, { quota = Infinity, throws = false, ignoreWrites = null, fullFor = null, failAt = 0, onSet = null } = {}) {
    const map = new Map(Object.entries(init));
    const used = () => [...map].reduce((n, [k, v]) => n + k.length + v.length, 0);
    const guard = () => { if (throws) throw Object.assign(new Error('blokeret'), { name: 'SecurityError' }); };
    const full = () => Object.assign(new Error('fuldt'), { name: 'QuotaExceededError' });
    let sets = 0;
    const store = {
        snapshots: [],
        get length() { guard(); return map.size; },
        key(i) { guard(); return [...map.keys()][i] ?? null; },
        getItem(k) { guard(); return map.has(k) ? map.get(k) : null; },
        setItem(k, v) {
            guard();
            v = String(v);
            sets++;
            if (failAt && sets === failAt) throw full();
            if (ignoreWrites && ignoreWrites.test(k)) return;
            if (fullFor && fullFor.test(k)) throw full();
            const prev = map.get(k);
            const size = used() - (prev !== undefined ? k.length + prev.length : 0) + k.length + v.length;
            if (size > quota) throw full();
            map.set(k, v);
            store.snapshots.push(Object.fromEntries(map));
            onSet?.(k, map);
        },
        removeItem(k) { guard(); map.delete(k); store.snapshots.push(Object.fromEntries(map)); },
        dump() { return Object.fromEntries(map); },
        used,
    };
    return store;
}

const J = JSON.stringify;
const cls = (filename, stamp, names = ['Anna', 'Bo'], extra = {}) => ({
    filename, name: filename.replace('.csv', ''), last_modified: stamp,
    content: { data: names.map((n, i) => ({ Navn: n, _rowId: `r${i}` })), rules: [], ...extra },
});
const parsed = (store, key) => JSON.parse(store.getItem(key));
const byFile = (list) => Object.fromEntries(list.map(c => [c.filename, c]));

/** Et gammelt lager som en lærers efter et halvt års brug. */
function legacyStore(extra = {}) {
    return {
        groupeng_classes: J([cls('3a.csv', '2026-10-01T10:00:00.000Z', ['Anna', 'Bo'], { rules: [{ type: 'balance' }] }),
            cls('2b.csv', '2026-10-02T10:00:00.000Z', ['Cecilie'])]),
        'GroupEng_Groups_3a.csv': J({ standard: [{ name: 'Group 1', members: ['r0', 'r1'] }], matrix: null }),
        'GroupEng_Topics_3a.csv': J({ 'S_Group 1': 'Liberalisme' }),
        'GroupEng_History_3a.csv': J([{ id: 'sess-1', date: '2026-10-01', name: 'Modul 1' }]),
        'GroupEng_Session_sess-1': J({ id: 'sess-1', groups: [] }),
        'GroupEng_Groups_2b.csv': J({ standard: [], matrix: null }),
        GroupEng_Last_Class: '3a.csv',
        GroupEng_Last_Class_Index: '0',
        GroupEng_News_Filter: 'features',
        'groupeng-theme': 'dark',               // ryddes af beta.js, ikke her
        'grupper-opskrift-guide-set': '1',      // et grupper-navn: bliver
        teacherId: 'abc',                       // dida.dk's egen: bliver
        ...extra,
    };
}

/** Hvad et gammelt lager uden konflikter skal ende som. */
function expectedFrom(old) {
    const out = {};
    for (const [k, v] of Object.entries(old)) out[currentKeyFor(k) ?? k] = v;
    return out;
}

/** Lageret efter flytningen af legacyStore() — "den rigtige 3a" er flyttet. */
function migrated() {
    const store = fakeStorage(legacyStore());
    migrateLegacyStorage(store);
    return store;
}

describe('navnene', () => {
    it('hvert gammelt navn har ét nyt — hele navne før præfikser', () => {
        expect(currentKeyFor('groupeng_classes')).toBe('grupdk_classes');
        expect(currentKeyFor('GroupEng_Last_Class')).toBe('grupdk_last_class');
        expect(currentKeyFor('GroupEng_Last_Class_Index')).toBe('grupdk_last_class_index');
        expect(currentKeyFor('GroupEng_News_Filter')).toBe('grupdk_news_filter');
        expect(currentKeyFor('GroupEng_Groups_3a.csv')).toBe('grupdk_groups_3a.csv');
        expect(currentKeyFor('GroupEng_Topics_3a.csv')).toBe('grupdk_topics_3a.csv');
        expect(currentKeyFor('GroupEng_History_3a.csv')).toBe('grupdk_history_3a.csv');
        expect(currentKeyFor('GroupEng_Session_sess-1')).toBe('grupdk_session_sess-1');
    });

    it('ukendte, nye og andre værktøjers navne røres ikke', () => {
        for (const k of ['groupeng-theme', 'GroupEng_Ukendt', 'GroupEng_Groups_', 'grupdk_classes', 'teacherId', 'grupper-udgave', null]) {
            expect(currentKeyFor(k)).toBeNull();
        }
    });
});

describe('flytningen', () => {
    it('et helt gammelt lager: alt står under de nye navne, intet under de gamle', () => {
        const old = legacyStore();
        const store = fakeStorage(old);
        const report = migrateLegacyStorage(store);
        expect(store.dump()).toEqual(expectedFrom(old));
        expect(report.failed).toEqual([]);
        expect(report.moved).toBe(9);
        expect(hasLegacyData(store)).toBe(false);
    });

    it('klasselisten flyttes efter grupper, emner, historik og indstillinger', () => {
        const store = migrated();
        const gone = store.snapshots.findIndex(s => !('groupeng_classes' in s));
        expect(Object.keys(store.snapshots[gone]).filter(k => k.startsWith('GroupEng_'))).toEqual([]);
    });

    it('et lager uden gamle navne: intet sker', () => {
        const done = expectedFrom(legacyStore());
        const store = fakeStorage(done);
        const report = migrateLegacyStorage(store);
        expect(store.dump()).toEqual(done);
        expect(store.snapshots).toHaveLength(0);
        expect(report.moved + report.dropped + report.replaced + report.merged).toBe(0);
    });

    it('"__proto__" er et filnavn og et id som alle andre', () => {
        const store = fakeStorage({
            groupeng_classes: J([cls('__proto__', '2026-10-01')]),
            'GroupEng_Groups___proto__': J({ standard: [] }),
            'GroupEng_Session___proto__': J({ id: '__proto__' }),
        });
        migrateLegacyStorage(store);
        expect(Object.keys(store.dump()).sort()).toEqual(['grupdk_classes', 'grupdk_groups___proto__', 'grupdk_session___proto__']);
    });

    it('ukendte gamle-lignende navne røres ikke, men nævnes', () => {
        const store = fakeStorage({ GroupEng_Ukendt: 'x', 'groupeng-theme': 'dark' });
        const report = migrateLegacyStorage(store);
        expect(store.dump()).toEqual({ GroupEng_Ukendt: 'x', 'groupeng-theme': 'dark' });
        expect(report.unknown).toEqual(['GroupEng_Ukendt']);
    });
});

describe('en klasse under det gamle navn erstatter ALDRIG en under det nye', () => {
    for (const [label, stamp] of [['nyere', '2026-11-05'], ['ældre', '2026-01-01'], ['samme tid', '2026-10-01T10:00:00.000Z'], ['uden tid', undefined]]) {
        it(`den gamle er ${label}: den bliver en kopi med egne nøgler, den rigtige er urørt`, () => {
            const store = migrated();
            const real = store.dump();
            const other = cls('3a.csv', stamp, ['Fremmed'], { rules: [] });
            if (stamp === undefined) delete other.last_modified;
            store.setItem('groupeng_classes', J([other]));
            store.setItem('GroupEng_Groups_3a.csv', J({ standard: [{ name: 'Group 1', members: ['r0'] }] }));
            const report = migrateLegacyStorage(store);

            const list = byFile(parsed(store, 'grupdk_classes'));
            expect(list['3a.csv']).toEqual(JSON.parse(real.grupdk_classes)[0]);
            expect(list['3a_kopi.csv']).toMatchObject({ name: '3a (kopi)', legacyFilename: '3a.csv' });
            expect(list['3a_kopi.csv'].content.data.map(r => r.Navn)).toEqual(['Fremmed']);
            expect(store.getItem('grupdk_groups_3a.csv')).toBe(real['grupdk_groups_3a.csv']);
            expect(parsed(store, 'grupdk_groups_3a_kopi.csv').standard[0].members).toEqual(['r0']);
            expect(report.copies).toEqual([{ from: '3a.csv', to: '3a_kopi.csv', name: '3a (kopi)' }]);
            expect(hasLegacyData(store)).toBe(false);
        });
    }

    it('samme klasse med præcis samme indhold: ingen kopi', () => {
        const store = migrated();
        store.setItem('groupeng_classes', store.getItem('grupdk_classes'));
        migrateLegacyStorage(store);
        expect(parsed(store, 'grupdk_classes')).toHaveLength(2);
    });

    it('den gamle fanes næste udgave opdaterer KOPIEN (nyere) — aldrig en kopi nummer to', () => {
        const store = migrated();
        store.setItem('groupeng_classes', J([cls('3a.csv', '2026-11-05', ['Første'])]));
        migrateLegacyStorage(store);
        store.setItem('groupeng_classes', J([cls('3a.csv', '2026-11-06', ['Anden'])]));
        migrateLegacyStorage(store);
        store.setItem('groupeng_classes', J([cls('3a.csv', '2026-11-01', ['Ældre'])]));
        migrateLegacyStorage(store);
        const list = parsed(store, 'grupdk_classes');
        expect(list.map(c => c.filename)).toEqual(['3a.csv', '2b.csv', '3a_kopi.csv']);
        expect(byFile(list)['3a_kopi.csv'].content.data.map(r => r.Navn)).toEqual(['Anden']);
        expect(byFile(list)['3a.csv'].content.data.map(r => r.Navn)).toEqual(['Anna', 'Bo']);
    });

    it('en klasse, der kun findes under det gamle navn, lægges ind som den er', () => {
        const store = migrated();
        store.setItem('groupeng_classes', J([cls('ny.csv', '2026-11-05')]));
        store.setItem('GroupEng_Groups_ny.csv', 'grupper');
        migrateLegacyStorage(store);
        expect(parsed(store, 'grupdk_classes').map(c => c.filename)).toEqual(['3a.csv', '2b.csv', 'ny.csv']);
        expect(store.getItem('grupdk_groups_ny.csv')).toBe('grupper');
    });

    it('planClassLists: den nye listes rækkefølge bevares, kopier og nye lægges til sidst', () => {
        const { list, copies } = planClassLists([cls('b', '1'), cls('a', '1')], [cls('c', '1'), cls('a', '0', ['X'])]);
        expect(list.map(c => c.filename)).toEqual(['b', 'a', 'c', 'a_kopi.csv']);
        expect(copies).toHaveLength(1);
    });
});

describe('fund 1: en gammel fane lægger klassen ind igen efter flytningen', () => {
    // Den gamle fane så klasselisten forsvinde ("slettet i en anden fane") og
    // importerede klassen igen — eller gendannede en backup — under SAMME
    // filnavn. Klassen skrives først, så grupper, emner og historik
    // (restoreBackup i api.js), hver som sin egen storage-hændelse.
    function oldTabRestore(store, order) {
        const writes = {
            groupeng_classes: J([cls('3a.csv', '2026-11-05T09:00:00.000Z', ['Anna', 'Bo'], { rules: [] })]),
            'GroupEng_Groups_3a.csv': J({ standard: [{ name: 'Group 1', members: ['r1', 'r0'] }] }),
            'GroupEng_History_3a.csv': J([{ id: 'sess-9', date: '2026-11-05', name: 'Fra backup' }]),
            'GroupEng_Session_sess-9': J({ id: 'sess-9' }),
        };
        for (const key of order) {
            store.setItem(key, writes[key]);
            migrateLegacyStorage(store, { freshKey: key });   // den nye fanes lytter
        }
        migrateLegacyStorage(store);                           // og næste opstart
    }
    const real = migrated().dump();

    for (const order of [
        ['groupeng_classes', 'GroupEng_Groups_3a.csv', 'GroupEng_History_3a.csv', 'GroupEng_Session_sess-9'],
        ['GroupEng_Groups_3a.csv', 'GroupEng_History_3a.csv', 'GroupEng_Session_sess-9', 'groupeng_classes'],
    ]) {
        it(`den rigtige 3a beholder regler, grupper, historik og session (${order[0]} først)`, () => {
            const store = migrated();
            oldTabRestore(store, order);
            const list = byFile(parsed(store, 'grupdk_classes'));
            expect(list['3a.csv']).toEqual(byFile(JSON.parse(real.grupdk_classes))['3a.csv']);
            expect(list['3a.csv'].content.rules).toEqual([{ type: 'balance' }]);
            for (const k of ['grupdk_groups_3a.csv', 'grupdk_topics_3a.csv', 'grupdk_history_3a.csv', 'grupdk_session_sess-1']) {
                expect(store.getItem(k), k).toBe(real[k]);
            }
            // Den gamle fanes udgave står som kopi, med sine egne nøgler.
            expect(list['3a_kopi.csv'].legacyFilename).toBe('3a.csv');
            expect(parsed(store, 'grupdk_groups_3a_kopi.csv').standard[0].members).toEqual(['r1', 'r0']);
            expect(parsed(store, 'grupdk_history_3a_kopi.csv')[0].id).toBe('sess-9');
            expect(store.getItem('grupdk_session_sess-9')).not.toBeNull();
            expect(hasLegacyData(store)).toBe(false);
        });
    }

    it('den gamle fanes senere skrivninger rammer kopien (den ferske vinder dér)', () => {
        const store = migrated();
        oldTabRestore(store, ['groupeng_classes', 'GroupEng_Groups_3a.csv']);
        store.setItem('GroupEng_Groups_3a.csv', 'flyttet igen i den gamle fane');
        migrateLegacyStorage(store, { freshKey: 'GroupEng_Groups_3a.csv' });
        expect(store.getItem('grupdk_groups_3a_kopi.csv')).toBe('flyttet igen i den gamle fane');
        expect(store.getItem('grupdk_groups_3a.csv')).toBe(real['grupdk_groups_3a.csv']);
    });

    it('en fersk skrivning til en RIGTIG klasses grupper overskriver intet — begge bliver', () => {
        const store = migrated();
        store.setItem('GroupEng_Groups_3a.csv', 'fra en gammel fane');
        const report = migrateLegacyStorage(store, { freshKey: 'GroupEng_Groups_3a.csv' });
        expect(store.getItem('grupdk_groups_3a.csv')).toBe(real['grupdk_groups_3a.csv']);
        expect(store.getItem('GroupEng_Groups_3a.csv')).toBe('fra en gammel fane');
        expect(report.undecided).toEqual(['GroupEng_Groups_3a.csv']);
        expect(hasLegacyData(store)).toBe(true);   // oprydningen holder sig væk
    });

    it('en indstilling: den gamle fanes ferske valg vinder, ellers den nye', () => {
        const store = migrated();
        store.setItem('GroupEng_Last_Class', '2b.csv');
        migrateLegacyStorage(store, { freshKey: 'GroupEng_Last_Class' });
        expect(store.getItem('grupdk_last_class')).toBe('2b.csv');
        store.setItem('GroupEng_Last_Class', 'gammel rest');
        migrateLegacyStorage(store);
        expect(store.getItem('grupdk_last_class')).toBe('2b.csv');
    });
});

describe('fund 2: noget fejler undervejs — næste kørsel kan stadig beslutte', () => {
    it('fejler en klasses nøgle, bliver den gamle klasseliste stående; næste kørsel gør det færdigt', () => {
        const old = legacyStore();
        const store = fakeStorage(old, { fullFor: /^grupdk_topics_/ });
        const report = migrateLegacyStorage(store);
        expect(store.getItem('groupeng_classes')).toBe(old.groupeng_classes);
        expect(report.failed).toContainEqual({ key: 'groupeng_classes', reason: 'waiting' });
        const healed = fakeStorage(store.dump());
        migrateLegacyStorage(healed);
        expect(healed.dump()).toEqual(expectedFrom(old));
    });

    it('begge navne for en klasses nøgle, og ingen gammel liste at sammenligne med: ingen slettes', () => {
        const store = fakeStorage({ ...expectedFrom(legacyStore()), 'GroupEng_History_3a.csv': J([{ id: 'andet' }]) });
        const report = migrateLegacyStorage(store);
        expect(store.getItem('GroupEng_History_3a.csv')).toBe(J([{ id: 'andet' }]));
        expect(store.getItem('grupdk_history_3a.csv')).toBe(legacyStore()['GroupEng_History_3a.csv']);
        expect(report.undecided).toEqual(['GroupEng_History_3a.csv']);
    });

    it('en gammel nøgle, en anden fane skriver til midt i flytningen, slettes ikke', () => {
        const store = fakeStorage(legacyStore(), {
            onSet: (k, map) => { if (k === 'grupdk_groups_3a.csv') map.set('GroupEng_Groups_3a.csv', 'skrevet imens'); },
        });
        const report = migrateLegacyStorage(store);
        expect(store.getItem('GroupEng_Groups_3a.csv')).toBe('skrevet imens');
        expect(report.changed).toContain('GroupEng_Groups_3a.csv');
    });
});

// ─── Afbrudt og fejlet hvor som helst, i alle konflikt-tilstande ───────────

/** Tilstande, hvor gammelt og nyt møder hinanden. */
function conflictStates() {
    const real = migrated().dump();
    const realList = JSON.parse(real.grupdk_classes);
    const withOld = (entry, extra = {}) => ({ ...real, groupeng_classes: J([entry]), ...extra });
    const linked = { ...realList[0], filename: '3a_kopi.csv', name: '3a (kopi)', legacyFilename: '3a.csv', last_modified: '2026-11-01' };
    const noStamp = cls('3a.csv', undefined, ['Uden tid']); delete noStamp.last_modified;
    return {
        'et helt gammelt lager': legacyStore(),
        'gammel nyere': withOld(cls('3a.csv', '2026-11-05', ['Ny']), { 'GroupEng_Groups_3a.csv': 'G-ny' }),
        'gammel ældre': withOld(cls('3a.csv', '2026-01-01', ['Gl']), { 'GroupEng_Groups_3a.csv': 'G-gl' }),
        'samme tid': withOld(cls('3a.csv', realList[0].last_modified, ['Samme']), { 'GroupEng_Topics_3a.csv': 'T' }),
        'uden tid': withOld(noStamp, { 'GroupEng_History_3a.csv': '[]' }),
        'en kopi findes': {
            ...real, grupdk_classes: J([...realList, linked]),
            groupeng_classes: J([cls('3a.csv', '2026-11-09', ['Nyeste'])]), 'GroupEng_Groups_3a.csv': 'G-kopi',
        },
        'ulæselig gammel liste': { ...real, groupeng_classes: '{ødelagt', 'GroupEng_Groups_2b.csv': 'G' },
        'kun gamle nøgler, ingen gammel liste': { ...real, 'GroupEng_Groups_3a.csv': 'G-løs', GroupEng_News_Filter: 'alle' },
        // Fund 4: to gamle navne på samme nye, og rester under kopiens filnavn.
        'gammel klasse med kopiens filnavn': {
            ...real, grupdk_classes: J([...realList, { ...linked, filename: '3a_kopi.csv' }]),
            groupeng_classes: J([cls('3a_kopi.csv', '2026-11-09', ['Ny klasse'])]),
            'GroupEng_Groups_3a.csv': 'G-kopi', 'GroupEng_Groups_3a_kopi.csv': 'G-ny-klasse',
        },
        'rester under kopiens filnavn': {
            ...real, groupeng_classes: J([cls('3a.csv', '2026-11-05', ['Konflikt'])]), 'GroupEng_Groups_3a.csv': 'G-konflikt',
            'grupdk_groups_3a_kopi.csv': 'rest', 'GroupEng_Topics_3a_kopi.csv': 'gammel rest',
        },
    };
}

/**
 * Hver oprindelig værdi skal findes et sted i lageret (klasser: deres
 * indhold). Indstillingerne (sidste klasse, nyhedsfilteret) er undtaget: står
 * de under begge navne, vinder den nye med vilje.
 */
const SETTINGS = new Set(['GroupEng_Last_Class', 'GroupEng_Last_Class_Index', 'GroupEng_News_Filter']);
function everythingStillThere(state, original) {
    const values = new Set(Object.values(state));
    const contents = new Set();
    for (const k of ['groupeng_classes', 'grupdk_classes']) {
        try { for (const c of JSON.parse(state[k] ?? '[]')) contents.add(J(c?.content)); } catch { /* ulæselig: står som rå værdi */ }
    }
    for (const [k, v] of Object.entries(original)) {
        if (k === 'groupeng_classes' || k === 'grupdk_classes') {
            let list;
            try { list = JSON.parse(v); } catch { if (!values.has(v)) return `${k} (rå)`; continue; }
            for (const c of list) if (!contents.has(J(c?.content))) return `${k}: ${c?.filename}`;
        } else if (!SETTINGS.has(k) && !values.has(v)) {
            return k;
        }
    }
    return null;
}

/**
 * En kopis grupper/emner/historik må aldrig stå i lageret uden kopien selv:
 * så ville oprydningen ved opstart kunne tage dem for rester af en slettet
 * klasse (og et filnavn uden klasse kunne senere gå til en anden).
 * `copies`: de filnavne, der er kopier (legacyFilename) i slutresultatet —
 * rester af en slettet klasse under et "_kopi"-navn er ikke en kopi.
 */
function copyKeysWithoutCopy(state, copies) {
    let files;
    try { files = new Set(JSON.parse(state.grupdk_classes ?? '[]').map(c => c?.filename)); } catch { return null; }
    for (const k of Object.keys(state)) {
        const m = k.match(/^grupdk_(?:groups|topics|history)_(.+)$/);
        if (m && copies.has(m[1]) && !files.has(m[1])) return k;
    }
    return null;
}

/** Filnavnene på kopierne i et lager. */
const copiesIn = (state) => new Set(JSON.parse(state.grupdk_classes ?? '[]').filter(c => c?.legacyFilename).map(c => c.filename));

describe('afbrudt eller fejlet hvor som helst — i alle konflikt-tilstande', () => {
    for (const [label, init] of Object.entries(conflictStates())) {
        it(`${label}: lukket efter hvert skridt → næste opstart giver det samme, og intet er væk undervejs`, () => {
            const full = fakeStorage(init);
            migrateLegacyStorage(full);
            const expected = full.dump();
            // To kørsler ændrer intet mere.
            migrateLegacyStorage(full);
            expect(full.dump()).toEqual(expected);
            for (const [i, state] of full.snapshots.entries()) {
                expect(everythingStillThere(state, init), `skridt ${i + 1}`).toBeNull();
                expect(copyKeysWithoutCopy(state, copiesIn(expected)), `skridt ${i + 1}`).toBeNull();
                const resumed = fakeStorage(state);
                migrateLegacyStorage(resumed);
                expect(resumed.dump(), `afbrudt efter skridt ${i + 1}`).toEqual(expected);
            }
        });

        it(`${label}: fuldt lager ved hvert skridt → en ny kørsel giver det samme`, () => {
            const full = fakeStorage(init);
            migrateLegacyStorage(full);
            const expected = full.dump();
            const writes = full.snapshots.length;
            for (let k = 1; k <= writes; k++) {
                const faulty = fakeStorage(init, { failAt: k });
                const report = migrateLegacyStorage(faulty);
                expect(report.lost, `fejl ved skrivning ${k}`).toEqual([]);
                expect(everythingStillThere(faulty.dump(), init), `fejl ved skrivning ${k}`).toBeNull();
                const rerun = fakeStorage(faulty.dump());
                migrateLegacyStorage(rerun);
                expect(rerun.dump(), `fejl ved skrivning ${k}`).toEqual(expected);
            }
        });
    }
});

describe('fuldt lager', () => {
    it('kan den nye ikke skrives ved siden af den gamle, gives der plads ved at fjerne den gamle først', () => {
        const big = 'x'.repeat(5000);
        const store = fakeStorage({ 'GroupEng_Groups_3a.csv': big }, { quota: 7000 });
        const report = migrateLegacyStorage(store);
        expect(store.dump()).toEqual({ 'grupdk_groups_3a.csv': big });
        expect(report.quotaFallback).toEqual(['GroupEng_Groups_3a.csv']);
        expect(report.failed).toEqual([]);
    });

    it('den store klasseliste i et næsten fuldt lager kommer også over', () => {
        const old = legacyStore({ groupeng_classes: J(Array.from({ length: 40 }, (_, i) => cls(`k${i}.csv`, '2026-10-01', Array(30).fill('Elev')))) });
        const store = fakeStorage(old, { quota: fakeStorage(old).used() + 200 });
        const report = migrateLegacyStorage(store);
        expect(store.dump()).toEqual(expectedFrom(old));
        expect(report.quotaFallback).toContain('groupeng_classes');
    });

    it('er der heller ikke plads, når den gamle er væk, lægges den gamle tilbage — og klasselisten venter', () => {
        const init = {
            groupeng_classes: J([cls('gammel.csv', '2026-10-01')]),
            grupdk_classes: J([cls('ny.csv', '2026-10-01')]),
            'GroupEng_Groups_gammel.csv': 'grupper',
        };
        const store = fakeStorage(init, { fullFor: /^grupdk_/ });
        const report = migrateLegacyStorage(store);
        expect(store.dump()).toEqual(init);
        expect(report.failed).toEqual([
            { key: 'GroupEng_Groups_gammel.csv', reason: 'quota' },
            { key: 'groupeng_classes', reason: 'waiting' },
        ]);
        expect(report.lost).toEqual([]);
    });

    it('det værste: hverken ny eller gammel kan skrives — værdien kommer med i rapporten', () => {
        const store = fakeStorage({ GroupEng_Last_Class: '3a.csv' }, { fullFor: /./ });
        const report = migrateLegacyStorage(store);
        expect(report.lost).toEqual([{ key: 'GroupEng_Last_Class', value: '3a.csv' }]);
    });
});

describe('et lager, der ikke opfører sig', () => {
    it('et lager, der kaster ved alt (privat vindue): ingen fejl ud, intet ændret', () => {
        const store = fakeStorage(legacyStore(), { throws: true });
        let report;
        expect(() => { report = migrateLegacyStorage(store); }).not.toThrow();
        expect(report.error).toBe('unreadable');
        expect(() => migrateLegacySession(store)).not.toThrow();
        expect(hasLegacyData(store)).toBe(true);   // kan ikke se efter: antag det værste
    });

    it('et lager, der siger ja men ikke gemmer: den gamle slettes ALDRIG', () => {
        const old = legacyStore();
        const store = fakeStorage(old, { ignoreWrites: /^grupdk_/ });
        const report = migrateLegacyStorage(store);
        expect(store.dump()).toEqual(old);
        expect(report.failed.every(f => f.reason === 'verify' || f.reason === 'waiting')).toBe(true);
    });

    it('en ulæselig gammel liste ved siden af en læselig ny: begge bliver', () => {
        const init = { groupeng_classes: '{ødelagt', grupdk_classes: J([cls('3a.csv', '2026-10-01')]) };
        const store = fakeStorage(init);
        const report = migrateLegacyStorage(store);
        expect(store.dump()).toEqual(init);
        expect(report.failed).toEqual([{ key: 'groupeng_classes', reason: 'unreadable' }]);
    });

    it('en ulæselig gammel liste uden en ny flyttes, som den er (appen siger selv, at den ikke kan læses)', () => {
        const store = fakeStorage({ groupeng_classes: '{ødelagt' });
        migrateLegacyStorage(store);
        expect(store.dump()).toEqual({ grupdk_classes: '{ødelagt' });
    });

    it('ingen storage overhovedet', () => {
        expect(migrateLegacyStorage(null).moved).toBe(0);
    });
});

afterEach(() => { localStorage.clear(); sessionStorage.clear(); });

describe('storage-hændelsen i en ny fane', () => {
    it('flytter en gammel fanes skrivning med det samme — og fanens egne lyttere får besked', async () => {
        vi.resetModules();
        localStorage.clear();
        await import('./storageStartup.js');
        const heard = [];
        const listener = (e) => heard.push(e.key);
        window.addEventListener('storage', listener);
        try {
            localStorage.setItem('GroupEng_Groups_ny.csv', 'fra gammel fane');
            window.dispatchEvent(new StorageEvent('storage', {
                key: 'GroupEng_Groups_ny.csv', newValue: 'fra gammel fane', storageArea: localStorage,
            }));
            expect(localStorage.getItem('grupdk_groups_ny.csv')).toBe('fra gammel fane');
            expect(localStorage.getItem('GroupEng_Groups_ny.csv')).toBeNull();
            expect(heard).toContain('grupdk_groups_ny.csv');

            // En sletning (en anden ny fanes flytning) giver ingen reaktion.
            localStorage.setItem('GroupEng_Last_Class', 'x');
            window.dispatchEvent(new StorageEvent('storage', { key: 'GroupEng_Groups_ny.csv', newValue: null, storageArea: localStorage }));
            expect(localStorage.getItem('GroupEng_Last_Class')).toBe('x');
        } finally {
            window.removeEventListener('storage', listener);
        }
    });
});

describe('sessionStorage', () => {
    it('flyttes; findes begge, bliver den nye', () => {
        const store = fakeStorage({ GroupEng_NavView: 'class', GroupEng_ClassTab: 'groups', GroupEng_StorageWarned: '1', grupdk_class_tab: 'students' });
        migrateLegacySession(store);
        expect(store.dump()).toEqual({ grupdk_nav_view: 'class', grupdk_class_tab: 'students', grupdk_storage_warned: '1' });
    });
});

describe('pakker udefra (dida.dk/grupper og www.dida.dk) — samme regler som lageret', () => {
    const oldList = J([cls('3a.csv', '2026-10-01', ['Fra gammel']), cls('kun-gammel.csv', '2026-10-01')]);
    const newList = J([cls('3a.csv', '2026-11-01', ['Fra ny'])]);

    it('med begge navne: samme resultat, uanset rækkefølgen i pakken — og intet springes over', () => {
        const a = toCurrentEntries({ groupeng_classes: oldList, grupdk_classes: newList, 'GroupEng_Groups_kun-gammel.csv': 'g' });
        const b = toCurrentEntries({ 'GroupEng_Groups_kun-gammel.csv': 'g', grupdk_classes: newList, groupeng_classes: oldList });
        expect({ ...a }).toEqual({ ...b });
        const files = JSON.parse(a.grupdk_classes).map(c => c.filename);
        expect(files).toEqual(['3a.csv', '3a_kopi.csv', 'kun-gammel.csv']);
        expect(a['grupdk_groups_kun-gammel.csv']).toBe('g');
    });

    it('ukendte nøgler falder fra', () => {
        expect(Object.keys(toCurrentEntries({ teacherId: 'abc', GroupEng_Ukendt: 'x', groupeng_classes: '[]' }))).toEqual(['grupdk_classes']);
    });

    it('adoptTransferEntries: begge navne i pakken giver det samme som i lageret — og intet overskrives her', () => {
        for (const order of [['groupeng_classes', 'grupdk_classes'], ['grupdk_classes', 'groupeng_classes']]) {
            const pkg = {};
            for (const k of order) pkg[k] = k === 'groupeng_classes' ? oldList : newList;
            const store = fakeStorage({});
            adoptTransferEntries(store, pkg);
            expect(JSON.parse(store.getItem('grupdk_classes')).map(c => c.filename)).toEqual(['3a.csv', '3a_kopi.csv', 'kun-gammel.csv']);
        }
        const here = fakeStorage({ grupdk_classes: 'her i forvejen', 'GroupEng_Topics_3a.csv': 'gammelt her' });
        adoptTransferEntries(here, { groupeng_classes: oldList, 'GroupEng_Groups_3a.csv': 'grupper', 'GroupEng_Topics_3a.csv': 'emner' });
        expect(here.dump()).toEqual({
            grupdk_classes: 'her i forvejen', 'GroupEng_Topics_3a.csv': 'gammelt her', 'grupdk_groups_3a.csv': 'grupper',
        });
    });
});

// ─── Anden gennemgang (3/11): sletning, en kopi i brug, kopiens navn ───────

/** Lav localStorage til et flyttet lager med en uafgjort gammel historik for 3a. */
function realStorageWithUndecided() {
    localStorage.clear();
    for (const [k, v] of Object.entries(legacyStore())) localStorage.setItem(k, v);
    migrateLegacyStorage(localStorage);
    // Sidste års 3a under det gamle navn — med en session, der nu står under
    // det nye navn og kun den gamle historik kender (sådan kan det ende).
    localStorage.setItem('GroupEng_History_3a.csv', J([{ id: 'o1', name: 'Sidste år' }]));
    localStorage.setItem('grupdk_session_o1', J({ id: 'o1', groups: [{ members: [{ name: 'Slettet Elev' }] }] }));
    localStorage.setItem('GroupEng_Topics_3a.csv', J({ 'S_Group 1': 'Gammelt emne' }));
    const report = migrateLegacyStorage(localStorage);
    expect(report.undecided).toEqual(expect.arrayContaining(['GroupEng_History_3a.csv']));
    pyBridge._invalidateClassesCache();
}

/** Hele lageret som tekst. (Object.entries(localStorage) giver intet i happy-dom — derfor key(i).) */
function everything() {
    const lines = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        lines.push(`${k}=${localStorage.getItem(k)}`);
    }
    expect(lines.length).toBeGreaterThan(0);
    return lines.join('\n');
}

describe('fund 1 (GDPR): en slettet klasse kommer ikke igen fra de gamle navne', () => {
    it('sletningen fjerner også de gamle nøgler og de sessioner, den gamle historik nævner', () => {
        realStorageWithUndecided();
        expect(pyBridge.deleteClass('3a.csv').success).toBe(true);
        storage.cleanupClassStorage('3a.csv');
        expect(everything()).not.toMatch(/GroupEng_[A-Za-z]+_3a\.csv|o1|Slettet Elev|sess-1/);
    });

    it('en ny klasse med SAMME filnavn (næste års 3a) får intet af det gamle — heller ikke efter genindlæsning', () => {
        realStorageWithUndecided();
        pyBridge.deleteClass('3a.csv');
        storage.cleanupClassStorage('3a.csv');
        pyBridge.createClass('3a', 'Navn\nNy Elev\n', true);
        const file = pyBridge.getClasses().find(c => c.name === '3a').filename;
        expect(file).toBe('3a.csv');
        // "Genindlæsning": flytningen og oprydningen ved opstart.
        migrateLegacyStorage(localStorage);
        storage.cleanupOrphanedClassData();
        storage.cleanupOrphanedPayloads();
        expect(localStorage.getItem('grupdk_history_3a.csv')).toBeNull();
        expect(localStorage.getItem('grupdk_topics_3a.csv')).toBeNull();
        expect(everything()).not.toMatch(/Slettet Elev|Sidste år|Gammelt emne|Liberalisme/);
    });

    it('står klassen stadig i en gammel liste, der ikke er flyttet, fjernes den dér også', () => {
        realStorageWithUndecided();
        localStorage.setItem('groupeng_classes', J([cls('3a.csv', '2026-01-01'), cls('andet.csv', '2026-01-01')]));
        storage.cleanupClassStorage('3a.csv');
        expect(JSON.parse(localStorage.getItem('groupeng_classes')).map(c => c.filename)).toEqual(['andet.csv']);
    });

    it('oprydningen ved opstart holder sig KUN fra det, der har en gammel udgave', () => {
        realStorageWithUndecided();
        localStorage.setItem('grupdk_groups_slettet.csv', 'rest');      // en slettet klasses rest
        localStorage.setItem('grupdk_session_zz', J({ id: 'zz' }));     // en session ingen kender
        storage.cleanupOrphanedClassData();
        storage.cleanupOrphanedPayloads();
        expect(localStorage.getItem('grupdk_groups_slettet.csv')).toBeNull();
        expect(localStorage.getItem('grupdk_session_zz')).toBeNull();
        // Det uafgjorte bliver: 3a's nøgler og sessionen, den gamle historik nævner.
        expect(localStorage.getItem('grupdk_session_o1')).not.toBeNull();
        expect(localStorage.getItem('GroupEng_History_3a.csv')).not.toBeNull();
        expect(localStorage.getItem('grupdk_history_3a.csv')).not.toBeNull();
    });

    it('sletter læreren en kopi, går den gamle fanes nøgler for kopien med — den rigtige rører de ikke', () => {
        localStorage.clear();
        for (const [k, v] of Object.entries(legacyStore())) localStorage.setItem(k, v);
        migrateLegacyStorage(localStorage);
        const realGroups = localStorage.getItem('grupdk_groups_3a.csv');
        localStorage.setItem('groupeng_classes', J([cls('3a.csv', '2026-11-05', ['Gammel fane'])]));
        migrateLegacyStorage(localStorage);
        // En senere skrivning fra den gamle fane, der venter (uafgjort er den ikke: den hører til kopien).
        localStorage.setItem('GroupEng_Topics_3a.csv', J({ 'S_Group 1': 'Fra gammel fane' }));
        pyBridge._invalidateClassesCache();
        // Den rigtige 3a slettes ikke — kopien gør.
        storage.cleanupClassStorage('3a.csv');   // (fx en gendannelse "overskriv" af 3a)
        expect(localStorage.getItem('GroupEng_Topics_3a.csv')).not.toBeNull();
        localStorage.setItem('grupdk_groups_3a.csv', realGroups);
        pyBridge.deleteClass('3a_kopi.csv');
        storage.cleanupClassStorage('3a_kopi.csv');
        expect(localStorage.getItem('GroupEng_Topics_3a.csv')).toBeNull();
        migrateLegacyStorage(localStorage);
        expect(localStorage.getItem('grupdk_topics_3a.csv') ?? '').not.toMatch(/Fra gammel fane/);
    });
});

describe('fund 2: en kopi, læreren har taget i brug, er lærerens', () => {
    function withCopy() {
        localStorage.clear();
        for (const [k, v] of Object.entries(legacyStore())) localStorage.setItem(k, v);
        migrateLegacyStorage(localStorage);
        localStorage.setItem('groupeng_classes', J([cls('3a.csv', '2026-11-05', ['Gammel fane'])]));
        migrateLegacyStorage(localStorage);
        pyBridge._invalidateClassesCache();
        expect(pyBridge.getClass('3a_kopi.csv').legacyFilename).toBe('3a.csv');
    }

    it('første gem i den nye kode fjerner koblingen — en gammel fanes skrivning overskriver ikke lærerens grupper', () => {
        withCopy();
        const c = pyBridge.getClass('3a_kopi.csv');
        pyBridge.updateClass('3a_kopi.csv', c.content.data, [], null, [], {}, {}, [], [], {});
        expect(pyBridge.getClass('3a_kopi.csv').legacyFilename).toBeUndefined();
        localStorage.setItem('grupdk_groups_3a_kopi.csv', 'lærerens grupper');
        localStorage.setItem('GroupEng_Groups_3a.csv', 'fra den gamle fane');
        migrateLegacyStorage(localStorage, { freshKey: 'GroupEng_Groups_3a.csv' });
        expect(localStorage.getItem('grupdk_groups_3a_kopi.csv')).toBe('lærerens grupper');
        expect(localStorage.getItem('grupdk_groups_3a.csv')).toBe(legacyStore()['GroupEng_Groups_3a.csv']);
    });

    it('omdøbning fjerner også koblingen — en senere gendannelse i den gamle fane erstatter ikke kopien', () => {
        withCopy();
        pyBridge.renameClass('3a_kopi.csv', 'Min kopi');
        const before = pyBridge.getClass('3a_kopi.csv');
        expect(before.legacyFilename).toBeUndefined();
        localStorage.setItem('groupeng_classes', J([cls('3a.csv', '2026-12-01', ['Endnu nyere'])]));
        migrateLegacyStorage(localStorage, { freshKey: 'groupeng_classes' });
        pyBridge._invalidateClassesCache();
        expect(pyBridge.getClass('3a_kopi.csv')).toEqual(before);
        expect(pyBridge.getClass('3a_kopi_2.csv').content.data.map(r => r.Navn)).toEqual(['Endnu nyere']);
    });
});

describe('fund 3: kopiens navn tager ikke en klasse fra den gamle liste', () => {
    it('gammel liste med både 3a (konflikt) og 3a_kopi (kun gammel): kopien hedder 3a_kopi_2', () => {
        const store = migrated();
        store.setItem('groupeng_classes', J([cls('3a.csv', '2026-11-05', ['Konflikt']), cls('3a_kopi.csv', '2026-11-01', ['Ægte'])]));
        migrateLegacyStorage(store);
        const list = byFile(parsed(store, 'grupdk_classes'));
        expect(list['3a_kopi.csv']).toMatchObject({ name: '3a_kopi' });
        expect(list['3a_kopi.csv'].content.data.map(r => r.Navn)).toEqual(['Ægte']);
        expect(list['3a_kopi_2.csv']).toMatchObject({ name: '3a (kopi)', legacyFilename: '3a.csv' });
    });
});

describe('fund 4 (3/11): to gamle navne, der peger på samme nye', () => {
    it('en gammel fane lægger en klasse ind med kopiens filnavn: kopiens grupper overskrives ikke', () => {
        // Kopien 3a_kopi.csv ejes af den gamle fanes 3a. Bagefter opretter den
        // gamle fane en klasse, der hedder "3a kopi" (samme filnavn). Begge
        // gamle grupper-nøgler peger nu på grupdk_groups_3a_kopi.csv.
        const real = migrated().dump();
        const list = JSON.parse(real.grupdk_classes);
        const copy = { ...list[0], filename: '3a_kopi.csv', name: '3a (kopi)', legacyFilename: '3a.csv' };
        const store = fakeStorage({
            ...real, grupdk_classes: J([...list, copy]),
            'GroupEng_Groups_3a.csv': 'G-fra-3a',
            'GroupEng_Groups_3a_kopi.csv': 'G-fra-3a-kopi',
        });
        migrateLegacyStorage(store);
        const values = Object.values(store.dump());
        expect(values).toContain('G-fra-3a');
        expect(values).toContain('G-fra-3a-kopi');
    });

    it('en kopi får ikke et filnavn, der allerede har nøgler i lageret (rester af en slettet klasse)', () => {
        const store = migrated();
        store.setItem('grupdk_groups_3a_kopi.csv', 'rest');
        store.setItem('GroupEng_Topics_3a_kopi.csv', 'gammel rest');
        store.setItem('groupeng_classes', J([cls('3a.csv', '2026-11-05', ['Konflikt'])]));
        store.setItem('GroupEng_Groups_3a.csv', 'G-konflikt');
        migrateLegacyStorage(store);
        const list = byFile(parsed(store, 'grupdk_classes'));
        expect(list['3a_kopi.csv']).toBeUndefined();
        expect(list['3a_kopi_2.csv']).toMatchObject({ legacyFilename: '3a.csv' });
        expect(store.getItem('grupdk_groups_3a_kopi_2.csv')).toBe('G-konflikt');
        expect(store.getItem('grupdk_groups_3a_kopi.csv')).toBe('rest');
    });
});

// ─── Tilfældige lagre: intet forsvinder, heller ikke med to faner ───────────

describe('tilfældige lagre (faste frø): intet forsvinder', () => {
    // Et lille, gentageligt tilfældighedsværk — samme frø giver samme lagre.
    const rng = (seed) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const FILES = ['3a.csv', '2b.csv', '3a_kopi.csv', '3a_kopi_2.csv'];
    const PER_CLASS = [['GroupEng_Groups_', 'grupdk_groups_'], ['GroupEng_Topics_', 'grupdk_topics_'], ['GroupEng_History_', 'grupdk_history_']];

    function randomState(r) {
        const pick = (a) => a[Math.floor(r() * a.length)];
        const entry = (f, extra = {}) => ({ filename: f, name: f, last_modified: pick(['2026-01-01', '2026-06-01', '2026-11-01', undefined]), content: { data: [pick(['A', 'B', 'C'])] }, ...extra });
        const st = {};
        if (r() < 0.7) {
            const l = FILES.filter(() => r() < 0.5).map(f => entry(f));
            if (r() < 0.3 && !l.some(e => e.filename === '3a_kopi_2.csv')) l.push(entry('3a_kopi_2.csv', { legacyFilename: '3a.csv' }));
            st.grupdk_classes = J(l);
        }
        if (r() < 0.8) st.groupeng_classes = J(FILES.filter(() => r() < 0.5).map(f => entry(f)));
        for (const f of FILES) for (const [o, n] of PER_CLASS) {
            if (r() < 0.4) st[o + f] = pick(['x', 'y', 'z']) + o + f;
            if (r() < 0.3) st[n + f] = pick(['x', 'y', 'w']) + n + f;
        }
        if (r() < 0.4) st['GroupEng_Session_s1'] = pick(['p', 'q']);
        if (r() < 0.3) st['grupdk_session_s1'] = pick(['p', 'r']);
        return st;
    }

    /** En kopi, en gammel fane ejer, må med vilje få den gamle fanes nyere udgave. */
    function ownedByOldTab(init) {
        const linked = new Set();
        const copies = new Set();
        for (const c of JSON.parse(init.grupdk_classes ?? '[]')) if (c.legacyFilename) { linked.add(c.legacyFilename); copies.add(c.filename); }
        return (file, key) => copies.has(file) || (linked.has(file) && (key === undefined || key.startsWith('GroupEng_')));
    }

    function missing(state, init) {
        const owned = ownedByOldTab(init);
        const values = new Set(Object.values(state));
        const contents = new Set();
        for (const k of ['groupeng_classes', 'grupdk_classes']) for (const c of JSON.parse(state[k] ?? '[]')) contents.add(J(c.content));
        for (const [k, v] of Object.entries(init)) {
            if (k.endsWith('_classes')) {
                for (const c of JSON.parse(v)) if (!owned(c.filename) && !contents.has(J(c.content))) return `${k}: ${c.filename}`;
            } else if (!values.has(v)) {
                const file = k.replace(/^(grupdk_(groups|topics|history)_|GroupEng_(Groups|Topics|History)_)/, '');
                if (file !== k && owned(file, k)) continue;
                return k;
            }
        }
        // En rigtig klasse i den nye liste er urørt.
        const after = byFile(JSON.parse(state.grupdk_classes ?? '[]'));
        for (const c of JSON.parse(init.grupdk_classes ?? '[]')) {
            if (!c.legacyFilename && J(after[c.filename]) !== J(c)) return `erstattet: ${c.filename}`;
        }
        return null;
    }

    it('200 lagre: én kørsel, en anden fane midt i hver skrivning, og en ny kørsel bagefter', () => {
        const r = rng(20261103);
        for (let n = 0; n < 200; n++) {
            const init = randomState(r);
            const once = fakeStorage(init);
            migrateLegacyStorage(once);
            expect(missing(once.dump(), init), `lager ${n}: ${J(init)}`).toBeNull();

            const steps = once.snapshots.length;
            for (let at = 1; at <= steps; at++) {
                // Fane B kører hele flytningen, lige efter fane A's skrivning nummer `at`.
                let count = 0;
                const a = fakeStorage(init, {
                    onSet: (k, map) => {
                        if (++count !== at) return;
                        const b = fakeStorage(Object.fromEntries(map));
                        migrateLegacyStorage(b);
                        map.clear();
                        for (const [bk, bv] of Object.entries(b.dump())) map.set(bk, bv);
                    },
                });
                migrateLegacyStorage(a);
                migrateLegacyStorage(a);
                expect(missing(a.dump(), init), `lager ${n}, fane B efter skrivning ${at}: ${J(init)}`).toBeNull();
            }
        }
    });
});
