// En klasse UDEN elever skal også kunne gemme sine kolonner.
//
// updateClass() udleder kolonnerne af elevrækkernes nøgler. Det er rigtigt,
// så længe der er rækker — men en klasse, hvor læreren har slettet alle
// elever, har ingen rækker at udlede af. Før blev `columns` så stående, som
// den var: "+ Kolonne", et omdøb og en sletning så rigtige ud på skærmen,
// men var væk efter en genindlæsning — og et omdøb efterlod reglerne på det
// NYE navn, mens kolonnen igen hed det gamle. En backup af en tom klasse
// kom tilbage helt uden kolonner. (92. gennemsyn, 11/11 2026.)
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { pyBridge } from './py_bridge.js';
import { initApiAdapter } from './api_adapter.js';
import { saveClassData, restoreBackup } from './api.js';
import { state } from './state.js';
import { autoSave } from './classActions.js';

beforeAll(() => initApiAdapter());

function stored(filename) {
    pyBridge._invalidateClassesCache();
    return pyBridge.getClasses().find(c => c.filename === filename);
}

/** En klasse med to kolonner, hvor alle elever derefter er slettet. */
function emptyClass(name) {
    const res = pyBridge.createClass(name, 'Navn,Køn\nAnna,K\nBo,M\n', true);
    pyBridge.updateClass(res.filename, [], [], 'Navn', [], {}, {}, [], [], {},
        { columns: ['Navn', 'Køn'] });
    pyBridge.getClass(res.filename, { track: true });
    return res.filename;
}

describe('kolonnerne i en klasse uden elever', () => {
    beforeEach(() => {
        localStorage.clear();
        pyBridge._invalidateClassesCache();
        window.notifyError = () => {};
        window.notifyInfo = () => {};
    });

    it('en ny kolonne ("+ Kolonne") gemmes — også gennem autoSaves vej (fetch → adapter)', async () => {
        const filename = emptyClass('tom1');
        await saveClassData(filename, [], [], 'Navn', [], {}, {}, [], [], {},
            { columns: ['Navn', 'Køn', 'Niveau'] });
        expect(stored(filename).content.columns).toEqual(['Navn', 'Køn', 'Niveau']);
    });

    it('autoSave sender fanens kolonner med — den vej, hver rettelse i elevlisten tager', async () => {
        const filename = emptyClass('tom_auto');
        state.activeView = 'students';
        state.displayColumn = 'Navn';
        state.currentClass = {
            filename, data: [], columns: ['Navn', 'Køn', 'Niveau'],
            rules: [], matrixRules: [], separations: [], settings: {}, matrixSettings: {},
            topics: [], columnOrders: {}, hiddenColumns: [], togetherGroups: []
        };
        autoSave();
        await new Promise(r => setTimeout(r, 0));
        expect(stored(filename).content.columns).toEqual(['Navn', 'Køn', 'Niveau']);
        state.currentClass = null;
    });

    it('et omdøb gemmes sammen med reglen, så de to peger på samme navn', async () => {
        const filename = emptyClass('tom2');
        const rules = [{ column: 'Elevnavn', type: 'spread' }];
        await saveClassData(filename, [], rules, 'Elevnavn', [], {}, {}, [], [], {},
            { columns: ['Elevnavn', 'Køn'] });
        const cls = stored(filename);
        expect(cls.content.columns).toEqual(['Elevnavn', 'Køn']);
        expect(cls.content.rules[0].column).toBe('Elevnavn');
    });

    it('interne felter og andet end tekst kommer ikke med i listen', () => {
        const filename = emptyClass('tom3');
        pyBridge.updateClass(filename, [], [], 'Navn', [], {}, {}, [], [], {},
            { columns: ['Navn', '_rowId', 42, null, 'Navn', '__MatrixSource__'] });
        expect(stored(filename).content.columns).toEqual(['Navn', '__MatrixSource__']);
    });

    it('har klassen elever, bestemmer rækkerne stadig — en forældet liste vinder ikke', () => {
        const res = pyBridge.createClass('fuld', 'Navn,Køn\nAnna,K\n', true);
        pyBridge.updateClass(res.filename, [{ Køn: 'K', Navn: 'Anna', _rowId: 'r1' }],
            [], 'Navn', [], {}, {}, [], [], {}, { columns: ['Navn', 'Køn', 'Gammel'] });
        expect(stored(res.filename).content.columns).toEqual(['Køn', 'Navn']);
    });

    it('uden en liste (ældre kalder) bliver de gemte kolonner stående som før', () => {
        const filename = emptyClass('tom4');
        pyBridge.updateClass(filename, [], [{ column: 'Køn' }], 'Navn', [], {}, {}, [], [], {});
        expect(stored(filename).content.columns).toEqual(['Navn', 'Køn']);
    });

    it('en backup af en tom klasse kommer tilbage MED sine kolonner', async () => {
        const res = await restoreBackup([{
            filename: 'tom_backup.csv', name: 'Tom backup', data: [],
            columns: ['Navn', 'Køn'], rules: [], id_column: 'Navn'
        }]);
        expect(res.error).toBeUndefined();
        expect(stored('tom_backup.csv').content.columns).toEqual(['Navn', 'Køn']);
    });
});
