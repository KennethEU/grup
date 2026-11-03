<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { notificationState, notificationActions } from '../js/modules/notificationState.js';
import { CheckCircle, XCircle, Info, X } from 'lucide-vue-next';
import { reactiveState as appState } from '../js/modules/reactiveState.js';

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
let followTimer = null;
function stopFollowing() {
    clearInterval(followTimer);
    followTimer = null;
}
watch(() => notifications.value.length, (n, old) => {
    // Straks ved hver NY besked — så den aldrig vises ét interval det forkerte
    // sted — og derefter løbende, indtil stakken er tom.
    if (n > (old || 0)) measureRibbon();
    if (n > 0 && !followTimer) followTimer = setInterval(measureRibbon, 300);
    else if (n === 0) stopFollowing();
}, { flush: 'sync' });
onMounted(() => window.addEventListener('resize', measureRibbon, { passive: true }));
onBeforeUnmount(() => {
    window.removeEventListener('resize', measureRibbon);
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
         høfligt (role=status) uden at blive læst op to gange. -->
    <div ref="containerEl" class="notification-container" :style="containerTop ? { '--toast-top': containerTop } : null">
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

       `pointer-events: auto` er prisen: containeren skal selv kunne tage imod
       hjulet for at kunne rulle. Den dækker nu også rammen og mellemrummene
       omkring beskederne — men kun mens der ER beskeder; er stakken tom, er
       kassen 0×0 og dækker ingenting.

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
