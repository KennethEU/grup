<script setup>
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { notificationState, notificationActions } from '../js/modules/notificationState.js';
import { CheckCircle, XCircle, Info, X } from 'lucide-vue-next';
import { reactiveState as appState } from '../js/modules/reactiveState.js';
import { topModalPanel } from '../composables/useModalFocus.js';

const notifications = computed(() => notificationState.notifications);

// ─── Under båndet, ikke oven på det ─────────────────────────────────────────
// Stakken lå lige under topbaren — og i klassevisningen ligger båndet netop
// dér: Emner, Regler og Generér i Grupper-fanen, Elev/Kolonne/Flyt/Slet i
// elevlisten. En besked efter en gruppedannelse ("Fordel på 'Køn' kan ikke gå
// helt op …") lagde sig altså hen over Generér, og læreren kunne ikke danne
// grupper igen, før den var væk. Målt 23/9 på 1280×720: toasten dækkede både
// Generér og Regler. Fundet med den realistiske testklasse, fordi den — i
// modsætning til de pæne testklasser — altid giver en besked efter en kørsel.
//
// Båndets hoved er sticky, men det er der ikke altid, og dets højde er ikke
// fast: det brydes over på flere linjer på en smal skærm. En måling i det
// øjeblik beskeden kommer, er ikke nok — "Klasse oprettet!" kommer, MENS appen
// skifter til klassevisningen, før båndet findes, og båndet dukkede så op lige
// under beskeden (målt: toast på y=76, båndet til y=110, Generér dækket i 5,6
// sek.). Derfor måles bunden løbende, så længe der ER beskeder på skærmen —
// ét opslag tre gange i sekundet, og slet intet, når stakken er tom. Uden bånd
// (forsiden, importen) står stakken, hvor den altid har stået.
const RIBBON = '.groups-header-sticky, .students-header-sticky';
const containerTop = ref(null);
const containerEl = ref(null);
function measureRibbon() {
    // Uden bånd måles topbaren selv: står der noget over den (den gamle
    // udgaves bjælke "forsvinder 2. november"), passer den faste højde ikke.
    const band = document.querySelector(RIBBON) || document.querySelector('.topbar');
    const bottom = band ? band.getBoundingClientRect().bottom : 0;
    const next = bottom > 0 ? `${Math.round(bottom) + 2}px` : null;
    if (next !== containerTop.value) {
        containerTop.value = next;
        // Sættes også direkte på elementet, FØR Vue tegner igen. Ellers tager
        // transition-group sit "før"-billede af beskedernes plads med den gamle
        // top og regner containerens flytning for en bevægelse: toasten gled
        // hen over båndet i 0,28 sek. (opstod med Vue 3.5.44).
        const el = containerEl.value;
        if (el) {
            if (next) el.style.setProperty('--toast-top', next);
            else el.style.removeProperty('--toast-top');
        }
    }
}
// ─── Inde i et åbent <dialog> ───────────────────────────────────────────────
// Opskriftens vindue (og Nyheder, telefonbeskeden og importens to spørgsmål)
// er et rigtigt <dialog> åbnet med showModal(). Det står i browserens øverste
// lag — over ALT, også en z-index på 10000 — og alt uden for det er inert.
// En besked givet, mens vinduet stod åbent (fx "Browserens lagerplads er
// fuld!", når en regelændring ikke kunne gemmes), lå derfor dæmpet bag
// vinduets mørke baggrund, delvist dækket af vinduet, og kunne hverken
// lukkes eller læses op af en skærmlæser (set på skærmbillede og målt
// 10/11 2026 ved 1280×600 og 800×480). Samme løsning som guiden
// (RecipeGuide.vue): stakken flytter ind i selve vinduet, mens det står
// åbent, og tilbage til <body>, når det lukker.
//
// Kun <dialog>-elementer: Vue-vinduerne (.modal-overlay) er almindelige lag
// under stakken og har deres egen regel (body.has-modal nedenfor).
const host = ref(null);   // det åbne <dialog>, eller null = <body>
function openDialog() {
    // Alle <dialog> i appen åbnes med showModal(). Står flere åbne, er det
    // sidst åbnede som regel også det sidste i siden.
    const open = document.querySelectorAll('dialog[open]');
    return open[open.length - 1] || null;
}
function updateHost() {
    const next = openDialog();
    // isConnected: et vindue kan forsvinde helt (fanen skiftes), mens det
    // står åbent. Så findes der ingen 'open'-ændring at lytte efter, og
    // beskederne ville blive i et element, der ikke er på siden længere.
    if (next !== host.value) host.value = next && next.isConnected ? next : null;
}

// ─── Kassen tager kun musen, når den kan rulle ──────────────────────────────
// Kassen om beskederne har luft hele vejen rundt (til skyggen) og mellem
// beskederne. Tog den altid imod musen, ramte et klik i den luft kassen i
// stedet for det, der stod bagved — fx elevlistens slet-kryds, mens "Klasse
// oprettet!" stod nederst til højre (målt 10/11 2026). Beskederne tager selv
// imod klik; kassen skal kun, når den har noget at rulle, for så skal hjulet
// og rullebjælken virke (se `pointer-events` i stilen nedenfor).
const canScroll = ref(false);
function measureScroll() {
    const el = containerEl.value;
    canScroll.value = !!el && el.scrollHeight > el.clientHeight;
}

// ─── Ved siden af et Vue-vindue, ikke oven på dets knapper ──────────────────
// Mens et af de almindelige vinduer står åbent (body.has-modal), står stakken
// nederst til højre. Målt 10/11 2026 med fem blivende fejlbeskeder: i Aftaler
// lå stakken over "Fjern aftale"-krydsene ved 1280×600, 1024×700, 800×480 og
// 375×700, i "Gem session" over selve Gem-knappen ved 1024×700 og 800×480 (og
// over feltet og Annuller på en telefon), og i "Gem som kolonne" over feltet
// og knappen ved 800×480. Fejlbeskeder bliver stående, til de klikkes væk —
// læreren måtte lukke dem alle, før vinduet kunne bruges.
//
// Derfor måles panelet, og stakken flytter, hvis der er plads:
//   1. til HØJRE for panelet, hvis beskederne dér kan være mindst 240 px
//      brede (smallere er svære at læse) — så får de hele højden;
//   2. ellers UNDER panelet, hvis den højeste besked kan stå hel dér;
//   3. ellers som før, oven på panelet. Ved 800×480 er der hverken plads ved
//      siden af eller under Aftaler og "Gem session" — så er det bedre, at
//      beskederne kan ses og lukkes, end at de klemmes ned i en stribe, der
//      kun viser en halv besked.
// Valget skrives som `data-modal-room` og to mål direkte på elementet (ikke
// gennem Vue), af samme grund som `--toast-top` ovenfor: Vue må ikke tegne
// imellem, ellers glider beskederne hen over vinduet.
const MIN_BESIDE = 240;   // mindste bredde på en besked ved siden af panelet
const GAP = 8;            // luft mellem panelet og stakken
function measureModalRoom() {
    const el = containerEl.value;
    if (!el) return;
    // Målingen sætter kassen tilbage til sin almindelige størrelse et
    // øjeblik, og browseren klipper så rulningen til den. Uden at huske den
    // sprang stakken til toppen hvert 300. ms — en lærer, der havde rullet ned
    // til den nederste besked for at lukke den, nåede det ikke (målt 10/11
    // 2026). Den skrives tilbage, når valget er truffet; intet tegnes imellem.
    const scrolled = el.scrollTop;
    try {
        chooseModalRoom(el);
    } finally {
        el.scrollTop = scrolled;
    }
}
function chooseModalRoom(el) {
    const panel = host.value ? null : (document.body.classList.contains('has-modal') ? topModalPanel() : null);
    // Først stakkens almindelige plads: valget regnes altid ud fra den, så
    // det ikke afhænger af, hvad der blev valgt sidst.
    delete el.dataset.modalRoom;
    if (!panel) return;
    const p = panel.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const overlaps = box.left < p.right + GAP && box.right > p.left
        && box.top < p.bottom + GAP && box.bottom > p.top;
    if (!overlaps) return;
    // Kassens kanter: 10 px fra skærmens kant og 10 px luft indeni hver side
    // (se `padding` i stilen) — beskederne selv står 20 px inde.
    const beside = window.innerWidth - p.right - GAP - 10 - 20;
    if (beside >= MIN_BESIDE) {
        el.style.setProperty('--toast-modal-inline', `${Math.floor(beside)}px`);
        el.dataset.modalRoom = 'beside';
        return;
    }
    const under = window.innerHeight - p.bottom - GAP - 10 - 20;
    const tallest = Math.max(0, ...[...el.querySelectorAll('.toast')].map(t => t.offsetHeight));
    if (tallest > 0 && under >= tallest) {
        el.style.setProperty('--toast-modal-block', `${Math.floor(under)}px`);
        el.dataset.modalRoom = 'under';
    }
}

let followTimer = null;
function follow() {
    updateHost();
    measureRibbon();
    measureModalRoom();
    measureScroll();
}
function stopFollowing() {
    clearInterval(followTimer);
    followTimer = null;
}
watch(() => notifications.value.length, (n, old) => {
    // Straks ved hver NY besked — så den aldrig vises ét interval det forkerte
    // sted — og derefter løbende, indtil stakken er tom.
    if (n > (old || 0)) follow();
    // Den nye besked står først i siden efter Vues næste tegning; mål
    // rulningen dér, ikke først ved næste interval.
    if (n !== old) nextTick(measureScroll);
    if (n > 0 && !followTimer) followTimer = setInterval(follow, 300);
    else if (n === 0) {
        stopFollowing();
        // Tom stak: intet at rulle. Målingen nedenfor ser stadig beskeder,
        // der glider ud, og intervallet er stoppet — uden denne linje kunne
        // `can-scroll` blive hængende på den tomme kasse (20×20 px luft).
        canScroll.value = false;
        return;
    }
}, { flush: 'sync' });

// Åbner eller lukker et vindue, flytter stakken med det samme — ikke først
// ved næste måling. Lytter kun på 'open'-attributten; det koster intet.
let dialogObserver = null;
// Det samme for de almindelige vinduer: de sætter `has-modal` på <body>.
// Kun <body>s egen class-attribut (ikke hele siden), og kun når der står
// beskeder — uden beskeder er der intet at flytte. requestAnimationFrame:
// vinduet er sat ind i siden, men dets panel har først sin plads, når
// browseren har regnet layoutet.
let modalObserver = null;
function onBodyClass() {
    if (notifications.value.length) requestAnimationFrame(follow);
}
onMounted(() => {
    window.addEventListener('resize', follow, { passive: true });
    dialogObserver = new MutationObserver(updateHost);
    dialogObserver.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
    modalObserver = new MutationObserver(onBodyClass);
    modalObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    updateHost();
});
onBeforeUnmount(() => {
    window.removeEventListener('resize', follow);
    dialogObserver?.disconnect();
    modalObserver?.disconnect();
    stopFollowing();
});

// En besked hører til det sted, den blev givet. En gammel hint-besked
// fulgte læreren med til de andre faner og lå hen over vinduer og gruppekort.
// Skifter fanen, ryddes alt undtagen fejl (de bliver, til de klikkes væk).
// `flush: 'sync'`, så kun de beskeder, der ALLEREDE står, ryddes — en besked,
// der gives i samme øjeblik som fanen skifter ("Klasse oprettet!"), overlever.
watch(() => appState.classViewTab, () => {
    notificationState.notifications
        .filter(n => n.type !== 'error')
        .forEach(n => notificationActions.remove(n.id));
}, { flush: 'sync' });

const removeNotification = (id) => {
    notificationActions.remove(id);
};

// Beskedens egen knap: kør handlingen, og luk beskeden — den er besvaret.
function runAction(note) {
    notificationActions.remove(note.id);
    note.action.run();
}
</script>

<template>
    <!-- Ingen aria-live på beholderen: hver besked har sin egen live-rolle,
         så fejl læses højt med det samme (role=alert) og succes/info
         høfligt (role=status) uden at blive læst op to gange.
         Teleporteret til <body> og data-modal-keep: når et vindue gør siden
         bagved inert (useModalFocus), skal beskederne stadig kunne læses op
         og klikkes væk. Inde i #app blev de inerte sammen med resten, så snart
         et bekræft- eller navngiv-vindue (som ligger i <body>) var åbent. -->
    <Teleport :to="host || 'body'">
    <div ref="containerEl" class="notification-container" :class="{ 'in-dialog': host, 'can-scroll': canScroll }" data-modal-keep :style="containerTop ? { '--toast-top': containerTop } : null">
        <transition-group name="toast">
            <div
                v-for="note in notifications"
                :key="note.id"
                :class="['toast', note.type]"
                :role="note.type === 'error' ? 'alert' : 'status'"
            >
                <div class="toast-icon">
                    <CheckCircle v-if="note.type === 'success'" :size="16" />
                    <XCircle v-else-if="note.type === 'error'" :size="16" />
                    <Info v-else :size="16" />
                </div>
                <div class="toast-body">
                    <span class="toast-message">{{ note.message }}</span>
                    <button v-if="note.action" type="button" class="toast-action" @click="runAction(note)">
                        {{ note.action.label }}
                    </button>
                </div>
                <button class="toast-close" @click="removeNotification(note.id)" aria-label="Luk">
                    <X :size="13" />
                </button>
            </div>
        </transition-group>
    </div>
    </Teleport>
</template>

<style scoped>
.notification-container {
    position: fixed;
    /* Under topbaren, ikke oven på den. Toasts'ene ligger i højre side —
       præcis hvor topbarens ikoner sidder — og en fejlbesked bliver stående
       til den klikkes væk. Den dækkede altså Nyheder, guide, GDPR, hjælp og
       tema-knappen, indtil man fandt det lille kryds. `--header-height` er
       topbarens egen højde, så de følges ad hvis den nogensinde ændres. */
    inset-block-start: var(--toast-top, calc(var(--header-height, 64px) + 2px));
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 8px;

    /* Stakken må ikke løbe ud over skærmkanten. Målt på 1280×720 med fem
       beskeder fra en generering med flere advarsler: 782 px høj — 62 px
       under kanten. Den nederste var en fejl, og fejl forsvinder først, når
       man klikker på krydset. Krydset lå uden for skærmen, og beskeden kunne
       altså aldrig komme væk igen. Derfor et loft på pladsen under topbaren,
       og en rulning når det ikke passer.

       Kassen tager kun imod musen (`pointer-events: auto`), mens den KAN
       rulle (klassen `can-scroll`, målt i measureScroll): så skal hjulet og
       rullebjælken virke, også i luften mellem beskederne. Ellers går et
       klik i rammen og mellemrummene igennem til det, der står bagved —
       beskederne selv tager stadig imod klik (`.toast` har sit eget `auto`).
       Før tog rammen altid klik: "Klasse oprettet!" dækkede de første
       sekunder elevlistens slet-kryds med sin 10 px luft (målt 10/11 2026).

       LUFTEN INDENI er ikke pynt: `overflow-y` gør også den vandrette akse til
       en rullecontainer, og uden luft blev beskedernes bløde skygge skåret af
       langs siderne — i ALLE tilfælde, ikke kun når der rulles.

       De 10 px er trukket fra afstanden til kanterne (20 − 10 og 12 − 10), så
       beskederne står nøjagtig, hvor de altid har stået — målt på 1280×720 og
       på 375×812: venstre kant, bredde og topkant er de samme tal som før.

       Prøv ikke at give skyggen mere luft. `max-inline-size` er content-box og
       måler beskeden selv, så luften lægges OVEN I de 92vw. Med 16 px hver
       side sprængte kassen en 375 px-skærm: beskeden blev 6 px smallere, og
       dens venstre kant rykkede 6 px ind (målt — 345 → 339 px). Med 10 px går
       regnestykket lige op fra 375 px og op (92vw + 30 ≤ 100vw), og på
       smallere skærme skrumper beskeden ganske lidt, som den også gjorde før. */
    inset-inline-end: 10px;
    padding: 10px;
    max-inline-size: min(92vw, 480px);
    max-block-size: calc(100dvh - var(--toast-top, calc(var(--header-height, 64px) + 2px)) - 32px);
    overflow-y: auto;
    overscroll-behavior: contain;
    pointer-events: none;
}
.notification-container.can-scroll {
    pointer-events: auto;
}

/* Er der et vindue åbent, flytter stakken ned. Ellers ligger den præcis hen
   over vinduets titel, faner og luk-knap — på en telefon dækkede to beskeder
   hele hovedet i de fire sekunder, de lever, og en fejlbesked bliver stående,
   til den klikkes væk. Klassen sættes ét sted: useModalFocus' stak. */
body.has-modal .notification-container {
    inset-block-start: auto;
    inset-block-end: 10px;
    max-block-size: min(50dvh, calc(100dvh - var(--header-height, 64px) - 34px));
}

/* Ved siden af eller under vinduets panel, når der er plads (målt i
   measureModalRoom; `data-modal-room` og de to mål sættes derfra). Uden
   plads gælder reglen ovenfor uændret. Attribut-vælgeren gør reglen tungere
   end bredden i BetaStyles.vue (html.beta). */
body.has-modal .notification-container[data-modal-room="beside"] {
    max-inline-size: var(--toast-modal-inline, min(92vw, 400px));
}
body.has-modal .notification-container[data-modal-room="under"] {
    max-block-size: var(--toast-modal-block, 50dvh);
}

/* En åben menu ligger OVER beskederne, mens den står åben. Stakken står
   nederst til højre og vokser opad — præcis dér, hvor Gem-menuen åbner over
   bundlinjen, og hvor "Lav aftale"-menuen falder ned i elevlisten. Målt 10/11
   2026 med fem blivende fejlbeskeder: begge punkter i Gem-menuen var dækket
   ved 1280×720, 1280×600 og 800×480, og "Undgå hinanden" ved 800×480 — et
   klik på dem ramte beskeden. Menuerne sidder inde i bjælkernes egne lag
   (bundlinjen 1000, elevlistens værktøjslinje 100), så de kan kun komme
   øverst, hvis stakken går UNDER bjælkerne, så længe menuen står åben. 99
   er stadig over alt andet på siden. Beskederne bliver stående og kan læses
   ved siden af menuen; når den lukker, er de øverst igen.
   Menuerne bærer selv mærket `data-popup-menu` (Gem, Del, kørselshistorik,
   afspilning og "Lav aftale"). Et åbent vindue går forud: dér skal stakken
   stå over vinduet. */
body:not(.has-modal):has([data-popup-menu]) .notification-container {
    z-index: 99;
}

/* Inde i et åbent <dialog> (se updateHost): nederst til højre som ved de
   andre vinduer. z-index 1, ikke 10000: inde i vinduet er det vinduets egne
   lag, stakken skal under — opskriftens ordvælger (60) og guiden — mens den
   stadig står over vinduets almindelige indhold. `dialog[open] >` gør reglen
   tungere end body.has-modal og beta-reglen i BetaStyles.vue. */
dialog[open] > .notification-container.in-dialog {
    z-index: 1;
    inset-block-start: auto;
    inset-block-end: 10px;
    max-block-size: min(50dvh, calc(100dvh - var(--header-height, 64px) - 34px));
}

.toast {
    pointer-events: auto;
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 10px;
    align-items: start;
    padding: 14px 12px 14px 16px;
    border-radius: 10px;
    border: 1px solid var(--border-medium);
    border-inline-start-width: 4px;
    background: var(--bg-modal);
    backdrop-filter: blur(16px);
    box-shadow: 0 4px 24px oklch(0 0 0 / 15%);
    font-size: 13px;
    line-height: 1.55;
    color: var(--text-main);
}

.toast.success { border-inline-start-color: var(--color-success); }
.toast.error   { border-inline-start-color: var(--color-error); }
.toast.info    { border-inline-start-color: oklch(0.55 0.18 250); }

.toast-icon {
    flex-shrink: 0;
    margin-block-start: 1px;
    color: var(--text-subtle);
}
.toast.success .toast-icon { color: var(--color-success); }
.toast.error   .toast-icon { color: var(--color-error); }
.toast.info    .toast-icon { color: oklch(0.55 0.18 250); }

.toast-message {
    white-space: pre-wrap;
    word-break: break-word;
    min-width: 0;
}

.toast-body {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    min-inline-size: 0;
}

.toast-action {
    padding-block: 6px;
    padding-inline: 12px;
    border: 1px solid var(--border-medium);
    border-radius: 6px;
    background: var(--bg-surface);
    color: var(--text-main);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
}
.toast-action:hover {
    background: var(--bg-surface-hover);
}

.toast-close {
    flex-shrink: 0;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-subtle);
    padding: 1px;
    margin-block-start: 1px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    opacity: 0.5;
    transition: opacity 0.15s, background 0.15s;
}
.toast-close:hover {
    opacity: 1;
    background: oklch(0 0 0 / 8%);
}

/* Overgange */
.toast-enter-active,
.toast-leave-active {
    transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.toast-enter-from,
.toast-leave-to {
    opacity: 0;
    transform: translateX(30px) scale(0.95);
}
.toast-move {
    transition: transform 0.28s ease;
}
</style>
