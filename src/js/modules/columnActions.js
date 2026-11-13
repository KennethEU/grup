// columnActions.js — kolonnerne i elevlisten: omdøb, slet, flyt, og navne
// der ikke duer.
//
// HVORFOR ET MODUL: et kolonnenavn står ikke ét sted. Det står i `columns`,
// i hver eneste elevrække, i reglerne, i de skjulte kolonner, i sorteringen,
// i rangeringen (`columnOrders`) og i lærerens valgte visningskolonne. Ligger
// et af indgrebene inde i en Vue-komponent, er der ingen ét sted at læse, hvad
// der SKAL følge med — og de tre steder der blev glemt (visningskolonnen,
// rangeringen og rækkefølgen) opdagede ingen, før grupperne stod med
// "(uden navn)". Sletningen blev efterladt i DeleteColumnModal.vue, da
// omdøbningen flyttede herhen; den kom med ved gennemsynet 2026-09-07.

import { teacherColumns } from './utils.js';

/**
 * Navne programmet holder for sig selv: ét ledende underscore er et internt
 * felt (`_rowId`, `_excluded` — se isInternalField() i utils.js), to er
 * programmets egne skjulte kolonner (`__MatrixSource__`, `__Rang:…__`).
 * Begge slags skjules af teacherColumns() — se validateColumnName().
 */
const RESERVED_PREFIX_RE = /^_/;

/**
 * Duer navnet som kolonnenavn?
 *
 * @param {string} raw          navnet læreren har skrevet
 * @param {string[]} columns    klassens nuværende kolonner
 * @param {string} [self]       kolonnen der omdøbes (må gerne "kollidere" med sig selv)
 * @returns {{ok: boolean, name?: string, error?: string}} `error` er lærervendt
 */
export function validateColumnName(raw, columns, self = null) {
    const name = String(raw ?? '').trim();

    if (!name) {
        return { ok: false, error: 'Kolonnen skal have et navn.' };
    }

    // Ét ledende underscore er programmets eget mærke for "internt felt"
    // (_rowId, _excluded). Et kolonnenavn med samme mærke forsvinder ud af
    // elevlisten, ud af Excel-eksporten og ud af det, motoren får — og en
    // regel på kolonnen ville så regne på en kolonne, der ikke findes.
    // Nemmere at sige nej med det samme end at forklare bagefter.
    //
    // TO underscores blev før lukket igennem, fordi `__MatrixSource__` er en
    // ægte kolonne. Men teacherColumns() skjuler ALT med "__" foran — så en
    // kolonne læreren kaldte "__Niveau" blev gemt, men stod ingen steder:
    // ikke i elevlisten, ikke i Slet/Omdøb/Kategorisér, ikke i reglerne. Hun
    // kunne hverken se eller fjerne den. Og "Gem som kolonne" med navnet
    // "__MatrixSource__" skrev oven i matrixdannelsens eget input. Programmet
    // selv navngiver aldrig sine kolonner gennem denne funktion, så nej til
    // alle. Det samme gælder et navn, der KUN er "_": isInternalField()
    // regner det som internt. Importen gør det samme med en overskrift, der
    // begynder med "_" (normalizeImportHeaders i importData.js).
    if (RESERVED_PREFIX_RE.test(name)) {
        const suggestion = name.replace(/^_+/, '').trim();
        return {
            ok: false,
            error: `Et kolonnenavn må ikke begynde med "_" — det bruger programmet til sine egne felter.` +
                (suggestion ? ` Prøv fx "${suggestion}".` : '')
        };
    }

    const list = Array.isArray(columns) ? columns : [];
    if (name !== self && list.includes(name)) {
        return { ok: false, error: `Kolonnen "${name}" findes allerede.` };
    }

    return { ok: true, name };
}

/**
 * Reglerne i kørselshistorikken (runHistory.js) — de ligger der som KOPIER.
 *
 * Hver kørsel i fanens historik har sin egen kopi af reglerne, og
 * `state._lastRunInputs` (det input, grupperne på skærmen blev dannet med)
 * har én til. Kopierne fulgte ikke med et omdøb eller en sletning (13/11
 * 2026): omdøbte læreren "Niveau" til "Faglighed" og hentede en kørsel med
 * "Ja, tag alt med", kom reglen tilbage på "Niveau" — en kolonne, der ikke
 * findes. Reglen gjorde så ingenting, og den rigtige regel var væk. Og
 * spørgsmålet "Skal de fra dengang også med?" kom, selvom læreren kun havde
 * rettet et navn. `_lastRunInputs` er lige så vigtig som listen: næste kørsel
 * lægges i historikken MED den.
 *
 * Kun kørsler fra DENNE klasse (`classFile`). `ui` er `state` i appen; i
 * testene er det et lille objekt uden historik, så alt er valgfrit.
 *
 * @param {object} cls
 * @param {object} ui
 * @param {(list: object[]) => object[]} change  får en regelliste, giver den nye
 */
function forEachRunRuleList(cls, ui, change) {
    if (!ui) return;
    const holders = [];
    const runs = Array.isArray(ui._runHistory) ? ui._runHistory : [];
    for (const run of runs) {
        if (run && run.classFile === (cls.filename || null)) holders.push(run);
    }
    if (ui._lastRunInputs && typeof ui._lastRunInputs === 'object') holders.push(ui._lastRunInputs);
    for (const holder of holders) {
        for (const key of ['rules', 'matrixRules']) {
            if (Array.isArray(holder[key])) holder[key] = change(holder[key]);
        }
    }
}

/**
 * Omdøb ÉN nøgle i et rækkeobjekt uden at flytte den bagerst.
 *
 * `row[nyt] = row[gammelt]; delete row[gammelt]` virker — men den flytter
 * nøglen om bagest i objektet, og DET har en følge: `updateClass()` udleder
 * den gemte kolonnerækkefølge af rækkernes nøgler (`columnsOfRows(data)` —
 * første række bestemmer rækkefølgen). Kolonnen bliver
 * altså stående på sin plads i tabellen indtil næste genindlæsning, hvor den
 * pludselig er hoppet ud til højre. Derfor skrives nøglerne fra og med den
 * omdøbte forfra igen, i samme rækkefølge som før.
 *
 * Rækkeobjektet genbruges (ingen ny reference), så alt der peger på rækken —
 * markeringer, Vue-keys, åbne vinduer — stadig peger på den samme elev.
 */
function renameKeyInPlace(row, oldKey, newKey) {
    const keys = Object.keys(row);
    const at = keys.indexOf(oldKey);
    if (at === -1) return;

    const tail = keys.slice(at).map(k => [k === oldKey ? newKey : k, row[k]]);
    for (const k of keys.slice(at)) delete row[k];
    for (const [k, v] of tail) row[k] = v;
}

/**
 * Omdøb en kolonne — og tag alt det med, der peger på den.
 *
 * @param {object} cls      klassen (`state.currentClass`)
 * @param {object} ui       UI-tilstanden (`state`) — læses/skrives på
 *                          `displayColumn`, `idColumn` og `sortState.col`
 * @param {string} oldName
 * @param {string} rawName  lærerens nye navn (trimmes)
 * @returns {{ok: boolean, error?: string, name?: string,
 *            rulesMoved?: number, orderMoved?: boolean, displayMoved?: boolean}}
 */
export function renameColumn(cls, ui, oldName, rawName) {
    if (!cls || !Array.isArray(cls.columns)) {
        return { ok: false, error: 'Ingen klasse er åben.' };
    }

    const check = validateColumnName(rawName, cls.columns, oldName);
    if (!check.ok) return check;

    const name = check.name;
    if (name === oldName) return { ok: true, name, rulesMoved: 0, orderMoved: false, displayMoved: false };

    const at = cls.columns.indexOf(oldName);
    if (at === -1) return { ok: false, error: `Kolonnen "${oldName}" findes ikke.` };

    cls.columns[at] = name;

    if (Array.isArray(cls.data)) {
        cls.data.forEach(row => { if (row) renameKeyInPlace(row, oldName, name); });
    }

    // Reglerne peger på kolonnen ved navn (`column` — feltet hedder først
    // `attribute` på vej ned i motoren, se generation.js).
    let rulesMoved = 0;
    for (const key of ['rules', 'matrixRules']) {
        const arr = cls[key];
        if (!Array.isArray(arr)) continue;
        for (const r of arr) {
            if (r && r.column === oldName) { r.column = name; rulesMoved++; }
        }
    }

    // Rangeringen beskriver KOLONNEN (Lav < Middel < Høj). Følger den ikke med,
    // holder "Ensartede"/"Balancér" op med at virke i samme øjeblik læreren
    // omdøber — og den forældreløse post bliver liggende i klassen og i
    // backuppen for evigt. deleteColumn() nedenfor rydder den op; et omdøb
    // skal flytte den.
    let orderMoved = false;
    const orders = cls.columnOrders;
    if (orders && typeof orders === 'object'
        && Object.prototype.hasOwnProperty.call(orders, oldName)) {
        orders[name] = orders[oldName];
        delete orders[oldName];
        orderMoved = true;
    }

    if (Array.isArray(cls.hiddenColumns)) {
        const hi = cls.hiddenColumns.indexOf(oldName);
        if (hi !== -1) cls.hiddenColumns[hi] = name;
    }

    // Kørselshistorikken har sin egen kopi af reglerne (se runRuleLists).
    forEachRunRuleList(cls, ui, (list) => {
        for (const r of list) {
            if (r && r.column === oldName) r.column = name;
        }
        return list;
    });

    let displayMoved = false;
    if (ui) {
        if (ui.sortState && ui.sortState.col === oldName) ui.sortState.col = name;

        // Identiteten er `_rowId` og kan ikke ramme et omdøb — men feltet
        // læses stadig af hele identitets-plumbingen, så det holdes i sync.
        if (ui.idColumn === oldName) ui.idColumn = name;

        // Visningskolonnen er den vigtigste af dem alle: står den tilbage på
        // det gamle navn, findes værdien ikke længere, og HVERT medlem på
        // hvert gruppekort — og i undgåelser, historik, udskrift og eksport —
        // står som "(uden navn)".
        if (ui.displayColumn === oldName) {
            ui.displayColumn = name;
            displayMoved = true;
        }
    }

    return { ok: true, name, rulesMoved, orderMoved, displayMoved };
}

/**
 * Slet en kolonne — og ryd op efter alt der pegede på den.
 *
 * HVORFOR HER OG IKKE I VINDUET: samme grund som `renameColumn()` ovenfor.
 * Et kolonnenavn står syv steder, og lå oprydningen inde i DeleteColumnModal,
 * var der ingen ét sted at læse hvad der SKAL følge med — og ingen tests.
 * Sletningen blev efterladt i komponenten, da omdøbningen flyttede herhen.
 *
 * DEN SIDSTE KOLONNE KAN IKKE SLETTES. Vinduet flyttede visningen til den
 * første tilbageværende kolonne, men var der ingen tilbage, blev
 * `displayColumn` sat til '' — og så falder HVERT medlem på hvert gruppekort,
 * i udskriften og i eksporten tilbage på "(uden navn)". Beskeden derom blev
 * samtidig sprunget over, fordi '' er falsk. En klasse der kun har navne i én
 * kolonne — en indsat navneliste er præcis det — kunne altså miste alle sine
 * navne i tavshed. Og der var ingen vej tilbage: vinduet rydder fortryd-
 * stakken, fordi en sletning er en skema-ændring. Målt i browseren på en
 * 4-elevers navneliste: `columns` blev [], visningskolonnen '', hver række
 * kun `_rowId` tilbage — og ikke én besked. Nu siger vi nej med en
 * begrundelse; læreren kan omdøbe kolonnen eller lave en ny først.
 *
 * @param {object} cls   klassen (`state.currentClass`)
 * @param {object} ui    UI-tilstanden (`state`) — `displayColumn`, `sortState`
 * @param {string} colName
 * @returns {{ok: boolean, error?: string, rulesRemoved?: number,
 *            displayMoved?: string|null}}
 */
export function deleteColumn(cls, ui, colName) {
    if (!cls || !Array.isArray(cls.columns)) {
        return { ok: false, error: 'Ingen klasse er åben.' };
    }

    const at = cls.columns.indexOf(colName);
    if (at === -1) return { ok: false, error: `Kolonnen "${colName}" findes ikke.` };

    // movableColumns(): lærerens egne kolonner. Den holder BÅDE de interne
    // felter (ét underscore) og `__MatrixSource__` ude — sidstnævnte er
    // programmets matrix-input, står ikke i slet-menuen og kan ikke vise
    // navne, så den redder ikke en klasse fra at ende uden kolonner.
    const own = movableColumns(cls.columns);
    if (own.length <= 1 && own.includes(colName)) {
        return {
            ok: false,
            error: `"${colName}" er klassens eneste kolonne, og den kan ikke slettes — `
                + `så ville hver eneste elev stå som "(uden navn)" på gruppekortene, `
                + `i udskriften og i eksporten. Lav en ny kolonne først, eller omdøb denne.`
        };
    }

    cls.columns.splice(at, 1);
    if (Array.isArray(cls.data)) {
        // `if (row)` som i renameColumn(): en enkelt ødelagt række må ikke
        // vælte sletningen midtvejs og efterlade kolonnen på resten.
        cls.data.forEach(row => { if (row) delete row[colName]; });
    }

    // En regel på en slettet kolonne peger på ingenting (den gamle Python-
    // motor væltede eller gjorde stille ingenting); den fjernes med kolonnen.
    let rulesRemoved = 0;
    for (const key of ['rules', 'matrixRules']) {
        const arr = cls[key];
        if (!Array.isArray(arr)) continue;
        const before = arr.length;
        cls[key] = arr.filter(r => !(r && r.column === colName));
        rulesRemoved += before - cls[key].length;
    }
    // Også i kørselshistorikkens kopi — ellers kom reglen tilbage med "Ja,
    // tag alt med" og pegede på en kolonne, der ikke findes.
    forEachRunRuleList(cls, ui, (list) => list.filter(r => !(r && r.column === colName)));

    // Rangeringen ryger med. Blev den stående, ville en NY kolonne med samme
    // navn arve en rækkefølge, læreren aldrig har valgt til den — og en
    // rangering på en kolonne der ikke findes, ville ligge i backuppen for evigt.
    if (cls.columnOrders
        && Object.prototype.hasOwnProperty.call(cls.columnOrders, colName)) {
        delete cls.columnOrders[colName];
    }

    if (Array.isArray(cls.hiddenColumns)) {
        cls.hiddenColumns = cls.hiddenColumns.filter(c => c !== colName);
    }

    let displayMoved = null;
    if (ui) {
        if (ui.sortState && ui.sortState.col === colName) ui.sortState.col = null;
        if (ui.displayColumn === colName) {
            // Der ER en tilbage — den blev sikret af værnet ovenfor.
            ui.displayColumn = movableColumns(cls.columns)[0] || '';
            displayMoved = ui.displayColumn;
        }
    }

    return { ok: true, rulesRemoved, displayMoved };
}

/**
 * Kolonner der kan FLYTTES af læreren.
 *
 * Interne felter (`_rowId`, `_excluded`) er ikke kolonner, hun har lavet, og
 * `__MatrixSource__` er programmets eget input til matrixdannelsen — den er en
 * ægte kolonne, men ikke en hun skal rode med. Begge slags skal blive liggende
 * på rækken; de skal bare ikke stå i listen, man trækker rundt i.
 *
 * @param {string[]} columns
 * @returns {string[]}
 */
export function movableColumns(columns) {
    // Samme spørgsmål som "hvad skal læreren se" — ét sted, se utils.js.
    return teacherColumns(columns);
}

/**
 * Flyt kolonnerne om i elevlisten.
 *
 * HVORFOR DET IKKE ER NOK AT SORTERE `cls.columns`: den liste er en afledt
 * kopi i hukommelsen. Den rækkefølge der OVERLEVER en genindlæsning, udledes
 * ved hver gemning af nøglerækkefølgen i den første elevrække —
 * `updateClass()` i py_bridge.js gør `columnsOfRows(data)`, hvor første
 * række bestemmer rækkefølgen. Rørte vi kun
 * `cls.columns`, ville tabellen se rigtig ud, indtil `autoSave()` skrev
 * rækkefølgen væk igen, og efter et reload stod kolonnerne som altid. Samme
 * fælde som `renameKeyInPlace()` ovenfor er skrevet for at undgå.
 *
 * Derfor skrives nøglerne om i HVER række. Rækkeobjektet genbruges (ingen ny
 * reference), så markeringer, Vue-keys og alt der peger på eleven, stadig
 * peger på den samme elev.
 *
 * I modsætning til et omdøb peger INTET på en kolonnes plads: regler,
 * `columnOrders`, `hiddenColumns`, `displayColumn` og `sortState.col` slår
 * alle op på navn og er upåvirkede. Derfor den korte funktion.
 *
 * @param {object} cls          klassen (`state.currentClass`)
 * @param {string[]} newOrder   de flytbare kolonner i den ønskede rækkefølge
 * @returns {{ok: boolean, error?: string, changed?: boolean}}
 */
export function reorderColumns(cls, newOrder) {
    if (!cls || !Array.isArray(cls.columns)) {
        return { ok: false, error: 'Ingen klasse er åben.' };
    }
    if (!Array.isArray(newOrder)) {
        return { ok: false, error: 'Rækkefølgen kunne ikke læses.' };
    }

    const movable = movableColumns(cls.columns);

    // Skal være nøjagtig de samme navne — hverken flere, færre eller ukendte.
    // En delvis liste ville tabe kolonner ved næste gemning, og en liste med
    // dubletter ville lade én kolonne æde en anden.
    const isPermutation = newOrder.length === movable.length
        && new Set(newOrder).size === newOrder.length
        && newOrder.every(c => movable.includes(c));
    if (!isPermutation) {
        return { ok: false, error: 'Rækkefølgen passer ikke til klassens kolonner.' };
    }

    const unchanged = newOrder.every((c, i) => c === movable[i]);
    if (unchanged) return { ok: true, changed: false };

    // Kolonner vi IKKE flytter, beholder deres indbyrdes orden og lægges
    // bagest — de står i forvejen sidst i praksis, og læreren ser dem ikke.
    const rest = cls.columns.filter(c => !movable.includes(c));
    cls.columns = [...newOrder, ...rest];

    if (Array.isArray(cls.data)) {
        for (const row of cls.data) {
            if (row) reorderKeysInPlace(row, newOrder);
        }
    }

    return { ok: true, changed: true };
}

/**
 * Skriv én rækkes nøgler om, så de flytbare står i `order`.
 *
 * Kun de nøgler rækken FAKTISK har, flyttes. En importeret fil kan have huller
 * — en kolonne tilføjet efter import findes på alle rækker, men en celle der
 * aldrig blev udfyldt i regnearket, kan mangle helt. Ville vi tvinge hele
 * `order` ned over rækken, fik de rækker pludselig nøgler med `undefined`, og
 * tomme felter ville begynde at tælle som udfyldte.
 *
 * Nøgler der ikke er med i `order` (interne felter, `__MatrixSource__`)
 * beholder deres indbyrdes rækkefølge og lægges bagest.
 */
function reorderKeysInPlace(row, order) {
    const currentKeys = Object.keys(row);
    const ordered = order.filter(k => Object.prototype.hasOwnProperty.call(row, k));
    const trailing = currentKeys.filter(k => !order.includes(k));

    const entries = [...ordered, ...trailing].map(k => [k, row[k]]);
    for (const k of currentKeys) delete row[k];
    for (const [k, v] of entries) row[k] = v;
}
