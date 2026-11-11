<script setup>
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { UI_NAMES } from '../../js/modules/beta.js';
import { reactiveState } from '../../js/modules/reactiveState.js';
import GroupCard from './GroupCard.vue';
import { modalActions } from '../../js/modules/modalState.js';
import * as groupActions from '../../js/modules/groupActions.js';
import { addEmptyGroup } from '../../js/modules/groupActions.js';
import ShareMenu from './ShareMenu.vue';
import SaveMenu from '../beta/SaveMenu.vue';
import { Tag, Clipboard, ClipboardPaste, Save, Users, Shuffle, UserPlus, Lock, Trash2, Grid2x2Plus, History, Share2, ChevronDown, Clapperboard } from 'lucide-vue-next';
import { isDragging, dropOnTrash, pickedMemberId, pickedMemberName, cancelPickUp } from '../../composables/useDragDrop.js';
import { isModalOpen } from '../../composables/useModalFocus.js';
import { hasRuns, previewRunGroups } from '../../js/modules/runHistory.js';
import RunHistoryMenu from './RunHistoryMenu.vue';
import ReplayMenu from './ReplayMenu.vue';
import * as replay from '../../js/modules/replay.js';
import { homeGroupFingerprint } from '../../js/modules/utils.js';
import { groupNumberOf } from '../../js/modules/nextEngine.js';

const props = defineProps({
    isMatrix: { type: Boolean, default: false },
    idColumn: { type: String, required: true }
});


// Findes der stamgrupper? Matrixens tomme felt sagde altid "Generér
// stamgrupper først" — også når de fandtes, og matrixen fx ikke kunne dannes,
// fordi en stamgruppe var fraværende. Så pegede teksten på et skridt, læreren
// allerede havde taget.
const hasStandardGroups = computed(() => (reactiveState.storedStandardGroups || []).length > 0);

// De grupper der gælder lige nu — stam eller matrix, alt efter visningen.
const groups = computed(() => {
    if (props.isMatrix) return reactiveState.storedMatrixGroups || [];
    return reactiveState.storedStandardGroups || [];
});

const hasGroups = computed(() => groups.value.length > 0);
// Er hver eneste synlige gruppe låst? Styrer både teksten og farven på
// "Lås alle / Lås alle op". Læste før reactiveState.isLocked, som ikke findes,
// så knappen aldrig viste den faktiske låsetilstand.
const allLocked = computed(() => groups.value.length > 0 && groups.value.every(g => g.locked));

// Visningens regler — stamgruppernes eller matrixens.
const viewRules = computed(() => {
    const cls = reactiveState.currentClass;
    if (!cls) return [];
    return (props.isMatrix ? cls.matrixRules : cls.rules) || [];
});

// De kolonner, reglerne står på — dem er det, mærkaterne på kortene viser.
const activeRuleColumns = computed(() => {
    const cols = [];
    viewRules.value.forEach(r => {
        if (r.column && !cols.includes(r.column)) cols.push(r.column);
    });
    return cols;
});

// Kolonnerne under Balancér-reglerne — alle, ikke kun den første: flere
// Balancér-regler virker på én gang (se GroupCard's `averages`).
const balanceColumns = computed(() => {
    const cols = [];
    for (const r of viewRules.value) {
        if (r.type === 'balance' && r.column && !cols.includes(r.column)) cols.push(r.column);
    }
    return cols;
});

// Vis/skjul mærkater
const showTags = computed(() => reactiveState.showGroupTags);

// Del-menuen: udskrift og Excel. Den lukker selv, når man klikker eller
// tabber væk fra den (useBarMenuDismiss) — også når en af de andre menuer på
// bjælken åbnes — så den behøver ikke kende dem.
const shareMenuOpen = ref(false);

function toggleShareMenu() {
    shareMenuOpen.value = !shareMenuOpen.value;
}

// Beta: Gem-menuen (to slags gem bag én knap). Lukker selv ved klik udenfor.
const saveMenuOpen = ref(false);

function toggleSaveMenu() {
    saveMenuOpen.value = !saveMenuOpen.value;
}

function toggleTags() {
    groupActions.toggleTags();
}

function onCopy() {
    groupActions.copyGroupsToClipboard();
}

function onSaveCol() {
    groupActions.handleSaveAsColumn();
}

function onSaveSession() {
    modalActions.openSaveSession();
}

function onAddLatecomer() {
    modalActions.openLatecomer();
}

// Gendan grupper fra en tidligere kopieret liste eller fra en gemt kolonne.
// Altid STAMgrupperne — matrixen dannes på tværs af dem og markeres forældet.
function onRestoreGroups(tab = 'text') {
    modalActions.openRestoreGroups(tab);
}

// Slået fra mens en kørsel er i gang — samme grund som Generér-knappen, men
// en anden fejl: gendannelsen ville lykkes, og så ville motorens resultat
// lande BAGEFTER og overskrive den i stilhed (`activeJobId` peger stadig på
// den kørsel, så stale-vagten i generation.js lader den passere). Den
// allerførste generering er netop tilfældet, hvor knappen står i tom-
// tilstanden og er lige ved hånden. Vil man alligevel, er vejen at stoppe
// kørslen først.
const canRestore = computed(() => !reactiveState.isGenerating);

function onGlobalLock() {
    groupActions.handleGlobalLock();
}

// Kørselshistorik. Knappen er slået fra, indtil der ER en tidligere kørsel —
// efter den allerførste generering er der ikke noget at gå tilbage til, og en
// tom popup ville bare være en blindgyde. Vi læser reactiveState direkte, så
// computed'en genberegnes, når stakken ændrer sig.
const canGoBack = computed(() => {
    void reactiveState.storedStandardGroups;
    // Matrixgrupperne SKAL med som afhængighed. En matrix-generering lægger
    // også en kørsel i stakken, men rører kun storedMatrixGroups — uden den
    // her blev computed'en aldrig regnet om, og knappen stod grå med
    // "Ingen tidligere kørsler endnu", selvom der lå kørsler at gå tilbage til.
    void reactiveState.storedMatrixGroups;
    void reactiveState.currentClass;
    return hasRuns();
});

const menuOpen = ref(false);

function onRunHistory() {
    menuOpen.value = !menuOpen.value;
}

// ─── Hvilke grupper der TEGNES ──────────────────────────────────────────────
// Normalt de rigtige. Holder læreren musen over en tidligere kørsel i
// historik-menuen, tegnes DEN kørsels grupper i stedet — i de samme kort, så
// man kan se forskellen på stedet i stedet for i en lille liste ved siden af.
// Intet gemmes; state.previewRunIndex nulstilles når musen forlader menuen.
const isPreviewing = computed(() => reactiveState.previewRunIndex !== null);

// Afspilningen af en optaget kørsel — samme princip som forhåndsvisningen
// ovenfor: kortene tegner et ANDET billede, mens intet af det rigtige
// ændres. Stopper afspilningen, falder de tilbage af sig selv.
//
// Rækkefølgen betyder noget: en afspilning er noget læreren har startet
// aktivt, en forhåndsvisning er bare musen der hviler i historik-menuen.
// Derfor vinder afspilningen.
// Forrige billedes kort: gruppenavn → { source, key, card }.
//
// HVORFOR: et bytte flytter to elever, men billedet bygges forfra hver gang.
// Fik alle kort et nyt gruppe-objekt, tegnede alle 75 kort (300 elever) sig
// om ved hvert bytte, og det holdt en langsom computer travl hele
// afspilningen (se replayMark i GroupCard.vue). Et kort, hvis elever er de
// samme som i forrige billede, får derfor SAMME objekt igen, og så lader Vue
// det være. Kun en hukommelse til næste billede — intet gemmes.
let lastReplayCards = new Map();

const replayGroups = computed(() => {
    const r = reactiveState.replay;
    // Skifter læreren visning midt i en afspilning, hører optagelsen ikke til
    // de kort, der nu står på skærmen (isReplaying er falsk). Så tegner vi den ikke.
    if (!isReplaying.value || !r.seating.length) {
        lastReplayCards = new Map();
        return null;
    }

    const locked = new Set(r.lockedGroups);
    const real = groups.value;
    const byName = new Map(real.map(g => [g.name, g]));
    const nextCards = new Map();

    // De låste grupper stod uden for hele kørslen og skal stå helt stille.
    const frames = r.seating.map((members, i) => {
        const name = r.groupNames[i] || `Group ${i + 1}`;
        const source = byName.get(name);
        // Spøgelseseleverne er motorens egne pladsholdere. De er med i
        // optagelsen, så hvert bytte er en ombytning af to — men de er
        // ikke elever, og de tegnes ikke.
        const shown = members.filter(m => !String(m).startsWith(r.phantomPrefix));
        const key = shown.join('\u0001');
        const before = lastReplayCards.get(name);
        const card = (before && before.source === source && before.key === key)
            ? before.card
            : { ...(source || {}), name, members: shown };
        nextCards.set(name, { source, key, card });
        return card;
    });
    lastReplayCards = nextCards;

    // Mens der deles ud, tegnes en gruppe først, når den har fået sin første
    // elev. Ellers stod der seks tomme kasser og ventede, og man kunne ikke
    // se fordelingen tage form.
    //
    // ÆRLIGT FORBEHOLD: motoren regner antallet af grupper ud FØRST og deler
    // derefter ud i dem — de tomme grupper findes altså allerede. Kortet
    // dukker op, når gruppen får sit første medlem, hvilket er det, man kan
    // se. Efter uddelingen vises alle, også en gruppe der endte tom.
    const duringDeal = r.frameIndex < r.dealCount;
    const visible = duringDeal ? frames.filter(g => g.members.length > 0) : frames;

    const lockedCards = real.filter(g => locked.has(g.name));
    const num = (name) => groupNumberOf(name) ?? 999999;
    return [...lockedCards, ...visible].sort((a, b) => num(a.name) - num(b.name));
});

// De grupper, kortene tegner: afspilningens billede, en forhåndsvist kørsel
// eller de rigtige grupper — i den rækkefølge.
const shownGroups = computed(() => {
    if (replayGroups.value) return replayGroups.value;
    if (isPreviewing.value) {
        const g = previewRunGroups(reactiveState.previewRunIndex, props.isMatrix);
        if (g) return g;
    }
    return groups.value;
});

// ─── Afspilning af kørslen ──────────────────────────────────────────────────
const rp = computed(() => reactiveState.replay);

// Under en afspilning er kortene et billede, ikke noget man kan rette i —
// præcis som ved forhåndsvisningen af en tidligere kørsel. Uden det kunne
// læreren nå at slette en gruppe eller flytte en elev i en fordeling, der
// forsvinder i samme øjeblik, afspilningen går videre.
// Kun sand for DEN visning, afspilningen hører til. Ellers ville et skift til
// matrix midt i en stam-afspilning låse matrixkortene, uden at der var noget
// at se.
const isReplaying = computed(() =>
    !!reactiveState.replay && reactiveState.replay.view === viewKey.value);

// Et tryk et vilkårligt sted, mens afspilningen kører, holder kortene låst,
// til fingeren eller musen slippes. Det er trykket i afspilningens billede,
// der betyder noget; et tryk i afspilleren selv koster intet, for kortene er
// låst i forvejen.
//
// HVORFOR: trykket uden for afspilleren lukker den (ReplayMenu), og så skifter
// kortene i samme øjeblik fra billedet til de rigtige grupper — mens musen
// stadig er nede. Målt 3/11 midt i uddelingen: læreren greb Jens i billedet,
// og Chromium og WebKit trak i stedet den elev, der sad på pladsen i de
// RIGTIGE grupper (Bob, David), over i en anden gruppe. En elev, læreren
// aldrig rørte, blev flyttet. Firefox startede intet træk.
//
// Låsen slippes først et tik efter pointerup, så klikket, der følger lige
// efter, heller ikke rammer et kort, læreren ikke kunne se.
const holdUntilRelease = ref(false);
let releaseTimer = null;
function onPointerDownDuringReplay() {
    if (isReplaying.value) holdUntilRelease.value = true;
}
function onPointerRelease() {
    if (!holdUntilRelease.value) return;
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => { holdUntilRelease.value = false; }, 0);
}
// I capture-fasen: lytteren skal se afspilningen FØR menuens egen lytter
// lukker den.
onMounted(() => {
    document.addEventListener('pointerdown', onPointerDownDuringReplay, true);
    document.addEventListener('pointerup', onPointerRelease, true);
    document.addEventListener('pointercancel', onPointerRelease, true);
});
onUnmounted(() => {
    clearTimeout(releaseTimer);
    document.removeEventListener('pointerdown', onPointerDownDuringReplay, true);
    document.removeEventListener('pointerup', onPointerRelease, true);
    document.removeEventListener('pointercancel', onPointerRelease, true);
});

// Rul det, der lige skete, ind i billedet.
//
// HVORFOR: opdaget først, da afspilningen kunne ses køre rigtigt. På en smal
// skærm er gruppekortene en lang søjle, og de to elever der byttede, lå tit
// uden for billedet — animationen viste noget, man skulle lede efter.
//
// `block: 'nearest'` er hele pointen: er eleven allerede synlig, sker der
// INTET. Kun når hun er uden for billedet, rulles der, og kun så langt som
// nødvendigt. Ellers ville hvert eneste bytte rykke siden, og 196 bytter i
// træk ville være uudholdeligt.
//
// Øjeblikkeligt, ikke blødt: ved 60 ms pr. bytte ville en blød rulning aldrig
// nå frem, før den næste begyndte.
//
// BEGGE, ikke bare den ene: et bytte ER to elever, der skifter plads. Ses kun
// den ene, er halvdelen af historien væk. Kan de to ikke være i billedet
// samtidig, vises den første — så er der da noget at se på, og statuslinjen
// nævner dem begge ved navn.
//
// TO TING MÅLES, ikke gættes — begge fundet ved at se afspilningen køre:
//
// 1) HVEM der ruller. Siden selv kan ikke rulle (`scrollHeight` er lig
//    `innerHeight`); gruppekortene ligger i en indre beholder med sin egen
//    rulning. `window.scrollBy` gjorde derfor bogstaveligt ingenting.
// 2) HVOR meget der er dækket. Det faste bånd foroven og afspilleren forneden
//    ligger OVEN PÅ beholderen, så dens synlige felt er mindre end den selv
//    tror. Med 90 og 260 skrevet i hånden blev båndet 348 px i et smalt
//    panel — smallere end to gruppekort.
function scrollParent(el) {
    let p = el.parentElement;
    while (p && p !== document.body) {
        const st = getComputedStyle(p);
        if (/(auto|scroll)/.test(st.overflowY) && p.scrollHeight > p.clientHeight + 1) return p;
        p = p.parentElement;
    }
    return null;
}

watch(() => reactiveState.replay && reactiveState.replay.frameIndex, async () => {
    if (!reactiveState.replay) return;
    await nextTick();
    const els = [...document.querySelectorAll('.group-grid li.replay-moved')];
    if (!els.length) return;

    const scroller = scrollParent(els[0]);
    if (!scroller) return;   // alt er i billedet i forvejen — intet at rulle

    const gap = 12;
    const box = scroller.getBoundingClientRect();
    const header = document.querySelector('.settings-panel, .create-topbar');
    const footer = document.querySelector('.replay-menu') || document.querySelector('.floating-action-bar');
    const bandTop = Math.max(box.top, header ? header.getBoundingClientRect().bottom : 0) + gap;
    const bandBottom = Math.min(box.bottom, footer ? footer.getBoundingClientRect().top : box.bottom) - gap;
    if (bandBottom <= bandTop) return;

    const rects = els.map(e => e.getBoundingClientRect());
    const pairTop = Math.min(...rects.map(r => r.top));
    const pairBottom = Math.max(...rects.map(r => r.bottom));

    if (pairBottom - pairTop > bandBottom - bandTop) {
        // For langt fra hinanden til at være i billedet samtidig. Så centreres
        // den første — der er da noget at se på, og statuslinjen nævner dem
        // begge ved navn.
        scroller.scrollTop += rects[0].top - (bandTop + bandBottom) / 2;
        return;
    }
    // Ellers: rul kun hvis parret stikker ud, og kun så langt som nødvendigt.
    // Er de allerede i billedet, sker der INTET — ellers ville hvert eneste
    // af 200 bytter rykke siden.
    if (pairTop < bandTop) scroller.scrollTop += pairTop - bandTop;
    else if (pairBottom > bandBottom) scroller.scrollTop += pairBottom - bandBottom;
});

// Forsvinder panelet, stopper afspilningen. Afspilleren er en del af panelet,
// og en afspilning der kører videre usynligt kan man hverken se eller stoppe.
//
// HVORFOR: browserens Tilbage (knappen, et swipe, Alt+← / ⌘[) sender intet tryk
// og intet fokus ind i siden, så afspilleren lukkede sig aldrig selv. Målt 3/11:
// Tilbage og Frem igen, og Grupper viste afspilningens billede (ét kort med tre
// elever), kortene var låst, og der var ingen afspiller at stoppe den med.
//
// Det dækker også skiftet mellem stamgrupper og matrix: BetaGroupsTab skifter
// opskriften med `<component :is>`, og panelet står i dens slot, så det bliver
// monteret om. Før stod her en `watch` på `isMatrix`, men den fyrede aldrig
// (målt 3/11) — det gamle panel får aldrig den nye værdi, det bliver fjernet.
onUnmounted(() => replay.stop());

// Gruppekortenes egen overgang varer et halvt sekund. Under en afspilning
// dukker kortene op i takt med uddelingen, så den skal følge hastigheden —
// samme afvejning som medlemslistens `--list-dur` i GroupCard.vue. Loftet er
// den halve sekund, den er tegnet til; gulvet er 40 ms, så bevægelsen ikke
// forsvinder helt.
const gridDuration = computed(() => {
    const r = reactiveState.replay;
    if (!r) return null;
    return { '--group-list-dur': `${Math.max(40, Math.min(500, r.speed))}ms` };
});

// Optagelsen findes kun i hukommelsen (se state.js), og den hører til DE
// grupper, den dannede. Har læreren flyttet en elev i hånden siden, ville
// afspilningen køre hen mod en placering, kortene ikke har — så siger vi fra
// i stedet.
const viewKey = computed(() => (props.isMatrix ? 'matrix' : 'standard'));
const recording = computed(() => reactiveState.lastRecording[viewKey.value]);

const recordingMatches = computed(() => {
    if (!recording.value) return false;
    return homeGroupFingerprint(groups.value)
        === reactiveState.lastRecordingFingerprint[viewKey.value];
});

const canReplay = computed(() => !!recording.value);

const replayBlockedReason = computed(() => {
    if (!recording.value) return null;
    if (recordingMatches.value) return null;
    return 'Grupperne er ændret, siden optagelsen blev lavet.';
});

function startReplay() {
    const rec = recording.value;
    // Dobbelttjekket er ikke overflødigt, selv om knappen er slået fra: der går
    // et øjeblik fra menuen tegnede sig, til der klikkes, og i det øjeblik kan
    // en elev være flyttet.
    if (!rec || !recordingMatches.value) return;
    replay.start(rec.data, rec.groupNames, rec.lockedGroups, viewKey.value);
}

const replayMenuOpen = ref(false);

function toggleReplayMenu() {
    // Går IKKE gennem en simpel !open: lukningen skal også stoppe
    // afspilningen. Uden det blev kortene stående på det billede, afspilningen
    // var nået til — uden knapper til at komme videre eller tilbage.
    if (replayMenuOpen.value) return closeReplayMenu();
    replayMenuOpen.value = true;
}

// Lukkes menuen, stopper afspilningen med. Ellers ville den køre videre uden
// noget sted at aflæse, hvor den er — og kortene ville blive ved med at vise
// et billede, læreren ikke længere kan styre.
function closeReplayMenu() {
    replay.stop();
    replayMenuOpen.value = false;
}

// ─── Markering: fortryd med Escape ──────────────────────────────────────────
// Har læreren markeret en elev (klik/tap/Enter) uden at ville flytte hende,
// skal Escape kunne fortryde. Er der et modalvindue åbent, ejer det tasten —
// ModalsRoot lytter på samme event, og uden tjekket ville ét Escape-tryk
// både lukke vinduet og rydde markeringen.
function onEscapeCancelPick(e) {
    if (e.key !== 'Escape') return;
    if (!pickedMemberId.value) return;
    // Er et modalvindue eller en åben skuffe ovenpå, ejer DEN tasten. Alle
    // lytter på document, så uden tjekket ville ét tryk lukke to ting på én
    // gang (stopPropagation hjælper ikke mellem lyttere på samme element).
    // Vinduerne spørges gennem `isModalOpen()` og ikke med et klasse-opslag:
    // Undgåelser-vinduet hedder ikke `.modal-overlay`.
    if (isModalOpen()) return;
    if (document.querySelector('.rule-drawer-popover, .topic-drawer-popover')) return;
    cancelPickUp();
}
onMounted(() => document.addEventListener('keydown', onEscapeCancelPick));
onUnmounted(() => document.removeEventListener('keydown', onEscapeCancelPick));

// Papirkurven
const trashActive = ref(false);

// Stopper et træk hvor som helst på siden, skal papirkurven holde op med at
// lyse — også når slippet aldrig ramte den.
watch(isDragging, (ongoing) => {
    if (!ongoing) {
        trashActive.value = false;
    }
});

// Papirkurven uden mus ligger nu i elevens egen række på gruppekortet
// (`onExcludePickedHere()` i GroupCard.vue) — slip-zonen her kan hverken
// tappes på en iPad eller nås fra tastaturet, så den må have en tvilling.

function onTrashDragOver(e) { e.preventDefault(); trashActive.value = true; }
function onTrashDragLeave() { trashActive.value = false; }
function onTrashDrop(e) {
    e.preventDefault();
    trashActive.value = false;
    dropOnTrash(props.idColumn);
}
</script>

<template>
    <div class="results-panel">

          <div>
            <!-- Status for markeret elev — KUN for skærmlæsere.
                 Se .pick-status i stylesheetet for hvorfor den ikke længere
                 tegnes på skærmen. -->
            <div class="pick-status" role="status" aria-live="polite">
                <template v-if="pickedMemberId">
                    {{ pickedMemberName }} er markeret — vælg "Flyt hertil"
                    nederst på et andet gruppekort, eller brug "Meld fraværende"
                    og "Fortryd" i elevens egen række. Esc fortryder.
                </template>
            </div>
            <!-- Ét gitter for begge visninger. :key skifter med visningen, så
                 gitteret bygges forfra ved et skift (som før, da der stod to).
                 id'erne bruges af stilarket og e2e-testene. -->
            <TransitionGroup
                 name="group-list"
                 tag="div"
                 :key="viewKey"
                 :id="isMatrix ? 'matrix-display' : 'groups-display'"
                 class="group-grid"
                 :inert="isPreviewing || isReplaying || holdUntilRelease"
                 :style="gridDuration"
                 :class="{ 'hide-tags': !showTags, isPreviewing }">
                <!-- Tælles på DE grupper der tegnes, ikke på den rigtige
                     tilstand: under en forhåndsvisning af en kørsel uden
                     grupper i denne visning er gitteret tomt, og uden den her
                     linje stod læreren med en blank skærm uden en forklaring. -->
                <div v-if="shownGroups.length === 0 && !isMatrix" key="placeholder_std" class="empty-state">
                    <Users :size="48" style="opacity:0.3;" />
                    <template v-if="isReplaying">
                        <strong>Klar til at dele ud</strong>
                        <span>Grupperne dukker op, efterhånden som motoren lægger eleverne.</span>
                    </template>
                    <template v-else-if="isPreviewing">
                        <strong>Ingen stamgrupper i denne kørsel</strong>
                        <span>Kørslen havde kun matrixgrupper.</span>
                    </template>
                    <template v-else>
                        <strong>Ingen grupper endnu</strong>
                        <span>Vælg dine regler i gruppeopskriften og tryk <strong>{{ UI_NAMES.generate }}</strong>.</span>
                        <button class="empty-restore-btn" @click="onRestoreGroups('column')"
                                :disabled="!canRestore">
                            <ClipboardPaste :size="13" />
                            <span>Eller gendan grupper du har brugt før</span>
                        </button>
                    </template>
                </div>
                <div v-else-if="shownGroups.length === 0" key="placeholder_mtx" class="empty-state">
                    <Shuffle :size="48" style="opacity:0.3;" />
                    <template v-if="isReplaying">
                        <strong>Klar til at dele ud</strong>
                        <span>Matrixgrupperne dukker op, efterhånden som motoren lægger eleverne.</span>
                    </template>
                    <template v-else-if="isPreviewing">
                        <strong>Ingen matrix i denne kørsel</strong>
                        <span>Kørslen havde kun stamgrupper. Henter du den frem, forsvinder matrixen på skærmen.</span>
                    </template>
                    <template v-else-if="hasStandardGroups">
                        <strong>Ingen matrixgrupper endnu</strong>
                        <span>Tryk <strong>{{ UI_NAMES.generateMatrix }}</strong> for at danne matrixgrupper på tværs af stamgrupperne.</span>
                    </template>
                    <template v-else>
                        <strong>Ingen matrixgrupper endnu</strong>
                        <span>Dan stamgrupperne først med <strong>{{ UI_NAMES.generate }}</strong>, skift derefter til <strong>{{ UI_NAMES.matrix }}</strong> og tryk <strong>{{ UI_NAMES.generateMatrix }}</strong>.</span>
                    </template>
                </div>
                <GroupCard
                    v-for="group in shownGroups"
                    :key="group.name"
                    :group="group"
                    :variant="viewKey"
                    :id-column="idColumn"
                    :active-rule-columns="activeRuleColumns"
                    :balance-columns="balanceColumns"
                />
            </TransitionGroup>
          </div>
        <!-- Bundbjælken -->
        <Transition name="float-up">
            <!-- role="group" og ikke "toolbar": en toolbar lover piletaster, og
                 knapperne her tabbes i stedet. Navnet fortæller en skærmlæser,
                 hvad den har landet i. -->
            <div v-if="hasGroups" class="floating-action-bar" role="group" aria-label="Handlinger på grupperne">
                <div class="action-pill-group">
                    <div class="share-anchor">
                        <button class="action-pill"
                                :class="{ active: shareMenuOpen }"
                                aria-haspopup="true"
                                :aria-expanded="shareMenuOpen ? 'true' : 'false'"
                                @click.stop="toggleShareMenu"
                                title="Udskriv grupperne, eller hent dem som Excel-fil">
                            <Share2 :size="13" />
                            <span>Del</span>
                        </button>
                        <ShareMenu v-if="shareMenuOpen" @close="shareMenuOpen = false" />
                    </div>
                    <!-- Ægte til/fra-knap: aria-pressed siger om tags er fremme. -->
                    <button class="action-pill" :class="{ active: showTags }" :aria-pressed="showTags" @click="toggleTags" title="Vis/skjul elevernes tags og gruppernes snit">
                        <Tag :size="13" />
                        <span>Tags</span>
                    </button>
                    <button class="action-pill" @click="onCopy" title="Kopiér holdopdeling">
                        <Clipboard :size="13" />
                        <span>Kopiér</span>
                    </button>
                    <button v-if="!isMatrix" class="action-pill" @click="onRestoreGroups('text')"
                            :disabled="!canRestore"
                            :title="canRestore ? 'Gendan grupper fra en kopieret liste eller en gemt kolonne' : 'Vent til gruppedannelsen er færdig'">
                        <ClipboardPaste :size="13" />
                        <span>Gendan</span>
                    </button>
                </div>

                <span class="bar-sep"></span>

                <div class="action-pill-group">
                    <div class="run-history-anchor">
                        <!-- aria-haspopup/-expanded: samme mønster som Regler- og
                             Emner-skufferne. Uden dem var der intet, der sagde at
                             knappen folder en menu ud, eller om den står åben. -->
                        <button class="action-pill icon-only"
                                :class="{ active: menuOpen }"
                                aria-haspopup="true"
                                :aria-expanded="menuOpen ? 'true' : 'false'"
                                @click.stop="onRunHistory"
                                :disabled="!canGoBack"
                                :title="canGoBack ? 'Tidligere kørsler' : 'Ingen tidligere kørsler endnu'">
                            <History :size="14" />
                        </button>
                        <RunHistoryMenu v-if="menuOpen" @close="menuOpen = false" />
                    </div>
                    <!-- Afspilning af kørslen. Samme plads og samme facon som
                         historikken ved siden af — begge er "se hvad der
                         skete", ikke "ret i grupperne". -->
                    <div class="replay-anchor">
                        <button class="action-pill icon-only"
                                :class="{ active: replayMenuOpen || !!rp }"
                                aria-haspopup="true"
                                :aria-expanded="replayMenuOpen ? 'true' : 'false'"
                                @click.stop="toggleReplayMenu"
                                title="Optag og afspil kørslen">
                            <Clapperboard :size="14" />
                        </button>
                        <ReplayMenu v-if="replayMenuOpen"
                                    :can-replay="canReplay"
                                    :recording-matches="recordingMatches"
                                    :blocked-reason="replayBlockedReason"
                                    :attempts-text="recordingMatches ? (recording.attemptsText || '') : ''"
                                    @start="startReplay"
                                    @close="closeReplayMenu" />
                    </div>
                    <button class="action-pill icon-only" @click="onAddLatecomer" title="Tilføj efternøler">
                        <UserPlus :size="14" />
                    </button>
                    <button class="action-pill icon-only" @click="addEmptyGroup" title="Tilføj gruppe">
                        <Grid2x2Plus :size="14" />
                    </button>
                    <button class="action-pill icon-only lock-all-btn" @click="onGlobalLock" :title="allLocked ? 'Lås alle op' : 'Lås alle'">
                         <Lock :size="14" :style="{ color: allLocked ? 'var(--color-warning)' : 'inherit' }" />
                    </button>
                    <div class="trash-zone-floating" :class="{ active: trashActive, dragging: isDragging }"
                         @dragover="onTrashDragOver" @dragleave="onTrashDragLeave" @drop="onTrashDrop" title="Træk elev herover for fravær"
                         aria-hidden="true">
                         <Trash2 :size="14" />
                    </div>
                </div>

                <span class="bar-sep"></span>

                <div class="action-pill-group">
                    <!-- Én Gem-knap med en menu, der forklarer de to slags gem -->
                    <div class="save-anchor">
                        <button class="action-pill primary-pill"
                                :class="{ active: saveMenuOpen }"
                                aria-haspopup="menu"
                                :aria-expanded="saveMenuOpen ? 'true' : 'false'"
                                @click.stop="toggleSaveMenu"
                                title="Gem grupperne i Historik, eller som kolonne i elevlisten">
                            <Save :size="13" />
                            <span>Gem</span>
                            <ChevronDown :size="12" aria-hidden="true" />
                        </button>
                        <SaveMenu v-if="saveMenuOpen" @close="saveMenuOpen = false"
                                  @history="onSaveSession" @column="onSaveCol" />
                    </div>
                </div>
            </div>
        </Transition>
    </div>
</template>

<style scoped>
/* Den tomme tilstands tekst: ligeligt fordelte linjer i stedet for et enkelt
   ord alene på den sidste ("… du har brugt før") */
.empty-state strong, .empty-state span { text-wrap: balance; }
/* ─── Status for markeret elev ────────────────────────────────────────────
   Kassen er ALTID i DOM'en (også tom), så aria-live kan nå at annoncere
   teksten. Et element der først indsættes samtidig med sit indhold, bliver
   ofte læst op af en skærmlæser med et tomt resultat.

   HVORFOR DEN IKKE LÆNGERE ER SYNLIG: den var en bjælke i fuld bredde over
   hele gitteret. Den skubbede alle kortene ~50 px ned i samme øjeblik, læreren
   klikkede — så det, hun sigtede efter, flyttede sig — og den stod øverst på
   skærmen, mens eleven kunne være scrollet langt ned. Handlingerne
   ("Meld fraværende", "Fortryd") sidder nu i elevens EGEN række inde på
   kortet, og de andre kort viser selv deres "Flyt hertil". Sætningen er
   dermed kun nødvendig for den, der ikke kan se skærmen — så den bliver
   stående her, klippet væk visuelt.

   Klippet, ikke `display: none`: et skjult element er ude af
   tilgængelighedstræet, og så ville aria-live aldrig sige noget. */
.pick-status {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
}

/* === Bundbjælken === */
/* Historik-knappens plads i bjælken. Bevidst UDEN position: relative —
   menuen skal have hele bjælken som holdepunkt, ikke den 34 px brede knap.
   Et absolut placeret element krymper til sin containing block, og med
   knappen som holdepunkt endte menuen på 13 px med ét ord pr. linje.
   Menuen placeres i stedet vandret med et målt offset (se RunHistoryMenu). */
.run-history-anchor {
    display: flex;
    align-items: center;
}

/* Del-, Gem- og afspilningsknappens plads — samme regel som
   .run-history-anchor: UDEN position: relative, så menuen også har hele
   bjælken som holdepunkt. Se useBarPopover.js. */
.share-anchor,
.save-anchor,
.replay-anchor {
    display: flex;
    align-items: center;
}

/* Mens en tidligere kørsel forhåndsvises, er kortene et billede — ikke noget
   man kan rette i. Uden det kunne læreren nå at flytte en elev rundt i en
   fordeling, der forsvinder i samme øjeblik musen forlader menuen.
   Selve spærringen sker med `inert` i templaten: pointer-events lukker KUN
   musen ude, mens hvert elevnavn stadig havde tabindex="0" og svarede på
   Enter. `inert` tager hele gitteret ud af tabuleringen og slår klik,
   tastetryk og fokus fra på én gang. Dæmpningen her er det synlige signal. */
.group-grid.isPreviewing {
    pointer-events: none;
    opacity: 0.85;
}

/* Bjælkens placering, størrelse og udseende står i BetaGroupsTab.vue
   (html.beta .floating-action-bar) — en flad linje i bunden af skærmen. */
.floating-action-bar {
    position: fixed;
    /* Holdepunkt for historik-menuen — se .run-history-anchor ovenfor. */
    z-index: 1000;
    display: flex;
    align-items: center;
}

.action-pill-group {
    display: flex;
    align-items: center;
    gap: 4px;
}

.bar-sep {
    width: 1px;
    height: 16px;
}

/* Højde, hjørner, farve og skrift: BetaGroupsTab.vue og BetaStyles.vue. */
.action-pill {
    padding: 0 14px;
    border: 1px solid transparent;
    background: transparent;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    white-space: nowrap;
    transition-property: var(--ctl-transition);
    transition-duration: 0.2s;
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}

/* Slået fra: fx kørselshistorikken før der er noget at gå tilbage til.
   Hover-løftet skal også slås fra, ellers ser knappen ud som om den virker. */
.action-pill:disabled {
    opacity: 0.35;
    cursor: not-allowed;
}
.action-pill:disabled:hover {
    background: transparent;
    color: var(--text-muted);
    transform: none;
}

.action-pill.icon-only {
    padding: 0;
    justify-content: center;
}

/* Papirkurven — vises kun under et træk; størrelse og plads i BetaStyles.vue */
.trash-zone-floating {
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition-property: var(--ctl-transition);
    transition-duration: 0.2s;
    transition-timing-function: cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.trash-zone-floating:hover {
    background: var(--border-subtle);
    color: var(--text-main);
}

/* Klar til at tage imod (en elev trækkes et andet sted) */
.trash-zone-floating.dragging {
    background: var(--color-error-bg);
    border: 1px dashed var(--color-error-border);
}

/* Eleven holdes over papirkurven */
.trash-zone-floating.active {
    background: var(--color-error-border);
    color: var(--color-error);
    border: 1px solid var(--color-error);
    transform: scale(1.25);
    box-shadow: 0 0 20px var(--color-error-border);
    animation: trash-pulse 0.8s infinite alternate ease-in-out;
}

@keyframes trash-pulse {
    from { transform: scale(1.15); box-shadow: 0 0 10px var(--color-error-bg); }
    to { transform: scale(1.3); box-shadow: 0 0 25px var(--color-error-border); }
}

/* Overgang */
.float-up-enter-active, .float-up-leave-active {
    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.float-up-enter-from, .float-up-leave-to {
    opacity: 0;
}

.group-grid {
    padding-block-end: 100px; /* Plads til den svævende knaprække */
}

/* Udseendet (ingen kasse, tekst direkte på arket) står i BetaStyles.vue. */
.empty-state {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding-inline: 20px;
    text-align: center;
}

/* Tom-tilstandens anden vej ud: har man grupperne fra sidste uge liggende,
   er der ikke noget at generere — der er noget at hente. */
.empty-restore-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition-property: var(--ctl-transition);
    transition-duration: 0.2s;
}
.empty-restore-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
