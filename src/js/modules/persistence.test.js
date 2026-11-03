// Persistens-værn: Grupper har ingen backend. Alt læreren har lavet ligger i
// browserens localStorage, og der findes ingen kopi at gendanne fra. Derfor
// er de fire ting der testes her ikke kosmetik:
//   1. en skrivning der fejler må ALDRIG se ud som om den lykkedes
//   2. to faner må ikke kunne skrive hinandens klasser væk
//   3. en sletning må ikke rydde data, før klassen faktisk ER slettet
//   4. advarslen om fyldt lagerplads skal komme MENS der er plads at rydde
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pyBridge } from './py_bridge.js';
import { state } from './state.js';
import * as storage from './storage.js';

/** Lad localStorage.setItem fejle som en fyldt kvote. */
function blockWrites() {
    return vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        const e = new Error('QuotaExceededError');
        e.name = 'QuotaExceededError';
        throw e;
    });
}

describe('klasselisten — fejlede skrivninger', () => {
    beforeEach(() => {
        localStorage.clear();
        pyBridge._invalidateClassesCache();
        window.notifyError = () => {};
    });
    afterEach(() => vi.restoreAllMocks());

    it('en klasse der ikke kunne gemmes, står heller ikke i listen bagefter', () => {
        const spy = blockWrites();
        const res = pyBridge.createClass('3a', 'Navn\nAnna\n', true);
        expect(res.error).toBeTruthy();

        spy.mockRestore();
        // Før invalideringen lå klassen tilbage i cachen og blev vist i
        // klasse-listen, som om den var gemt — indtil næste reload.
        expect(pyBridge.getClasses()).toEqual([]);
    });

    it('et omdøb der ikke kunne gemmes, ruller tilbage til det gamle navn', () => {
        pyBridge.createClass('3a', 'Navn\nAnna\n', true);
        const file = pyBridge.getClasses()[0].filename;

        const spy = blockWrites();
        expect(pyBridge.renameClass(file, '3b').error).toBeTruthy();
        spy.mockRestore();

        expect(pyBridge.getClass(file).name).toBe('3a');
    });

    it('deleteClass melder fejl i stedet for success når skrivningen afvises', () => {
        pyBridge.createClass('3a', 'Navn\nAnna\n', true);
        const file = pyBridge.getClasses()[0].filename;

        const spy = blockWrites();
        const res = pyBridge.deleteClass(file);
        spy.mockRestore();

        expect(res.success).toBeUndefined();
        expect(res.error).toBeTruthy();
        // Klassen er der stadig — så oprydningen af grupper/historik/emner
        // (som kalderen kører BAGEFTER) heller ikke løber.
        expect(pyBridge.getClass(file)).toBeTruthy();
    });
});

describe('klasselisten — to faner', () => {
    beforeEach(() => {
        localStorage.clear();
        pyBridge._invalidateClassesCache();
        // pyBridge er en singleton og lever videre mellem testene. En rigtig
        // fane starter tom, så det skal den også gøre her — ellers tier
        // advarslen om en slettet klasse, fordi den blev sagt i forrige test.
        pyBridge._seenModified.clear();
        pyBridge._deletedElsewhereWarned.clear();
        window.notifyError = () => {};
    });

    it('en klasse oprettet i den anden fane overlever et gem i denne fane', () => {
        pyBridge.createClass('3a', 'Navn\nAnna\n', true);
        const file3a = pyBridge.getClasses()[0].filename;

        // Denne fane har læst listen og holder den i cachen.
        expect(pyBridge.getClasses()).toHaveLength(1);

        // Den anden fane opretter "3b". Den deler localStorage, men ikke
        // cachen — her simuleret ved at skrive udenom pyBridge.
        const classList = JSON.parse(localStorage.getItem('grupdk_classes'));
        classList.push({
            filename: '3b.csv', name: '3b', last_modified: new Date().toISOString(),
            content: { columns: ['Navn'], data: [{ Navn: 'Bo' }], rules: [], id_column: 'Navn' },
        });
        localStorage.setItem('grupdk_classes', JSON.stringify(classList));

        // Denne fane gemmer sin egen klasse — hele listen skrives ud på én
        // gang. Læses udgangspunktet fra den forældede cache, forsvinder 3b.
        pyBridge.updateClass(file3a, [{ Navn: 'Anna' }], [], 'Navn', [], {}, {}, [], []);

        const after = JSON.parse(localStorage.getItem('grupdk_classes')).map(c => c.filename);
        expect(after).toContain('3b.csv');
        expect(after).toContain(file3a);
    });

    // Den modsatte vej af testen ovenfor: dér måtte et gem ikke SLETTE den
    // anden fanes klasse — her må det ikke GENSKABE en, hun har slettet.
    it('en klasse slettet i den anden fane bliver ikke skrevet tilbage', () => {
        pyBridge.createClass('3a', 'Navn\nAnna\n', true);
        const file = pyBridge.getClasses()[0].filename;
        pyBridge.getClass(file);   // denne fane har klassen åben

        // Den anden fane sletter klassen.
        localStorage.setItem('grupdk_classes', JSON.stringify([]));
        pyBridge._invalidateClassesCache();

        // …og denne fane gemmer sin ugemte udgave (et tastetryk, eller
        // flushPendingWrites() når fanen lukkes).
        const res = pyBridge.updateClass(file, [{ Navn: 'Anna' }], [], 'Navn', [], {}, {}, [], [], {});

        expect(res.error).toBeTruthy();
        expect(JSON.parse(localStorage.getItem('grupdk_classes'))).toHaveLength(0);
    });

    it('læreren får det at vide — én gang, ikke ved hvert tastetryk', () => {
        const warnings = [];
        window.notifyError = (m) => warnings.push(m);

        pyBridge.createClass('3a', 'Navn\nAnna\n', true);
        const file = pyBridge.getClasses()[0].filename;
        pyBridge.getClass(file);
        localStorage.setItem('grupdk_classes', JSON.stringify([]));
        pyBridge._invalidateClassesCache();

        pyBridge.updateClass(file, [{ Navn: 'Anna' }], [], 'Navn', [], {}, {}, [], [], {});
        pyBridge.updateClass(file, [{ Navn: 'Anna B' }], [], 'Navn', [], {}, {}, [], [], {});
        pyBridge.updateClass(file, [{ Navn: 'Anna C' }], [], 'Navn', [], {}, {}, [], [], {});

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('slettet i en anden fane');
    });

    // Værnet må ikke ramme den ene vej, hvor en klasse der ikke findes,
    // SKAL kunne skrives: backuppen er lærerens sidste udvej.
    it('en gendannelse fra backup opretter stadig klassen', () => {
        const res = pyBridge.updateClass(
            '3a.csv', [{ Navn: 'Anna' }], [], 'Navn', [], {}, {}, [], [], {},
            { allowCreate: true });

        expect(res.success).toBe(true);
        expect(JSON.parse(localStorage.getItem('grupdk_classes'))).toHaveLength(1);
    });
});

describe('historik — udrensning efterlader ikke tunge payloads', () => {
    beforeEach(() => {
        localStorage.clear();
        state.currentClass = { filename: '3a.csv', name: '3a', data: [], columns: ['Navn'] };
        window.notifyError = () => {};
    });

    it('en session ældre end 90 dage får også sin payload slettet', () => {
        const old = new Date();
        old.setDate(old.getDate() - 200);

        storage.saveSessionPayload({ id: 'gl', name: 'Gammel', groups: [] });
        storage.saveSessionPayload({ id: 'ny', name: 'Ny', groups: [] });
        storage.saveHistory([
            { id: 'gl', date: old.toISOString(), name: 'Gammel' },
            { id: 'ny', date: new Date().toISOString(), name: 'Ny' },
        ]);

        expect(storage.getHistory().map(e => e.id)).toEqual(['ny']);
        // Payloaden er det tunge — den lå før tilbage usynligt og fyldte.
        expect(storage.loadSessionPayload('gl')).toBeNull();
        expect(storage.loadSessionPayload('ny')).toBeTruthy();
    });

    it('en ulæselig dato tæller ikke som "for gammel"', () => {
        storage.saveSessionPayload({ id: 'x', name: 'Skæv', groups: [] });
        storage.saveHistory([{ id: 'x', date: 'ikke-en-dato', name: 'Skæv' }]);

        expect(storage.getHistory().map(e => e.id)).toEqual(['x']);
        expect(storage.loadSessionPayload('x')).toBeTruthy();
    });
});

describe('advarsel om fyldt lagerplads', () => {
    beforeEach(() => localStorage.clear());

    it('tier når der er rigeligt plads', async () => {
        const { getStoragePressureWarning } = await import('./py_bridge.js');
        localStorage.setItem('lidt', 'x'.repeat(1000));
        expect(getStoragePressureWarning()).toBeNull();
    });

    it('advarer med procent og en konkret handling over 80 %', async () => {
        const { getStoragePressureWarning } = await import('./py_bridge.js');
        // ~4,2 MB i UTF-16 = to bytes pr. tegn.
        localStorage.setItem('meget', 'x'.repeat(2_150_000));
        const warning = getStoragePressureWarning();
        expect(warning).toMatch(/% fuld/);
        expect(warning).toMatch(/backup/i);
    });
});

// ── Gennemsyn 2026-08-25: persistens & lagerplads ──────────────────────────
// De fire ting nedenfor har det til fælles, at de kun viser sig når noget
// ANDET allerede er galt — fuld kvote, en ulæselig nøgle, to åbne faner. Det
// er præcis dér, hvor en tavs fejl bliver til et tabt sæt grupper.

describe('gem session — listen er det der tæller', () => {
    beforeEach(() => {
        localStorage.clear();
        state.currentClass = { filename: '3a.csv', name: '3a', data: [], columns: ['Navn'] };
        state.storedStandardGroups = [{ name: 'Gruppe 1', members: [], locked: false }];
        state.storedMatrixGroups = [];
        state.displayColumn = 'Navn';
        window.notifyError = () => {};
    });
    afterEach(() => vi.restoreAllMocks());

    it('en session hvis liste-skrivning afvises, meldes ikke som gemt', async () => {
        const history = await import('./history.js');

        // Payloaden går igennem, listen gør ikke — det er rækkefølgen i
        // saveCurrentSession(), og netop dér lå kvitteringen og løj.
        const original = localStorage.setItem.bind(localStorage);
        vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
            if (String(key).startsWith('grupdk_history_')) {
                const e = new Error('QuotaExceededError');
                e.name = 'QuotaExceededError';
                throw e;
            }
            original(key, value);
        });

        const res = history.saveCurrentSession('Onsdag', false);
        // Payloaden SKAL være nået frem — ellers tester vi trin 2, ikke trin 3.
        expect(localStorage.setItem).toHaveBeenCalledWith(
            expect.stringContaining('grupdk_session_'), expect.any(String));
        // null → SaveSessionModal springer sin "gemt i historikken!" over.
        expect(res).toBeNull();
    });

    it('payloaden efterlades ikke som spildplads, når listen fejlede', async () => {
        const history = await import('./history.js');
        const original = localStorage.setItem.bind(localStorage);
        vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
            if (String(key).startsWith('grupdk_history_')) {
                const e = new Error('QuotaExceededError');
                e.name = 'QuotaExceededError';
                throw e;
            }
            original(key, value);
        });

        history.saveCurrentSession('Onsdag', false);
        vi.restoreAllMocks();

        // Ingen grupdk_session_-nøgle må stå tilbage: den er usynlig for
        // læreren og fylder netop den plads, der lige slap op.
        const leftBehind = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('grupdk_session_')) leftBehind.push(k);
        }
        expect(leftBehind).toEqual([]);
    });
});

describe('oprydning i gemte sessioner', () => {
    beforeEach(() => {
        localStorage.clear();
        state.currentClass = { filename: '3a.csv', name: '3a', data: [], columns: ['Navn'] };
        window.notifyError = () => {};
    });

    it('en ulæselig historik-liste får ikke sessionerne slettet', () => {
        storage.saveSessionPayload({ id: 's1', name: 'Mandag', groups: [] });
        storage.saveSessionPayload({ id: 's2', name: 'Tirsdag', groups: [] });
        localStorage.setItem('grupdk_history_3a.csv', '{ikke gyldig json');

        storage.cleanupOrphanedPayloads();

        // En payload-nøgle siger ikke selv hvilken klasse den hører til. Kan
        // listen ikke læses, ved vi ikke hvad den kendte — og før slettede
        // oprydningen så HELE klassens historik, automatisk ved opstart.
        expect(storage.loadSessionPayload('s1')).toBeTruthy();
        expect(storage.loadSessionPayload('s2')).toBeTruthy();
    });

    it('en forældreløs payload ryddes stadig, når listerne kan læses', () => {
        storage.saveSessionPayload({ id: 'spoegelse', name: 'Ingen kender mig', groups: [] });
        localStorage.setItem('grupdk_history_3a.csv', JSON.stringify([]));

        expect(storage.cleanupOrphanedPayloads()).toBe(1);
        expect(storage.loadSessionPayload('spoegelse')).toBeNull();
    });

    it('en liste-linje uden payload fjernes, så den ikke bliver en blindgyde', () => {
        storage.saveSessionPayload({ id: 'lever', name: 'Mandag', groups: [] });
        localStorage.setItem('grupdk_history_3a.csv', JSON.stringify([
            { id: 'lever', date: new Date().toISOString(), name: 'Mandag' },
            { id: 'doed', date: new Date().toISOString(), name: 'Tirsdag' },
        ]));

        storage.cleanupOrphanedPayloads();

        // "doed" ville ellers stå i Historik-fanen og svare
        // "Kunne ikke hente session data!" hver eneste gang.
        expect(storage.getHistory().map(e => e.id)).toEqual(['lever']);
    });
});

describe('grupperne — to faner', () => {
    // Advarslen huskes pr. FILNAVN og pr. fane (modulet lever hele testfilen
    // igennem, som en rigtig fane gør). Hver test skal derfor have sin egen
    // klasse — ellers ville test to og tre bestå, fordi test ét allerede har
    // brugt beskeden op, og de ville bestå med værnet fjernet.
    beforeEach(() => {
        localStorage.clear();
        window.notifyError = () => {};
    });

    /** Sæt den klasse, fanen står i. */
    function openClass(filename) {
        state.currentClass = { filename, name: filename.replace('.csv', ''), data: [], columns: ['Navn'] };
    }

    /** Hændelsen browseren sender til alle ANDRE faner. */
    function fromOtherTab(key, newValue) {
        window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
    }

    it('en kørsel i den anden fane siges højt — én gang', () => {
        openClass('fane-1a.csv');
        const warnings = [];
        window.notifyError = (m) => warnings.push(m);

        fromOtherTab('grupdk_groups_fane-1a.csv', JSON.stringify({ standard: [], matrix: null }));
        fromOtherTab('grupdk_groups_fane-1a.csv', JSON.stringify({ standard: [], matrix: null }));

        // Grupper skrives ved hvert træk, hvert emne og hver lås. Én besked
        // pr. klasse — ellers dækker de skærmen og bliver klikket væk.
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('ændret i en anden fane');
    });

    it('en anden klasses grupper rører os ikke', () => {
        openClass('fane-2a.csv');
        const warnings = [];
        window.notifyError = (m) => warnings.push(m);
        fromOtherTab('grupdk_groups_fane-2b.csv', JSON.stringify({ standard: [], matrix: null }));
        expect(warnings).toHaveLength(0);
    });

    it('en SLETTET nøgle siger ikke noget — klasse-sletningen har sin egen besked', () => {
        openClass('fane-3a.csv');
        const warnings = [];
        window.notifyError = (m) => warnings.push(m);
        fromOtherTab('grupdk_groups_fane-3a.csv', null);
        expect(warnings).toHaveLength(0);
    });

    // "Hent de nye grupper" afløste rådet "Genindlæs siden". Alt, der kun
    // lever i hukommelsen og beskriver grupperne på skærmen, skal se ud, som en
    // genindlæsning ville give — ellers lyver det om de hentede grupper.
    it('"Hent de nye grupper" rydder det, der beskrev fanens egne grupper', () => {
        openClass('fane-4a.csv');
        const mine = [{ name: 'Gruppe 1', members: ['r1', 'r2'] }, { name: 'Gruppe 2', members: ['r3', 'r4'] }];
        const theirs = [{ name: 'Gruppe 1', members: ['r1', 'r3'] }, { name: 'Gruppe 2', members: ['r2', 'r4'] }];
        const theirMatrix = [{ name: 'Matrix 1', members: ['r1', 'r2'] }];
        state.storedStandardGroups = mine;
        state.storedMatrixGroups = null;
        state._runHistory.length = 0;
        state.matrixSourceFingerprint = 'fanens-egne-stamgrupper';
        state._lastGeneratedFingerprint = 'fanens-egen-kørsel';
        state._lastRunInputs = { rules: [] };
        state.lastRecording = { standard: { runs: [] }, matrix: null };
        state.lastRecordingFingerprint = { standard: 'x', matrix: null };
        state.replay = { recording: { runs: [] }, runIndex: 0, frameIndex: 0, playing: true };
        state.previewRunIndex = 0;

        const value = JSON.stringify({ standard: theirs, matrix: theirMatrix, matrixStale: false });
        localStorage.setItem('grupdk_groups_fane-4a.csv', value);
        let action = null;
        window.notifyError = (m, a) => { action = a; };
        fromOtherTab('grupdk_groups_fane-4a.csv', value);
        expect(action?.label).toBe('Hent de nye grupper');

        const ok = [];
        window.notifySuccess = (m) => ok.push(m);
        action.run();

        expect(ok).toHaveLength(1);
        expect(state.storedStandardGroups.map(g => g.members)).toEqual(theirs.map(g => g.members));
        expect(state.storedMatrixGroups.map(g => g.members)).toEqual(theirMatrix.map(g => g.members));
        // Fanens egne grupper kan hentes tilbage fra kørselsmenuen
        expect(state._runHistory[0].standard.map(g => g.members)).toEqual(mine.map(g => g.members));
        // Den anden fanes matrix hører til DENS stamgrupper: intet aftryk = ingen falsk drift-advarsel
        expect(state.matrixSourceFingerprint).toBeNull();
        expect(state._lastGeneratedFingerprint).toBeNull();
        expect(state._lastRunInputs).toBeNull();
        expect(state.lastRecording).toEqual({ standard: null, matrix: null });
        expect(state.lastRecordingFingerprint).toEqual({ standard: null, matrix: null });
        expect(state.replay).toBeNull();
        expect(state.previewRunIndex).toBeNull();
    });

    it('"Hent de nye grupper" efter en flytning her siger, at der intet nyt er', () => {
        openClass('fane-5a.csv');
        const mine = [{ name: 'Gruppe 1', members: ['r1', 'r2'] }];
        state.storedStandardGroups = mine;
        state.storedMatrixGroups = null;
        let action = null;
        window.notifyError = (m, a) => { action = a; };
        fromOtherTab('grupdk_groups_fane-5a.csv', JSON.stringify({ standard: [{ name: 'Gruppe 1', members: ['r2', 'r1'] }], matrix: null }));
        // Læreren flytter alligevel en elev her: fanens egne grupper gemmes ovenpå
        localStorage.setItem('grupdk_groups_fane-5a.csv', JSON.stringify({ standard: mine, matrix: null }));

        const ok = [];
        const info = [];
        window.notifySuccess = (m) => ok.push(m);
        window.notifyInfo = (m) => info.push(m);
        expect(action.run()).toBe(false);
        expect(ok).toHaveLength(0);
        expect(info[0]).toContain('ingen nyere grupper');
        expect(state.storedStandardGroups.map(g => g.members)).toEqual([['r1', 'r2']]);
    });
});

describe('oprydning efter en slettet klasse', () => {
    beforeEach(() => {
        localStorage.clear();
        state.currentClass = { filename: '3a.csv', name: '3a', data: [], columns: ['Navn'] };
        window.notifyError = () => {};
    });

    /** Læg det fulde nøglesæt for en klasse ned i lageret. */
    function classData(filename) {
        localStorage.setItem(`grupdk_groups_${filename}`,
            JSON.stringify({ standard: [{ name: 'Gruppe 1', members: [{ name: 'Anna' }] }], matrix: null }));
        localStorage.setItem(`grupdk_topics_${filename}`, JSON.stringify({ 'S_Gruppe 1': 'Liberalisme' }));
        localStorage.setItem(`grupdk_history_${filename}`,
            JSON.stringify([{ id: `s-${filename}`, date: new Date().toISOString(), name: 'Mandag' }]));
        localStorage.setItem(`grupdk_session_s-${filename}`, JSON.stringify({ id: `s-${filename}`, groups: [] }));
    }

    it('grupper, emner og sessioner fra en klasse der ikke findes, ryddes ved opstart', () => {
        localStorage.setItem('grupdk_classes', JSON.stringify([
            { filename: '3a.csv', name: '3a', content: {} },
        ]));
        classData('3a.csv');
        classData('slettet.csv');   // efterladt af den anden fane

        expect(storage.cleanupOrphanedClassData()).toBe(1);

        // Elevnavnene fra den slettede klasse er væk …
        expect(localStorage.getItem('grupdk_groups_slettet.csv')).toBeNull();
        expect(localStorage.getItem('grupdk_topics_slettet.csv')).toBeNull();
        expect(localStorage.getItem('grupdk_history_slettet.csv')).toBeNull();
        expect(localStorage.getItem('grupdk_session_s-slettet.csv')).toBeNull();
        // … og den klasse der stadig findes, er urørt.
        expect(localStorage.getItem('grupdk_groups_3a.csv')).toBeTruthy();
        expect(localStorage.getItem('grupdk_session_s-3a.csv')).toBeTruthy();
    });

    it('en ulæselig klasseliste rydder ingenting', () => {
        localStorage.setItem('grupdk_classes', '{ikke gyldig json');
        classData('3a.csv');

        expect(storage.cleanupOrphanedClassData()).toBe(0);
        expect(localStorage.getItem('grupdk_groups_3a.csv')).toBeTruthy();
    });

    it('en klasseliste der slet ikke findes, rydder ingenting', () => {
        // Listen er væk, klassernes data er der endnu. Det er dét tilfælde,
        // hvor appen beder læreren om IKKE at lukke fanen — grupperne og
        // historikken er det eneste, der er tilbage.
        classData('3a.csv');

        expect(storage.cleanupOrphanedClassData()).toBe(0);
        expect(localStorage.getItem('grupdk_history_3a.csv')).toBeTruthy();
    });
});

describe('emnekortet — to faner', () => {
    beforeEach(() => {
        localStorage.clear();
        state.currentClass = { filename: '3a.csv', name: '3a', data: [], columns: ['Navn'] };
        window.notifyError = () => {};
    });

    it('et emne skrevet i den anden fane overlever et emne-gem i denne fane', () => {
        storage.saveTopic('Gruppe 1', 'Liberalisme', 'S_');

        // Fane B skriver direkte i lageret og fyrer det storage-event,
        // browseren sender til alle ANDRE faner.
        const key = 'grupdk_topics_3a.csv';
        const fromTabB = { 'S_Gruppe 1': 'Liberalisme', 'S_Gruppe 2': 'Socialisme' };
        localStorage.setItem(key, JSON.stringify(fromTabB));
        window.dispatchEvent(new StorageEvent('storage', { key }));

        // Denne fane retter nu sit EGET emne. saveTopic læser hele kortet og
        // skriver det hele tilbage — uden invalideringen af cachen ville den
        // sende det forældede kort af sted og slette fane B's emne.
        storage.saveTopic('Gruppe 1', 'Konservatisme', 'S_');

        expect(storage.getTopic('Gruppe 2', 'S_')).toBe('Socialisme');
        expect(storage.getTopic('Gruppe 1', 'S_')).toBe('Konservatisme');
    });
});

describe('gendan session — en gendannelse der ikke blev gemt', () => {
    beforeEach(() => {
        localStorage.clear();
        state.currentClass = {
            filename: '3a.csv', name: '3a', columns: ['Navn'],
            data: [{ Navn: 'Anna', _rowId: 'r1' }, { Navn: 'Bo', _rowId: 'r2' }],
        };
        state.storedStandardGroups = [];
        state.storedMatrixGroups = null;
        state.displayColumn = 'Navn';
    });
    afterEach(() => vi.restoreAllMocks());

    it('siger fra, når grupperne ikke kunne skrives til lageret', async () => {
        const history = await import('./history.js');
        storage.saveSessionPayload({
            id: 's1', name: 'Mandag', date: new Date().toISOString(),
            type: 'STANDARD_ONLY',
            groups: [{ name: 'Gruppe 1', members: [{ id: 'r1', name: 'Anna' }], topic: '' }],
            matrixGroups: [],
        });

        const messages = [];
        window.notifyError = (m) => messages.push(m);
        const original = localStorage.setItem.bind(localStorage);
        vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
            if (String(key).startsWith('grupdk_groups_')) {
                const e = new Error('QuotaExceededError');
                e.name = 'QuotaExceededError';
                throw e;
            }
            original(key, value);
        });

        history.restoreSession('s1');

        // Grupperne står på skærmen …
        expect(state.storedStandardGroups.length).toBe(1);
        // … men de ligger ikke i lageret, og det SKAL siges om SESSIONEN.
        // Den generelle "lagerplads er fuld"-besked fra safeStorageSet er
        // ikke nok: den fortæller ikke læreren, at grupperne på skærmen er
        // væk ved næste genindlæsning.
        expect(messages.join(' ')).toMatch(/genindlæser siden/i);
    });
});

// Skjulte kolonner: læreren højreklikker en overskrift for at gemme en kolonne
// væk (Lectio-eksporter har let ti, hun er ligeglad med). Valget står i
// `hiddenColumns` på klassen, og `onHeaderContextMenu` gemmer med det samme —
// men feltet blev aldrig skrevet med, så kolonnerne var tilbage efter et
// reload. Se updateClass() i py_bridge.js.
describe('skjulte kolonner overlever et gem', () => {
    beforeEach(() => {
        localStorage.clear();
        pyBridge._invalidateClassesCache();
        window.notifyError = () => {};
    });

    it('en skjult kolonne står der stadig, når klassen læses ind igen', () => {
        pyBridge.updateClass(
            '3a.csv', [{ Navn: 'Anna', Klasse: '3a' }], [], 'Navn', [], {}, {}, [], [], {},
            { allowCreate: true, hiddenColumns: ['Klasse'] });

        expect(pyBridge.getClass('3a.csv').content.hiddenColumns).toEqual(['Klasse']);
    });

    // Et gem fra en vej der ikke kender feltet, må ikke tørre det af —
    // samme værn som togetherGroups har.
    it('et gem uden feltet lader den skjulte kolonne stå', () => {
        pyBridge.updateClass(
            '3a.csv', [{ Navn: 'Anna', Klasse: '3a' }], [], 'Navn', [], {}, {}, [], [], {},
            { allowCreate: true, hiddenColumns: ['Klasse'] });
        pyBridge.updateClass(
            '3a.csv', [{ Navn: 'Anna B', Klasse: '3a' }], [], 'Navn', [], {}, {}, [], [], {});

        expect(pyBridge.getClass('3a.csv').content.hiddenColumns).toEqual(['Klasse']);
    });
});

// Kolonnelisten blev udledt af FØRSTE række alene (`Object.keys(data[0])`).
// Manglede den første elev en nøgle — en ældre klasse eller en håndredigeret
// backup — forsvandt kolonnen fra listen ved næste gem, mens cellerne lå
// usynligt tilbage i de andre rækker.
describe('kolonnelisten læses af alle rækker', () => {
    beforeEach(() => {
        localStorage.clear();
        pyBridge._invalidateClassesCache();
        pyBridge._seenModified.clear();
        pyBridge._deletedElsewhereWarned.clear();
        window.notifyError = () => {};
    });

    it('en kolonne, den første elev mangler, overlever et gem', () => {
        pyBridge.createClass('3a', 'Navn\nAnna\nBo\n', true);
        const file = pyBridge.getClasses()[0].filename;
        pyBridge.getClass(file);

        pyBridge.updateClass(file, [{ Navn: 'Anna' }, { Navn: 'Bo', Karakter: '7' }],
            [], 'Navn', [], {}, {}, [], [], {});

        expect(pyBridge.getClass(file).content.columns).toEqual(['Navn', 'Karakter']);
    });
});
