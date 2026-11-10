// Import-stien: hvad en lærers Excel-fil rent faktisk bliver til, når
// sheet_to_csv har skrevet hele arkets "brugte område" ud.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pyBridge } from './py_bridge.js';
import { NEW_BUILD_MESSAGE } from './newBuild.js';

describe('createClass — import af Excel-agtige CSV-data', () => {
    beforeEach(() => localStorage.clear());

    function cols(filename) {
        const cls = pyBridge.getClasses().find(c => c.filename === filename);
        return cls.content.columns;
    }

    it('CASE 1: oppustet Excel-område giver ingen "Uden navn"-kolonner', () => {
        const csv = 'Navn,Køn,Emne,,,,,,,,,\nAnna,K,Biologi,,,,,,,,,\nMikkel,M,Fysik,,,,,,,,,\n';
        const res = pyBridge.createClass('3a', csv, true);
        expect(res.error).toBeUndefined();
        expect(cols(res.filename)).toEqual(['Navn', 'Køn', 'Emne']);
        expect(res.warning).toContain('tomme kolonner blev sprunget over');
    });

    it('CASE 2: tom kolonne foran → ID-kolonnen bliver den rigtige', () => {
        const csv = ',Navn,Køn\n,Anna,K\n,Mikkel,M\n';
        const res = pyBridge.createClass('3b', csv, true);
        const cls = pyBridge.getClasses().find(c => c.filename === res.filename);
        expect(cls.content.id_column).toBe('Navn');
        expect(res.warning).not.toContain('mangler en værdi i kolonnen');
    });

    it('CASE 3: tom celle i visningskolonnen nævnes — men blokerer ikke', () => {
        const csv = 'Navn,Køn\nAnna,K\n,M\n';
        const res = pyBridge.createClass('3c', csv, true);
        expect(res.error).toBeUndefined();
        expect(res.warning).toContain('1 række har ingen værdi i "Navn"');
        expect(res.warning).not.toContain('kan du ikke danne grupper');
    });

    it('titel-linje øverst i arket giver en advarsel om forskudte kolonner', () => {
        // Mønstret fra et Excel-ark med en overskrift i A1: én udfyldt celle
        // øverst, flere kolonner nedenunder.
        const csv = 'Klasse 1a — elevliste\nNavn,Køn,Emne\nAnna,K,Biologi\nMikkel,M,Fysik\n';
        const res = pyBridge.createClass('3t', csv, true);
        expect(res.error).toBeUndefined();
        expect(res.warning).toContain('Klasse 1a — elevliste');
        expect(res.warning).toContain('kolonnerne læst forkert');
    });

    it('en klasseliste med KUN én kolonne udløser ikke titel-advarslen', () => {
        const csv = 'Navn\nAnna\nMikkel\nClara\n';
        const res = pyBridge.createClass('3u', csv, true);
        expect(res.error).toBeUndefined();
        expect(res.warning || '').not.toContain('kolonnerne læst forkert');
    });

    it('kun ÉN navngiven kolonne, men data i flere → advarsel, ingen automatisk rettelse', () => {
        // Her ER "Navn" en rigtig overskrift, og kolonne 2 mangler bare sin.
        // Advarslen kommer (den kan ikke skelne), men rækkerne skal være i behold:
        // alle tre elever er der stadig, ingen er blevet spist som overskrift.
        const csv = 'Navn\nAnna,K\nMikkel,M\nClara,K\n';
        const res = pyBridge.createClass('3v', csv, true);
        expect(res.error).toBeUndefined();
        expect(res.rowCount).toBe(3);
    });

    it('hver elev får sit eget _rowId ved import', () => {
        const csv = 'Navn,Køn\nAnna,K\nBob,M\nClara,K\n';
        const res = pyBridge.createClass('3h', csv, true);
        const cls = pyBridge.getClasses().find(c => c.filename === res.filename);
        const ids = cls.content.data.map(r => r._rowId);
        expect(ids).toHaveLength(3);
        expect(new Set(ids).size).toBe(3);          // unikke
        expect(cls.content.columns).not.toContain('_rowId'); // usynligt for læreren
    });

    it('to elever med samme navn er to forskellige elever — ingen advarsel', () => {
        const csv = 'Navn,Køn\nAnna Hansen,K\nAnna Hansen,K\n';
        const res = pyBridge.createClass('3i', csv, true);
        const cls = pyBridge.getClasses().find(c => c.filename === res.filename);
        const ids = cls.content.data.map(r => r._rowId);
        expect(new Set(ids).size).toBe(2);
        expect(res.warning).toBeUndefined();
    });

    it('REGRESSION: komma-decimal-advarslen fyrer stadig', () => {
        // "Anna,7,5" har 3 celler mod 2 overskrifter
        const csv = 'Navn,Karakter\nAnna,7,5\nMikkel,10\n';
        const res = pyBridge.createClass('3d', csv, true);
        expect(res.warning).toContain('flere kolonner end overskrifterne');
    });


    it('kolonne med overskrift men uden data bevares', () => {
        const csv = 'Navn,Køn,Noter\nAnna,K,\nMikkel,M,\n';
        const res = pyBridge.createClass('3f', csv, true);
        expect(cols(res.filename)).toEqual(['Navn', 'Køn', 'Noter']);
        expect(res.warning).toBeUndefined();
    });

    it('uden overskrifter: tomme kolonner fjernes, Navn/Info bevares', () => {
        const csv = 'Anna,K,,,\nMikkel,M,,,\n';
        const res = pyBridge.createClass('3g', csv, false);
        expect(cols(res.filename)).toEqual(['Navn', 'Info 1']);
    });

    // Overskrifterne kommer fra lærerens fil og bruges som nøgler i et
    // opslagsobjekt. Var det et almindeligt {}, ville en kolonne der hedder
    // det samme som en indbygget egenskab ramme det arvede felt i stedet for
    // et tomt opslag — og blive omdøbt til "constructor_NaN".
    it('en kolonne der hedder som en indbygget egenskab beholder sit navn', () => {
        const csv = 'constructor,toString,valueOf\nAnna,K,10\n';
        const res = pyBridge.createClass('3h', csv, true);
        expect(cols(res.filename)).toEqual(['constructor', 'toString', 'valueOf']);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Worker-livscyklus: en init() der bliver afløst
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Genstart efter en deploy
//
// Fanen har stået åben, mens en ny udgave blev lagt op. En genstart efter
// "Stop" må hverken hente den gamle motor-tråd (væk fra serveren) eller
// blande gammel JavaScript med nye Python-filer. Se newBuild.js.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// To faner, samme klasse
//
// Klassen ligger i hukommelsen i BEGGE faner. Retter man i den ene og
// bagefter i den anden, skriver den anden hele sin egen — nu forældede —
// udgave tilbage, og den førstes rettelse er væk uden en lyd. Der findes
// ingen server med en kopi. `last_modified` er det eneste spor, der er
// tilbage af den fremmede skrivning.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('en anden fane har ændret klassen under os', () => {
    let errors;

    beforeEach(() => {
        localStorage.clear();
        pyBridge._seenModified.clear();
        pyBridge._seenContent.clear();
        pyBridge._foreignEditWarned.clear();
        pyBridge._invalidateClassesCache();
        errors = [];
        window.notifyError = (msg) => errors.push(msg);
    });

    afterEach(() => { delete window.notifyError; });

    /** Skriv direkte i lageret — sådan ser den ANDEN fanes gem ud herfra. */
    function editFromOtherTab(filename, newName) {
        const classes = JSON.parse(localStorage.getItem('grupdk_classes'));
        const cls = classes.find(c => c.filename === filename);
        cls.content.data[0].Navn = newName;
        cls.last_modified = new Date(Date.now() + 60000).toISOString();
        localStorage.setItem('grupdk_classes', JSON.stringify(classes));
        pyBridge._invalidateClassesCache();
    }

    it('siger til, når vi er ved at skrive den anden fanes rettelse væk', () => {
        const res = pyBridge.createClass('2fane', 'Navn,Køn\nAnna,K\nBo,M\n', true);
        const cls = pyBridge.getClass(res.filename, { track: true });
        const data = JSON.parse(JSON.stringify(cls.content.data));

        editFromOtherTab(res.filename, 'ANNA FRA FANE A');

        // Denne fane har sin EGEN rettelse. Uden den skrives intet: et gem
        // af det, fanen allerede kender, lader den anden fanes stå
        // (_hasOwnChange, se persistence.test.js).
        data[1].Navn = 'Bodil';
        pyBridge.updateClass(res.filename, data, [], 'Navn', [], {}, {}, [], [], {});

        expect(errors.length).toBe(1);
        expect(errors[0]).toContain('også åben i en anden fane');
        // Gemmet sker ALLIGEVEL — det læreren har på skærmen, er det hun
        // arbejder i, og at afvise det ville koste hende arbejde uden en
        // vej ud. Beskeden fortæller, at den ANDEN fane nu er forældet.
        expect(pyBridge.getClass(res.filename).content.data[0].Navn).toBe('Anna');
    });

    it('advarer kun én gang pr. klasse — ikke ved hvert tastetryk', () => {
        const res = pyBridge.createClass('2fane_b', 'Navn\nAnna\n', true);
        const data = [{ Navn: 'Anna' }];
        pyBridge.getClass(res.filename, { track: true });
        editFromOtherTab(res.filename, 'X');

        pyBridge.updateClass(res.filename, data, [], 'Navn', [], {}, {}, [], [], {});
        pyBridge.updateClass(res.filename, data, [], 'Navn', [], {}, {}, [], [], {});
        pyBridge.updateClass(res.filename, data, [], 'Navn', [], {}, {}, [], [], {});

        expect(errors.length).toBe(1);
    });

    it('vores EGNE gem udløser ingen advarsel', () => {
        const res = pyBridge.createClass('2fane_c', 'Navn\nAnna\n', true);
        const data = [{ Navn: 'Anna' }];

        // Gem, omdøb, gem igen — alle tre bumper last_modified selv.
        pyBridge.updateClass(res.filename, data, [], 'Navn', [], {}, {}, [], [], {});
        pyBridge.renameClass(res.filename, 'Nyt navn');
        pyBridge.updateClass(res.filename, data, [], 'Navn', [], {}, {}, [], [], {});

        expect(errors).toEqual([]);
    });

    it('et omdøb, browseren afviste, giver ingen falsk alarm ved næste gem', () => {
        // Omdøbet huskede sit nye tidsstempel FØR det vidste, om skrivningen
        // lykkedes. Afviste browseren den (lageret fuldt), stod lageret med
        // det gamle stempel, og næste gem kaldte det "ændret i en anden fane".
        const res = pyBridge.createClass('2fane_e', 'Navn\nAnna\n', true);
        const data = [{ Navn: 'Anna' }];
        pyBridge.getClass(res.filename, { track: true });

        const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
            const e = new Error('fuld');
            e.name = 'QuotaExceededError';
            throw e;
        });
        const renamed = pyBridge.renameClass(res.filename, 'Et meget længere navn');
        spy.mockRestore();
        expect(renamed.error).toBeTruthy();

        errors.length = 0;   // beskeden om fuldt lager hører til omdøbet
        pyBridge.updateClass(res.filename, data, [], 'Navn', [], {}, {}, [], [], {});

        expect(errors).toEqual([]);
    });

    it('en klasse vi aldrig har set før, giver ingen falsk alarm', () => {
        // Fane B er lige startet: klassen findes i lageret, men denne fane
        // har aldrig hentet den. Så er der ikke noget at sammenligne med.
        const res = pyBridge.createClass('2fane_d', 'Navn\nAnna\n', true);
        pyBridge._seenModified.clear();

        pyBridge.updateClass(res.filename, [{ Navn: 'Anna' }], [], 'Navn', [], {}, {}, [], [], {});

        expect(errors).toEqual([]);
    });
});

// Kolonnenavnet er en lagernøgle: alle importerede celler skal overleve,
// og en almindelig tekstkolonne må aldrig styre elevens fravær eller id.
describe('overskrifter ved import bevarer de enkelte celler', () => {
    beforeEach(() => localStorage.clear());

    it('bevarer både gentagne overskrifter og allerede nummererede navne', () => {
        const result = pyBridge.createClass('Header collision', 'Name,Score,Score,Score_2\nAnna,1,2,3');
        const { columns, data } = pyBridge.getClass(result.filename).content;
        expect(new Set(columns).size).toBe(4);
        expect(columns.map(column => data[0][column])).toEqual(['Anna', '1', '2', '3']);
        expect(columns[3]).toBe('Score_2');
    });

    it('interne feltnavne fra en fil bliver synlige datakolonner', () => {
        const result = pyBridge.createClass('Reserved headers', 'Name,_excluded,_rowId,__proto__\nAnna,false,external,note');
        const { columns, data } = pyBridge.getClass(result.filename).content;
        expect(columns.every(column => !column.startsWith('_'))).toBe(true);
        expect(columns.map(column => data[0][column])).toEqual(['Anna', 'false', 'external', 'note']);
        expect(data[0]._excluded).toBeUndefined();
        expect(data[0]._rowId).not.toBe('external');
        expect(result.warning).toContain('omdøbt');
    });
});

// "å" som a + ring (typisk kopieret ud af en PDF) og som ét tegn er to
// forskellige tekster for motoren. Før blev "Århus" og "Århus" to værdier,
// og en Adskil-regel på "Århus" ramte kun halvdelen af eleverne.
describe('tegnform (NFC) — importen og motorens input', () => {
    const NFC = 'Århus';
    const NFD = 'Århus';

    beforeEach(() => localStorage.clear());

    it('createClass gemmer celler og overskrifter som ét tegn', () => {
        const res = pyBridge.createClass('nfc', `Navn,A\u030Argang,By\nAnna,1g,${NFD}\nBo,2g,${NFC}\n`, true);
        const cls = pyBridge.getClasses().find(c => c.filename === res.filename);
        expect(cls.content.columns).toEqual(['Navn', '\u00C5rgang', 'By']);
        expect(cls.content.data.map(r => r.By)).toEqual([NFC, NFC]);
    });

});
