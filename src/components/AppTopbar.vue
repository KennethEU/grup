<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { adoptFromWww } from '../js/modules/adoptWww.js';
import { CLASSES_KEY, NAV_VIEW_KEY, CLASS_TAB_KEY, STORAGE_WARNED_KEY } from '../js/modules/storageKeys.js';
import { reportStorageMigration } from '../js/modules/storageStartup.js';
import { reactiveState as state } from '../js/modules/reactiveState.js';
import * as api from '../js/modules/api.js';
import * as storage from '../js/modules/storage.js';
import { getStoragePressureWarning, pyBridge } from '../js/modules/py_bridge.js';
import { autoSave, syncDisplayColumn } from '../js/modules/classActions.js';
import { migrateRefsToRowIds, teacherColumns, columnsOfRows, normalizeCellText } from '../js/modules/utils.js';
import { clearClassMemory } from '../js/modules/classMemory.js';
import { isModalOpen } from '../composables/useModalFocus.js';
import { modalActions } from '../js/modules/modalState.js';
import { ChevronDown, Pencil, X, Plus, BookOpen, ShieldCheck, HelpCircle, Sparkles, Lightbulb } from 'lucide-vue-next';
import ConfirmModal from './ConfirmModal.vue';
import PromptModal from './PromptModal.vue';
import NewsDialog from './NewsDialog.vue';

// Modal state
const showDeleteConfirm = ref(false);
const deleteTarget = ref(null);
const showRenamePrompt = ref(false);
const renameTarget = ref(null);
const showNewClassPrompt = ref(false);
const showNewsDialog = ref(false);

// Browserens lager kan være slået HELT fra ("Bloker alle cookies" i Safari,
// eller en skoles låste browserprofil). Så kaster selve opslaget
// `localStorage` en SecurityError — ikke ved skrivningen, men ved læsningen.
// Alle seks opslag her (tema + fane-hukommelse) kørte ubeskyttet, og ét af
// dem kører i modul-toppen: fejlen ramte altså FØR komponenten var tegnet,
// og læreren fik en hvid skærm i stedet for en app. `safeStorageSet()`
// dækkede kun skrivningerne i py_bridge.js, ikke læsningerne her.
// Fane-hukommelsen er pynt; den må aldrig kunne vælte resten.
const storageRead = (store, key) => {
    try { return window[store].getItem(key); } catch (e) { return null; }
};
const storageWrite = (store, key, value) => {
    try { window[store].setItem(key, value); } catch (e) { /* ingen hukommelse — fint */ }
};

// Temaet (Rolig) sættes af prepareBetaPage() i beta.js, før topbaren tegnes.

const classes = ref([]);

// Én collator, ikke én pr. sammenligning — samme grund som i StudentTable:
// at bygge en frisk Intl.Collator er den dyre del af localeCompare.
// `numeric: true` er ikke pynt: uden den står 10.a før 2.a.
const classCollator = new Intl.Collator('da', { numeric: true });

/**
 * Klasserne som de skal STÅ i menuen — alfabetisk.
 *
 * Rækkefølgen i `classes` er den rækkefølge, de blev oprettet i (nye lægges
 * bagest i `grupdk_classes`), og efter et par måneder er den ikke til at
 * finde rundt i. Sorteringen er kun visning: det underliggende array røres
 * ikke, så alt der regner i indeks, regner på det samme som før.
 */
const sortedClasses = computed(() =>
    [...classes.value].sort((a, b) => classCollator.compare(a.name || '', b.name || '')));

const isClassMenuOpen = ref(false);
const classSelectorRef = ref(null);

const closeMenu = (e) => {
    if (classSelectorRef.value && !classSelectorRef.value.contains(e.target)) {
        isClassMenuOpen.value = false;
    }
};

/**
 * Escape lukker klassemenuen og lægger fokus tilbage på pillen.
 *
 * Uden den var klik ved siden af eneste vej ud — samme mangel som Regler- og
 * Emner-skufferne havde. Ligger der et modalvindue ovenpå, er det DET Escape
 * gælder: alle Escape-lytterne deler document, og den nederste i rækken skal
 * selv holde fingrene væk. `isModalOpen()` er facit — et opslag på
 * `.modal-overlay` overså Undgåelser-vinduet, som ikke har den klasse.
 */
const onEscapeClassMenu = (e) => {
    if (e.key !== 'Escape' || !isClassMenuOpen.value) return;
    if (isModalOpen()) return;
    isClassMenuOpen.value = false;
    classSelectorRef.value?.querySelector('.class-trigger')?.focus();
};

const loadClasses = async (goToStudents = false, createdFilename = null) => {
    try {
        const classList = await api.fetchClasses();
        classes.value = classList;

        if (classList.length > 0) {
            let targetIdx = 0;

            if (goToStudents) {
                // En klasse er netop oprettet eller gendannet. Har den, der
                // skrev den, sagt HVILKEN, åbnes netop den. "Den sidste i
                // listen" holder kun for en ny klasse: en backup, der skrives
                // oven i en eksisterende ("Overskriv mine"), beholder sin
                // plads — så læreren gendannede 2.a og landede i 3.b.
                const createdIdx = createdFilename
                    ? classList.findIndex(c => c.filename === createdFilename)
                    : -1;
                targetIdx = createdIdx !== -1 ? createdIdx : classList.length - 1;
            } else {
                const lastFilename = storage.getLastClassFilename();
                if (lastFilename) {
                    const foundIdx = classList.findIndex(c => c.filename === lastFilename);
                    if (foundIdx !== -1) targetIdx = foundIdx;
                } else {
                    const lastIdx = storage.getLastClassIndex();
                    targetIdx = (lastIdx >= 0 && lastIdx < classList.length) ? lastIdx : 0;
                }
            }

            const target = classList[targetIdx];
            if (target) {
                selectClass(target.filename, targetIdx, goToStudents);
            }
        } else {
            state.navView = 'dashboard';
        }
    } catch (e) {
        console.error("Failed to load classes", e);
    }
};

// Kaldes ved classCreated-event — navigerer altid til elevliste.
// `detail.filename` er den klasse, der skal åbnes (se loadClasses()).
const onClassCreated = (e) => loadClasses(true, e?.detail?.filename || null);

/**
 * Hent klasselisten igen — og rør IKKE ved den klasse, der er åben.
 *
 * `loadClasses()` gør to ting: den henter listen OG vælger en klasse. Det
 * andet er en oprydning i sig selv, for `selectClass()` kalder
 * `clearClassMemory()` — som med vilje smider fortryd-stakken,
 * kørselshistorikken og optagelsen væk, fordi de hører til den klasse, man
 * FORLADER. Bliver læreren stående i sin egen klasse, er der ingen klasse at
 * forlade, og oprydningen rammer den, hun arbejder i.
 *
 * Målt: stå i 2.a med en kørsel bag sig, og slet — eller bare omdøb — 3.b i
 * klassemenuen. Ctrl+Z-stakken gik fra 1 til 0 og "Se kørslen" fra optaget
 * til tom, uden at noget sagde det, og uden at 2.a var rørt med en finger.
 * Menuen skal opdateres; klassen skal ikke.
 */
const refreshClassList = async () => {
    try {
        classes.value = await api.fetchClasses();
        return classes.value;
    } catch (e) {
        console.error('Kunne ikke genlæse klasselisten', e);
        return null;   // listen kunne ikke læses — menuen står, som den stod
    }
};

/**
 * Luk den klasse, der står på skærmen, fordi den ikke findes længere.
 *
 * Både sletningen i FANEN SELV og en sletning i en anden fane ender her, så
 * de to veje ikke kan drive fra hinanden — det gjorde de: kun den anden fane
 * ryddede op, mens `confirmDeleteClass()` nøjedes med at nulstille
 * `currentClass`. Slettede læreren sin SIDSTE klasse, blev der aldrig valgt
 * en ny, og så kørte `clearClassMemory()` heller aldrig: elevrækkerne i
 * fortryd-stakken, grupperne med navnene i og optagelsen af sidste kørsel
 * blev liggende i fanen resten af dagen — om en klasse, læreren lige havde
 * fået at vide var slettet.
 */
const closeOpenClass = () => {
    clearClassMemory();
    // Grupperne kommer fra lageret, ikke fra clearClassMemory()s liste —
    // og lageret under den slettede klasse er tomt nu.
    state.storedStandardGroups = null;
    state.storedMatrixGroups = null;
    state.lastGeneratedGroups = null;
    state.currentClass = null;
    // Uden en åben klasse er der ingen emner at foreslå — den slettede
    // klasses emner må ikke blive stående i siden.
    storage.populateDatalistFromStorage();
    state.navView = 'dashboard';
};

/**
 * En ANDEN fane har ændret klasselisten.
 *
 * Læreren har tit Grupper åben to steder — et link fra Lectio åbner en ny
 * fane frem for at finde den gamle frem. Den gamle fane opdagede intet: dens
 * menu viste en liste fra i går, og var klassen slettet i den nye fane, sad
 * den gamle med en klasse, der ikke findes.
 *
 * `loadClasses()` kan IKKE bruges her: den vælger også en klasse, og det
 * ville rive læreren væk fra den, hun står i. Her opdateres kun menuen —
 * plus det ene tilfælde, der ikke kan ignoreres: klassen på skærmen er væk.
 *
 * (`pyBridge`s egen storage-lytter ryddede allerede sin cache. Den blev
 * tilføjet da modulet blev læst ind, altså før denne — så listen vi henter
 * her, er den friske.)
 */
const onForeignClassesChange = async (e) => {
    // e.key er null når den anden fane har kaldt localStorage.clear().
    if (e.key && e.key !== CLASSES_KEY) return;

    const classList = await refreshClassList();
    if (classList === null) return;

    const open = state.currentClass;
    if (!open) return;
    if (classList.some(c => c.filename === open.filename)) return;

    // Klassen er slettet i den anden fane. Vi lukker den her frem for at lade
    // læreren arbejde videre i noget, der ikke kan gemmes — hvert gem ville
    // blive afvist (se updateClass), og grupper, emner og historik er slettet
    // med klassen. Samme oprydning som en sletning i FANEN SELV; begge veje
    // går gennem closeOpenClass().
    pyBridge.warnClassDeletedElsewhere(open.filename, open.name);
    closeOpenClass();
};

const selectClass = async (filename, index, goToStudents = false) => {
    storage.saveLastClassFilename(filename);
    storage.saveLastClassIndex(index);
    // Alt det om den forrige klasse, der kun lå i hukommelsen — fortryd-stak,
    // kørselshistorik, optagelse, afspilning, markeringer. Listen står i
    // classMemory.js, så en ny funktion kun skal melde sig ÉT sted.
    clearClassMemory();
    isClassMenuOpen.value = false;

    try {
        const data = await api.fetchClass(filename, { track: true });
        state.currentClass = data;

        if (state.currentClass.columns) {
            state.currentClass.columns = teacherColumns(state.currentClass.columns);
        } else {
             if (state.currentClass.data && state.currentClass.data.length > 0) {
                state.currentClass.columns = teacherColumns(columnsOfRows(state.currentClass.data));
            } else {
                state.currentClass.columns = [];
            }
        }
        
        if (!state.currentClass.data) state.currentClass.data = [];
        if (!state.currentClass.separations) state.currentClass.separations = [];

        // Migrering: det gamle felt `attribute` samles i `column`. Hele
        // Vue-laget læser `r.column`; kun gamle gemte regellister bruger
        // `attribute`. Når det normaliseres ét sted
        // her, kan generation.js, RuleBuilder, HintsStack osv. nøjes med ét
        // feltnavn uden OR-fallbacks spredt rundt i koden.
        const _migrateRules = (arr) => {
            if (!Array.isArray(arr)) return;
            for (const r of arr) {
                if (r && r.attribute && !r.column) r.column = r.attribute;
                if (r) delete r.attribute;
            }
        };
        _migrateRules(state.currentClass.rules);
        _migrateRules(state.currentClass.matrixRules);

        // Migrering: klassens emner udledes af de eksisterende emner pr. gruppe,
        // hvis det nye felt endnu ikke er udfyldt. Sker én gang pr. klasse.
        // Resultatet gemmes altid (også en tom liste), så senere indlæsninger
        // springer grenen over — ellers kørte migreringen hver gang klassen
        // åbnes, selvom svaret aldrig ændrer sig.
        if (!Array.isArray(state.currentClass.topics)) {
            state.currentClass.topics = storage.deriveClassTopicsFromGroupTopics();
        }

        const saved = storage.loadGroupsFromStorage();
        if (saved) {
            if (saved.standard) storage.hydrateGroupTopics(saved.standard, 'S_');
            if (saved.matrix) storage.hydrateGroupTopics(saved.matrix, 'M_');
            state.storedStandardGroups = saved.standard;
            state.storedMatrixGroups = saved.matrix;
            state.lastGeneratedGroups = saved.standard;
            // Flaget blev nulstillet i clearClassMemory() ovenfor — det må
            // aldrig følge med fra den FORRIGE klasse. Her sættes det fra
            // DENNE klasses egne gemte grupper (se saveGroupsToStorage()).
            // Gamle gemte grupper uden feltet giver false, som før.
            state.matrixGroupsStale = !!(saved.matrixStale
                && Array.isArray(saved.matrix) && saved.matrix.length > 0);
        } else {
            state.storedStandardGroups = null;
            state.storedMatrixGroups = null;
            state.lastGeneratedGroups = null;
        }
        // Emneforslagene bygges forfra for DENNE klasse — også uden gemte
        // grupper. Før 4/11 skete det kun med grupper, så en klasse uden fik
        // den forrige klasses emner foreslået i emnefeltet.
        storage.populateDatalistFromStorage();

        // Migration: giv hver elev et _rowId, og oversæt alt der peger på en
        // elev (undgåelser, gemte og låste grupper) fra det gamle navne-baserede
        // id. Kører EFTER grupperne er hentet, fordi de også skal oversættes.
        // Idempotent — på en allerede migreret klasse laver den ingenting.
        const _mig = migrateRefsToRowIds(
            state.currentClass,
            state.currentClass.id_column,
            {
                separations: state.currentClass.separations,
                togetherGroups: state.currentClass.togetherGroups,
                groupSets: [state.storedStandardGroups, state.storedMatrixGroups],
            }
        );
        // Skriv resultatet ned med det samme, så migreringen kun kører én
        // gang pr. klasse — og så de nye id'er overlever en lukket fane.
        // (Selve klassen gemmes nedenfor, sammen med alt det andet.)
        if (_mig.refsRemapped > 0) storage.saveGroupsToStorage();

        // Migration: "å" som a + ring (kopieret ud af en PDF, importeret før
        // 2026-09-24) gemmes som ét tegn — se nfc() i utils.js. Idempotent:
        // på en klasse i orden ændres intet, og der gemmes ikke.
        normalizeCellText(state.currentClass.data);

        if (state.currentClass.settings) {
            state.groupMode = state.currentClass.settings.groupMode || 'size';
        } else {
            state.groupMode = 'size';
        }

        // Gendan gemt tab-state fra sessionStorage (f.eks. efter F5), ellers default til 'students'
        const savedNav = storageRead('sessionStorage', NAV_VIEW_KEY);
        const savedTab = storageRead('sessionStorage', CLASS_TAB_KEY);
        // Ved ny klasse-oprettelse (goToStudents=true): altid til elevliste
        state.navView = goToStudents ? 'class' : (savedNav || 'class');
        state.classViewTab = goToStudents ? 'students' : ((savedTab && ['students', 'groups', 'history'].includes(savedTab)) ? savedTab : 'students');

        // Vis-kolonnen sættes HER og ikke kun i ClassView, som ikke findes,
        // når fanen er genindlæst i Hjælp eller Import & backup. Se
        // syncDisplayColumn().
        syncDisplayColumn();

        // Gem det, indlæsningen har rettet i hukommelsen — NU, mens lageret
        // stadig er præcis det, fanen lige har læst.
        //
        // Ovenfor rettes en del: regler i det gamle format, emner, _rowId,
        // "å" som to tegn, og en klasse fra en ældre udgave mangler nogle
        // felter, som et gem altid skriver (togetherGroups, hiddenColumns,
        // columnOrders, matrixSettings …). Før 10/11 2026 blev kun nogle af
        // dem gemt med det samme. Resten lå kun i hukommelsen, og så var
        // fanens FØRSTE gem en "ændring" — også når læreren intet havde
        // gjort, fx når fanen blev lukket (flushPendingWrites gemmer en
        // sidste gang). Med klassen åben i to faner skrev en gammel, urørt
        // fane så hele sin udgave over det, læreren havde rettet i den
        // anden — uden en advarsel, hun kunne se (den kom i den fane, der
        // lukkede). Målt med en sonde over 17 gamle klasseformer.
        //
        // Har indlæsningen intet rettet, skriver gemmet ingenting
        // (updateClass → _hasOwnChange), så det er gratis at kalde altid.
        setTimeout(autoSave, 0);

    } catch (e) {
        console.error(e);
        window.notifyError("Fejl ved indlæsning af klasse: " + e.message);
    }
};

const deleteClass = (c) => {
    deleteTarget.value = c;
    showDeleteConfirm.value = true;
};

const confirmDeleteClass = async () => {
    const c = deleteTarget.value;
    showDeleteConfirm.value = false;
    deleteTarget.value = null;
    if (!c) return;
    try {
        // Rækkefølgen er ikke ligegyldig: slet FØRST selve klassen, og ryd
        // først dens grupper, historik og emner bagefter. Omvendt — som før —
        // ville en fejlet sletning efterlade klassen i listen, men tømt for
        // alt hvad læreren havde gemt om den, og intet af det kan hentes
        // tilbage. Ingen backend betyder ingen kopi at gendanne fra.
        const res = await api.deleteClass(c.filename);
        if (res && res.error) throw new Error(res.error);
        storage.cleanupClassStorage(c.filename);

        // To forskellige situationer, og de må ikke behandles ens.
        if (state.currentClass && state.currentClass.filename === c.filename) {
            // Det var klassen på skærmen. Luk den helt — også dens fortryd-stak,
            // kørselshistorik og optagelse — og lad loadClasses() finde den
            // næste klasse frem (eller blive på Oversigt, er der ingen tilbage).
            closeOpenClass();
            loadClasses();
        } else {
            // Det var en ANDEN klasse. Læreren bliver stående i sin egen, og så
            // skal kun menuen opdateres: loadClasses() ville vælge klassen om
            // og dermed rydde en hukommelse, der stadig er i brug.
            refreshClassList();
        }
    } catch (e) {
        console.error("Fejl ved sletning:", e);
        if (window.notifyError) window.notifyError("Kunne ikke slette klasse: " + e.message);
    }
};

const promptRename = (c) => {
    renameTarget.value = c;
    showRenamePrompt.value = true;
};

const confirmRename = async (newName) => {
    const c = renameTarget.value;
    showRenamePrompt.value = false;
    renameTarget.value = null;
    if (!c || !newName || newName === c.name) return;
    try {
        const res = await api.renameClass(c.filename, newName);
        if (res.error) {
            window.notifyError("Fejl ved omdøbning: " + res.error);
        } else {
            window.notifySuccess("Klasse omdøbt!");
            // Kun menuen. Klassen på skærmen hentes forfra lige nedenfor, hvis
            // det var DEN, der blev omdøbt — den gren har altid stået her, og
            // den siger i sig selv, at loadClasses() aldrig skulle vælge om.
            refreshClassList();
            if (state.currentClass && state.currentClass.filename === c.filename) {
                api.fetchClass(c.filename, { track: true }).then(data => {
                    state.currentClass = data;
                }).catch(err => {
                    console.error("Fejl ved genindlæsning:", err);
                });
            }
        }
    } catch (e) {
        console.error(e);
        window.notifyError("Kunne ikke omdøbe klasse.");
    }
};

const createEmptyClass = () => {
    showNewClassPrompt.value = true;
};

const confirmNewClass = async (name) => {
    showNewClassPrompt.value = false;
    if (!name) return;
    try {
        const res = await api.createClassFromPaste(name, "Navn", true);
        if (res.error) {
            window.notifyError("Fejl: " + res.error);
        } else {
            window.notifySuccess("Klasse oprettet!");

            // KUN listen. Her stod `await loadClasses()`, og det var to
            // klassevalg oven i hinanden: loadClasses() vælger selv en klasse
            // — og den venter ikke på sit eget `selectClass()`, så `await`
            // returnerede, mens det første valg stadig havde en hentning i
            // luften. Nedenunder blev det andet valg sat i gang med det samme.
            //
            // I DAG kan det ikke gå galt, og det er værd at vide hvorfor:
            // `fetch` fanges af api_adapter.js, som læser localStorage
            // synkront og returnerer en allerede indfriet Promise. De to valg
            // lander derfor i den rækkefølge de blev sat i gang, og det andet
            // — den nye klasse — vinder hver gang. Efterprøvet: den gamle kode
            // vælger den rigtige klasse 3 ud af 3 gange.
            //
            // Men den garanti står ingen steder. Den er en bivirkning af, at
            // "serveren" er synkron, og api.js er med vilje skrevet som
            // HTTP-kald. Bliver hentningen nogensinde ægte asynkron, kan det
            // FØRSTE valg lande sidst og vinde: klasse B's elever på skærmen
            // med klasse A's grupper, fordi det ene valg nåede at lægge sine
            // grupper i `storedStandardGroups`, før det andet skrev sin
            // klasse — og næste `saveGroupsToStorage()` gemmer så A's grupper
            // under B's filnavn. Samme fejlform som en kørsel der lander i en
            // anden klasse (`landedInOtherClass()` i generation.js).
            //
            // Ét valg i stedet for to koster ingenting og fjerner spørgsmålet.
            // Det sparer samtidig en hel klasseindlæsning, der blev smidt væk:
            // migreringer, hydrering af emner og et `setTimeout(autoSave)`.
            await refreshClassList();

            // Den nye klasse ligger sidst i listen. Slår opslaget fejl, tages
            // den sidste alligevel, så læreren altid lander i en klasse.
            let idx = res.filename
                ? classes.value.findIndex(c => c.filename === res.filename)
                : -1;
            if (idx === -1) idx = classes.value.length - 1;
            if (idx >= 0) selectClass(classes.value[idx].filename, idx);
        }
    } catch (e) {
        console.error(e);
        window.notifyError("Kunne ikke oprette klasse: " + e.message);
    }
};

const navigateTo = (view) => {
    state.navView = view;
    pushNavState();
};

// "Vis guide" står samme sted på alle sider. Kun Elevliste og Grupper har en
// guide; andre steder er knappen usynlig, men fylder stadig, så ikonerne og
// klassevælgeren ikke hopper, når man skifter fane.
const guideEvent = computed(() => {
    if (state.navView !== 'class' || !state.currentClass) return '';
    if (state.classViewTab === 'groups') return 'recipe-guide:show';
    // Elevlistens guide skal have elever at pege på
    if (state.classViewTab === 'students' && state.currentClass.data?.length) return 'student-guide:show';
    return '';
});
function showGuide() {
    if (guideEvent.value) window.dispatchEvent(new CustomEvent(guideEvent.value));
}

const currentTabs = computed(() => {
    // If we have a class, show class-specific tabs + Import & backup
    if (state.currentClass) {
        return [
            { id: 'students', label: 'Elevliste', view: 'class' },
            { id: 'groups', label: 'Grupper', view: 'class' },
            { id: 'history', label: 'Historik', view: 'class' },
            { id: 'import', label: 'Import & backup', view: 'import' }
        ];
    }
    // Dashboard / No class selected
    return [
        { id: 'dashboard', label: 'Oversigt', view: 'dashboard' },
        { id: 'import', label: 'Import & backup', view: 'import' }
    ];
});

const activeTabId = computed(() => {
    if (state.navView === 'class') return state.classViewTab;
    return state.navView; // e.g. 'import', 'dashboard'
});

const saveNavState = () => {
    storageWrite('sessionStorage', NAV_VIEW_KEY, state.navView);
    storageWrite('sessionStorage', CLASS_TAB_KEY, state.classViewTab);
};

const pushNavState = () => {
    saveNavState();
    history.pushState({ navView: state.navView, classTab: state.classViewTab }, '');
};

const switchTab = (tab) => {
    if (tab.view === 'class') {
        state.navView = 'class';
        state.classViewTab = tab.id;
    } else {
        state.navView = tab.view;
    }
    pushNavState();
};

const onPopState = (e) => {
    if (e.state && e.state.navView) {
        // Historikken husker visninger, ikke klasser. Er klassen væk siden —
        // slettet, fx den sidste — førte Tilbage til en klassevisning uden
        // klasse: "Ingen klasse valgt", og ingen fane markeret. Uden en åben
        // klasse er Oversigt stedet at lande, som efter selve sletningen.
        const wantsClass = e.state.navView === 'class';
        const navView = wantsClass && !state.currentClass ? 'dashboard' : e.state.navView;
        const classTab = e.state.classTab || state.classViewTab;
        // Skifter Tilbage/Frem visningen, lukkes vinduerne med (se closeAll).
        // Kun ved et RIGTIGT skifte: "Vis for klassen" fjerner sit eget skridt
        // med history.back(), når det lukkes, og den popstate lander på samme
        // fane — dér må et vindue, der står åbent, ikke forsvinde.
        if (navView !== state.navView || classTab !== state.classViewTab) {
            modalActions.closeAll();
        }
        state.navView = navView;
        state.classViewTab = classTab;
    }
};

// Historikken skal vide, hvilken visning læreren står på, også når den skifter
// uden et nyt skridt. Efter en genindlæsning huskes visningen først, når klassen
// er hentet, så skridtet sagde "dashboard", mens læreren stod på Grupper. Lukkede
// man så "Vis for klassen" (eller trykkede Tilbage dertil), landede man på
// "Ingen klasse valgt". Kører efter klikket, så et nyt skridt fra switchTab er
// lagt først og det forrige skridt beholder sin egen visning.
watch(() => [state.navView, state.classViewTab], ([navView, classTab]) => {
    history.replaceState({ ...(history.state || {}), navView, classTab }, '');
});

onMounted(() => {
    // Kunne noget ikke flyttes til de nye nøglenavne ved opstarten, siges det
    // nu, hvor beskederne findes (se storageStartup.js).
    reportStorageMigration();
    // Rækkefølgen: klasserne først. Den rydder hele nøglesættet for en
    // slettet klasse (inkl. dens sessioner), så payload-oprydningen bagefter
    // kun har de ægte forældreløse tilbage at se på.
    try { storage.cleanupOrphanedClassData(); } catch (e) {}
    // Sessioner over 90 dage (eller ud over de 50 nyeste) i klasser, læreren
    // ikke har gemt i siden — løftet på GDPR-siden gælder alle klasser.
    try { storage.pruneStaleHistories(); } catch (e) {}
    try { storage.cleanupOrphanedPayloads(); } catch (e) {}
    // Advar MENS der stadig er plads at rydde op på. Rækkefølgen betyder
    // noget: oprydningen ovenfor frigør plads, så vi ikke advarer om noget
    // der lige er blevet løst. Kun én gang pr. fane — en advarsel der
    // gentager sig ved hvert skifte af klasse bliver til støj man klikker væk.
    try {
        if (!storageRead('sessionStorage', STORAGE_WARNED_KEY)) {
            const warning = getStoragePressureWarning();
            if (warning) {
                storageWrite('sessionStorage', STORAGE_WARNED_KEY, '1');
                // notifyError bliver stående til den klikkes væk (de andre
                // typer selvforsvinder). Det er meningen — beskeden kræver
                // en handling, ikke bare et blik.
                if (window.notifyError) window.notifyError(warning);
            }
        }
    } catch (e) { console.error(e); }
    // Klasser flyttet med fra www.dida.dk hentes ind FØR listen læses, så de
    // står i menuen fra første øjeblik (se adoptWww.js). Er der intet at
    // hente, svarer den med det samme.
    adoptFromWww()
        .catch(e => console.error('[adoptWww]', e))
        .finally(() => loadClasses());
    document.addEventListener('classCreated', onClassCreated);
    document.addEventListener('click', closeMenu);
    document.addEventListener('keydown', onEscapeClassMenu);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('storage', onForeignClassesChange);
    // Sæt initial history-state så første back ikke forlader appen
    history.replaceState({ navView: state.navView, classTab: state.classViewTab }, '');
});

onUnmounted(() => {
    document.removeEventListener('classCreated', onClassCreated);
    document.removeEventListener('click', closeMenu);
    document.removeEventListener('keydown', onEscapeClassMenu);
    window.removeEventListener('popstate', onPopState);
    window.removeEventListener('storage', onForeignClassesChange);
});
</script>

<template>
  <header class="topbar">
    <div class="brand">
        <a href="/" class="brand-link" title="grup.dk">
            <svg class="brand-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="3" width="8" height="8" rx="2.5" fill="currentColor" fill-opacity="0.22"/>
                <rect x="13" y="3" width="8" height="8" rx="2.5" fill="currentColor"/>
                <rect x="3" y="13" width="8" height="8" rx="2.5" fill="currentColor"/>
                <rect x="13" y="13" width="8" height="8" rx="2.5" fill="currentColor" fill-opacity="0.22"/>
            </svg>
            <span class="brand-text">grup<span class="grup-dot">.</span>dk</span>
        </a>
    </div>

    <span class="brand-sep"></span>

    <div class="nav-center">
        <!-- Fanerne -->
        <!-- aria-current="page": den markerede fane HED det samme som de
             øvrige for en skærmlæser — "Elevliste, knap", uanset hvor man
             stod. Klassen `active` er kun maling. Fanerne skifter hele
             hovedvisningen, så det er navigation, ikke en kontakt: derfor
             aria-current og ikke aria-pressed. -->
        <div class="main-nav">
            <button v-for="tab in currentTabs"
                    :key="tab.id"
                    class="nav-tab"
                    :class="{ active: activeTabId === tab.id }"
                    :aria-current="activeTabId === tab.id ? 'page' : null"
                    @click="switchTab(tab)">
                {{ tab.label }}
            </button>
        </div>

        <div style="flex: 1"></div>

        <button id="topbar-guide-btn" type="button" class="topbar-guide" title="Vis guide"
                :class="{ 'is-unused': !guideEvent }" :disabled="!guideEvent" @click="showGuide">
            <Lightbulb :size="15" />
            <span>Vis guide</span>
        </button>

        <!-- Klassepillen.
             Selve pillen er en RIGTIG knap — ikke en <div @click>. Var den en
             div, kunne klasseskiftet (appens allerførste handling) slet ikke
             nås uden mus: målt tabIndex -1, og ingen af menuens knapper var i
             DOM'en, før musen havde åbnet den. -->
        <div class="class-context" ref="classSelectorRef" :class="{active: isClassMenuOpen}">
            <button type="button" class="class-trigger"
                    aria-haspopup="true"
                    :aria-expanded="isClassMenuOpen ? 'true' : 'false'"
                    @click="isClassMenuOpen = !isClassMenuOpen">
                <span class="class-label">Klasse</span>
                <span class="class-value">
                    <span v-if="state.currentClass" class="class-name">{{ state.currentClass.name }}</span>
                    <span v-else class="class-name empty">Vælg...</span>
                    <ChevronDown :size="14" class="chevron" />
                </span>
            </button>

            <!-- Klassemenuen -->
            <Transition name="fade-slide-down">
                <div class="glass-dropdown" v-if="isClassMenuOpen" @click.stop>
                    <div class="dropdown-header">
                        <span class="dropdown-title">Klasser</span>
                        <button class="icon-btn add-btn" @click="createEmptyClass" title="Opret ny klasse"><Plus :size="14" /></button>
                    </div>
                    <div class="class-list">
                        <div v-if="classes.length === 0" class="empty-hint">Ingen klasser oprettet endnu.</div>
                        <!-- Sorteret visning, men `selectClass` får indekset i den
                             USORTEREDE liste: `saveLastClassIndex()` er stadig
                             fald tilbage for gamle browsere uden det gemte
                             filnavn, og et indeks fra den sorterede liste ville
                             pege på en anden klasse efter en genindlæsning. -->
                        <div v-for="c in sortedClasses" :key="c.filename"
                             class="class-item"
                             :class="{active: state.currentClass && state.currentClass.filename === c.filename}">
                            <!-- Navnet er selv knappen. Før kunne en tastaturbruger
                                 nå "Omdøb" og "Slet" inde i rækken, men ikke VÆLGE
                                 klassen — den handling lå på den omsluttende div. -->
                            <!-- aria-current: i en menu med fire klasser lød
                                 den valgte præcis som de tre andre. -->
                            <button type="button" class="name"
                                    :aria-current="state.currentClass && state.currentClass.filename === c.filename ? 'true' : null"
                                    @click="selectClass(c.filename, classes.findIndex(x => x.filename === c.filename))">{{ c.name }}</button>
                            <div class="actions">
                                <button class="icon-btn edit-btn" @click.stop="promptRename(c)" title="Omdøb klasse"><Pencil :size="14" /></button>
                                <button class="icon-btn delete-btn" @click.stop="deleteClass(c)" title="Slet klasse"><X :size="14" /></button>
                            </div>
                        </div>
                    </div>
                </div>
            </Transition>
        </div>
    </div>

    <!-- Ikonerne til højre -->
    <div class="nav-right">
        <!-- Ikon-knapperne har et aria-label fra start: tooltip.js sætter først navnet
             ved hover/fokus, og en skærmlæser kunne nå at møde dem navnløse. -->
        <button class="topbar-icon news-btn" @click="showNewsDialog = true" title="Nyheder & opdateringer" aria-label="Nyheder &amp; opdateringer"><Sparkles :size="18" /></button>
        <!-- Samme som fanerne: de tre ikoner åbner hver sin side, og den man
             står på var kun markeret med farve. aria-current gør den hørbar. -->
        <button class="topbar-icon" :class="{active: state.navView === 'edu'}" :aria-current="state.navView === 'edu' ? 'page' : null" @click="navigateTo('edu')" title="Pædagogisk guide" aria-label="Pædagogisk guide"><BookOpen :size="18" /></button>
        <button class="topbar-icon" :class="{active: state.navView === 'gdpr'}" :aria-current="state.navView === 'gdpr' ? 'page' : null" @click="navigateTo('gdpr')" title="Privatliv & GDPR" aria-label="Privatliv &amp; GDPR"><ShieldCheck :size="18" /></button>
        <button class="topbar-icon" :class="{active: state.navView === 'help'}" :aria-current="state.navView === 'help' ? 'page' : null" @click="navigateTo('help')" title="Om programmet" aria-label="Om programmet"><HelpCircle :size="18" /></button>
    </div>
  </header>

  <!-- Vinduer -->
  <ConfirmModal
    v-if="showDeleteConfirm"
    title="Slet klasse"
    :message="`Er du sikker på, at du vil slette '${deleteTarget?.name}'? Dette kan ikke fortrydes.`"
    confirm-text="Slet"
    variant="danger"
    @confirm="confirmDeleteClass"
    @cancel="showDeleteConfirm = false"
  />

  <PromptModal
    v-if="showRenamePrompt"
    title="Omdøb klasse"
    placeholder="Nyt navn"
    :initial-value="renameTarget?.name || ''"
    confirm-text="Omdøb"
    @confirm="confirmRename"
    @cancel="showRenamePrompt = false"
  />

  <PromptModal
    v-if="showNewClassPrompt"
    title="Ny klasse"
    placeholder="Navn på klasse"
    initial-value="Ny klasse"
    confirm-text="Opret"
    @confirm="confirmNewClass"
    @cancel="showNewClassPrompt = false"
  />

  <NewsDialog :open="showNewsDialog" @close="showNewsDialog = false" />
</template>

<style scoped>
.topbar {
    /* Samme token som toasts'ene måler sig efter (NotificationManager.vue),
       så de to ikke kan drive fra hinanden og lægge sig oven i hinanden. */
    height: var(--header-height);
    display: flex;
    align-items: center;
    justify-content: space-between;
    /* 32 px til venstre: logoet flugter med fanernes indhold (elevlisten,
       Grupper og Import starter alle 32 px inde). 24 px til højre: ikon-
       knapperne har 9 px luft om ikonet, så selve ikonet slutter 32 px inde. */
    padding-block: 0;
    padding-inline: 32px 24px;
    background: var(--bg-topbar);
    border-bottom: 1px solid var(--surface-tint); /* En streg, der lige kan ses */
    position: sticky;
    top: 0;
    z-index: 1000;
}

.brand {
    display: flex;
    align-items: center;
    gap: 4px;
}

.brand-link {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
    color: inherit;
}

.brand-icon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    color: oklch(0.50 0.19 264);  /* firkanterne bruger currentColor */
}

.brand-text {
    font-size: 16px;
    font-weight: 800;
    color: var(--text-main);
    letter-spacing: -0.04em;
}

/* grup.dk's blå (samme som --primary i Rolig-temaet og i favicon.svg,
   hvor den står som hex #2858cd). Logoet og prikken har altid denne farve. */
.grup-dot {
    color: oklch(0.50 0.19 264);
}

.brand-sep {
    width: 1px;
    height: 24px;
    background: var(--border-medium);
    margin-left: 20px;
}

.nav-center {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    /* Lader klassepillen skrumpe (se .class-context), i stedet for at et
       langt klassenavn skubber ikonerne til højre ud over skærmkanten. */
    min-inline-size: 0;
    padding-left: 10px;
}

.main-nav {
    display: flex;
    align-items: center;
    gap: 0;
    height: 64px;
    /* Fanerne skrumper ikke — klassepillen gør (den har "…"). Før brød
       "Import & backup" over tre linjer ved 1.024-1.180 px med et langt
       klassenavn (målt 9/11 2026). */
    flex-shrink: 0;
}

.nav-tab {
    background: transparent;
    border: none;
    height: 100%;
    padding: 0 16px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
    position: relative;
    transition-property: var(--ctl-transition);
    transition-duration: 0.2s;
    display: flex;
    align-items: center;
    white-space: nowrap;
}

.nav-tab:hover {
    color: var(--text-main);
    background: var(--bg-surface-hover);
}

.nav-tab.active,
.nav-tab.active:hover {
    /* --text-link, ikke --primary: samme blå i lyst tema, men i mørkt tema
       er --primary for mørk til tekst (3,6:1). Stregen under beholder den. */
    color: var(--text-link);
    background: transparent;
}

.nav-tab.active::after {
    content: '';
    position: absolute;
    bottom: 0px;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--primary);
    box-shadow: 0 -2px 10px var(--primary-light);
}

/* Klassepillen.
   Yderste lag er kun holdepunkt for menuen (position: relative). Al pillens
   udseende ligger på .class-trigger, som er den knap man trykker på. */
.class-context {
    position: relative;
    /* Et langt klassenavn må ikke skubbe resten af topbjælken. Uden loft og
       uden min-inline-size: 0 voksede pillen med navnet og brød det over op
       til fire linjer ved 1024 px ("Samfundsfag A 2.x Erhvervsøkonomi og
       innovation hold B 2026/27") — højere end bjælken, så første linje blev
       skåret af foroven. Nu står navnet på én linje med "…", og det fulde
       navn ses i menuen, pillen åbner. */
    min-inline-size: 0;
    max-inline-size: 360px;
}

.class-trigger {
    display: flex;
    max-inline-size: 100%;
    align-items: baseline;
    gap: 12px;
    padding: 8px 16px 8px 12px;
    background: var(--bg-surface);
    border: 1px solid var(--border-medium);
    cursor: pointer;
    transition-property: var(--ctl-transition);
    transition-duration: 0.2s;
    -webkit-user-select: none;
    user-select: none;
    font: inherit;
    color: inherit;
}

.class-trigger:hover, .class-context.active .class-trigger {
    background: var(--bg-surface-hover);
    border-color: var(--border-medium);
}

.class-label {
    flex-shrink: 0;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    font-weight: 600;
}

.class-value {
    display: flex;
    align-items: center;
    gap: 8px;
    min-inline-size: 0;
}

.class-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.class-value .chevron {
    flex-shrink: 0;
}

.class-name.empty {
    color: var(--text-muted);
    font-style: italic;
    font-weight: 400;
}

.chevron {
    font-size: 10px;
    color: var(--text-subtle);
}

/* Klassemenuen */
.glass-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    width: 280px;
    background: var(--bg-modal);
    border: 1px solid var(--border-medium);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-float);
    padding: 8px;
    z-index: 1000;
}

.dropdown-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-medium);
    margin-bottom: 8px;
}

.dropdown-title {
    font-size: 11px;
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.05em;
    color: var(--text-muted);
}

.class-list {
    max-height: 300px;
    overflow-y: auto;
}

.class-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition-property: var(--ctl-transition);
    transition-duration: 0.2s;
}

.class-item:hover {
    background: var(--bg-surface-hover);
}

.class-item.active {
    background: var(--primary-light);
    color: var(--text-main);
}

.class-item .name {
    font-size: 13px;
    font-weight: 500;
    /* Navnet brydes over flere linjer i stedet for at få "…". Pillen i
       topbjælken afkorter navnet, så menuen er det eneste sted, hvor et langt
       klassenavn kan læses helt — og to klasser, der kun adskiller sig til
       sidst ("… hold A 2026/27" / "… hold B 2026/27"), så før ens ud.
       anywhere: også et navn uden mellemrum brydes i stedet for at løbe ud. */
    overflow-wrap: anywhere;
    /* Knap-nulstilling: rækken skal se ud præcis som før, hvor navnet var
       et <span>. flex: 1 + min-width: 0 lader navnet tage pladsen op til
       Omdøb/Slet-knapperne. */
    flex: 1;
    min-inline-size: 0;
    text-align: start;
    background: none;
    border: none;
    padding: 0;
    color: inherit;
    font-family: inherit;
    cursor: pointer;
}

.actions {
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s;
}

/* focus-within: uden den var "Omdøb" og "Slet" USYNLIGE, men stadig
   fokuserbare — Tab landede på en knap ingen kunne se. */
.class-item:hover .actions,
.class-item:focus-within .actions {
    opacity: 1;
}

.icon-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    transition-property: var(--ctl-transition);
    transition-duration: 0.2s;
}

.icon-btn:hover {
    background: var(--bg-surface-hover);
    color: var(--text-main);
}

.delete-btn:hover {
    color: var(--color-error);
}

/* Ikonerne til højre */
.nav-right {
    display: flex;
    gap: 8px;
}

.topbar-guide {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    padding: 8px 14px 8px 12px;
    background: var(--bg-surface);
    border: 1px solid var(--border-medium);
    border-radius: 30px;
    color: var(--primary);
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
}
.topbar-guide:hover { background: var(--primary-light); }
.topbar-guide:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.topbar-guide.is-unused { visibility: hidden; }

.topbar-icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition-property: var(--ctl-transition);
    transition-duration: 0.2s;
    font-size: 16px;
}

.topbar-icon:hover {
    background: var(--bg-surface-hover);
    color: var(--text-main);
}

.topbar-icon.active {
    background: var(--primary-light);
    color: var(--text-main);
    border-color: var(--primary);
}

/* Overgange */
.fade-slide-down-enter-active,
.fade-slide-down-leave-active {
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.fade-slide-down-enter-from,
.fade-slide-down-leave-to {
    opacity: 0;
    transform: translate(-50%, -10px);
}

/* ── Smalle vinduer ──────────────────────────────────────────────────────────
   Medieblokkene står SIDST med vilje. En regel her har samme vægt som
   grundreglen, så den, der står længst nede, vinder. Stod de før grundreglerne
   for .nav-right, .topbar-guide og .glass-dropdown, virkede intet af det, de
   satte på dem: ikonerne fik aldrig den smallere afstand, pæren aldrig den
   smallere polstring, og klassemenuen stod 11 px uden for venstre kant ved
   375 px (målt 10/11 2026). Læg nye grundregler OVEN OVER denne linje. */
/* Smal skærm og browser-zoom: en bærbar på 1366×768 med 150 % zoom er 911
   CSS-pixel bred. Dér fik klassenavnet 7 px af pillen — "2.a (testdata)"
   stod som "2", uden "…", så det lignede et helt navn, og læreren kunne ikke
   se, hvilken klasse der var åben. Ordet "Klasse" og fanernes luft tog
   pladsen. Under 1100 px står ordet derfor kun i knappens tilgængelige navn
   (skærmlæseren siger stadig "Klasse 2.a …"), og fanerne rykker tættere. */
@media (max-width: 1099px) {
    .class-label {
        position: absolute;
        inline-size: 1px;
        block-size: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
    }

    .class-trigger {
        padding-inline-start: 16px;
    }

    .nav-tab {
        padding-inline: 10px;
    }

    /* "Vis guide" som pære alene. Siden 9/11 skrumper fanerne ikke (så
       "Import & backup" ikke brød over tre linjer), og så tog de og guide-
       knappen al pladsen: ved 911 px stod klassenavnet på 31 px — ét tegn.
       Ordet står stadig i knappens navn (skærmlæser) og som tip (title). */
    .topbar-guide {
        padding-inline: 10px;
    }
    .topbar-guide span {
        position: absolute;
        inline-size: 1px;
        block-size: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
    }
}

/* Smalle vinduer (under 900 px) og telefon: på én række løb fanerne ind i
   ikonerne, og klassevælgeren forsvandt. Ved 850 px var der 34 px til
   klassenavnet, under 800 px intet, og under 780 px lå pillen oven i
   ikonerne (målt 10/11 2026) — fx et vindue på halvdelen af en bærbar.
   Nu er bjælken to rækker: logo, klasse og ikoner øverst, fanerne nederst.
   Fanerne ruller sidelæns, hvis de ikke kan være der. Højden
   (--header-height: 112px) sættes i style.css med SAMME grænse, så alt, der
   måler sig efter bjælken, følger med. */
@media (max-width: 900px) {
    .topbar {
        flex-wrap: wrap;
    }
    .brand { block-size: 56px; }
    .brand-sep { display: none; }
    .nav-right { gap: 2px; }
    /* Fanerne får hele nederste række; klassevælgeren rykker op mellem
       logoet og ikonerne. `display: contents` lader de to stå hver for sig
       i bjælken, selv om de ligger i samme boks i markup. */
    .nav-center { display: contents; }
    /* Guidens pære står lige efter logoet (stregen mellem dem er væk) */
    .topbar-guide { margin-inline-start: 12px; }
    .nav-center > div[style] { display: none; }
    .class-context {
        order: 1;
        flex: 1;
        max-inline-size: none;
        margin-inline: 10px;
    }
    .nav-right { order: 2; }
    /* Klassemenuen centreret under pillen gik ud over venstre kant */
    .glass-dropdown {
        left: 0;
        transform: none;
        width: min(280px, calc(100vw - 24px));
    }
    .main-nav {
        order: 3;
        flex-basis: 100%;
        block-size: 55px;
        min-inline-size: 0;
        overflow-x: auto;
        scrollbar-width: none;
        border-block-start: 1px solid var(--surface-tint);
    }
    .nav-tab {
        white-space: nowrap;
        padding-inline: 10px;
    }
    .nav-tab:first-child { padding-inline-start: 0; }
    /* Fanerækken ruller sidelæns og klipper derfor alt uden for sig selv:
       fokusringen 2 px udenfor stod kun som to lodrette streger. Indenfor
       kan den ses hele vejen rundt. */
    .nav-tab:focus-visible { outline-offset: -2px; }
}

/* Telefon (under 700 px): Grupper er lavet til computer, men skal kunne
   bruges i en nødsituation. Ordet "grup.dk" må vige for klassen; logoets
   ikon, guidens pære og ikonerne bliver. (Her stod før også
   `.topbar-guide { display: none }`, men den virkede aldrig — grundreglen
   længere nede har samme vægt og vinder — og guiden bruges på telefon:
   e2e/guide_smal_skaerm.spec.ts.) */
@media (max-width: 700px) {
    .topbar { padding-inline: 12px; }
    .brand-text { display: none; }
    /* Kun ikonet står foran pæren; klassenavnet skal have pladsen */
    .topbar-guide { margin-inline-start: 6px; }
    /* Klassemenuen: under pillen var den 8 px for bred ved 375 px (pillen
       står 85 px inde). Her ligger den fast under øverste række i hele
       skærmens bredde (12 px fra kanterne, som bjælken). */
    .glass-dropdown {
        position: fixed;
        inset-block-start: 56px;
        inset-inline: 12px;
        width: auto;
    }
}
</style>
