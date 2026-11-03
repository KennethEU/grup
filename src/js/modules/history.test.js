import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { state } from './state.js';

// Sæt til true for at lade lageret afvise ALLE skrivninger — sådan opfører
// en fuld kvote sig, og sådan opfører Safari sig i privat browsing.
let storageRejects = false;

// Mock storage
vi.mock('./py_bridge.js', () => ({
    safeStorageSet: (key, value) => { localStorage.setItem(key, value); return true; },
}));

// We need a real-ish storage module for history tests
vi.mock('./storage.js', () => {
    const getHistory = () => {
        const fn = state.currentClass?.filename;
        if (!fn) return [];
        try {
            const str = localStorage.getItem(`grupdk_history_${fn}`);
            return str ? JSON.parse(str) : [];
        } catch { return []; }
    };
    const saveHistory = (arr) => {
        const fn = state.currentClass?.filename;
        if (!fn) return false;
        if (storageRejects) return false;
        localStorage.setItem(`grupdk_history_${fn}`, JSON.stringify(arr));
        return true;
    };
    return {
        getHistory,
        saveHistory,
        saveSessionPayload: vi.fn((obj) => {
            if (storageRejects) return false;
            localStorage.setItem(`grupdk_session_${obj.id}`, JSON.stringify(obj));
            return true;
        }),
        loadSessionPayload: vi.fn((id) => {
            try {
                const str = localStorage.getItem(`grupdk_session_${id}`);
                return str ? JSON.parse(str) : null;
            } catch { return null; }
        }),
        deleteSessionPayload: vi.fn((id) => {
            localStorage.removeItem(`grupdk_session_${id}`);
        }),
        saveGroupsToStorage: vi.fn(),
        // Kørselshistorikken tager et snapshot af emne-kortet, når en gemt
        // session er ved at overskrive grupperne.
        readTopicMap: vi.fn(() => ({})),
        replaceTopicMap: vi.fn(() => true),
        hydrateGroupTopics: vi.fn(),
        saveTopic: vi.fn(),
        replaceTopicsForPrefix: vi.fn(() => !storageRejects),
        getTopic: vi.fn(() => null),
    };
});

import { saveCurrentSession, deleteSession, restoreSession, renameSession, loadSessionForPreview } from './history.js';
// Det mockede storage-modul — flere tests måler HVOR MANGE skrivninger en
// handling koster, ikke kun hvad der står i lageret bagefter.
import * as storageMock from './storage.js';
import { listRuns, clearRuns, hasManualChanges, markClean, pushRun } from './runHistory.js';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// History Module Tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('saveCurrentSession', () => {
    beforeEach(() => {
        localStorage.clear();
        state.currentClass = {
            filename: 'test-class',
            name: 'Test',
            data: [
                { Navn: 'Anna', Køn: 'K' },
                { Navn: 'Bob', Køn: 'M' },
            ],
            columns: ['Navn', 'Køn'],
            rules: [{ type: 'distribute', column: 'Køn' }],
        };
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['Anna'], topic: 'Tema A' },
            { name: 'Group 2', members: ['Bob'], topic: 'Tema B' },
        ];
        state.storedMatrixGroups = null;
        state.matrixGroupsStale = false;
    });

    // En ny stam-generering lader den gamle matrix blive liggende og sætter
    // kun flaget. Gemte "Matrixgrupper" den med, kom sessionen senere tilbage
    // med en matrix dannet ud fra ANDRE stamgrupper — og markeret som frisk.
    it('gemmer ikke en forældet matrix med i sessionen', () => {
        state.storedMatrixGroups = [{ name: 'Group 1', members: ['Anna', 'Bob'] }];
        state.matrixGroupsStale = true;

        const meta = saveCurrentSession('Forældet matrix', true);

        expect(meta.type).toBe('STANDARD_ONLY');
        const payload = JSON.parse(localStorage.getItem(`grupdk_session_${meta.id}`));
        expect(payload.matrixGroups).toEqual([]);
    });

    // Valget "Matrixgrupper" stod åbent, også når der ingen matrix var —
    // og så kastede `null.map` en fejl midt i gemningen. Vinduet blev
    // stående, og der skete ingenting.
    it('kaster ikke, når der ingen matrix er', () => {
        state.storedMatrixGroups = null;

        const meta = saveCurrentSession('Uden matrix', true);

        expect(meta).toBeTruthy();
        expect(meta.type).toBe('STANDARD_ONLY');
    });

    it('opretter en session med de rigtige oplysninger', () => {
        const meta = saveCurrentSession('Test Session', false);
        expect(meta).toBeDefined();
        expect(meta.id).toBeDefined();
        expect(meta.name).toBe('Test Session');
        expect(meta.type).toBe('STANDARD_ONLY');
        expect(meta.stats.groupCount).toBe(2);
    });

    it('nummererer ens navne fortløbende', () => {
        saveCurrentSession('My Session', false);
        const meta2 = saveCurrentSession('My Session', false);
        expect(meta2.name).toBe('My Session (2)');
    });

    it('nummererer versionerne fortløbende', () => {
        saveCurrentSession('Test', false);
        saveCurrentSession('Test', false); // Test (2)
        const meta3 = saveCurrentSession('Test', false);
        expect(meta3.name).toBe('Test (3)');
    });

    it('gemmer matrixgrupperne, når includeMatrix er true', () => {
        state.storedMatrixGroups = [
            { name: 'MGroup 1', members: ['Anna', 'Bob'] },
        ];
        const meta = saveCurrentSession('Matrix Session', true);
        expect(meta.type).toBe('WITH_MATRIX');
        expect(meta.stats.matrixCount).toBe(1);
    });

    it('gemmer gruppemedlemmer som {id, name}-objekter', () => {
        saveCurrentSession('Test', false);
        // Check stored payload
        const history = JSON.parse(localStorage.getItem('grupdk_history_test-class'));
        const sessionId = history[0].id;
        const payload = JSON.parse(localStorage.getItem(`grupdk_session_${sessionId}`));
        expect(payload.groups[0].members[0]).toEqual({ id: 'Anna', name: 'Anna' });
    });

    it('klarer medlemmer som objekter i grupperne', () => {
        state.storedStandardGroups = [
            { name: 'G1', members: [{ id: 'a1', name: 'Anna' }] },
        ];
        const meta = saveCurrentSession('Obj Test', false);
        expect(meta.stats.groupCount).toBe(1);

        const history = JSON.parse(localStorage.getItem('grupdk_history_test-class'));
        const payload = JSON.parse(localStorage.getItem(`grupdk_session_${history[0].id}`));
        expect(payload.groups[0].members[0]).toEqual({ id: 'a1', name: 'Anna' });
    });

    it('gemmer de aktive regler', () => {
        saveCurrentSession('Rule Test', false);
        const history = JSON.parse(localStorage.getItem('grupdk_history_test-class'));
        const payload = JSON.parse(localStorage.getItem(`grupdk_session_${history[0].id}`));
        expect(payload.activeRules.length).toBe(1);
        expect(payload.activeRules[0].name).toBe('distribute');
    });
});

describe('deleteSession', () => {
    beforeEach(() => {
        localStorage.clear();
        state.currentClass = {
            filename: 'test-class',
            data: [],
            columns: [],
            rules: [],
        };
        state.storedStandardGroups = [{ name: 'G1', members: [] }];
    });

    it('fjerner sessionen fra historiklisten', () => {
        const meta = saveCurrentSession('Del Test', false);
        deleteSession(meta.id);
        const history = JSON.parse(localStorage.getItem('grupdk_history_test-class') || '[]');
        expect(history.find(s => s.id === meta.id)).toBeUndefined();
    });

    it('fjerner sessionens data fra lageret', () => {
        const meta = saveCurrentSession('Del Test', false);
        const key = `grupdk_session_${meta.id}`;
        expect(localStorage.getItem(key)).not.toBeNull();

        deleteSession(meta.id);
        expect(localStorage.getItem(key)).toBeNull();
    });
});

describe('restoreSession', () => {
    beforeEach(() => {
        localStorage.clear();
        // Ligesom en indlæst klasse: hver elev har et _rowId, og grupper peger
        // på id'er — ikke navne. Visningskolonnen er lærerens valg.
        state.currentClass = {
            filename: 'test-class',
            data: [
                { Navn: 'Anna', Køn: 'K', _rowId: 'r1' },
                { Navn: 'Bob', Køn: 'M', _rowId: 'r2' },
                { Navn: 'Charlie', Køn: 'M', _rowId: 'r3' },
            ],
            columns: ['Navn', 'Køn'],
            id_column: 'Navn',
            rules: [],
        };
        state.displayColumn = 'Navn';
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['r1', 'r2'] },
        ];
        state.storedMatrixGroups = null;
        state.matrixGroupsStale = false;
        state.classViewTab = 'students';
        window.notifyInfo = vi.fn();
    });

    // En session gemt før _rowId fandtes, bar navne som id'er. Eleverne
    // findes via navne-fallbacken — men efternølerne blev talt på de GEMTE
    // id'er, så hver eneste elev i klassen blev meldt som ny: "3 nye elever
    // (efternølere) fundet" om en klasse, hvor alle stod i en gruppe.
    it('tæller ikke elever fundet via navnet som efternølere', () => {
        localStorage.setItem('grupdk_session_foer-rowid', JSON.stringify({
            id: 'foer-rowid', name: 'Før _rowId', type: 'STANDARD_ONLY',
            groups: [
                { name: 'Group 1', members: [{ id: 'Anna', name: 'Anna' }, { id: 'Bob', name: 'Bob' }] },
                { name: 'Group 2', members: [{ id: 'Charlie', name: 'Charlie' }] },
            ],
            matrixGroups: [],
        }));

        restoreSession('foer-rowid');

        expect(state.storedStandardGroups[0].members).toEqual(['r1', 'r2']);
        expect(window.notifyInfo).not.toHaveBeenCalled();
    });

    // En låst gruppe er en beslutning læreren har truffet. Kom sessionen
    // tilbage ulåst, rev den næste generering netop de grupper op, som var
    // meningen at holde fast.
    it('gendanner låsen på en låst gruppe', () => {
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['r1'], locked: true },
            { name: 'Group 2', members: ['r2'], locked: false },
        ];
        const meta = saveCurrentSession('Med lås', false);
        state.storedStandardGroups = null;

        restoreSession(meta.id);

        expect(state.storedStandardGroups[0].locked).toBe(true);
        expect(state.storedStandardGroups[1].locked).toBe(false);
    });

    // Emnekortet er ÉN nøgle i lageret, og gendannelsen skrev det én gang pr.
    // gruppe (plus en pruneTopics oveni). Blev den fjerde skrivning afvist —
    // fuld kvote — stod kortet med sessionens emner for de første grupper og
    // forgårsdagens for resten, mens skærmen viste sessionens. Nu er det ét
    // kald pr. prefix, og svaret bliver set på (testen nedenfor).
    it('skriver emnekortet ÉN gang, ikke én gang pr. gruppe', () => {
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['r1'], topic: 'Alpha' },
            { name: 'Group 2', members: ['r2'], topic: 'Beta' },
            { name: 'Group 3', members: ['r3'], topic: 'Gamma' },
        ];
        const meta = saveCurrentSession('Tre emner', false);
        storageMock.replaceTopicsForPrefix.mockClear();
        storageMock.saveTopic.mockClear();

        restoreSession(meta.id);

        const standardWrites = storageMock.replaceTopicsForPrefix.mock.calls
            .filter(c => c[0] === 'S_');
        expect(standardWrites).toHaveLength(1);
        expect(standardWrites[0][1].map(g => g.topic)).toEqual(['Alpha', 'Beta', 'Gamma']);
        expect(storageMock.saveTopic).not.toHaveBeenCalled();
    });

    // Går emne-skrivningen galt, står grupperne rigtigt efter en genindlæsning
    // — men med de FORRIGE emner på. Det er lige så meget et tab som grupperne
    // selv, og læreren skal have det at vide.
    it('siger fra, hvis emnekortet ikke kunne gemmes', () => {
        window.notifyError = vi.fn();
        const meta = saveCurrentSession('Med emner', false);
        storageMock.replaceTopicsForPrefix.mockImplementationOnce(() => false);

        restoreSession(meta.id);

        expect(window.notifyError).toHaveBeenCalled();
    });

    // Emnevælgeren på gruppekortet er en <select> med klassens emner, og den
    // matcher præcist. Stod der "klima" på gruppen og "Klima" i emnelisten,
    // var vælgeren TOM, selvom gruppen havde et emne. Samme fejl som "Gendan
    // grupper" fik rettet 23/9 — her ad sessionens vej.
    it('giver gruppens emne klassens stavemåde', () => {
        state.currentClass.topics = ['klima'];
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['r1'], topic: 'klima' },
        ];
        const meta = saveCurrentSession('Lille k', false);
        // Læreren retter stavemåden i emnelisten, inden sessionen hentes frem.
        state.currentClass.topics = ['Klima'];
        storageMock.replaceTopicsForPrefix.mockClear();

        restoreSession(meta.id);

        expect(state.currentClass.topics).toEqual(['Klima']);
        expect(state.storedStandardGroups[0].topic).toBe('Klima');
        // Kortet i lageret skal have den samme stavemåde som gruppen.
        const written = storageMock.replaceTopicsForPrefix.mock.calls
            .find(c => c[0] === 'S_')[1];
        expect(written[0].topic).toBe('Klima');
    });

    // Fletningen huskede ikke de emner, den selv lagde til: en session med
    // per-gruppe-emner "Klima" og "klima" gav klassen TO emner — og emne-
    // listen runder gruppeantallet til et multiplum af antal emner.
    it('bliver ikke til to emner, når sessionen staver det ens emne to måder', () => {
        state.currentClass.topics = [];
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['r1'], topic: 'Klima' },
            { name: 'Group 2', members: ['r2'], topic: 'klima' },
        ];
        const meta = saveCurrentSession('To stavemåder', false);

        restoreSession(meta.id);

        expect(state.currentClass.topics).toEqual(['Klima']);
        expect(state.storedStandardGroups.map(g => g.topic)).toEqual(['Klima', 'Klima']);
    });

    it('gendanner låsen på matrixgrupper', () => {
        state.storedMatrixGroups = [
            { name: 'Group 1', members: ['r1'], locked: true },
        ];
        const meta = saveCurrentSession('Matrix med lås', true);
        state.storedMatrixGroups = null;

        restoreSession(meta.id);

        expect(state.storedMatrixGroups[0].locked).toBe(true);
    });

    it('en session gemt uden lås-feltet gendannes ulåst', () => {
        // Payload som de gamle sessioner så ud — helt uden `locked`.
        localStorage.setItem('grupdk_session_gammel', JSON.stringify({
            id: 'gammel', name: 'Gammel', type: 'STANDARD_ONLY',
            groups: [{ name: 'Group 1', members: [{ id: 'r1', name: 'Anna' }], topic: '' }],
            matrixGroups: [],
        }));

        restoreSession('gammel');

        expect(state.storedStandardGroups[0].locked).toBe(false);
    });

    // Flaget betyder "matrixen passer ikke til stamgrupperne længere". Stod
    // det tilbage fra en tidligere generering, dannede det første skift væk
    // fra og tilbage til matrixvisningen matrixen forfra — og kastede den
    // gendannede session væk.
    it('rydder forældet-flaget når sessionen selv har en matrix', () => {
        state.storedMatrixGroups = [{ name: 'Group 1', members: ['r1'] }];
        const meta = saveCurrentSession('Med matrix', true);
        state.matrixGroupsStale = true;

        restoreSession(meta.id);

        expect(state.matrixGroupsStale).toBe(false);
    });

    it('sætter forældet-flaget når sessionen kun har stamgrupper', () => {
        const meta = saveCurrentSession('Kun stam', false);
        state.matrixGroupsStale = false;

        restoreSession(meta.id);

        expect(state.storedMatrixGroups).toBeNull();
        expect(state.matrixGroupsStale).toBe(true);
    });

    it('gendanner grupperne og skifter til fanen med grupperne', () => {
        const meta = saveCurrentSession('Restore Test', false);
        state.storedStandardGroups = null; // clear

        restoreSession(meta.id);

        expect(state.storedStandardGroups).toBeDefined();
        expect(state.storedStandardGroups.length).toBeGreaterThan(0);
        expect(state.classViewTab).toBe('groups');
    });

    it('finder efternølere (nye elever, der ikke er i sessionen)', () => {
        // Save with Anna and Bob
        state.storedStandardGroups = [
            { name: 'G1', members: ['r1'] },
            { name: 'G2', members: ['r2'] },
        ];
        const meta = saveCurrentSession('Latecomers Test', false);

        // Charlie exists in class but was NOT in the session
        restoreSession(meta.id);

        // Navnet står i beskeden, og én elev er "1 elev" — ikke "1 nye elever".
        expect(window.notifyInfo).toHaveBeenCalledWith(
            '1 elev fra klassen står ikke i nogen gruppe i sessionen (Charlie). '
            + 'Sæt eleven ind med "Tilføj efternøler".'
        );
    });

    it('nævner højst tre manglende elever og springer fraværende over', () => {
        state.storedStandardGroups = [{ name: 'G1', members: ['r1'] }];
        const meta = saveCurrentSession('Mange mangler', false);
        state.currentClass.data.push(
            { Navn: 'David', Køn: 'M', _rowId: 'r4' },
            { Navn: 'Emil', Køn: 'M', _rowId: 'r5' },
            { Navn: 'Freja', Køn: 'K', _rowId: 'r6', _excluded: true },
        );

        restoreSession(meta.id);

        // Bob, Charlie, David og Emil mangler; Freja er fraværende og tæller ikke.
        expect(window.notifyInfo).toHaveBeenCalledWith(
            '4 elever fra klassen står ikke i nogen gruppe i sessionen '
            + '(Bob, Charlie, David m.fl.). Sæt dem ind med "Tilføj efternøler".'
        );
    });

    it('laver spøgelseselever for fjernede elever', () => {
        // David er med i klassen når sessionen gemmes — navnet fryses i
        // snapshottet — og slettes derefter, så han kun findes som spøgelse.
        state.currentClass.data.push({ Navn: 'David', Køn: 'M', _rowId: 'r4' });
        state.storedStandardGroups = [
            { name: 'G1', members: ['r1', 'r4'] },
        ];
        const meta = saveCurrentSession('Ghost Test', false);

        // Remove David from class data before restore
        state.currentClass.data = [
            { Navn: 'Anna', Køn: 'K', _rowId: 'r1' },
        ];

        restoreSession(meta.id);

        // David should become a ghost
        const g1 = state.storedStandardGroups[0];
        const davidMember = g1.members.find(m => typeof m === 'object' && m.isGhost);
        expect(davidMember).toBeDefined();
        expect(davidMember.name).toBe('David');
    });

    it('sætter matrixgrupperne til null for STANDARD_ONLY-sessioner', () => {
        state.storedMatrixGroups = [{ name: 'M1', members: [] }];
        const meta = saveCurrentSession('Standard Only', false);

        restoreSession(meta.id);
        expect(state.storedMatrixGroups).toBeNull();
    });

    it('tæller IKKE fraværende (_excluded) elever som efternølere', () => {
        // Save session with Anna and Bob (Charlie not in groups)
        state.storedStandardGroups = [
            { name: 'G1', members: ['r1'] },
            { name: 'G2', members: ['r2'] },
        ];
        const meta = saveCurrentSession('Excluded Test', false);

        // Mark Charlie as excluded (fraværende) before restore
        state.currentClass.data[2]._excluded = true;

        restoreSession(meta.id);

        // Charlie is excluded, so should NOT trigger latecomer notification
        expect(window.notifyInfo).not.toHaveBeenCalled();
    });

    it('blander IKKE to elever sammen, hvis id/navn kun adskiller sig ved store/små bogstaver', () => {
        // "Emma" and "emma" must be treated as two distinct students — same
        // invariant as py_bridge.js's canonicalizeCategoricalCasing, which
        // deliberately leaves the ID column untouched.
        state.currentClass.data = [
            { Navn: 'Emma', Køn: 'K' },
            { Navn: 'emma', Køn: 'M' },
        ];
        state.storedStandardGroups = [
            { name: 'G1', members: ['Emma', 'emma'] },
        ];
        const meta = saveCurrentSession('Case Collision Test', false);
        state.storedStandardGroups = null;

        restoreSession(meta.id);

        const members = state.storedStandardGroups[0].members;
        expect(members).toHaveLength(2);
        // Neither should have fallen back to a ghost — both real students
        // must have been found via the (now correctly populated) studentMap.
        members.forEach(m => expect(typeof m === 'object' && m.isGhost).toBe(false));
        // The two resolved values must remain distinct (case preserved),
        // not both collapsing to the same student.
        expect(new Set(members)).toEqual(new Set(['Emma', 'emma']));
    });

    // To elever med SAMME navn i en session gemt før _rowId. Navne-fallbacken
    // slog op i et kort med ét navn → én elev, så begge referencer pegede på
    // den samme Anna: hun stod i to grupper på én gang, og den anden Anna
    // forsvandt ud af alle grupper. Samme fejl som migrateRefsToRowIds() fik
    // lukket med sin pulje (docs/grupper.md → "To ens navne").
    it('giver to ens navne hver sin elev — i begge gruppesæt', () => {
        state.currentClass.data = [
            { Navn: 'Anna', Køn: 'K', _rowId: 'r1' },
            { Navn: 'Bob', Køn: 'M', _rowId: 'r2' },
            { Navn: 'Anna', Køn: 'K', _rowId: 'r4' },
        ];
        localStorage.setItem('grupdk_session_to-annaer', JSON.stringify({
            id: 'to-annaer', name: 'To Annaer', type: 'WITH_MATRIX',
            groups: [
                { name: 'Group 1', members: [{ id: 'Anna', name: 'Anna' }, { id: 'Bob', name: 'Bob' }] },
                { name: 'Group 2', members: [{ id: 'Anna', name: 'Anna' }] },
            ],
            // Matrixen er en opdeling for sig: de SAMME to Annaer igen.
            matrixGroups: [
                { name: 'Group 1', members: [{ id: 'Anna', name: 'Anna' }] },
                { name: 'Group 2', members: [{ id: 'Anna', name: 'Anna' }, { id: 'Bob', name: 'Bob' }] },
            ],
        }));

        restoreSession('to-annaer');

        const flat = (groups) => groups.flatMap(g => g.members);
        expect(flat(state.storedStandardGroups).sort()).toEqual(['r1', 'r2', 'r4']);
        expect(flat(state.storedMatrixGroups).sort()).toEqual(['r1', 'r2', 'r4']);
        expect(window.notifyInfo).not.toHaveBeenCalled();
    });

    // Et id-match lægger beslag på eleven FØR navne-fallbacken uddeler noget.
    // Ellers kunne et navn i gruppe 1 tage den Anna, som gruppe 2 peger
    // direkte på med sit id.
    it('lader et id-match gå forud for et navne-match på samme elev', () => {
        state.currentClass.data = [
            { Navn: 'Anna', Køn: 'K', _rowId: 'r1' },
            { Navn: 'Anna', Køn: 'K', _rowId: 'r4' },
        ];
        localStorage.setItem('grupdk_session_blandet', JSON.stringify({
            id: 'blandet', name: 'Blandet', type: 'STANDARD_ONLY',
            groups: [
                { name: 'Group 1', members: [{ id: 'Anna', name: 'Anna' }] },
                { name: 'Group 2', members: [{ id: 'r1', name: 'Anna' }] },
            ],
            matrixGroups: [],
        }));

        restoreSession('blandet');

        expect(state.storedStandardGroups[0].members).toEqual(['r4']);
        expect(state.storedStandardGroups[1].members).toEqual(['r1']);
    });

    // Flere referencer end elever med navnet: de overskydende er spøgelser,
    // ikke en ekstra kopi af den samme elev.
    it('gør overskydende navne-referencer til spøgelser', () => {
        localStorage.setItem('grupdk_session_for-mange', JSON.stringify({
            id: 'for-mange', name: 'For mange', type: 'STANDARD_ONLY',
            groups: [
                { name: 'Group 1', members: [{ id: 'Anna', name: 'Anna' }] },
                { name: 'Group 2', members: [{ id: 'Anna', name: 'Anna' }] },
            ],
            matrixGroups: [],
        }));

        restoreSession('for-mange');

        expect(state.storedStandardGroups[0].members).toEqual(['r1']);
        expect(state.storedStandardGroups[1].members[0]).toMatchObject({ name: 'Anna', isGhost: true });
    });

    // En payload i en form restoreSession ikke kan læse (ødelagt eller
    // håndredigeret backup — writeClassExtras tjekker kun, at det er et
    // objekt). Før kastede `session.groups.map` en TypeError EFTER pushRun():
    // ingen besked, og kørselsmenuen havde fået en ekstra linje for intet.
    it('siger fra ved en payload uden grupper — og rører ingenting', () => {
        localStorage.setItem('grupdk_session_uden-grupper', JSON.stringify({
            id: 'uden-grupper', name: 'Ødelagt', type: 'STANDARD_ONLY',
        }));
        window.notifyError = vi.fn();
        const before = state.storedStandardGroups;
        const runsBefore = listRuns().length;

        expect(() => restoreSession('uden-grupper')).not.toThrow();

        expect(window.notifyError).toHaveBeenCalled();
        expect(state.storedStandardGroups).toBe(before);
        expect(state.classViewTab).toBe('students');
        expect(listRuns().length).toBe(runsBefore);
    });
});

describe('renameSession', () => {
    beforeEach(() => {
        localStorage.clear();
        state.currentClass = {
            filename: 'test-class',
            data: [
                { Navn: 'Anna', Køn: 'K' },
                { Navn: 'Bob', Køn: 'M' },
            ],
            columns: ['Navn', 'Køn'],
            rules: [],
        };
        state.storedStandardGroups = [
            { name: 'G1', members: ['Anna', 'Bob'] },
        ];
    });

    it('omdøber sessionen i historikkens oplysninger', () => {
        const meta = saveCurrentSession('Original Name', false);
        const result = renameSession(meta.id, 'New Name');
        expect(result).toBe(true);

        const history = JSON.parse(localStorage.getItem('grupdk_history_test-class'));
        const entry = history.find(s => s.id === meta.id);
        expect(entry.name).toBe('New Name');
    });

    it('omdøber sessionen i dens data', () => {
        const meta = saveCurrentSession('Original', false);
        renameSession(meta.id, 'Renamed');

        const payload = JSON.parse(localStorage.getItem(`grupdk_session_${meta.id}`));
        expect(payload.name).toBe('Renamed');
    });

    it('svarer false for en session, der ikke findes', () => {
        expect(renameSession('nonexistent', 'Name')).toBe(false);
    });

    it('svarer false for et tomt navn', () => {
        const meta = saveCurrentSession('Test', false);
        expect(renameSession(meta.id, '')).toBe(false);
        expect(renameSession(meta.id, '   ')).toBe(false);
    });

    it('fjerner mellemrum omkring det nye navn', () => {
        const meta = saveCurrentSession('Test', false);
        renameSession(meta.id, '  Trimmed Name  ');

        const history = JSON.parse(localStorage.getItem('grupdk_history_test-class'));
        const entry = history.find(s => s.id === meta.id);
        expect(entry.name).toBe('Trimmed Name');
    });
});

describe('loadSessionForPreview', () => {
    beforeEach(() => {
        localStorage.clear();
        state.currentClass = {
            filename: 'test-class',
            data: [
                { Navn: 'Anna', Køn: 'K' },
                { Navn: 'Bob', Køn: 'M' },
            ],
            columns: ['Navn', 'Køn'],
            rules: [],
        };
        state.storedStandardGroups = [
            { name: 'G1', members: ['Anna'], topic: 'Emne' },
            { name: 'G2', members: ['Bob'], topic: '' },
        ];
    });

    it('svarer null for en session, der ikke findes', () => {
        expect(loadSessionForPreview('nonexistent')).toBeNull();
    });

    it('giver en forhåndsvisning med visningsnavne', () => {
        const meta = saveCurrentSession('Preview Test', false);
        const preview = loadSessionForPreview(meta.id);

        expect(preview).toBeDefined();
        expect(preview.name).toBe('Preview Test');
        expect(preview.standard).toHaveLength(2);
    });

    it('markerer manglende elever som spøgelser', () => {
        state.storedStandardGroups = [
            { name: 'G1', members: ['Removed'] },
        ];
        const meta = saveCurrentSession('Ghost Preview', false);

        // Remove student from class
        state.currentClass.data = [{ Navn: 'Anna' }];

        const preview = loadSessionForPreview(meta.id);
        const member = preview.standard[0].members[0];
        // Preview members are now { name, isGhost } objects (no emoji)
        expect(member).toEqual({ name: 'Removed', isGhost: true });
    });

    // Forhåndsvisningen skal vise det samme, som "Genopliv" gør bagefter.
    // Med ét navn → én elev viste den begge Annaer som til stede, mens
    // gendannelsen satte den samme Anna ind to gange.
    it('giver to ens navne hver sin elev, som gendannelsen gør', () => {
        state.currentClass.data = [
            { Navn: 'Anna', _rowId: 'r1' },
            { Navn: 'Anna', _rowId: 'r4' },
        ];
        state.displayColumn = 'Navn';
        localStorage.setItem('grupdk_session_tre-annaer', JSON.stringify({
            id: 'tre-annaer', name: 'Tre Annaer', type: 'STANDARD_ONLY',
            groups: [
                { name: 'G1', members: [{ id: 'Anna', name: 'Anna' }, { id: 'Anna', name: 'Anna' }] },
                { name: 'G2', members: [{ id: 'Anna', name: 'Anna' }] },
            ],
            matrixGroups: [],
        }));

        const preview = loadSessionForPreview('tre-annaer');

        expect(preview.standard[0].members).toEqual([
            { name: 'Anna', isGhost: false }, { name: 'Anna', isGhost: false },
        ]);
        // Der er kun to Annaer i klassen — den tredje reference er et spøgelse.
        expect(preview.standard[1].members).toEqual([{ name: 'Anna', isGhost: true }]);
    });

    it('svarer null ved en payload uden grupper', () => {
        localStorage.setItem('grupdk_session_uden-grupper', JSON.stringify({
            id: 'uden-grupper', name: 'Ødelagt',
        }));
        expect(loadSessionForPreview('uden-grupper')).toBeNull();
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// En gendannet session og kørselsmenuen
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('restoreSession og kørselshistorikken', () => {
    beforeEach(() => {
        localStorage.clear();
        clearRuns();
        state.currentClass = {
            filename: 'test-class',
            data: [
                { Navn: 'Anna', Køn: 'K', _rowId: 'r1' },
                { Navn: 'Bob', Køn: 'M', _rowId: 'r2' },
            ],
            columns: ['Navn', 'Køn'],
            rules: [], matrixRules: [],
            settings: {}, matrixSettings: {},
            separations: [], topics: [],
        };
        state.displayColumn = 'Navn';
        state.storedMatrixGroups = null;
        window.notifyInfo = vi.fn();
    });

    // Uden det her var en gendannet session den ene vej at miste dagens
    // fordeling uden en vej tilbage: sessionen hentes jo netop frem, fordi
    // man fortrød — og så var det den forkerte session.
    it('lægger den fordeling der forlades i kørselsmenuen', () => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];
        const meta = saveCurrentSession('Gammel', false);

        // Dagens fordeling, som er den der står på skærmen nu.
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['r1'] },
            { name: 'Group 2', members: ['r2'] },
        ];

        restoreSession(meta.id);

        expect(listRuns()).toHaveLength(1);
        expect(listRuns()[0].groupCount).toBe(2);
    });

    // Aftrykket fulgte ikke med, så menuen troede at læreren havde flyttet
    // elever i hånden — og advarede om flytninger, hun aldrig havde lavet.
    it('regner ikke den gendannede session som manuelle flytninger', () => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];
        const meta = saveCurrentSession('Gammel', false);
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['r1'] },
            { name: 'Group 2', members: ['r2'] },
        ];
        markClean();

        restoreSession(meta.id);

        expect(hasManualChanges()).toBe(false);
    });

    // Sessionen gemte selv de regler, den blev dannet med. Uden dem blev de
    // gendannede grupper parret med DAGENS regler, og næste generering lagde
    // fordelingen i kørselsstakken beskrevet med regler, den aldrig kom fra
    // — så "tag alt med" hentede de forkerte frem.
    it('parrer den gendannede session med sessionens egne regler, ikke dagens', () => {
        state.currentClass.rules = [{ type: 'distribute', column: 'Køn', value: '' }];
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];
        const meta = saveCurrentSession('Fra i sidste uge', false);

        // Læreren har siden skiftet regel og dannet nye grupper.
        state.currentClass.rules = [{ type: 'cluster', column: 'Niveau', value: '' }];
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['r1'] },
            { name: 'Group 2', members: ['r2'] },
        ];
        markClean();

        restoreSession(meta.id);

        // Næste generering lægger den genoplivede fordeling i stakken.
        pushRun();

        expect(listRuns()[0].rulesLabel).toContain('Fordel Køn');
        expect(listRuns()[0].rulesLabel).not.toContain('Klyng');
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// En fejlet skrivning må ikke se ud som en succes
//
// Samme regel som resten af persistens-stien: omdøber eller sletter læreren
// en session, mens lagerpladsen er fuld, så listen på skærmen den nye
// tilstand — men næste genindlæsning henter den gamle frem igen.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('gemte sessioner — fejlede skrivninger', () => {
    beforeEach(() => {
        localStorage.clear();
        storageRejects = false;
        state.currentClass = {
            filename: 'test-class',
            data: [{ Navn: 'Anna', _rowId: 'r1' }],
            columns: ['Navn'],
            rules: [], matrixRules: [],
            settings: {}, matrixSettings: {},
            separations: [], topics: [],
        };
        state.displayColumn = 'Navn';
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];
        state.storedMatrixGroups = null;
    });

    afterEach(() => { storageRejects = false; });

    it('renameSession melder fejl, når listen ikke kan skrives', () => {
        const meta = saveCurrentSession('Før', false);
        storageRejects = true;
        expect(renameSession(meta.id, 'Efter')).toBe(false);
    });

    it('deleteSession melder fejl — og beholder payloaden, så sessionen ikke bliver et spøgelse', () => {
        const meta = saveCurrentSession('Skal blive', false);
        storageRejects = true;

        expect(deleteSession(meta.id)).toBe(false);
        // Payloaden SKAL stadig ligge der: var den slettet, ville sessionen
        // stå i listen uden data og kun kunne svare "Kunne ikke hente".
        expect(localStorage.getItem(`grupdk_session_${meta.id}`)).not.toBeNull();
    });

    it('svarer stadig true, når skrivningen går igennem', () => {
        const meta = saveCurrentSession('Normal', false);
        expect(renameSession(meta.id, 'Nyt navn')).toBe(true);
        expect(deleteSession(meta.id)).toBe(true);
    });
});
