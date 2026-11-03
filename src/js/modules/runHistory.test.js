import { describe, it, expect, beforeEach, vi } from 'vitest';
import { reactive } from 'vue';
import { state } from './state.js';

// Emne-kortet holdes i en simpel map, så testene handler om HVAD der
// gemmes og gendannes — ikke om localStorage.
let topicMap = {};
// Sæt til true for at lade lageret afvise ALLE skrivninger — sådan opfører
// en fuld kvote sig, og sådan opfører Safari sig i privat browsing.
let storageRejects = false;
vi.mock('./storage.js', () => ({
    readTopicMap: () => ({ ...topicMap }),
    replaceTopicMap: (m) => {
        if (storageRejects) return false;
        topicMap = { ...m };
        return true;
    },
    hydrateGroupTopics: (groups, prefix) => {
        (groups || []).forEach(g => {
            const t = topicMap[`${prefix}${g.name}`];
            g.topic = (t && String(t).trim()) ? String(t).trim() : null;
        });
    },
    saveGroupsToStorage: vi.fn(() => !storageRejects),
    getTopic: (name, prefix) => topicMap[`${prefix}${name}`] || null,
}));

import {
    pushRun, restoreRun, listRuns, clearRuns, hasRuns,
    hasManualChanges, markClean, describeRules,
    hasSettingsChanges, previewRunGroups, runChanges, MAX_RUNS,
} from './runHistory.js';
import * as replay from './replay.js';

function classFile(filename = 'test-class') {
    return {
        filename,
        name: filename,
        data: [
            { _rowId: 'r1', Navn: 'Anna' },
            { _rowId: 'r2', Navn: 'Bo' },
            { _rowId: 'r3', Navn: 'Cecilie' },
        ],
        columns: ['Navn'],
        rules: [], matrixRules: [],
        settings: {}, matrixSettings: {},
        separations: [], topics: [],
    };
}

beforeEach(() => {
    topicMap = {};
    storageRejects = false;
    clearRuns();
    state.currentClass = classFile();
    state.displayColumn = 'Navn';
    state.storedStandardGroups = null;
    state.storedMatrixGroups = null;
    state.groupMode = 'size';
    state.matrixGroupsStale = false;
});

describe('pushRun — hvad der overhovedet kommer i stakken', () => {
    it('gemmer ingenting når der ikke er nogen grupper endnu', () => {
        // Allerførste generering: der ER ikke noget at gå tilbage til.
        expect(pushRun()).toBeNull();
        expect(hasRuns()).toBe(false);
    });

    it('gemmer den udgående tilstand, så listen er "kørsler du kan gå tilbage til"', () => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1', 'r2'] }];
        pushRun();

        const runs = listRuns();
        expect(runs).toHaveLength(1);
        expect(runs[0].groupCount).toBe(1);
    });

    it('holder kun de nyeste MAX_RUNS kørsler', () => {
        for (let i = 0; i < MAX_RUNS + 3; i++) {
            state.storedStandardGroups = [{ name: `Group ${i}`, members: ['r1'] }];
            pushRun();
        }
        expect(listRuns()).toHaveLength(MAX_RUNS);
        // Nyeste forrest.
        expect(listRuns()[0].groupCount).toBe(1);
    });

    // Afspilningen viser, hvordan den fordeling blev til, der nu skiftes ud.
    // Timeren skal også være død — ellers tikker den et billede mere frem.
    it('stopper en afspilning — også med en tom fordeling', () => {
        vi.useFakeTimers();
        try {
            const recording = {
                runs: [{ seed: [[], []], deal: [['r1', 0], ['r2', 1]], events: [] }],
                best_run_index: 0,
            };
            for (const groups of [null, [{ name: 'Group 1', members: ['r1', 'r2'] }]]) {
                state.storedStandardGroups = groups;
                expect(replay.start(recording, ['Group 1', 'Group 2'], [], 'standard')).toBe(true);
                replay.play();
                pushRun();
                expect(state.replay).toBeNull();
                vi.advanceTimersByTime(5000);
                expect(state.replay).toBeNull();
            }
        } finally {
            vi.useRealTimers();
        }
    });

    it('tæller kun elever der er til stede', () => {
        state.currentClass.data[1]._excluded = true;
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];
        pushRun();

        expect(listRuns()[0].presentCount).toBe(2);
    });
});

describe('restoreRun — grupperne kommer tilbage som de var', () => {
    it('gendanner medlemmerne', () => {
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['r1', 'r2'] },
            { name: 'Group 2', members: ['r3'] },
        ];
        pushRun();
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1', 'r2', 'r3'] }];

        expect(restoreRun(0)).toMatchObject({ restored: true });
        expect(state.storedStandardGroups).toHaveLength(2);
        expect(state.storedStandardGroups[1].members).toEqual(['r3']);
    });

    // Præcis den fejl der blev fundet i de gemte sessioner: `locked` faldt
    // på gulvet, og næste generering rev de låste grupper op.
    it('gendanner låsen på en låst gruppe', () => {
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['r1'], locked: true },
            { name: 'Group 2', members: ['r2'], locked: false },
        ];
        pushRun();
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1', 'r2'], locked: false }];

        restoreRun(0);

        expect(state.storedStandardGroups[0].locked).toBe(true);
        expect(state.storedStandardGroups[1].locked).toBe(false);
    });

    it('gendanner stam- og matrixgrupper sammen', () => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1', 'r2'] }];
        state.storedMatrixGroups = [{ name: 'Group 1', members: ['r1', 'r3'] }];
        pushRun();
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r3'] }];
        state.storedMatrixGroups = null;

        restoreRun(0);

        expect(state.storedStandardGroups[0].members).toEqual(['r1', 'r2']);
        expect(state.storedMatrixGroups[0].members).toEqual(['r1', 'r3']);
    });

    it('en kørsel med matrix er ikke forældet — en uden er', () => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];
        state.storedMatrixGroups = [{ name: 'Group 1', members: ['r1'] }];
        pushRun();                       // kørsel MED matrix
        state.storedMatrixGroups = null;
        pushRun();                       // kørsel UDEN matrix

        restoreRun(0);                   // den uden
        expect(state.matrixGroupsStale).toBe(true);

        // Hver gendannelse lægger den forladte tilstand forrest, så
        // pladserne skubbes ned. Find kørslen med matrix på dens indhold.
        const withMatrix = listRuns().findIndex(r => r.hasMatrix);
        restoreRun(withMatrix);
        expect(state.matrixGroupsStale).toBe(false);
    });

    it('siger fra når kørslen ikke findes', () => {
        expect(restoreRun(0)).toBe(false);
        expect(restoreRun(99)).toBe(false);
    });
});

describe('restoreRun — emnerne følger med kørslen', () => {
    it('gendanner hele emne-kortet, ikke kun gruppeobjektet', () => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'], topic: 'Liberalisme' }];
        topicMap = { 'S_Group 1': 'Liberalisme' };
        pushRun();

        // Læreren genererer igen og emnerne bliver nogle andre.
        topicMap = { 'S_Group 1': 'Socialisme' };
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r2'], topic: 'Socialisme' }];

        restoreRun(0);

        // Både kortet OG gruppeobjektet — ellers viser badges ét emne mens
        // dropdown'en viser et andet.
        expect(topicMap['S_Group 1']).toBe('Liberalisme');
        expect(state.storedStandardGroups[0].topic).toBe('Liberalisme');
    });

    it('fletter klasse-emner ind i stedet for at erstatte dem', () => {
        state.currentClass.topics = ['Liberalisme', 'Konservatisme'];
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];
        pushRun();

        // Læreren tilføjer et emne EFTER kørslen — det må ikke forsvinde.
        state.currentClass.topics = ['Liberalisme', 'Konservatisme', 'Socialisme'];

        restoreRun(0);

        expect(state.currentClass.topics).toEqual(
            ['Liberalisme', 'Konservatisme', 'Socialisme']);
    });

    it('fletter case-ufølsomt, så "liberalisme" ikke bliver et emne mere', () => {
        state.currentClass.topics = ['Liberalisme'];
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];
        pushRun();
        state.currentClass.topics = ['liberalisme'];

        restoreRun(0);

        expect(state.currentClass.topics).toHaveLength(1);
    });

    // Fletningen ovenfor beholder klassens "liberalisme" — men gruppen fik
    // kørslens "Liberalisme" fra emnekortet. Emnevælgeren på kortet er en
    // <select>, der matcher præcist, så den stod TOM, selvom gruppen havde et
    // emne. Samme fejl som "Gendan grupper" fik rettet 23/9.
    it('giver gruppens emne klassens stavemåde, så emnevælgeren ikke står tom', () => {
        state.currentClass.topics = ['klima'];
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'], topic: 'klima' }];
        topicMap = { 'S_Group 1': 'klima' };
        pushRun();

        // Læreren retter stavemåden i emnelisten og danner grupper igen.
        state.currentClass.topics = ['Klima'];
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r2'], topic: 'Klima' }];
        topicMap = { 'S_Group 1': 'Klima' };

        restoreRun(0);

        expect(state.currentClass.topics).toEqual(['Klima']);
        expect(state.storedStandardGroups[0].topic).toBe('Klima');
        expect(topicMap['S_Group 1']).toBe('Klima');
    });
});

describe('restoreRun — indstillinger kun når læreren beder om det', () => {
    beforeEach(() => {
        state.currentClass.rules = [{ type: 'distribute', column: 'Køn' }];
        state.currentClass.settings = { groupTarget: '4' };
        state.currentClass.separations = [{ ids: ['r1', 'r2'] }];
        state.groupMode = 'size';
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];
        pushRun();

        // Læreren retter reglen bagefter.
        state.currentClass.rules = [{ type: 'cluster', column: 'Niveau' }];
        state.currentClass.settings = { groupTarget: '6' };
        state.currentClass.separations = [];
        state.groupMode = 'number';
    });

    // Det typiske tilfælde: "jeg rettede en regel, genererede, og vil have de
    // gamle grupper tilbage MEN beholde min rettelse".
    it('lader reglerne stå som standard', () => {
        restoreRun(0);

        expect(state.currentClass.rules[0].type).toBe('cluster');
        expect(state.currentClass.settings.groupTarget).toBe('6');
        expect(state.groupMode).toBe('number');
    });

    it('gendanner regler, indstillinger, undgåelser og tilstand på ekstra klik', () => {
        restoreRun(0, true);

        expect(state.currentClass.rules[0].type).toBe('distribute');
        expect(state.currentClass.settings.groupTarget).toBe('4');
        expect(state.currentClass.separations).toHaveLength(1);
        expect(state.groupMode).toBe('size');
    });
});

describe('restoreRun — elevlisten røres aldrig', () => {
    // Ville vi gendanne elevrækkerne, ville en elev der er MØDT OP stå
    // fraværende igen — og vi ville skrive i den liste, Ctrl+Z-stakken ejer.
    it('lader fravær og elevrækker være i fred', () => {
        state.currentClass.data[0]._excluded = true;
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];
        pushRun();

        // Anna møder op.
        state.currentClass.data[0]._excluded = false;
        state.currentClass.data[0].Navn = 'Anna Sørensen';

        restoreRun(0);

        expect(state.currentClass.data[0]._excluded).toBe(false);
        expect(state.currentClass.data[0].Navn).toBe('Anna Sørensen');
    });
});

describe('restoreRun — et skridt for langt kan fortrydes', () => {
    it('lægger den forladte tilstand i stakken', () => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];
        pushRun();                                              // kørsel A
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r2'] }];

        restoreRun(0);                                          // tilbage til A
        expect(state.storedStandardGroups[0].members).toEqual(['r1']);

        // Den tilstand vi forlod (r2) skal kunne hentes frem igen — den
        // ligger nu øverst, fordi restoreRun() lagde den i stakken.
        expect(listRuns().length).toBeGreaterThan(1);
        restoreRun(0);
        expect(state.storedStandardGroups[0].members).toEqual(['r2']);
    });
});

describe('hasManualChanges — spørg kun når der er noget at miste', () => {
    beforeEach(() => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1', 'r2'] }];
        pushRun();
        markClean();
    });

    it('er falsk lige efter en kørsel', () => {
        expect(hasManualChanges()).toBe(false);
    });

    it('er sand når en elev er flyttet i hånden', () => {
        state.storedStandardGroups[0].members = ['r1'];
        expect(hasManualChanges()).toBe(true);
    });

    it('er sand når en gruppe er blevet låst', () => {
        state.storedStandardGroups[0].locked = true;
        expect(hasManualChanges()).toBe(true);
    });

    it('er falsk igen efter en gendannelse', () => {
        state.storedStandardGroups[0].members = ['r1'];
        restoreRun(0);
        expect(hasManualChanges()).toBe(false);
    });

    // restoreRun() lægger HELE emnekortet tilbage. Et emne læreren har rettet
    // eller byttet rundt på bagefter, forsvinder derfor lige så stille som en
    // flyttet elev — og skal give den samme advarsel.
    it('er sand når et emne er rettet på gruppeobjektet', () => {
        state.storedStandardGroups[0].topic = 'Liberalisme';
        expect(hasManualChanges()).toBe(true);
    });

    it('er sand når et emne er byttet i emnekortet', () => {
        topicMap['S_Group 1'] = 'Konservatisme';
        expect(hasManualChanges()).toBe(true);
    });

    it('ser forskel på stam- og matrix-emner med samme gruppenavn', () => {
        // Stam- og matrixgrupper hedder begge "Group 1"; kun præfikset
        // skiller dem ad i emnekortet.
        state.storedMatrixGroups = [{ name: 'Group 1', members: ['r3'] }];
        markClean();
        topicMap['M_Group 1'] = 'Runde 2';
        expect(hasManualChanges()).toBe(true);
    });
});

describe('klasseskift — en kørsel må aldrig lande i den forkerte klasse', () => {
    it('viser ikke kørsler fra en anden klasse', () => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];
        pushRun();
        expect(listRuns()).toHaveLength(1);

        state.currentClass = classFile('anden-klasse');
        expect(listRuns()).toHaveLength(0);
        expect(hasRuns()).toBe(false);
    });

    it('kan ikke gendanne en anden klasses kørsel', () => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];
        pushRun();

        state.currentClass = classFile('anden-klasse');
        expect(restoreRun(0)).toBe(false);
    });

    it('clearRuns tømmer stakken', () => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];
        pushRun();
        clearRuns();
        expect(listRuns()).toHaveLength(0);
    });
});

describe('dublet-værn', () => {
    it('lægger ikke den samme tilstand i stakken to gange i træk', () => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];
        pushRun();
        pushRun();
        pushRun();

        expect(listRuns()).toHaveLength(1);
    });

    it('men en ægte ændring kommer med', () => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];
        pushRun();
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r2'] }];
        pushRun();

        expect(listRuns()).toHaveLength(2);
    });
});

describe('describeRules — hvad kørslen blev dannet med', () => {
    it('nævner regler ved deres danske navne', () => {
        const run = {
            rules: [{ type: 'distribute', column: 'Køn' }],
            settings: {}, classTopics: [], groupMode: 'size',
        };
        expect(describeRules(run)).toContain('Fordel Køn');
    });

    it('skelner mellem antal grupper og gruppestørrelse', () => {
        const base = { rules: [], classTopics: [] };
        expect(describeRules({ ...base, groupMode: 'number', settings: { groupTarget: '5' } }))
            .toContain('5 grupper');
        expect(describeRules({ ...base, groupMode: 'size', settings: { groupTarget: '4' } }))
            .toContain('4 pr. gruppe');
    });

    it('siger det ligeud når der ingen regler er', () => {
        expect(describeRules({ rules: [], settings: {}, classTopics: [] }))
            .toBe('Ingen regler');
    });
});

describe('slettede elever', () => {
    // Et medlem bæres rundt som "r7". Slettes eleven, er der ingen række at
    // slå navnet op i, og kortet ville vise "(uden navn)".
    it('fryser navnene i snapshottet', () => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1', 'r2'] }];
        pushRun();

        state.currentClass.data = state.currentClass.data.filter(r => r._rowId !== 'r2');

        // Navnet er gemt i snapshottet, uanset hvad elevlisten siger nu.
        expect(state._runHistory[0].names['r2']).toBe('Bo');
    });
});


describe('previewRunGroups — kørslen på gruppekortene', () => {
    // Forhåndsvisningen tegner kørslens RÅ gruppeobjekter på de rigtige
    // kort, så lås og medlemmer skal komme med, som de stod.
    it('tager låsen og medlemmerne med', () => {
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['r1', 'r2'], locked: true },
            { name: 'Group 2', members: ['r3'] },
        ];
        pushRun();

        const shown = previewRunGroups(0, false);
        expect(shown).toHaveLength(2);
        expect(shown[0].locked).toBe(true);
        expect(shown[0].members).toEqual(['r1', 'r2']);
    });

    it('kan vise matrixgrupperne i stedet', () => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];
        state.storedMatrixGroups = [{ name: 'Group 1', members: ['r2', 'r3'] }];
        pushRun();

        expect(previewRunGroups(0, true)[0].members).toEqual(['r2', 'r3']);
    });

    // En kopi: intet læreren gør under forhåndsvisningen må sive ind i
    // snapshottet.
    it('giver en kopi, ikke snapshottet selv', () => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];
        pushRun();

        previewRunGroups(0, false)[0].members.push('r3');
        expect(previewRunGroups(0, false)[0].members).toEqual(['r1']);
    });
});


describe('reaktive proxyer i gruppelisten', () => {
    // Flere steder i appen skrives `state.storedStandardGroups = [...groups]`
    // (LatecomerModal, addEmptyGroup, deleteGroup). Spredning af et reaktivt
    // array lægger PROXY-objekter ned i det nye array, og structuredClone
    // kaster DataCloneError på dem — hele "gå tilbage" gik død med en fejl i
    // konsollen og en menu der blev hængende.
    it('kan gemme og gendanne en liste der indeholder proxyer', () => {
        const reactiveGroups = reactive([
            { name: 'Group 1', members: ['r1', 'r2'], locked: true },
            { name: 'Group 2', members: ['r3'] },
        ]);
        // Spredningen er det, der lægger proxyer ned i arrayet.
        state.storedStandardGroups = [...reactiveGroups];

        expect(() => pushRun()).not.toThrow();
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];

        expect(restoreRun(0)).toMatchObject({ restored: true });
        expect(state.storedStandardGroups).toHaveLength(2);
        expect(state.storedStandardGroups[0].locked).toBe(true);
    });

    it('kan også forhåndsvise en liste med proxyer', () => {
        const reactiveGroups = reactive([{ name: 'Group 1', members: ['r1', 'r2'] }]);
        state.storedStandardGroups = [...reactiveGroups];
        pushRun();

        expect(() => previewRunGroups(0, false)).not.toThrow();
        expect(previewRunGroups(0, false)[0].members).toEqual(['r1', 'r2']);
    });
});


describe('inputtet hører til de grupper det dannede', () => {
    // pushRun() kaldes i BEGYNDELSEN af den næste generering — på et
    // tidspunkt hvor læreren typisk lige HAR ændret en regel. Læses begge
    // dele dér, parres kørsel 1's grupper med kørsel 2's indstillinger:
    // info-linjen lyver, og "tag alt med" henter de forkerte regler frem.
    it('gemmer indstillingerne fra dengang grupperne blev dannet', () => {
        state.currentClass.settings = { groupTarget: '4' };
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];
        markClean();                       // som ved enden af en generering

        // Læreren ændrer størrelsen og trykker Generér igen.
        state.currentClass.settings = { groupTarget: '6' };
        pushRun();

        expect(state._runHistory[0].settings.groupTarget).toBe('4');
    });

    it('efter en gendannelse hører kørslens eget input til grupperne', () => {
        state.currentClass.settings = { groupTarget: '4' };
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];
        markClean();

        state.currentClass.settings = { groupTarget: '6' };
        pushRun();
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r2'] }];
        markClean();

        restoreRun(0);                     // tilbage til kørslen med '4'
        expect(state._lastRunInputs.settings.groupTarget).toBe('4');
    });
});

describe('hasSettingsChanges — spørg kun når der er noget at svare på', () => {
    beforeEach(() => {
        state.currentClass.rules = [{ type: 'distribute', column: 'Køn' }];
        state.currentClass.settings = { groupTarget: '4' };
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];
        markClean();
        pushRun();
    });

    it('er falsk når intet er ændret siden kørslen', () => {
        expect(hasSettingsChanges(0)).toBe(false);
    });

    it('opdager en ændret regel', () => {
        state.currentClass.rules = [{ type: 'cluster', column: 'Køn' }];
        expect(hasSettingsChanges(0)).toBe(true);
    });

    it('opdager en ændret gruppestørrelse', () => {
        state.currentClass.settings = { groupTarget: '6' };
        expect(hasSettingsChanges(0)).toBe(true);
    });

    it('opdager en ny undgåelse', () => {
        state.currentClass.separations = [{ ids: ['r1', 'r2'] }];
        expect(hasSettingsChanges(0)).toBe(true);
    });

    it('opdager et nyt klasse-emne', () => {
        state.currentClass.topics = ['Liberalisme'];
        expect(hasSettingsChanges(0)).toBe(true);
    });

    it('opdager skiftet mellem størrelse og antal', () => {
        state.groupMode = 'number';
        expect(hasSettingsChanges(0)).toBe(true);
    });

    it('lader sig ikke narre af nøglerækkefølgen', () => {
        // Samme regel, felterne skrevet i en anden orden.
        state.currentClass.rules = [{ column: 'Køn', type: 'distribute' }];
        expect(hasSettingsChanges(0)).toBe(false);
    });

    // Gruppestørrelsen gemmes som "4" fra genereringen, men som 4 når
    // +/−-knappen skriver den tilbage. Samme størrelse, to skrivemåder —
    // og læreren blev spurgt om indstillinger, hun aldrig havde rørt.
    it('lader sig ikke narre af tal skrevet som tekst', () => {
        state.currentClass.settings = { groupTarget: 4 };
        expect(hasSettingsChanges(0)).toBe(false);
    });

    it('siger nej om en kørsel der ikke findes', () => {
        expect(hasSettingsChanges(99)).toBe(false);
    });
});

describe('de frosne navne skal nå skærmen', () => {
    // Navnene fryses ned i snapshottet, netop fordi eleven kan være slettet,
    // når læreren går tilbage. Men medlemmet er en ren streng ("r7"), og
    // gruppekortet slår navnet op i elevlisten — findes rækken ikke, stod
    // der "(uden navn)", og de frosne navne blev aldrig brugt til noget.
    it('en slettet elev kommer tilbage med sit navn og et spøgelses-mærke', () => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1', 'r2'] }];
        pushRun();

        // Bo slettes fra elevlisten, mens de gamle grupper ligger i stakken.
        state.currentClass.data = state.currentClass.data.filter(r => r._rowId !== 'r2');
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];

        restoreRun(0);

        const [anna, bo] = state.storedStandardGroups[0].members;
        // Anna findes stadig — hun skal blive ved at være en ren id-streng,
        // så en navnerettelse i elevlisten slår igennem.
        expect(anna).toBe('r1');
        expect(bo).toMatchObject({ id: 'r2', name: 'Bo', isGhost: true });
    });

    it('forhåndsvisningen viser også den slettede elevs navn', () => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1', 'r2'] }];
        pushRun();
        state.currentClass.data = state.currentClass.data.filter(r => r._rowId !== 'r2');

        const shown = previewRunGroups(0, false);
        expect(shown[0].members[1]).toMatchObject({ name: 'Bo', isGhost: true });
    });
});

describe('forhåndsvisning af en kørsel uden matrix', () => {
    // Fald tilbage på de NUVÆRENDE grupper og forhåndsvisningen lyver: den
    // viser den matrix der står på skærmen lige nu, som om kørslen havde den.
    // Først klikket afslørede at matrixen forsvandt.
    it('svarer en tom liste — ikke null, der betyder "ingen kørsel"', () => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];
        state.storedMatrixGroups = null;
        pushRun();

        expect(previewRunGroups(0, true)).toEqual([]);
        // null er stadig svaret, når der slet ikke er nogen kørsel på pladsen.
        expect(previewRunGroups(9, true)).toBeNull();
    });
});

describe('en fejlet skrivning må ikke se ud som en succes', () => {
    it('siger fra når kørslen ikke kunne gemmes', () => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1', 'r2'] }];
        pushRun();
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];

        storageRejects = true;
        const result = restoreRun(0);

        // Grupperne ER kommet frem på skærmen ...
        expect(result.restored).toBe(true);
        expect(state.storedStandardGroups[0].members).toHaveLength(2);
        // ... men de ligger ikke i lageret, og det skal kaldstedet kunne se.
        expect(result.saved).toBe(false);
    });

    it('kvitterer normalt når skrivningen gik igennem', () => {
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1', 'r2'] }];
        pushRun();
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];

        expect(restoreRun(0)).toEqual({ restored: true, saved: true });
    });
});

describe('runChanges — hvad kørslen ændrer i HVERT gruppesæt', () => {
    // Baggrund: kørselshistorikken gemmer stamgrupper OG matrix i ét snapshot,
    // men forhåndsvisningen kan kun tegne det sæt læreren står i. Matrixen
    // dannes sjældnere end stamgrupperne, så flere kørsler i træk deler den
    // SAMME matrix — og i matrixvisningen var de chips helt identiske at se på,
    // selvom hvert klik skrev stamgrupperne forskelligt om.
    const homeA = [{ name: 'Group 1', members: ['r1', 'r2'] }, { name: 'Group 2', members: ['r3'] }];
    const homeB = [{ name: 'Group 1', members: ['r1', 'r3'] }, { name: 'Group 2', members: ['r2'] }];
    const matrixM = [{ name: 'Group 1', members: ['r1', 'r3'] }];

    it('ser forskellen i stamgrupperne, selvom matrixen er den samme', () => {
        state.storedStandardGroups = homeA;
        state.storedMatrixGroups = matrixM;
        pushRun();
        // Læreren genererer stamgrupperne om; matrixen står urørt.
        state.storedStandardGroups = homeB;

        expect(runChanges(0)).toEqual({ standard: 'changed', matrix: 'unchanged' });
    });

    it('siger til når matrixen forsvinder ved en gendannelse', () => {
        state.storedStandardGroups = homeA;
        state.storedMatrixGroups = null;
        pushRun();
        state.storedMatrixGroups = matrixM;

        expect(runChanges(0).matrix).toBe('removed');
    });

    it('kalder det uændret når kørslen er magen til det der står nu', () => {
        state.storedStandardGroups = homeA;
        state.storedMatrixGroups = matrixM;
        pushRun();

        expect(runChanges(0)).toEqual({ standard: 'unchanged', matrix: 'unchanged' });
    });

    it('et ændret emne tæller som en ændring — kørslen har sit eget emnekort', () => {
        topicMap = { 'S_Group 1': 'Gammelt emne' };
        state.storedStandardGroups = homeA;
        pushRun();
        // Læreren omdøber emnet bagefter; grupperne står urørt.
        topicMap = { 'S_Group 1': 'Nyt emne' };

        expect(runChanges(0).standard).toBe('changed');
    });

    it('listRuns bærer svaret med ud til menuen', () => {
        state.storedStandardGroups = homeA;
        pushRun();
        state.storedStandardGroups = homeB;

        expect(listRuns()[0].changes.standard).toBe('changed');
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// De frosne navne må ikke arve fra Object
//
// Et medlem bæres normalt som _rowId ("r7"), men i grupper gemt før _rowId
// fandtes er nøglen elevens NAVN. Med `{}` som opslagstabel svarede et
// opslag på en nøgle der ikke fandtes med en ARVET funktion — navnet blev
// aldrig frosset, og gendannelsen læste funktionen tilbage og satte den som
// elevens navn på kortet. Samme rettelse som overview.js og py_bridge.js fik.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('runHistory — navne der hedder det samme som Objects egne felter', () => {
    it('fryser navnet på en elev, hvis medlemsnøgle er "constructor"', () => {
        // Gammel gemt gruppe: medlemmet ER navnet.
        state.currentClass.data = [{ _rowId: 'constructor', Navn: 'Constructor Hansen' }];
        state.storedStandardGroups = [{ name: 'Group 1', members: ['constructor'] }];
        pushRun();

        // Eleven slettes, og så gås der tilbage: navnet skal komme fra
        // snapshottet, ikke fra Object.prototype.
        state.currentClass.data = [];
        const restoredGroups = previewRunGroups(0, false);
        const firstMemberName = restoredGroups[0].members[0].name;
        expect(typeof firstMemberName).toBe('string');
        expect(firstMemberName).toBe('Constructor Hansen');
    });

    it('sætter ikke "[object Object]" på en elev der hedder __proto__', () => {
        state.currentClass.data = [{ _rowId: '__proto__', Navn: 'Proto Jensen' }];
        state.storedStandardGroups = [{ name: 'Group 1', members: ['__proto__'] }];
        pushRun();

        state.currentClass.data = [];
        const firstMemberName = previewRunGroups(0, false)[0].members[0].name;
        expect(firstMemberName).toBe('Proto Jensen');
    });
});
