<script setup>
// Banneret over gruppekortene — KUN de røde beskeder.
//
// HVORFOR KUN RØDE: et banner skubber gruppekortene ned, og højden voksede med
// antallet af beskeder. De fleste af dem var forslag om en indstilling ("brug
// 6 grupper i stedet for 4"), og de betalte med plads i resultatet for at tale
// om noget, der stod i båndet ovenover. De er flyttet:
//
//   - beskeder med en `anchor` vises som en markering på den knap, de handler
//     om (størrelsen i opskriften)
//   - "Du har låst N grupper" er helt væk — hængelåsen står på kortene
//
// Tilbage står regelkonflikterne og ÉN info-besked: at N elever står som
// "(uden navn)". Den bliver, fordi den betyder, at kortene er ulæselige — ikke
// noget man folder sammen. Grupperne forskydes altså nu kun, når noget faktisk
// er galt.
//
// Beregningen ligger i js/modules/hints.js, så båndet og banneret ikke kan
// komme til at sige hver sit om den samme regel.
import { computed } from 'vue';
import { bannerHints, dismiss } from '../js/modules/hints.js';
import { TriangleAlert, Info, X } from 'lucide-vue-next';

// Udsnittet: advarslerne om opsætningen står i gruppeopskriften og resten over
// grupperne (isRecipeHint / isResultHint i recipe.js). Alle tre steder giver et filter.
const props = defineProps({
    filter: { required: true, validator: (v) => typeof v === 'function' },
});
const shownHints = computed(() => bannerHints.value.filter(props.filter));

// En besked kan have én knap (`action`) eller flere (`actions`) — Skal
// sammen-advarslen har både "Vis aftalen" og "Dan grupper uden aftalen".
function hintActions(h) {
    return h.actions || (h.action ? [h.action] : []);
}

// Står beskeden i opskriftens vindue, lukkes vinduet først. Det står i
// browserens øverste lag (showModal), og et vindue, knappen åbner ("Ranger
// værdierne…", "Vis aftalen"), er et almindeligt lag og åbnede usynligt BAG
// det. Samme greb som Ranger i kolonnevalget og Aftaler i opskriften.
//
// Fokus (169. gennemsyn, tematik (198)): havde knappen fokus (tastatur eller
// skærmlæser), sættes fokus på bjælkens "Rediger", som åbner opskriften igen,
// FØR vinduet, knappen åbner, når at huske, hvor fokus var. Før huskede det
// knappen i det lukkede vindue, og fokus endte på <body>, når det lukkede
// (målt i Safari; Chromium og Firefox endte på fanen, der åbnede opskriften).
function runAction(a, event) {
    const dialog = event.currentTarget.closest('dialog.recipe-dialog');
    if (dialog) {
        const hadFocus = dialog.contains(document.activeElement);
        window.dispatchEvent(new CustomEvent('recipe-dialog:request', { detail: { open: false } }));
        if (hadFocus) document.querySelector('.recipe-bar__open')?.focus();
    }
    a.run();
}

// ─── Fokus efter krydset (169. gennemsyn, tematik (198)) ────────────────────
// Krydset forsvinder med advarslen, og ved den sidste forsvinder hele stakken
// (v-if). Havde krydset fokus, stod fokus bagefter på <body> (målt i alle tre
// browsere), og læreren begyndte forfra øverst på siden — eller, i
// opskriftens vindue, uden for vinduet. Nu: krydset på advarslen, der rykker
// op (eller den ovenover), og efter den sidste det, Tab ville have ramt
// efter stakken (opskriftens første linje, det første gruppekort).
// Fokus flyttes FØR advarslen fjernes: kun Chromium sender blur, når et
// element med fokus fjernes.
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function focusAfterStack(stack) {
    const scope = stack.closest('dialog') || stack.closest('.tab-content') || document.body;
    const after = [...scope.querySelectorAll(FOCUSABLE)].filter(el =>
        !stack.contains(el) && !el.closest('[inert]') && el.getClientRects().length > 0);
    return after.find(el => stack.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
        || after[after.length - 1] || null;
}
function onDismiss(h, event) {
    const stack = event.currentTarget.closest('.hints-stack');
    let target = null;
    if (stack?.contains(document.activeElement)) {
        const ids = shownHints.value.map(x => x.id);
        const i = ids.indexOf(h.id);
        const neighbour = ids[i + 1] ?? ids[i - 1];
        target = neighbour === undefined ? focusAfterStack(stack)
            : [...stack.querySelectorAll('.gh-hint')].find(el => el.dataset.hintId === neighbour)?.querySelector('.gh-hint-dismiss');
    }
    target?.focus();
    dismiss(h.id);
}
</script>

<template>
    <div v-if="shownHints.length" class="hints-stack" aria-live="polite">
        <div
            v-for="h in shownHints"
            :key="h.id"
            :data-hint-id="h.id"
            class="gh-hint"
            :class="{
                'gh-hint--conflict': h.kind === 'conflict',
                'gh-hint--info': h.kind === 'info',
                'gh-hint--last': h.source === 'last',
            }"
            :role="h.kind === 'conflict' ? 'alert' : 'status'"
        >
            <TriangleAlert v-if="h.kind === 'conflict'" :size="16" class="gh-hint-icon" />
            <Info v-else :size="16" class="gh-hint-icon" />
            <!-- Knapperne står UNDER teksten, til venstre. Beskederne (toasts)
                 lander øverst til højre lige under båndet — og dækkede før
                 knapper, der stod yderst til højre i banneret. -->
            <div class="gh-hint-body">
                <span class="gh-hint-text">{{ h.text }}</span>
                <span v-if="hintActions(h).length" class="gh-hint-actions">
                    <button v-for="a in hintActions(h)" :key="a.label"
                            type="button"
                            class="gh-hint-action"
                            :disabled="a.disabled"
                            @click="runAction(a, $event)">{{ a.label }}</button>
                </span>
            </div>
            <button class="gh-hint-dismiss" @click="onDismiss(h, $event)" :aria-label="'Luk advarsel'">
                <X :size="13" />
            </button>
        </div>
    </div>
</template>
<style scoped>
/* Farver, kanter, luft og skriftstørrelse står i BetaGroupsTab.vue (en stille
   linje med en farvet streg i venstre side), som vinder over de scoped regler.
   Her står kun opbygningen. */
.hints-stack {
    display: flex;
    flex-direction: column;
}

.gh-hint {
    /* Skriften arves fra <body> (Plus Jakarta Sans). Før stod her
       `var(--sans, system-ui)`, men --sans findes ikke i Grupper, så
       banneret stod ALTID i systemskriften — se tools/check-code.mjs, tjek 6. */
    font-weight: 500;
    display: flex;
    align-items: flex-start;
    gap: 8px;
}

.gh-hint-icon {
    flex-shrink: 0;
    margin-block-start: 1px;
}

.gh-hint-body {
    flex: 1;
    min-inline-size: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.gh-hint-text {
    line-height: 1.4;
}

/* Handlings-knap i et hint. Højde, flade og farve (en blød knap) står i
   BetaGroupsTab.vue. */
.gh-hint-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.gh-hint-action {
    flex-shrink: 0;
    padding-inline: 12px;
    /* `font: 600 12px inherit` er ugyldigt (inherit må ikke stå i en
       font-genvej), så hele linjen blev smidt væk, og knappen mistede sin
       fede skrift. Arv familien, og sæt størrelse og vægt hver for sig. */
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s;
}
.gh-hint-action:disabled { cursor: not-allowed; opacity: 0.5; }

.gh-hint-dismiss {
    flex-shrink: 0;
    background: none;
    border: none;
    cursor: pointer;
    color: currentColor;
    opacity: 0.45;
    padding: 1px;
    margin-block-start: 1px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.15s, background 0.15s;
}
.gh-hint-dismiss:hover {
    opacity: 1;
    background: oklch(0 0 0 / 8%);
}
</style>
