import { state } from './state.js';
import { modalActions } from './modalState.js';
import * as api from './api.js';
import { togetherComponents, togetherConflict, togetherPath } from './together.js';
import { namesText } from './recipe.js';
import { ensureRowIds, ROW_ID, memberDisplayName, orderIdsByRow, teacherColumns } from './utils.js';

// Ting der venter på at blive skrevet ind i klassen, når fanen lukkes.
//
// Flere steder i UI'et samler vi kald sammen med debounce() — 30 tastetryk i
// en celle skal ikke blive til 30 gem. Prisen er, at ændringen i et kort
// øjeblik KUN findes i hukommelsen, og Grupper har ingen server at hente den
// fra bagefter. Her kan sådan et sted melde sig, så flushPendingWrites()
// kan nå at køre det, inden siden forsvinder.
const pendingWrites = new Set();

/**
 * Meld en udskudt skrivning til. Returnerer en funktion der framelder igen —
 * kald den i komponentens onUnmounted, ellers holder vi liv i en komponent
 * der er væk.
 */
export function registerPendingWrite(flushFn) {
    pendingWrites.add(flushFn);
    return () => pendingWrites.delete(flushFn);
}

/**
 * Sidste chance for at få alt ned i localStorage, før fanen lukkes eller
 * genindlæses. Kaldes fra main.js på `pagehide` og `beforeunload`.
 *
 * Rækkefølgen er ikke tilfældig:
 *
 *  1. TAG FOKUS fra det felt der redigeres. Elevtabellens celler er
 *     contenteditable, og teksten skrives først ind i klassen ved `blur`.
 *     Lukker læreren fanen med markøren stående i cellen, fyrer der aldrig
 *     et blur, og det sidst tastede navn har aldrig eksisteret uden for
 *     skærmen. `blur()` udløser cellens egen handler synkront, så værdien er
 *     i klassen, inden vi går videre.
 *  2. KØR DE UDSKUDTE opdateringer, så de når at skrive deres ændring ind i
 *     klassen (fx gruppestørrelsen, der venter 0,3 s på flere klik).
 *  3. GEM klassen én gang. Alle de debouncede veje ender alligevel her, så
 *     ét kald dækker dem alle — også elevtabellens celleredigering.
 */
export function flushPendingWrites() {
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (active && typeof active.blur === 'function'
        && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
        active.blur();
    }

    for (const flush of pendingWrites) {
        try {
            flush();
        } catch (e) {
            // Én komponent der fejler, må ikke forhindre gemmet nedenfor.
            console.error('[classActions] Udskudt skrivning fejlede:', e);
        }
    }

    autoSave();
}

/**
 * Sæt Vis-kolonnen (det navn, der står på gruppekortene) ud fra klassen.
 *
 * Prioritet: (1) den kolonne, læreren gemte med klassen (`id_column` — det
 * gamle feltnavn, hvis værdi altid har været lærerens valg), (2) et valg,
 * der stadig er gyldigt, (3) ellers den første synlige kolonne.
 *
 * Kaldes, når klassen indlæses (AppTopbar `selectClass`), og fra ClassView,
 * når klassen skifter. Før 10/11 2026 skete det KUN i ClassView, og den
 * findes kun, mens læreren står i klassen. Blev siden genindlæst, mens hun
 * stod i Hjælp (eller Import & backup), stod Vis-kolonnen tom, og næste gem —
 * også det sidste, når fanen lukkes — skrev den første kolonne ind i
 * stedet for hendes eget valg ("Vis: Fornavn" blev til "Navn"). Og fordi
 * det var en ændring, skrev fanen HELE sin udgave af klassen, også over
 * det, en anden fane havde rettet imens.
 */
export function syncDisplayColumn() {
    const cls = state.currentClass;
    const visible = teacherColumns(cls?.columns);
    if (visible.length === 0) {
        state.displayColumn = '';
    } else if (cls.id_column && visible.includes(cls.id_column)) {
        state.displayColumn = cls.id_column;
    } else if (!(state.displayColumn && visible.includes(state.displayColumn))) {
        state.displayColumn = visible[0];
    }
}

export function autoSave() {
    if (!state.currentClass) return;

    const isMatrix = state.activeView === 'matrix';

    const rawRules = isMatrix
        ? (state.currentClass.matrixRules || [])
        : (state.currentClass.rules || []);

    const settingsKey = isMatrix ? 'matrixSettings' : 'settings';
    const currentUiSettings = state.currentClass[settingsKey] || {
        groupMode: state.groupMode || 'size',
        groupTarget: '4',
        groupMod: '+'
    };

    if (isMatrix) {
        state.currentClass.matrixSettings = currentUiSettings;
        state.currentClass.matrixRules = rawRules;
    } else {
        state.currentClass.settings = currentUiSettings;
        state.currentClass.rules = rawRules;
    }

    // Klassens `id_column`-felt gemmer lærerens VISNINGSkolonne. Identiteten
    // (_rowId) ligger på selve elevrækkerne og skal ikke persisteres separat.
    // Feltnavnet er beholdt, fordi dets værdi altid har været lærerens valg —
    // gamle klasser læses dermed korrekt uden en migreringsrunde.
    const displayColValue = state.displayColumn
        || (state.currentClass.columns && state.currentClass.columns[0])
        || '';
    // Hukommelsen skal sige det samme som lageret. syncDisplayColumn() (når
    // elevlistens side tegnes forfra) foretrækker klassens `id_column`, så
    // et gammelt valg her ville tage lærerens nye tilbage.
    state.currentClass.id_column = displayColValue;

    api.saveClassData(
        state.currentClass.filename,
        state.currentClass.data,
        state.currentClass.rules,
        displayColValue,
        state.currentClass.separations,
        state.currentClass.settings,
        state.currentClass.matrixSettings,
        state.currentClass.matrixRules,
        state.currentClass.topics || [],
        state.currentClass.columnOrders || {},
        {
            togetherGroups: state.currentClass.togetherGroups || [],
            hiddenColumns: state.currentClass.hiddenColumns || [],
            // Kun brugt, når klassen ingen elever har: så er der ingen
            // rækker at udlede kolonnerne af (se updateClass i py_bridge.js).
            columns: state.currentClass.columns || []
        }
    ).then(() => {
        // Save button feedback is handled by Vue via reactivity if needed
    });
}

export function handleAddRow() {
    if (!state.currentClass) return;
    const newRow = {};
    if (state.currentClass.columns) {
        state.currentClass.columns.forEach(col => newRow[col] = "");
    }
    if (!state.currentClass.data) state.currentClass.data = [];
    state.currentClass.data.unshift(newRow); // Add to TOP
    // Den nye elev skal have sin egen identitet med det samme — ellers deler
    // to tomme rækker nøgle, og markering/redigering ville smitte mellem dem.
    ensureRowIds(state.currentClass.data);
    autoSave();
}

// BEMÆRK: her lå `handleAddCol(name)` og `handleDeleteCol()`. Ingen af dem
// blev kaldt — værktøjslinjen gør begge dele selv (StudentToolbar.confirmAddCol
// og modalActions.openDeleteColumn). handleAddCol var værre end ubrugt: den
// tilføjede en kolonne UDEN validateColumnName (et navn med "_" foran ville
// blive læst som et internt felt) og UDEN at nulstille fortryd-stakken, som
// enhver skema-ændring skal — netop den fejl, gennemsynet fandt to levende
// steder. En død skrivevej ind i lærerens data, der endda gør det forkert,
// er farligere end den er nyttig. (Gennemsyn 2026-09-01.)

/**
 * De `_rowId` der faktisk står i klassen lige nu.
 *
 * Begge aftale-veje spørger om det samme — "er eleven her stadig?" — og skal
 * svare ens. Før havde kun "Skal sammen" vagten, og den læste id'et uden at
 * trimme; en undgåelse kunne derfor skrives med et dødt id i sig.
 */
function knownRowIds(data) {
    const rows = Array.isArray(data) ? data : [];
    return new Set(rows.map(row => String(row?.[ROW_ID] ?? '').trim()).filter(Boolean));
}

function normalizedRuleIds(rule) {
    return [...new Set((rule?.ids || []).map(id => String(id).trim()).filter(Boolean))].sort();
}

function idsCoveredByRule(ids, rule) {
    const existingIds = normalizedRuleIds(rule);
    if (existingIds.length < ids.length) return false;
    const existing = new Set(existingIds);
    return ids.every(id => existing.has(id));
}

// En undgåelse med flere elever dækker alle sine delmængder: ingen af dem må
// sidde sammen. Den mindre regel gør derfor ingen forskel, så længe den store
// står — men den er LÆRERENS, og hun har ikke trukket den tilbage.
//
// HVORFOR VI IKKE SLETTER DEN: den forrige udgave fjernede den mindre regel i
// stilhed og gemte med det samme, også bare fordi listen blev åbnet. Fjernede
// læreren senere den store regel igen, var løftet om de to elever væk uden at
// nogen havde sagt det. Vi peger rækken ud i listen i stedet og lader hende
// selv bestemme. (Gennemsyn 2026-09-06.)
export function coveredSeparationIndexes(rules = []) {
    const covered = new Set();
    rules.forEach((rule, index) => {
        const ids = normalizedRuleIds(rule);
        if (ids.length < 2) return;
        const isCovered = rules.some((other, otherIndex) => {
            if (index === otherIndex) return false;
            const otherIds = normalizedRuleIds(other);
            if (otherIds.length < ids.length) return false;
            // Ved helt ens regler er det den FØRSTE der dækker de øvrige.
            if (otherIds.length === ids.length && otherIndex > index) return false;
            return ids.every(id => otherIds.includes(id));
        });
        if (isCovered) covered.add(index);
    });
    return covered;
}

// Se modalActions.openAgreements — ét vindue, to faner.
const openAgreements = (tab) => modalActions.openAgreements(tab);

export function handleSeparateAction() {
    const cls = state.currentClass;
    if (!cls) return;
    // Kun elever der stadig ER i klassen. Markeringen peger på _rowId, og
    // id'et overlever eleven — så en undgåelse kunne blive skrevet med et
    // dødt id i sig. Den kan aldrig gå i brug (generation.js filtrerer den
    // fra), men den står i listen, tælles i badget, og dækker en rigtig
    // undgåelse af de samme elever, så DEN ikke kan tilføjes bagefter.
    // `pruneSelection()` rydder op i markeringen ved sletningen; det her er
    // den samme vagt som handleTogetherAction() nedenfor har haft hele tiden,
    // på det sted hvor aftalen faktisk skrives.
    const known = knownRowIds(cls.data);
    // Rækkefølge = elevlistens, ikke id'ets. Se orderIdsByRow() i utils.js:
    // sammenligningerne nedenfor sorterer deres egne kopier, så den gemte
    // orden er ren visning — og den skal følge det, læreren ser.
    const ids = orderIdsByRow(
        [...state.selectedForAction].filter(id => known.has(String(id ?? '').trim())),
        cls.data);
    if (ids.length < 2) {
        if (window.notifyInfo) window.notifyInfo("Vælg mindst 2 elever.");
        return;
    }

    // En undgåelse må ikke oprette en direkte eller indirekte konflikt med
    // en eksisterende Skal sammen-aftale. Kontrollen skal ligge her også,
    // fordi læreren kan starte i den modsatte ende af menuen.
    const togetherGroups = cls.togetherGroups || [];
    if (togetherGroups.length) {
        const allStudents = (cls.data || []).map(student => ({ ...student, _excluded: false }));
        const conflict = togetherConflict(
            togetherComponents(togetherGroups, allStudents),
            [{ ids }]
        );
        if (conflict) {
            // Siger det højt, at INTET blev gemt, og hvem det gælder — ikke
            // bare at "eleverne har begge aftaler", som lød som en advarsel
            // om noget, der var gemt.
            const [a, b] = conflict.pair || conflict.ids;
            const nameOf = (id) => memberDisplayName(id, cls.data, state.displayColumn);
            const via = togetherPath(togetherGroups, a, b);
            window.notifyError?.(`Undgå hinanden blev ikke gemt: ${nameOf(a)} og ${nameOf(b)} skal sammen`
                + `${via && via.length ? ` via ${namesText(via.map(nameOf))}` : ''}. `
                + 'Ret eller fjern Skal sammen-aftalen under Elevliste → Aftaler, hvis de i stedet skal adskilles.');
            return;
        }
    }

    if (!cls.separations) cls.separations = [];

    // Findes reglen allerede — også som del af en større undgåelse — er der
    // intet at tilføje. Vi siger det, og lader listen være.
    if (cls.separations.some(sep => idsCoveredByRule(ids, sep))) {
        window.notifyInfo?.('Denne undgåelse findes allerede eller er dækket af en større undgåelse.');
        return;
    }

    cls.separations.push({ ids: ids, timestamp: Date.now() });
    autoSave();
    state.selectedForAction.clear();
    // Enten vinduet ELLER en besked — aldrig begge dele. Beskederne ligger
    // øverst på skærmen og dækkede vinduets titel, faner og luk-knap på en
    // telefon i de fire sekunder de lever. Vinduet viser selv den nye række.
    openAgreements('separate');
}

// Aftalen ændrer ikke dagens grupper. Den bruges ved næste stamgruppedannelse.
export function handleTogetherAction() {
    const cls = state.currentClass;
    if (!cls || state.isGenerating) return;
    const known = knownRowIds(cls.data);
    // Som ved undgåelser: gemt i elevlistens rækkefølge, ikke id'ets.
    const ids = orderIdsByRow([...state.selectedForAction].filter(id => known.has(String(id ?? '').trim())), cls.data);
    if (ids.length < 2) { window.notifyInfo?.('Vælg mindst 2 elever.'); return; }
    const agreements = cls.togetherGroups || [];
    // Dublet-tjekket skal være ligeglad med rækkefølgen — derfor sorteres
    // BEGGE sider hver for sig her, og ikke i det der gemmes.
    const sameSet = JSON.stringify([...ids].sort());
    if (agreements.some(a => JSON.stringify([...a.ids].sort()) === sameSet)) {
        window.notifyInfo?.('Denne Skal sammen-aftale findes allerede.');
        return;
    }
    const next = [...agreements, { ids, timestamp: Date.now() }];
    // Også fraværende elever tæller her: aftalerne skal kunne holde i morgen.
    const allStudents = cls.data.map(s => ({ ...s, _excluded: false }));
    const conflict = togetherConflict(togetherComponents(next, allStudents), cls.separations);
    if (conflict) {
        const [a, b] = conflict.pair || conflict.ids;
        const nameOf = (id) => memberDisplayName(id, cls.data, state.displayColumn);
        const via = togetherPath(next, a, b);
        window.notifyError?.(`Skal sammen blev ikke gemt: ${nameOf(a)} og ${nameOf(b)} har en Undgå hinanden-aftale, `
            + `men ville komme til at stå sammen${via && via.length ? ` via ${namesText(via.map(nameOf))}` : ''}. `
            + 'Ret eller fjern undgåelsen under Elevliste → Aftaler først.');
        return;
    }
    cls.togetherGroups = next;
    autoSave();
    state.selectedForAction.clear();
    // Vinduet fortæller selv, hvad aftalen betyder — se openAgreements().
    openAgreements('together');
}
