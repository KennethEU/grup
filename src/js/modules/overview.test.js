import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from './state.js';
import { ROW_ID_PATTERN } from './utils.js';

// Emner slås op i storage — her holder vi det i en simpel map, så testen
// handler om hvad der STÅR på udskriften, ikke om localStorage.
const topics = {};
vi.mock('./storage.js', () => ({
    getTopic: (name, prefix) => topics[`${prefix}${name}`] || null,
}));

import { openOverview } from './overview.js';

// window.open erstattes af en opsamler, så vi kan læse den genererede HTML.
let written;
function stubWindowOpen() {
    written = '';
    vi.stubGlobal('open', () => ({
        document: {
            write: (html) => { written += html; },
            close: () => {},
        },
    }));
}

beforeEach(() => {
    for (const k of Object.keys(topics)) delete topics[k];
    stubWindowOpen();
    window.notifyInfo = vi.fn();
    window.notifyError = vi.fn();

    state.currentClass = {
        name: '3.a',
        data: [
            { _rowId: 'r1', Navn: 'Anna', Kaldenavn: 'Ann' },
            { _rowId: 'r2', Navn: 'Bo' },
            { _rowId: 'r3', Navn: 'Cecilie' },
        ],
    };
    state.displayColumn = 'Navn';
    state.storedStandardGroups = null;
    state.storedMatrixGroups = null;
    state.matrixGroupsStale = false;
});

// En ny stam-generering lader den gamle matrix blive liggende og sætter kun
// flaget "matrixen skal dannes forfra". Udskriften så ikke på flaget og
// skrev den gamle matrix ud som "Runde 2" under de NYE stamgrupper — med
// oprindelses-mærkater regnet ud fra grupper, matrixen aldrig kom fra.
describe('openOverview — en forældet matrix kommer ikke på papiret', () => {
    it('udskriver kun stamgrupperne, når matrixen er forældet', () => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1', 'r2'] }];
        state.storedMatrixGroups = [{ name: 'Group 1', members: ['r1', 'r3'] }];
        state.matrixGroupsStale = true;

        openOverview();

        expect(written).toContain('Stamgrupper');
        expect(written).not.toContain('Matrixgrupper');
        expect(written).not.toContain('Runde 1');
        // Læreren får at vide, hvorfor matrixen mangler.
        expect(window.notifyInfo).toHaveBeenCalledWith(expect.stringContaining('Matrix'));
    });

    it('udskriver stadig en frisk matrix', () => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1', 'r2'] }];
        state.storedMatrixGroups = [{ name: 'Group 1', members: ['r1', 'r3'] }];

        openOverview();

        expect(written).toContain('Matrixgrupper');
        expect(window.notifyInfo).not.toHaveBeenCalled();
    });
});

describe('openOverview — udskriften viser navne, ikke interne id\'er', () => {
    it('skriver elevernes navne på stamgrupperne', () => {
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['r1', 'r2'] },
            { name: 'Group 2', members: ['r3'] },
        ];

        openOverview();

        expect(written).toContain('Anna');
        expect(written).toContain('Bo');
        expect(written).toContain('Cecilie');
        expect(written).not.toMatch(new RegExp(`>${ROW_ID_PATTERN.source.slice(1, -1)}<`));
    });

    it('følger lærerens valgte visningskolonne', () => {
        state.displayColumn = 'Kaldenavn';
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];

        openOverview();

        expect(written).toContain('Ann');
    });

    it('skriver navne i matrixgrupper og på oprindelses-badget', () => {
        topics['S_Group 1'] = 'Biologi';
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1', 'r2'] }];
        state.storedMatrixGroups = [{ name: 'Group 1', members: ['r1', 'r3'] }];

        openOverview();

        expect(written).toContain('Anna');
        expect(written).toContain('Cecilie');
        expect(written).toContain('Biologi');
        expect(written).not.toMatch(new RegExp(`>${ROW_ID_PATTERN.source.slice(1, -1)}<`));
    });

    // Udskriften er den sidste flade der kunne komme til at hente noget
    // udefra. Gør den det, ryger lærerens IP-adresse til en tredjepart hver
    // gang hen printer grupper — og på en skole uden internet får papiret
    // en tilfældig skrifttype. Testen holder den hjemme.
    it('henter skriften fra dida.dk selv — ikke fra et eksternt CDN', () => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];

        openOverview();

        expect(written).toContain('/fonts/fonts.css');
        expect(written).not.toContain('fonts.googleapis.com');
        expect(written).not.toContain('fonts.gstatic.com');
    });

    it('viser navnet fra dengang gruppen blev dannet, når eleven er slettet', () => {
        state.storedStandardGroups = [
            { name: 'Group 1', members: [{ id: 'r9', name: 'Dorte' }] },
        ];

        openOverview();

        expect(written).toContain('Dorte');
    });

    // Fluebenet "Til stede" fjerner ikke eleven fra gruppen — kun papirkurven
    // gør det. Uden markeringen sender den udprintede liste læreren ud efter
    // en elev, der er meldt fraværende.
    it('markerer en fraværende elev på udskriften', () => {
        state.currentClass.data[1]._excluded = true; // Bo
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1', 'r2'] }];

        openOverview();

        expect(written).toContain('fraværende');
        expect(written).toContain('class="absent"');
    });

    it('markerer også fraværende i matrixafsnittet', () => {
        state.currentClass.data[2]._excluded = true; // Cecilie
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];
        state.storedMatrixGroups = [{ name: 'Group 1', members: ['r3'] }];

        openOverview();

        expect(written).toContain('fraværende');
    });

    it('markerer ikke en elev der er til stede', () => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1', 'r2'] }];

        openOverview();

        expect(written).not.toContain('fraværende');
    });

    // ── Gennemsyn af udgangene 2/9: hvad der KAN LÆSES på papiret ──────────
    //
    // De tre tests ovenfor beviser, at det RIGTIGE står i HTML'en. De siger
    // intet om, hvad der er tilbage af det, når arket kommer ud af printeren.
    // Målt på en A4-side med Playwright (print-medie): emnet blev klippet af,
    // og navnet blev presset ned på to linjer af et mærkat der ikke kunne give
    // sig. Begge dele er ren CSS, så det er CSS'en der testes.

    it('klipper ikke emnet af på gruppekortet', () => {
        topics['S_Group 1'] = 'Globalisering og ulighed i Danmark';
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];

        openOverview();

        // Hele emnet skal stå i HTML'en …
        expect(written).toContain('Globalisering og ulighed i Danmark');

        // … OG emnet må ikke være sat op til at skjule overskydende tekst.
        // `max-width: 110px` + `text-overflow: ellipsis` + `nowrap` gjorde
        // netop det: "Globalisering og ..." på papiret, mens PRÆCIS samme
        // tekst stod i fuld længde som oprindelses-mærkat i matrixafsnittet.
        // (Siden 12/9 står emnet som en linje under gruppenavnet, .topic.)
        const topicRule = written.match(/\.topic \{[^}]*\}/)[0];
        expect(topicRule).not.toContain('text-overflow');
        expect(topicRule).not.toContain('nowrap');
        expect(topicRule).not.toMatch(/max-(width|inline-size):\s*\d+px/);
        expect(topicRule).toContain('overflow-wrap: break-word');
    });

    it('lader navnet få pladsen foran oprindelses-mærkatet', () => {
        topics['S_Group 1'] = 'Globalisering og ulighed i Danmark';
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];
        state.storedMatrixGroups = [{ name: 'Group 1', members: ['r1'] }];

        openOverview();

        // Navnet og oprindelsen står i hver sit element på elevens linje.
        expect(written).toContain('class="name"');
        expect(written).toContain('class="origin"');

        // Linjen må ombryde: kan de to ikke stå side om side, rykker
        // oprindelsen ned under navnet i stedet for at klemme det. Uden
        // wrap blev "Sebastian Holm" delt over to linjer af et langt emne.
        expect(written).toMatch(/\bli \{[^}]*flex-wrap: wrap/);

        // Oprindelsen må ombryde. Var den `nowrap`, kunne den ikke give sig.
        const originRule = written.match(/\.origin \{[^}]*\}/)[0];
        expect(originRule).not.toContain('nowrap');

        // … men kun mellem ORD. `overflow-wrap: anywhere` delte "Klimapolitik"
        // i "Klimapo / litik", når en lang elev ved siden af pressede på — et
        // halveret emnenavn er lige så ubrugeligt som det klippede.
        expect(originRule).toContain('overflow-wrap: break-word');
        expect(originRule).not.toContain('anywhere');
    });

    // Hovedet siger hvilken klasse, hvornår og hvor mange — og klassens navn
    // er bruger-tekst som alt andet.
    it('skriver omfanget i hovedet og escaper klassens navn', () => {
        state.currentClass.name = '3.a <b>fed</b>';
        state.currentClass.data[1]._excluded = true; // Bo
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['r1', 'r2'] },
            { name: 'Group 2', members: ['r3'] },
        ];
        state.storedMatrixGroups = [{ name: 'Group 1', members: ['r1', 'r2', 'r3'] }];

        openOverview();

        // Eleverne tælles én gang, selv om de står i både stam og matrix.
        // Teksten læses uden tags — hver del står i sit eget span.
        const text = written.replace(/<[^>]+>/g, '');
        expect(text).toContain('3 elever · 2 stamgrupper · 1 matrixgruppe · 1 fraværende');
        expect(written).toContain('<span class="meta-part">1 matrixgruppe</span>');
        expect(written).toContain('Runde 1 · Stamgrupper');
        expect(written).toContain('3.a &lt;b&gt;fed&lt;/b&gt;');
        expect(written).not.toContain('<b>fed</b>');
    });

    // Én forkortelse, tre steder. Udskriften skrev "Gr. 1", mens gruppekortet
    // og den kopierede liste skrev "Grp 1" — og `SOURCE_RE` i restoreGroups.js
    // (den der skræller mærkatet af igen) kender kun grp/gruppe/group.
    it('forkorter stamgruppen som resten af appen — "Grp 1", ikke "Gr. 1"', () => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];
        state.storedMatrixGroups = [{ name: 'Group 1', members: ['r1'] }];

        openOverview();

        expect(written).toContain('Grp 1');
        expect(written).not.toContain('Gr. 1');
    });
});
