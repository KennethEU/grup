<script setup>
import { computed, ref, watch, nextTick, onUnmounted } from 'vue';
import { reactiveState } from '../../js/modules/reactiveState.js';
import { getColorForString, memberDisplayName, isMemberAbsent, groupDisplayName, groupShortName, debounce, cellNumber } from '../../js/modules/utils.js';
import { studentById, homeGroupOriginById, avoidConflictIds } from '../../js/modules/lookups.js';
import { getTopic, saveTopic, saveGroupsToStorage, refreshTopicDatalistSoon } from '../../js/modules/storage.js';
import {
    startDrag, endDrag, dropOnGroup, getInsertIndex, draggingMemberId, draggingFromGroup,
    pickUpMember, movePickedTo, pickedMemberId, pickedFromGroup, pickedMemberName,
    pickIsInContext, excludePicked, cancelPickUp,
    swapTarget, setSwapTarget, clearSwapTarget, justSwappedIds, SWAP_DWELL_MS,
    resolveMemberId as resolveDragMemberId,
} from '../../composables/useDragDrop.js';
import { Lock, Unlock, Ghost, Trash2, UserMinus, ShieldX, CornerDownRight, X, ArrowLeftRight } from 'lucide-vue-next';
import { deleteGroup } from '../../js/modules/groupActions.js';
import { registerPendingWrite } from '../../js/modules/classActions.js';

const props = defineProps({
    group: { type: Object, required: true },
    variant: { type: String, default: 'standard' }, // 'standard' or 'matrix'
    idColumn: { type: String, required: true },
    activeRuleColumns: { type: Array, default: () => [] },
    // Kolonnerne under visningens Balancér-regler, i reglernes rækkefølge.
    balanceColumns: { type: Array, default: () => [] }
});

const isMatrix = computed(() => props.variant === 'matrix');

const topicPrefix = computed(() => isMatrix.value ? 'M_' : 'S_');
const isDragOver = ref(false);

// Emne-autocompletens <datalist>. Den er GLOBAL — ét element i body, delt af
// alle kort — men blev bygget forfra i hvert eneste korts setup(). Ved 50
// grupper var det 50 identiske genopbygninger af den samme DOM-liste, midt i
// den gentegning læreren venter på. Den debouncede vej samler dem til én.
refreshTopicDatalistSoon();

// Display name
const displayName = computed(() => groupDisplayName(props.group.name));

// Gruppens snit i hver Balancér-regels kolonne — én linje under overskriften,
// der vises og skjules med Tags-knappen (`.hide-tags .group-average`).
//
// Snittet stod før i selve overskriften og kun for den FØRSTE Balancér-regel.
// Siden 23/9 virker flere Balancér-regler på én gang, og så stod den anden
// kolonne ingen steder. Nu får hver kolonne sit tal, med navnet foran.
//
// Kun de elever der er HER tæller: en fraværende bliver stående på kortet,
// men arbejder ikke med i gruppen i dag — og gruppedannelsen og
// efternøler-placeringen regner også kun med dem, der er her. Et spøgelse
// (slettet elevrække) har ingen række og tæller heller ikke.
//
// cellNumber() og ikke parseFloat(): kommaet er det danske decimaltegn, og
// parseFloat("7,5") er 7 — kortet sagde engang „Snit: 4.5”, hvor motoren
// havde balanceret på 5,0. En ord-kolonne (også en rangeret "Lav/Middel/Høj")
// giver intet tal og står derfor ikke med; et snit på 2,3 er ikke et niveau.
// Tallet skrives med komma, som resten af den danske flade.
const averages = computed(() => {
    const cols = props.balanceColumns;
    if (!cols.length || !reactiveState.currentClass) return [];
    const byId = studentById.value;
    const out = [];
    for (const col of cols) {
        let sum = 0, count = 0;
        for (const m of props.group.members) {
            if (isMemberAbsent(m, null, byId)) continue;
            const student = byId.get(resolveMemberId(m));
            if (!student) continue;
            const val = cellNumber(student[col]);
            if (val !== null) { sum += val; count++; }
        }
        if (count > 0) {
            out.push({ col, text: (sum / count).toFixed(1).replace('.', ',') });
        }
    }
    return out;
});

const averagesText = computed(() =>
    averages.value.map(a => `${a.col} ${a.text}`).join(' · '));

// Emnefelt — sat ved mount ud fra localStorage.
// BEMÆRK: Vue genbruger komponenten, når :key="group.name" er den samme på
// tværs af kørsler, så setup() kører IKKE igen. Der skal derfor en eksplicit
// watch til, for at holde feltet i takt, når gruppens emne ryddes udefra
// (clearAllTopics / gruppedannelse uden klasseemner).
const topicValue = ref(getTopic(props.group.name, topicPrefix.value) || (isMatrix.value ? 'MATRIX' : ''));

watch(
    () => props.group.topic,
    (newTopic) => {
        // Hold den lokale, redigerbare ref i takt, hver gang gruppens emne
        // sættes udefra (fx efter clearAllTopics eller en ny kørsel uden emner).
        topicValue.value = newTopic || (isMatrix.value ? 'MATRIX' : '');
    }
);

// Sand, når klassen har emner på klasseniveau — så tildeles emnerne automatisk
// af gruppedannelsen, men læreren kan stadig overstyre pr. gruppe.
const hasClassTopics = computed(() => {
    if (isMatrix.value) return false; // matrix groups always editable
    const t = reactiveState.currentClass?.topics;
    return Array.isArray(t) && t.length > 0;
});

// Den ordnede liste af klassens emner (til vælgeren)
const classTopicList = computed(() => {
    const t = reactiveState.currentClass?.topics;
    return Array.isArray(t) ? t.filter(x => x && String(x).trim()) : [];
});

function onClassTopicChange(e) {
    const val = e.target.value.trim();
    const cleanVal = val || null;
    if (saveTopic(props.group.name, cleanVal, topicPrefix.value) === false) {
        // Vue ser ingen ændring i modellen, så selve select-elementet skal
        // også sættes tilbage efter browserens allerede udførte valg.
        e.target.value = topicDisplay.value || '';
        return;
    }
    props.group.topic = cleanVal;

    const groups = reactiveState.storedStandardGroups;
    if (groups) {
        const g = groups.find(xg => xg.name === props.group.name);
        if (g) g.topic = cleanVal;
        saveGroupsToStorage();
    }
}

// Reaktiv visningsværdi: når klasseemnerne styrer det hele, læses direkte fra
// props.group.topic (holdt i takt af generation.js / hydrateGroupTopics) i
// stedet for den lokale ref. Ellers bruges den lokale ref (gammel redigerbar tilstand).
const topicDisplay = computed(() => {
    if (hasClassTopics.value) {
        return props.group.topic || getTopic(props.group.name, topicPrefix.value) || '';
    }
    return topicValue.value;
});

const topicStyle = computed(() => {
    const val = topicDisplay.value;
    if (!val || val === 'MATRIX' || val.length === 0) return {};
    const colors = getColorForString(val);
    // backgroundColor, ikke background: genvejen nulstiller også
    // background-image, og dér ligger emnevælgerens pil (.topic-select).
    // Pilen var derfor væk på hvert kort, der HAVDE et emne — og kun synlig
    // på dem med "— Intet emne —".
    return { backgroundColor: colors.bg, color: colors.color };
});

// En udskudt skrivning tilhører netop den klasse OG det gruppeobjekt,
// læreren tastede i. Gruppenavnet genbruges ved nye kørsler og klasseskift,
// så opslag alene på "Group 1" kunne skrive et gammelt emne i nye grupper.
function persistTopic(group, cleanVal, isMatrixCard, filename) {
    if (reactiveState.currentClass?.filename !== filename) return;
    const groups = isMatrixCard ? reactiveState.storedMatrixGroups : reactiveState.storedStandardGroups;
    if (!groups?.includes(group)) return;
    const prefix = isMatrixCard ? 'M_' : 'S_';
    if (saveTopic(group.name, cleanVal, prefix) === false) {
        // Det afviste emne må ikke vises som gemt eller komme med i en
        // efterfølgende matrix/session via gruppens kopi af emnet.
        topicValue.value = getTopic(group.name, prefix) || (isMatrixCard ? 'MATRIX' : '');
        return;
    }
    group.topic = cleanVal;
    saveGroupsToStorage();
}

// Emnefeltet skriver ved hvert `input` — altså hvert tastetryk. Målt på en
// klasse med 220 elever: at skrive "Klimaforandringer" gav 34 skrivninger til
// localStorage (17 af emnekortet, 17 af HELE gruppe-blobben à ~3,9 KB). Tiden
// er ikke problemet (0,1 ms i alt); de 34 selvstændige chancer for at ramme en
// fuld kvote midt i et ord er det — hver af dem kan afvises alene og efterlade
// lageret et andet sted end skærmen.
//
// Feltet viser straks kladden. Gruppens emne ændres først, når emnekortet
// er gemt, så resten af appen ikke bruger et afvist emne som et gemt valg.
const debouncedPersistTopic = debounce(persistTopic, 250);

// Ventetiden må ikke kunne æde det sidst tastede: lukker læreren fanen inden
// de 250 ms er gået, findes emnet KUN i hukommelsen, og Grupper har ingen
// server at hente det fra. Samme melding som gruppeindstillingerne bruger.
const unregisterPendingTopic = registerPendingWrite(debouncedPersistTopic.flush);
onUnmounted(() => {
    unregisterPendingTopic();
    // Kortet forsvinder (ny generering, klasseskift) — det der stod i feltet
    // skal med ned, inden komponenten er væk.
    debouncedPersistTopic.flush();
});

function onTopicInput(e) {
    const val = e.target.value.trim();
    topicValue.value = e.target.value;
    const cleanVal = (isMatrix.value && val === 'MATRIX') ? null : val;
    debouncedPersistTopic(props.group, cleanVal, isMatrix.value, reactiveState.currentClass?.filename);
}

function onTopicFocus() {
    if (isMatrix.value && topicValue.value === 'MATRIX') {
        topicValue.value = '';
    }
}

function onTopicBlur() {
    // Klik videre til fx Matrix eller en anden klasse: emnet skal være
    // gemt, inden den næste handling begynder at læse eller udskifte grupper.
    debouncedPersistTopic.flush();
    if (isMatrix.value && topicValue.value.trim() === '') {
        topicValue.value = 'MATRIX';
    }
}

function toggleLock() {
    props.group.locked = !props.group.locked;
    saveGroupsToStorage();
}

// Member helpers
//
// ALT hvad der skal stå om ét medlem regnes ÉT sted, én gang pr. gennemtegning.
// Før spurgte skabelonen seks gange pr. elev — navnet, fraværet (tre steder:
// css-klassen, ikonet og title), regel-tags (to gange: v-if og v-for) og
// oprindelsen — og hvert spørgsmål gennemløb hele elevlisten. Målt i browseren
// (300 elever, 75 kort, to regler): et skift af visningskolonne tegnede alle
// kort om på 48,5 ms, en tilføjet elevrække på 53,7 ms. Nu 7,6 og 3,5 ms.
// Opslagene går gennem de delte kort i lookups.js.
const EMPTY_INFO = Object.freeze({ name: '', absent: false, originTags: [], ruleTags: [] });

const memberInfo = computed(() => {
    const byId = studentById.value;
    const origins = isMatrix.value ? homeGroupOriginById.value : null;
    const ruleCols = props.activeRuleColumns;
    const map = new Map();

    for (const m of membersWithPreview.value) {
        const id = resolveMemberId(m);
        if (map.has(id)) continue;

        if (isPreview(m)) {
            // Placeholderen under et træk bærer sit navn med sig.
            map.set(id, { name: m.name, absent: false, originTags: [], ruleTags: [] });
            continue;
        }

        map.set(id, describeMember(m, byId, origins, ruleCols));
    }

    // Under et byt står den anden elev på den trukne elevs plads HER — så
    // hun skal regnes med, selvom hun ikke er medlem af kortet (endnu).
    const incoming = incomingMember.value;
    if (incoming) map.set(INCOMING_KEY, describeMember(incoming, byId, origins, ruleCols));
    return map;
});

/** Alt om ét medlem: navn, fravær, oprindelse og regel-tags. */
function describeMember(m, byId, origins, ruleCols) {
    const id = resolveMemberId(m);
    const student = byId.get(id);
    const info = {
        name: memberDisplayName(m, null, reactiveState.displayColumn, byId),
        absent: isMemberAbsent(m, null, byId),
        originTags: [],
        ruleTags: []
    };

    // Oprindelses-badget (kun matrix): hvilken stamgruppe kommer eleven
    // fra. Det hører til NAVNET og vises derfor ved siden af det — ikke
    // nede i tag-rækken, som læreren kan slå fra med Tags-knappen.
    // Kun for elever der stadig står i klassen, som før.
    if (origins && student) {
        const originVal = origins.get(id);
        if (originVal) {
            const colors = getColorForString(originVal);
            info.originTags.push({
                text: groupShortName(originVal),
                style: { background: colors.bg, color: colors.color }
            });
        }
    }

    // Regel-tags: elevens værdi i hver kolonne, der er en aktiv regel.
    // Nøglen er forkortet til 3 tegn (kolonnenavne er ofte datoer), så
    // hele kolonnenavnet lægges i title — ellers er "17-" ikke at gætte.
    if (student && ruleCols.length > 0) {
        for (const col of ruleCols) {
            const val = student[col];
            if (val) {
                info.ruleTags.push({
                    key: col.substring(0, 3).toLowerCase(),
                    value: String(val),
                    title: `${col}: ${val}`
                });
            }
        }
    }

    return info;
}

/** Det færdigregnede om ét medlem. Faldback'en er tom, aldrig undefined. */
function info(m) {
    return memberInfo.value.get(resolveMemberId(m)) || EMPTY_INFO;
}

// ─── Markering: flyt en elev uden mus ───────────────────────────────────────
// Klik/tap/Enter på en elev markerer hende; derefter viser alle ANDRE ulåste
// kort en "Flyt hertil"-knap. Det er den eneste vej på en tavle-pc eller iPad,
// hvor HTML5-træk-og-slip slet ikke findes, og den eneste vej fra tastaturet.

// Er DENNE elev markeret lige nu?
// Under en afspilning er kortet et billede af et øjeblik i kørslen. De
// knapper der INVITERER til at ændre noget ("Slet gruppe?", "Flyt hertil")
// skal ikke stå der — gitteret er allerede spærret (inert i
// GroupResultsPanel), men et tilbud man ikke kan tage imod, er værre end
// intet tilbud.
const isReplaying = computed(() => {
    const r = reactiveState.replay;
    return !!r && r.view === (isMatrix.value ? 'matrix' : 'standard');
});

// Forhåndsvisningen af en tidligere kørsel (musen hen over et tal i
// kørselsmenuen) er præcis samme situation som en afspilning: kortene viser
// en fordeling, der ikke er den gældende, og gitteret er allerede spærret
// (`inert` i GroupResultsPanel). Den blev bare glemt her.
//
// HVAD MAN SÅ: markeringens fremhævning forsvandt — eleven ligger jo et
// andet sted i den viste kørsel, og `isPicked()` kræver både elev-id OG
// gruppenavn — mens "Flyt hertil" BLEV STÅENDE, fordi `canReceivePicked`
// kun sammenligner gruppenavnet. Resultatet var fem knapper der lovede at
// flytte en elev, mens ingen elev var markeret nogen steder, og det ene
// kort uden knap var blot det, der tilfældigvis hed det samme som
// kildegruppen.
//
// Markeringen RYDDES ikke her — den skal komme tilbage, når musen forlader
// menuen. At pege på et menupunkt må ikke koste læreren sit valg. Den ryddes
// kun, når fordelingen faktisk skiftes ud (cancelPickUp() i pushRun()).
const isPreviewing = computed(() => reactiveState.previewRunIndex !== null);

// ─── Afspilning: de to der lige byttede plads ───────────────────────────────
// Overgangen på medlemslisten varer 250 ms. Under en afspilning på 60 ms pr.
// bytte ville hvert bytte afbryde det forrige midt i, og listen ville stå og
// flimre med halvt indtonede navne i stedet for at vise, hvem der flyttede
// sig. Derfor følger varigheden hastigheden — dog aldrig længere end de 250
// ms, den er tegnet til, og aldrig så kort at bevægelsen forsvinder helt.
const listDuration = computed(() => {
    const r = reactiveState.replay;
    if (!r) return null;
    const ms = Math.max(40, Math.min(250, r.speed));
    return { '--list-dur': `${ms}ms` };
});

// Uden fremhævningen er en gentegning af 30 kort bare et flimmer, hvor man
// ikke kan se HVAD der skete. Farven kommer fra hændelsens art, så det er til
// at se, når motoren gør det værre med vilje.
const replayKind = computed(() => {
    const r = reactiveState.replay;
    return r && r.last ? r.last.kind : null;
});

function isReplayMoved(member) {
    const r = reactiveState.replay;
    if (!r || !r.last) return false;
    const id = resolveMemberId(member);
    // `moved` bærer alle i billedet — ved et blok-bytte (Skal sammen) flere
    // end to. a/b er reserven for en hændelse uden listen.
    if (Array.isArray(r.last.moved)) return r.last.moved.includes(id);
    return id === r.last.a || id === r.last.b;
}

function isPicked(member) {
    if (isPreview(member)) return false;
    // Under en forhåndsvisning står der en anden fordeling på kortene. Et
    // sammenfald dér — eleven lå tilfældigvis i en gruppe med samme navn i
    // den gamle kørsel — ville fremhæve hende i et billede, hun ikke er
    // markeret i.
    if (isPreviewing.value) return false;
    return pickedMemberId.value === resolveMemberId(member)
        && pickedFromGroup.value?.name === props.group.name;
}

// Vises "Flyt hertil" på dette kort? Kun når en elev fra en ANDEN gruppe er
// markeret, og dette kort ikke er låst.
// pickIsInContext(): markeringen skal høre til DEN klasse og DEN visning der
// står på skærmen. Uden det tjek dukkede knappen op på matrixkortene efter et
// skift fra stamgrupperne — og på en helt anden klasses kort efter et
// klasseskift, hvor både gruppenavne og elev-id'er går igen.
const canReceivePicked = computed(() =>
    !!pickedMemberId.value
    && pickIsInContext()
    && !props.group.locked
    && pickedFromGroup.value?.name !== props.group.name
);

function onMemberActivate(member, e) {
    if (isPreview(member) || props.group.locked) return;
    // Knapperne i den markerede række ligger INDE i <li>, så deres KLIK bobler
    // herop. Uden vagten ville "Meld fraværende" først melde eleven fraværende
    // og derefter markere hende igen — og "Fortryd" ville fortryde og markere
    // i samme tryk.
    //
    // Tastaturet har sin egen vagt i skabelonen (`.self`), og den SKAL sidde
    // dér — ikke her. `.prevent` kalder preventDefault() FØR handleren, så en
    // vagt på dette sted kom for sent: Enter på "Meld fraværende" fik sit
    // klik aflyst af rækkens egen lytter, og de to knapper var derfor helt
    // døde for tastaturet. Målt 9/9: fokus på knappen, Enter — intet
    // click-event, eleven blev hverken meldt fraværende eller sluppet.
    if (e && e.target.closest?.('.pick-action-btn')) return;
    pickUpMember(resolveMemberId(member), props.group, info(member).name);
}

// ─── Fokus efter en handling i flyt-flowet (gennemsynet 9/9) ────────────────
// Alle tre knapper forsvinder i samme øjeblik de virker: rækkens to
// handlinger forlader DOM'en med markeringen, og "Flyt hertil" gør det samme
// på alle de andre kort. Står markøren på en af dem, falder den på gulvet —
// målt efter hver af de tre: `document.activeElement` er BODY, og næste Tab
// begynder forfra øverst på siden. Det er præcis den mus-frie vej der går i
// stykker: skal to elever bytte gruppe, starter man forfra efter den første.
//
// Markøren lægges derfor på en ELEVRÆKKE på dette kort — helst den elev,
// handlingen handlede om, ellers naboen på hendes plads. Er kortet tomt, tager
// låseknappen imod, så man i det mindste bliver i gruppen.
const cardRef = ref(null);

function focusAfterPickAction(memberId, fallbackIndex) {
    nextTick(() => {
        const card = cardRef.value;
        if (!card) return;
        // Kun hvis markøren faktisk faldt på gulvet. Har læreren klikket et
        // andet sted i mellemtiden, står den, hvor hun satte den.
        const active = document.activeElement;
        if (active && active !== document.body) return;
        // offsetParent: en række der er ved at glide ud, står stadig i DOM'en
        // med `display: none` under sin leave-overgang, og .focus() på den
        // ville ikke gøre noget.
        const rows = [...card.querySelectorAll('.group-members-list > li[tabindex]')]
            .filter(li => li.offsetParent !== null);
        let row = memberId == null ? null
            : rows.find(li => li.dataset.id === String(memberId));
        if (!row && fallbackIndex >= 0 && rows.length) {
            row = rows[Math.min(fallbackIndex, rows.length - 1)];
        }
        (row || card.querySelector('.lock-btn'))?.focus();
    });
}

// "Meld fraværende" i den markerede række. Papirkurven i bundbjælken er en
// SLIP-zone og kun det — den kan hverken tappes på en iPad eller nås fra
// tastaturet. Vejen går gennem den samme excludePicked() som før; den flyttede
// bare fra den brede linje over grupperne ned til eleven selv.
function onExcludePickedHere() {
    // Navnet OG pladsen skal læses FØR: excludePicked() rydder markeringen,
    // og rækken er væk bagefter — så naboen på hendes plads er det bedste, vi
    // kan give markøren.
    const name = pickedMemberName.value;
    const pickedIndex = props.group.members.findIndex(
        m => resolveMemberId(m) === String(pickedMemberId.value));
    if (excludePicked(props.idColumn)) {
        window.notifySuccess?.(`${name} er meldt fraværende og taget ud af gruppen.`);
        focusAfterPickAction(null, pickedIndex);
    }
}

function onReceivePicked() {
    const id = pickedMemberId.value;
    movePickedTo(props.group);
    focusAfterPickAction(id, -1);
}

// Fortryd: eleven bliver stående, kun knapperne forsvinder — så hendes egen
// række er det oplagte sted at sætte markøren.
function onCancelPick() {
    const id = pickedMemberId.value;
    cancelPickUp();
    focusAfterPickAction(id, -1);
}

// Drag and drop
function onDragStart(e, member) {
    if (props.group.locked) {
        e.preventDefault();
        return;
    }
    e.dataTransfer.effectAllowed = 'move';
    startDrag(resolveMemberId(member), props.group);
}

// Står i skabelonen som `@dragend="onDragEnd"` — et rent navn, som Vue kalder.
// Før stod der `!isPreview(member) && onDragEnd`: et udtryk, som Vue pakker
// ind som en sætning, så funktionen blev nævnt, men aldrig kaldt. Kun slippet
// på et gruppekort ryddede op (onDrop nedenfor), og efter et slip på
// papirkurven eller et afbrudt træk stod papirkurven og lyste. Værnet mod
// forhåndsvisningen er unødvendigt: den række er ikke `draggable`.
function onDragEnd() {
    endDrag();
}

const dragOverIndex = ref(-1);

const membersWithPreview = computed(() => {
    // Returnér den oprindelige liste, hvis der ikke trækkes hen over dette kort
    if (!isDragOver.value || !draggingMemberId.value) {
        return props.group.members;
    }
    // Viser kortet et byt, står listen som den er: eleven, der byttes med,
    // bliver på sin plads og markeres (se isSwapTarget). Ingen pladsholder.
    if (isSwapHere.value) return props.group.members;

    const list = [...props.group.members];

    // Placeholderen viser NAVNET, ikke identiteten. Medlemmer bæres rundt som
    // _rowId, så det oprindelige medlem slås op i kildegruppen og oversættes af
    // memberDisplayName — samme vej som memberInfo. Stod her bare det
    // trukne id, skrev den gruppe man svævede hen over "r17" i stedet for
    // elevens navn. Objektet (ikke bare id'et) sendes videre, så en ghost-elev
    // uden række i klassen stadig kan vise sit medbragte navn.
    const draggedMember = draggingFromGroup.value?.members
        .find(m => resolveMemberId(m) === String(draggingMemberId.value))
        ?? String(draggingMemberId.value);

    const previewItem = {
        id: 'PREVIEW_ITEM',
        name: memberDisplayName(draggedMember, null, reactiveState.displayColumn, studentById.value),
        isPreview: true
    };

    // Flytter læreren rundt inden for sit eget kort, tages den trukne elev ud
    // først: dragOverIndex er en plads i listen UDEN hende (se
    // getInsertIndex), præcis som moveMember() tæller ved slippet.
    const existingIdx = list.findIndex(m => resolveMemberId(m) === String(draggingMemberId.value));
    if (existingIdx !== -1) list.splice(existingIdx, 1);

    // -1 (ingen plads endnu) og alt for store tal betyder: sidst i listen
    let idx = dragOverIndex.value;
    if (idx < 0 || idx > list.length) idx = list.length;

    // Sæt forhåndsvisningen ind på den udregnede visuelle plads
    list.splice(idx, 0, previewItem);
    
    return list;
});

// --- Helper Functions ---

// Pladsholderen under et træk har sit eget id; ellers samme id som trækket bruger.
function resolveMemberId(m) {
    if (m && m.isPreview) return 'PREVIEW_ITEM';
    return resolveDragMemberId(m);
}

function isPreview(m) {
    return m && m.isPreview;
}

// ─── Byt to elever ──────────────────────────────────────────────────────
// Et træk flytter som udgangspunkt eleven herover (pladsholderen). Hviler
// musen over en elev på DETTE kort i SWAP_DWELL_MS, skifter kortet til et
// byt: eleven markeres med to pile, og i gruppen, der trækkes fra, står
// hendes navn stiplet på den trukne elevs plads. Går musen væk fra hende,
// er det en flytning igen. Selve byttet sker i swapMembers() (useDragDrop.js).

/** Viser DETTE kort et byt lige nu? */
const isSwapHere = computed(() => swapTarget.value?.groupName === props.group.name);

/** Er rækken eleven, den trukne elev vil bytte med? */
function isSwapTarget(m) {
    return isSwapHere.value && !isPreview(m)
        && resolveMemberId(m) === String(swapTarget.value.memberId);
}

/**
 * Er rækken den trukne elev, i den gruppe hun trækkes FRA, mens et byt
 * vises et andet sted? Så står den anden elevs navn stiplet på hendes plads.
 * Rækken bliver i DOM'en (samme `:key`): kun navnet og udseendet skifter.
 * (Målt 3/11: en fjernet kilderække får stadig sin egen `dragend` — rækkens
 * `@dragend` kører — men hændelsen når ikke op til `document`. Se tooltip.js.)
 */
function isSwapIncoming(m) {
    // Først den billige computed: er der ikke et byt på vej til DETTE kort,
    // læses swapTarget slet ikke — så de andre kort tegnes ikke om, hver gang
    // et byt begynder eller slutter et andet sted.
    if (!incomingMember.value) return false;
    return !!swapTarget.value && !isPreview(m)
        && draggingFromGroup.value?.name === props.group.name
        && resolveMemberId(m) === String(draggingMemberId.value);
}

// Nøglen i memberInfo for eleven, der er på vej hertil i et byt. Den kan
// ikke kollidere med et rigtigt id (de er "r…" eller elevens navn fra en
// gammel session — aldrig med mellemrum og store bogstaver som her).
const INCOMING_KEY = 'SWAP INCOMING';

/**
 * Den anden elev i et byt, når hun er på vej ind på DETTE kort — ellers null.
 * Står i en computed, så memberInfo kun regnes om, når byttet skifter.
 */
const incomingMember = computed(() => {
    const t = swapTarget.value;
    if (!t || draggingFromGroup.value?.name !== props.group.name) return null;
    return t.member ?? t.memberId;
});

/**
 * Det, rækken skal vise. Under et byt står den anden elev på den trukne
 * elevs plads, og så skal HELE rækken være hendes — navnet, fraværet, tags
 * og oprindelsen. Første udgave skiftede kun navnet: trak læreren en
 * fraværende elev, stod den andens navn med fraværs-ikonet ved siden af.
 */
function rowInfo(m) {
    if (isSwapIncoming(m)) return memberInfo.value.get(INCOMING_KEY) || EMPTY_INFO;
    return info(m);
}

/** Medlemmet, rækken viser — den anden elev, når hun er på vej hertil. */
function rowMember(m) {
    return isSwapIncoming(m) ? incomingMember.value : m;
}

function isJustSwapped(m) {
    return !isPreview(m) && justSwappedIds.value.has(resolveMemberId(m));
}

// Hvilken elev musen hviler over, og siden hvornår.
let dwellId = null;
let dwellSince = 0;
// Hvor eleven stod (lodret), da byttet blev vist — se updateSwap().
let swapBand = null;

function resetDwell() {
    dwellId = null;
    dwellSince = 0;
    swapBand = null;
}

/**
 * Rækkens lodrette placering i vinduet, UDEN en igangværende overgang.
 * getBoundingClientRect() tæller transformen med, og rækkerne glider, når
 * pladsholderen kommer og går. Så ville musen "forlade" eleven, mens hun
 * stadig er på vej hen under den, og byttet ville slukke med det samme.
 */
function rowSpan(row, listEl) {
    const listTop = listEl.getBoundingClientRect().top;
    const offset = row.offsetParent === listEl
        ? row.offsetTop
        : row.offsetTop - listEl.offsetTop;
    const top = listTop + offset;
    return { top, bottom: top + row.offsetHeight };
}

/**
 * Eleven under musen — KUN når musen står på et rigtigt navn.
 *
 * Står musen på pladsholderen (det grå mellemrum), er svaret null: dér
 * flytter læreren eleven ind, og det skal blive ved at være en flytning,
 * uanset hvor længe musen hviler. Før regnede vi eleven lige under
 * mellemrummet med, og så blev en pause i mellemrummet pludselig til et byt.
 */
function memberUnder(listEl, clientY) {
    const row = [...listEl.children].find(el => {
        if (el.tagName !== 'LI') return false;
        const { top, bottom } = rowSpan(el, listEl);
        return clientY >= top && clientY < bottom;
    });
    if (!row || row.classList.contains('placeholder-item')) return null;
    const id = row.dataset.id;
    return id && id !== 'PREVIEW_ITEM' ? id : null;
}

function updateSwap(listEl, clientY) {
    // Kun mellem to grupper: inden for én gruppe er et byt bare en ny
    // rækkefølge, og dér er pladsholderen det rigtige svar.
    const from = draggingFromGroup.value;
    if (!from || from.name === props.group.name) return;

    // Viser vi allerede et byt, holder det, så længe musen er over eleven —
    // ELLER dér, hvor hun stod, da byttet blev vist. Pladsholderen forsvinder
    // nemlig med byttet, og så rykker rækkerne op: eleven kan glide væk under
    // en mus, der står helt stille. Uden båndet slukkede byttet, pladsholderen
    // kom igen, og efter SWAP_DWELL_MS tændte det på ny — et blink i takt.
    if (isSwapHere.value) {
        const row = [...listEl.children].find(el =>
            el.dataset?.id === String(swapTarget.value.memberId));
        const inBand = swapBand && clientY >= swapBand.top && clientY < swapBand.bottom;
        if (inBand) return;
        if (row) {
            const { top, bottom } = rowSpan(row, listEl);
            if (clientY >= top && clientY < bottom) return;
        }
        clearSwapTarget();
        resetDwell();
        return;
    }

    const id = memberUnder(listEl, clientY);
    const now = Date.now();
    if (id !== dwellId) {
        dwellId = id;
        dwellSince = now;
        return;
    }
    if (id && now - dwellSince >= SWAP_DWELL_MS) {
        const member = props.group.members.find(m => resolveMemberId(m) === id);
        if (!member) return;
        const row = [...listEl.children].find(el => el.dataset?.id === id);
        swapBand = row ? rowSpan(row, listEl) : null;
        // Selve medlemmet går med, så kortet, der trækkes FRA, kan vise
        // hende helt — fravær, tags og oprindelse — og ikke kun navnet.
        setSwapTarget({ groupName: props.group.name, memberId: id, name: info(member).name, member });
    }
}

// Er eleven et "spøgelse" (findes ikke i den nuværende klasses data)?
function isGhost(m) {
    if (isPreview(m)) return false; // pladsholderen er aldrig et spøgelse
    return typeof m === 'object' && m !== null && !!m.isGhost;
}

// Markeret fraværende i elevlisten, men står stadig på kortet. Fluebenet i
// elevlisten rører nemlig ikke grupperne — kun papirkurven gør det — så uden
// den her markering udleverer læreren en gruppeliste med en elev, der ikke
// er i lokalet. Se isMemberAbsent() i utils.js.
function isAbsent(m) {
    // Regnet én gang pr. gennemtegning i memberInfo — her er det et opslag.
    return info(m).absent;
}

// Sidder eleven sammen med en, hun skulle undgå?
//
// HVORFOR MARKERINGEN FINDES: hintet over kortene NÆVNER navnene, men på et
// hold med tyve grupper skal læreren selv finde dem. Og hintet står øverst —
// er hun scrollet ned i kortene, ser hun det ikke. Markeringen sidder dér,
// hvor hun skal handle.
//
// Sættet er bygget ÉN gang for hele visningen (avoidConflictIds i lookups.js),
// så det her er ét Set-opslag pr. elev — ikke en gennemløbning af
// undgåelses-listen pr. elev pr. gennemtegning.
const avoidIds = computed(() =>
    avoidConflictIds.value[isMatrix.value ? 'matrix' : 'standard']);

function isAvoidConflict(m) {
    if (isPreview(m)) return false;
    return avoidIds.value.has(resolveMemberId(m));
}

/**
 * Teksten på musen over en elev. Samlet i én funktion frem for en
 * ternær-trappe i skabelonen — der er fire tilstande nu, og undgåelsen skal
 * kunne stå SAMMEN med de øvrige (en fraværende elev kan også være i et brud).
 */
function memberTitle(m) {
    if (isGhost(m)) return 'Denne elev findes ikke i nuværende klasse';
    const parts = [];
    if (isAvoidConflict(m)) {
        parts.push('Undgåelse brudt: eleven sidder sammen med en, der skulle undgås. '
            + 'Flyt den ene — en ny gruppedannelse retter det ikke, hvis gruppen er låst.');
    }
    if (isPicked(m)) {
        // Eleven ER allerede markeret, og det står FØRST: det er den tilstand,
        // hun er i lige nu. Uden den her gren stod der stadig "Klik for at
        // flytte eleven til en anden gruppe" oven på hende — og et klik mere
        // gør det stik modsatte: det FORTRYDER markeringen. Tippet ligger
        // desuden lige oven på det eneste navn, der er fremhævet på skærmen,
        // så den forkerte sætning var også den mest synlige.
        //
        // NAVNET STÅR MED, selvom det også står i rækken: tooltip.js flytter
        // enhver `title` over i `aria-label` (og overskriver et, skabelonen
        // selv har sat), så DEN HER sætning er rækkens navn for en
        // skærmlæser. Uden navnet ville rækken hedde "Markeret — vælg …",
        // og så var det ikke til at høre HVEM der er markeret.
        parts.push(`${info(m).name} er markeret — vælg "Flyt hertil" på en `
            + 'anden gruppe. Klik igen (eller tryk Esc) for at fortryde');
    } else if (isAbsent(m)) {
        // Nævn BEGGE veje: papirkurven er en slip-zone, og på en iPad eller
        // fra tastaturet er der ikke noget at trække med. Markeringen giver
        // "Meld fraværende" i elevens egen række (se .pick-actions nedenfor).
        parts.push('Markeret fraværende i elevlisten — træk eleven til papirkurven, '
            + 'eller klik og vælg "Meld fraværende", for at tage eleven ud af gruppen');
    } else if (!props.group.locked && parts.length === 0) {
        parts.push('Klik for at flytte eleven til en anden gruppe');
    }
    return parts.length ? parts.join(' · ') : null;
}

// --- Drag & Drop Handlers ---

function onDragOver(e) {
    if (props.group.locked) return;
    e.preventDefault();
    e.stopPropagation(); // vigtigt: hændelsen bliver her og bobler ikke videre
    
    if (!isDragOver.value) isDragOver.value = true;

    // Pladsen regnes ud fra musens højde i forhold til rækkerne — højst
    // ca. 30 gange i sekundet, så pladsholderen ikke ryster.
    const now = Date.now();
    if (now - lastDragUpdate.value > 30) {
        updateSwap(e.currentTarget, e.clientY);
        const idx = getInsertIndex(e.currentTarget, e.clientY, draggingMemberId.value);
        if (dragOverIndex.value !== idx) {
            dragOverIndex.value = idx;
        }
        lastDragUpdate.value = now;
    }
}

const lastDragUpdate = ref(0);

function onDragLeave(e) {
    const current = e.currentTarget;
    const related = e.relatedTarget;
    // Forlad kun, hvis vi virkelig forlod liste-beholderen
    if (related && (current.contains(related) || current === related)) {
        return;
    }
    isDragOver.value = false;
    dragOverIndex.value = -1;
    // Musen er ude af kortet: et byt her gælder ikke længere.
    if (isSwapHere.value) clearSwapTarget();
    resetDwell();
}

function onDrop(e) {
    if (props.group.locked) return;
    e.preventDefault();
    e.stopPropagation();

    // 1. Hent den endelige placering fra forhåndsvisningen.
    // Er dragOverIndex gyldig, bruges den. Ellers regnes den ud en sidste gang.
    let finalIndex = dragOverIndex.value;
    if (finalIndex === -1) finalIndex = getInsertIndex(e.currentTarget, e.clientY, draggingMemberId.value);

    // 2. Nulstil den lokale visning UMIDDELBART
    // Det fjerner forhåndsvisnings-posten med det samme, så UI'et ikke hakker
    isDragOver.value = false;
    dragOverIndex.value = -1;

    // 3. Udfør selve flytningen (et byt, hvis kortet viser et)
    dropOnGroup(props.group, finalIndex);
    resetDwell();

    // For en sikkerheds skyld: ryd den fælles træk-tilstand
    endDrag();
}
</script>

<template>
    <div ref="cardRef"
         class="group-card"
         :data-group-id="group.name"
         :data-locked="group.locked ? 'true' : 'false'"
         :class="{ locked: group.locked, 'drag-over': isDragOver && draggingMemberId !== null }">
        <!-- Kortets hoved -->
        <div class="group-header-row">
            <button class="lock-btn"
                    :title="group.locked ? 'Lås op' : 'Lås gruppe'"
                    :aria-label="`${group.locked ? 'Lås op' : 'Lås gruppe'} — ${displayName}`"
                    @click="toggleLock">
                <Lock v-if="group.locked" :size="14" />
                <Unlock v-else :size="14" />
            </button>
            <h4 class="group-title">{{ displayName }}</h4>
            <!-- Class has topic list → editable select (auto-assigned, but overridable) -->
            <select v-if="hasClassTopics"
                    aria-label="Emne for gruppen"
                    class="group-topic-input topic-badge-input compact-input topic-select"
                    :style="topicStyle"
                    :value="topicDisplay || ''"
                    :title="topicDisplay ? `${topicDisplay} — klik for at ændre emne` : 'Klik for at ændre emne'"
                    @change="onClassTopicChange">
                <option value="">— Intet emne —</option>
                <option v-for="t in classTopicList" :key="t" :value="t">{{ t }}</option>
            </select>
            <!-- Uden emner på klassen: et frit felt pr. gruppe -->
            <!-- Et matrixkort uden emne har intet at skrive i feltet (pladsholderen
                 "MATRIX" var kun et tomt felt, der lignede en fejl) -->
            <input v-else-if="!isMatrix || (topicValue && topicValue !== 'MATRIX')"
                   type="text"
                   aria-label="Emne for gruppen"
                   list="topics-datalist"
                   class="group-topic-input topic-badge-input compact-input"
                   :placeholder="isMatrix ? 'MATRIX' : '+ Emne'"
                   :value="topicValue"
                   :style="topicStyle"
                   :title="isMatrix ? 'Klik for at ændre emne' : 'Skriv emne (f.eks. Liberalisme)'"
                   @input="onTopicInput"
                   @focus="onTopicFocus"
                   @blur="onTopicBlur">
        </div>
        <p v-if="averages.length" class="group-average" :title="`Gruppens snit: ${averagesText}`">
            <span class="group-average-label">Snit</span>
            <span v-for="a in averages" :key="a.col" class="group-average-item">
                <span class="group-average-col">{{ a.col }}</span> {{ a.text }}
            </span>
        </p>
        <!-- Elevlisten -->
        <TransitionGroup
            name="list"
            tag="ul"
            class="group-members-list"
            :style="listDuration"
            :class="{ 'drag-over': isDragOver, empty: group.members.length === 0 }"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
            @drop="onDrop">
            <li v-for="member in membersWithPreview"
                :key="resolveMemberId(member)"
                :data-id="resolveMemberId(member)"
                :draggable="!group.locked && !isPreview(member)"
                :tabindex="(group.locked || isPreview(member)) ? null : 0"
                :role="isPicked(member) ? 'group' : ((group.locked || isPreview(member)) ? null : 'button')"
                :aria-pressed="(group.locked || isPreview(member) || isPicked(member)) ? null : 'false'"
                :class="{
                    ghost: isGhost(rowMember(member)),
                    absent: rowInfo(member).absent,
                    'avoid-conflict': isAvoidConflict(member) && !isSwapIncoming(member),
                    'placeholder-item': isPreview(member),
                    picked: isPicked(member),
                    'replay-moved': isReplayMoved(member),
                    'swap-target': isSwapTarget(member),
                    'swap-incoming': isSwapIncoming(member),
                    'just-swapped': isJustSwapped(member)
                }"
                :data-replay-kind="isReplayMoved(member) ? replayKind : null"
                :title="memberTitle(member)"
                @click="onMemberActivate(member, $event)"
                @keydown.enter.self.prevent="onMemberActivate(member, $event)"
                @keydown.space.self.prevent="onMemberActivate(member, $event)"
                @dragstart="!isPreview(member) && onDragStart($event, member)"
                @dragend="onDragEnd">
                <div class="member-name">
                    <ArrowLeftRight v-if="isSwapTarget(member)" :size="12" class="swap-icon" aria-hidden="true" />
                    <span class="member-name-text">{{ rowInfo(member).name }}</span>
                    <Ghost v-if="isGhost(rowMember(member))" :size="12" style="opacity: 0.6;" />
                    <UserMinus v-else-if="rowInfo(member).absent" :size="12" class="absent-icon" />
                    <!-- Undgåelsen gælder den trukne elevs plads NU — ikke den,
                         der er på vej hertil i et byt. -->
                    <ShieldX v-if="isAvoidConflict(member) && !isSwapIncoming(member)" :size="12" class="avoid-icon" />
                    <span v-for="(tag, ti) in rowInfo(member).originTags"
                          :key="'origin-' + ti"
                          class="badge-origin"
                          :style="tag.style">{{ tag.text }}</span>
                    <!-- Sidst: margin-inline-start: auto skubber den ud til
                         højre kant, og ikonerne skal blive ved navnet. -->
                    <span v-if="isSwapTarget(member)" class="swap-label">byt</span>
                </div>
                <div v-if="rowInfo(member).ruleTags.length > 0" class="student-tags">
                    <span v-for="(tag, ti) in rowInfo(member).ruleTags"
                          :key="ti"
                          class="student-tag"
                          :title="tag.title"><span class="tag-key">{{ tag.key }}</span><span class="tag-val">{{ tag.value }}</span></span>
                </div>
                <!-- Handlingerne på den markerede elev — i rækken hos hende,
                     ikke i en bred linje over hele gitteret.

                     HVORFOR HER: den brede linje stod øverst på skærmen, mens
                     eleven kunne være scrollet langt ned; læreren skulle op og
                     tilbage for at melde hende fraværende. Og linjen skubbede
                     alle kortene ned i samme øjeblik, hun klikkede — så det,
                     hun sigtede efter, flyttede sig.

                     Rækken er `role="group"` mens den er markeret, IKKE
                     `role="button"`: en knap må ikke have knapper indeni, og
                     så ville en skærmlæser ikke kunne nå de to her. Esc og et
                     klik på selve navnet fortryder stadig — se vagten i
                     onMemberActivate(). -->
                <div v-if="isPicked(member)" class="pick-actions">
                    <button class="pick-action-btn" @click="onExcludePickedHere">
                        <UserMinus :size="12" aria-hidden="true" />
                        Meld fraværende
                    </button>
                    <!-- Fortryd er kun et kryds. Ikke for at spare pynt: et
                         kort bliver aldrig smallere end ~341px (gitteret er
                         `minmax(340px, 1fr)`, og det rammer man på en
                         almindelig bærbar ved 3 spalter). Med ordet "Fortryd"
                         på var navn + knapper 14px for brede for rækken ved
                         et navn som "Rasmus Vestergaard", og knapperne faldt
                         ned på en linje for sig — den markerede elev blev
                         62px høj mod naboernes 30. Krydset er desuden den
                         TREDJE vej ud: Esc og et klik på navnet virker
                         stadig, så ingen sidder fast, hvis ikonet ikke
                         siger dem noget. Teksten står i `title`/`aria-label`. -->
                    <button class="pick-action-btn pick-action-cancel"
                            title="Fortryd markeringen (Esc)"
                            @click="onCancelPick">
                        <X :size="13" aria-hidden="true" />
                    </button>
                </div>
            </li>
        </TransitionGroup>

        <!-- Flyt hertil — den mus-frie vej. Vises kun mens en elev fra en anden
             gruppe er markeret, og kun på ulåste kort.

             HVORFOR DER IKKE STÅR ET NAVN PÅ KNAPPEN: den vises på ALLE de
             andre kort på én gang. På et hold med seks grupper stod elevens
             navn derfor fem-seks gange i fed på skærmen — og de fyldte
             bjælker havde højere kontrast end den markerede elev, som er
             præcis det, læreren skal kunne finde. Navnet står i linjen over
             kortene ("Karla Eriksen er markeret …"), så det er sagt én gang.
             `aria-label` beholder det fulde navn: en skærmlæser hopper fra
             knap til knap uden at have læst linjen ovenover, og "Flyt hertil"
             alene siger ikke hvem.

             LABEL-I-NAVN: navnet BEGYNDER med den synlige tekst. Sagde det
             bare "Flyt Karla Eriksen til Gruppe 1", indeholdt det ikke
             ordene på knappen — og så kan stemmestyring ikke ramme den:
             "klik Flyt hertil" finder ingenting (WCAG 2.5.3). -->
        <button
            v-if="canReceivePicked && !isReplaying && !isPreviewing"
            class="receive-picked-btn"
            :aria-label="`Flyt hertil — ${pickedMemberName} til ${displayName}`"
            @click="onReceivePicked">
            <CornerDownRight :size="13" aria-hidden="true" />
            Flyt hertil
        </button>

        <!-- Slet gruppe — vises kun, når gruppen er tom og ikke låst.
             Låsen gælder også sletningen: en tom, låst gruppe er en plads
             læreren har sat af, ikke en rest der kan ryddes væk. Se
             deleteGroup() i groupActions.js, hvor selve reglen står. -->
        <button
            v-if="group.members.length === 0 && !group.locked && !isReplaying && !isPreviewing"
            class="delete-group-btn"
            @click="deleteGroup(group.name)"
            title="Slet denne tomme gruppe">
            <Trash2 :size="12" />
            Slet gruppe?
        </button>
    </div>
</template>

<style scoped>
/* --- Kortets hoved ---
   Højde, luft, farver og skrift står i BetaGroupsTab.vue (kortet som et ark),
   som vinder over de scoped regler. */
.group-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.group-title {
    margin: 0;
    background: none;
    border: none;
    padding: 0;
    flex: 1;
    transition: color 0.2s;
}

/* --- Det kompakte kort --- */
/* Kortet er en lodret stak: hoved, navneliste, og nederst den knap der hører
   til tilstanden ("Flyt hertil" eller "Slet gruppe?").

   HVORFOR FLEX OG IKKE BLOCK: gitteret strækker alle kort i en række til
   samme højde, men med `display: block` flød knappen bare efter navnelisten.
   Et kort med fire elever fik derfor knappen 31 px OVER sin egen underkant,
   mens nabokortet med fem havde den flush — samme række, to knaphøjder, og
   et dødt hul under den ene. Med flex + `flex: 1` på listen bliver den
   overskydende højde listens, ikke et hul, og knapperne flugter på tværs af
   rækken. */
.group-card {
    display: flex;
    flex-direction: column;
}

/* --- Elevlisten --- */
.group-members-list {
    min-height: 40px;
    margin: 0;
    list-style: none;
    position: relative;
    /* Æder den plads gitteret strækker kortet med — se .group-card ovenfor. */
    flex: 1;
    transition: background-color 0.2s, min-height 0.2s;
}

.group-members-list li {
    /* Ikke fast højde: rækken skal kunne vokse, når tags wrapper ned under
       navnet. Med height: 24px lå navnene oven i hinanden. */
    min-block-size: 24px;
}

/* Fraværende elev der stadig står i gruppen. Dæmpet og med streg over
   navnet, så en udprintet eller aflæst gruppeliste ikke sender læreren ud
   efter en elev, der er meldt fraværende i elevlisten. */
.group-members-list li.absent .member-name-text {
    text-decoration: line-through;
    text-decoration-thickness: 1px;
}
.group-members-list li.absent {
    opacity: 0.55;
}
.absent-icon {
    color: var(--text-subtle);
    flex-shrink: 0;
}

/* Eleven sidder sammen med en, hun skulle undgå.
   Rød tekst OG et skjold-ikon — farven alene er ikke nok, når den skal
   kunne ses af en der ikke skelner rød fra grøn (WCAG 1.4.1). */
.group-members-list li.avoid-conflict .member-name-text {
    color: var(--color-error, oklch(0.55 0.20 27));
    font-weight: 600;
}
.avoid-icon {
    color: var(--color-error, oklch(0.55 0.20 27));
    flex-shrink: 0;
}
/* Fraværende OG i et brud: dæmpningen fra .absent gør advarslen svær at se,
   så den løftes tilbage. Undgåelsen er den vigtigste af de to. */
.group-members-list li.absent.avoid-conflict {
    opacity: 0.8;
}

/* Markeret elev (klik/tap/Enter) — venter på at blive flyttet */
.group-members-list li.picked {
    background: var(--primary-light);
    border: 1px solid var(--primary);
    border-radius: 4px;
    /* Kanten er 1px, som placeholderen: uden fradraget hopper linjen 2px. */
    padding: 2px 5px;
    font-weight: 600;
}

/* Handlingerne inde i den markerede række.
   `margin-inline-start: auto` skubber dem ud til højre kant af rækken;
   <li> er allerede flex med `flex-wrap`, så de falder ned på deres egen linje
   i et smalt kort i stedet for at klemme navnet. */
.pick-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-inline-start: auto;
    flex-shrink: 0;
}

/* Navnet har normalt `flex: 1 1 55%` — det skal fylde rækken ud, så et langt
   navn ikke ombrydes. Men netop dét grundmål (55% af kortet) plus knapperne
   var bredere end rækken, så knapperne faldt ned på en linje for sig og gjorde
   den markerede elev dobbelt så høj som naboerne. Mens rækken er markeret,
   tager navnet kun sin egen bredde, og knapperne står ved siden af det.
   Ombrydningen er stadig i behold som reserve på et smalt kort. */
.group-members-list li.picked .member-name {
    flex: 0 1 auto;
}

/* Knapperne er 30px høje og ikke de 44px, DESIGN.md sætter som touch-mål.
   Det er et bevidst bytte: rækken er 24px, og to 44px-knapper ville gøre den
   markerede elev dobbelt så høj som alle de andre og skubbe resten af gruppen
   ned. 30×~120px er stadig et stort mål for en finger — bredden bærer det —
   og den store, mus-frie handling ("Flyt hertil") holder sine 44px. */
/* Teksten er --text-main og IKKE --primary. Målt i mørkt tema: blå tekst på
   den blå markerings-tone gav 2,45:1 — under halvdelen af de 4,5:1, WCAG
   kræver for 11px, og dårligere end appens egen accent-tekst i øvrigt ligger
   på (~3,3:1). Knappen sidder jo netop oven på den ENE række, der er farvet.
   Accenten bliver i kanten, i ikonet og i hover-fladen; det er rigeligt til
   at vise, at det er en knap. Med --text-main er den 14:1 i mørkt og 13:1 i
   lyst tema. */
.pick-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-block-size: 30px;
    /* 6px og ikke 9px. Gitteret er `minmax(340px, 1fr)`, så et kort bliver
       aldrig smallere end ~341px — og dét rammer man på en ganske almindelig
       bærbar (1126px bredde giver 3 spalter à 341px). Dér var navn + knapper
       10px for brede for rækken, så knapperne faldt ned på en linje for sig
       og gjorde den markerede elev 62px høj mod naboernes 30. De 6px henter
       12px hjem og holder det almindelige tilfælde på én linje. Ombrydningen
       bliver stående som reserve til de rigtigt lange navne. */
    padding-inline: 6px;
    border: 1px solid var(--primary-border);
    border-radius: 6px;
    background: var(--bg-surface);
    color: var(--text-main);
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.pick-action-btn:hover {
    background: var(--primary);
    border-color: var(--primary);
    color: white;
}

/* "Fortryd" er den stille af de to: den ene tager eleven UD af gruppen, den
   anden annullerer bare. Ens knapper side om side er en dårlig plads at gætte
   på. */
.pick-action-cancel {
    border-color: transparent;
    background: transparent;
    color: var(--text-muted);
    /* Kvadratisk uden tekst — ellers bliver krydset klemt ind i 12px. */
    padding-inline: 0;
    inline-size: 28px;
    justify-content: center;
}
.pick-action-cancel:hover {
    background: var(--bg-surface-hover);
    border-color: var(--border-medium);
    color: var(--text-main);
}

/* "Flyt hertil" — sidder flush i bunden af kortet som "Slet gruppe?"-knappen.
   Se .group-card ovenfor for hvorfor kortet er flex: uden det havde knappen
   forskellig højde fra kort til kort i den samme række.

   HVORFOR DEN ER DÆMPET: den er ikke ét kald til handling — den står på alle
   de andre kort samtidig. Fem-seks fyldte, blå bjælker råbte højere end den
   markerede elev og gjorde skærmen urolig i netop det øjeblik, hvor læreren
   skal kunne se hvem hun har fat i. Derfor tegnes den som en MÅLZONE: en
   stiplet kant og accentfarvet tekst på kortets egen bund. Først når musen
   eller tastaturfokus er på den, fyldes den helt — så er der ingen tvivl om,
   hvor eleven lander. */
.receive-picked-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    inline-size: 100%;
    /* 44px høj: touch-målet fra DESIGN.md — knappen findes netop for
       tavle-pc'er og iPads, hvor et 24px-mål ikke kan rammes. */
    min-block-size: 44px;
    padding-block: 7px;
    border: none;
    border-block-start: 1px dashed var(--primary-border);
    border-radius: 0 0 var(--radius-md) var(--radius-md);
    background: transparent;
    color: var(--primary);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
    letter-spacing: 0.02em;
}
.receive-picked-btn:hover,
.receive-picked-btn:focus-visible {
    background: var(--primary);
    border-block-start-color: var(--primary);
    color: white;
}

/* Pladsholderen — hvor eleven lander */
.placeholder-item {
    opacity: 0.5;
    background: var(--primary-bg-subtle);
    border: 1px dashed var(--primary-border);
    pointer-events: none;
}

/* Emnefeltet i kortets hoved */
/* Kant, flade og farve står i BetaGroupsTab.vue (emnet som tekst). */
.compact-input {
    height: 28px;
    padding: 0 10px;
    font-size: 11px;
    transition-property: var(--ctl-transition);
    transition-duration: 0.2s;
}

/* `background`-genvejen er ikke kun farven: den fjerner også emnevælgerens
   pil (background-image), mens feltet har fokus. */
.compact-input:focus {
    background: var(--bg-input-focus);
    outline: none;
}

/* Gruppens snit pr. Balancér-kolonne — én stille linje under overskriften.
   Skjules med Tags-knappen (`.hide-tags .group-average` i style.css). Lange
   kolonnenavne må bryde linjen; tallet står altid ved sit navn. */
.group-average {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 10px;
    row-gap: 2px;
    margin: 0;
    padding-block: 4px;
    padding-inline: 10px;
    border-block-end: 1px solid var(--border-light);
    font-size: 11px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
}

.group-average-label {
    font-weight: 600;
}

.group-average-item {
    overflow-wrap: anywhere;
    min-inline-size: 0;
}

.group-average-col {
    color: var(--text-tag);
}

/* Emnevælgeren — ligner et mærke, uden browserens egen ramme */
.topic-select {
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
    font-weight: 600;
    padding-inline-end: 18px; /* plads til pilen, der er tegnet som baggrund */
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='currentColor' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 6px center;
    /* Mærket er højst 140px (.topic-badge-input), og emner må være 60 tegn.
       Et langt emne blev klippet midt i et ord ("Globalisering og inte");
       nu får det "…", og hele emnet står i tippet (title ovenfor). */
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
}
.topic-select:hover {
    filter: brightness(0.95);
}

/* --- Træk-og-slip: kortet, eleven lander i, lyser op ---
   Klassen sidder på KORTET og sættes kun under et elevtræk (se skabelonen).
   Før stod den kun på listen indeni, og så ramte reglerne her og i
   style.css aldrig noget: pladsholderen var det eneste tegn på, hvor eleven
   ville lande. Ingen transform: et kort, der skalerer under musen, flytter de
   rækker, getInsertIndex() måler pladsen ud fra. Tonen og stregen foroven
   står i BetaGroupsTab.vue (`.group-card.drag-over`). */
.group-card.drag-over {
    z-index: 10;
}

.group-members-list.drag-over li {
    pointer-events: none;
}

/* --- Byt to elever ---
   Eleven, der byttes med: blå ramme og to pile, samme blå som målkortet.
   På den trukne elevs plads: den andens navn med stiplet kant. Efter
   slippet: begge rækker grønne et øjeblik (justSwappedIds i useDragDrop). */
.group-members-list li.swap-target {
    outline: 2px solid var(--primary);
    outline-offset: -1px;
    border-radius: 6px;
    background: var(--primary-bg-subtle);
    color: var(--primary);
}

.swap-icon { flex-shrink: 0; }

.swap-label {
    margin-inline-start: auto;
    font-size: 11px;
    font-weight: 600;
}

.group-members-list li.swap-incoming {
    outline: 1px dashed var(--primary);
    outline-offset: -1px;
    border-radius: 6px;
    color: var(--primary);
}

.group-members-list li.just-swapped {
    outline: 2px solid var(--color-success);
    outline-offset: -1px;
    border-radius: 6px;
    background: var(--color-success-bg);
}

/* ─── Afspilning: de to der lige byttede plads ──────────────────────────── */
/* Uden fremhævningen er en gentegning af 30 kort bare et flimmer, hvor man
   ikke kan se HVAD der skete. Farven bærer forklaringen: grøn = motoren gjorde
   grupperne bedre, ravgul = den gjorde det værre med vilje for at komme ud af
   en blindgyde. Næsten halvdelen af bytterne er den sidste slags. */
.group-members-list li.replay-moved {
    outline: 2px solid var(--color-success);
    outline-offset: 1px;
    border-radius: 6px;
    background: var(--color-success-bg);
}

.group-members-list li.replay-moved[data-replay-kind="1"] {
    outline-color: var(--color-warning);
    background: var(--color-warning-bg);
}

.group-members-list li.replay-moved[data-replay-kind="2"],
.group-members-list li.replay-moved[data-replay-kind="3"],
.group-members-list li.replay-moved[data-replay-kind="4"] {
    outline-color: var(--text-link);
    background: var(--surface-tint);
}

/* --- Navnene glider på plads (Vues TransitionGroup) --- */
.list-move,
.list-enter-active,
.list-leave-active {
    transition: all var(--list-dur, 0.25s) cubic-bezier(0.18, 0.89, 0.32, 1.28);
}

.list-enter-from,
.list-leave-to {
    opacity: 0;
    transform: scale(0.8);
}

.list-leave-active {
    display: none;
}

/* Tom gruppe — stiplet felt at slippe på */
.group-members-list.empty {
    border: 1.5px dashed var(--border-medium);
    border-radius: 0 0 var(--radius-md) var(--radius-md);
    background: var(--bg-surface);
    min-block-size: 32px;
}

/* Slet-knappen — stille rød, nederst i et tomt kort */
.delete-group-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    inline-size: 100%;
    padding-block: 7px;
    border: none;
    border-block-start: 1px solid var(--border-subtle);
    border-radius: 0 0 var(--radius-md) var(--radius-md);
    background: none;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    letter-spacing: 0.02em;
}
.delete-group-btn:hover {
    background: oklch(0.94 0.08 27 / 50%);
    color: oklch(0.45 0.18 27);
}
</style>
