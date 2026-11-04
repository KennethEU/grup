<script setup>
// Optagelse og afspilning af en kørsel — hele funktionen bor her.
//
// Menuen har to tilstande: "Se kørslen", når der ligger en optagelse, og
// selve afspilleren, mens den kører. Der er ikke længere et flueben —
// optagelsen er altid slået til, fordi den koster 1,5 % ekstra tid, og fordi
// et flueben man skulle huske FØR kørslen var den sikreste måde at opdage
// funktionen for sent.
//
// Virker for både stamgrupper og matrix; optagelsen slås op pr. visning, så
// en matrix-kørsel ikke smider stamgruppernes optagelse væk.
//
// Bor over bundbjælken, samme sted og samme facon som kørselshistorikken
// (RunHistoryMenu), og deler placeringen med den (useBarPopover). Bevidst
// ikke et modalvindue: man skal kunne SE gruppekortene, mens den kører.
//
// Selve logikken ligger i replay.js. Herinde er der kun knapper.
import { ref, computed, watch, nextTick } from 'vue';
import { reactiveState } from '../../js/modules/reactiveState.js';
import { useBarPopover } from '../../composables/useBarPopover.js';
import { useBarMenuDismiss } from '../../composables/useBarMenuDismiss.js';
import { UI_NAMES } from '../../js/modules/beta.js';
import * as replay from '../../js/modules/replay.js';
import { Play, Pause, SkipForward, RotateCcw, Clapperboard } from 'lucide-vue-next';

const props = defineProps({
    // Findes der en optagelse, og passer den stadig til grupperne på skærmen?
    canReplay: { type: Boolean, default: false },
    recordingMatches: { type: Boolean, default: false },
    blockedReason: { type: String, default: null },
    // Den nye motor: "Forsøg 13 af 20 – det bedste. 9 andre forsøg endte
    // lige så godt." Afspilningen viser kun det vindende forsøg, så her står,
    // hvilket det var, og at de andre ikke var bedre. Tom med den nuværende.
    attemptsText: { type: String, default: '' },
});

const emit = defineEmits(['close', 'start']);

const rootRef = ref(null);
const { menuStyle, arrowStyle } = useBarPopover(rootRef, 'replay-anchor', 320);

const rp = computed(() => reactiveState.replay);
const currentRun = computed(() => {
    const r = rp.value;
    return r ? r.recording.runs[r.runIndex] : null;
});

// Motor A's tal er PARRETS score — de to grupper der byttede — ikke klassens
// samlede. Det skal stå der, ellers læses 14,2 som en samlet score, og så
// lyver linjen. Efterpasset er det eneste sted med et ægte totaltal.
const status = computed(() => {
    const r = rp.value;
    if (!r) return '';
    if (!r.total) return 'Motoren ramte rigtigt i første forsøg — der er intet at afspille.';
    if (!r.last) return 'Før første elev er lagt. Motoren har sorteret klassen og skal til at dele ud.';

    const e = r.last;

    // Uddelingen først: motoren sorterer klassen og lægger eleverne ud én ad
    // gangen. Hver motor har sin egen rækkefølge — se `deal` i recorder.py.
    if (e.kind === replay.KIND_DEAL) {
        return `Deler ud · elev ${r.frameIndex} af ${r.dealCount} → gruppe ${e.groupIndex + 1}`;
    }

    const parts = [`Bytte ${r.frameIndex - r.dealCount} af ${r.total - r.dealCount}`];
    if (e.kind === replay.KIND_JOINT) parts.push('efterpas');
    else if (e.passNum != null) parts.push(`pas ${e.passNum}`);
    // "under X", ikke bare "X". Regelnavnet siger, hvilken regel motoren var
    // i gang med — IKKE hvilken regel der forårsagede byttet. Målt på et
    // rigtigt hold (22 elever, 6 Fordel-regler): 409 af 419 bytter faldt på
    // den SIDSTE regel, og flyttede man den regel forrest, faldt de 409 til 8
    // — mens den nye sidste regel så tog 281. Bytterne hober sig op dér, hvor
    // motoren kæmper, og det er altid den sidst anvendte regel, fordi de
    // øvrige allerede binder hvert eneste bytte.
    if (e.rule) parts.push(`under ${e.rule}`);
    // Den ene af de to er en tom plads, som ikke tegnes. Uden den her linje
    // ser det ud, som om eleven vandrer alene mellem to grupper uden grund —
    // og det gør hun tit: paa laererens eget hold var 69-94 % af motor B's
    // bytter af den slags.
    if (e.soloMove) parts.push('bytter med en tom plads');
    // Motoren kan flytte én elev uden en makker.
    if (e.isMove) parts.push(`flytter til gruppe ${e.groupIndex + 1}`);
    // Et blok-bytte: en Skal sammen-aftale flytter samlet, så den ikke
    // splittes. Uden linjen lignede det et almindeligt bytte, der tilfældigvis
    // flyttede fire elever på én gang.
    if (e.pairCount > 1) parts.push(`Skal sammen flytter samlet (${e.pairCount} elever hver vej)`);
    if (e.before != null && e.after != null) {
        const fmt = (v) => Number(v).toFixed(1).replace('.', ',');
        const scopeLabel = e.kind === replay.KIND_JOINT ? 'i alt' : 'parret';
        parts.push(`${scopeLabel} ${fmt(e.before)} → ${fmt(e.after)}`);
    }
    return parts.join(' · ');
});

const KIND_TEXT = {
    [replay.KIND_IMPROVE]: 'Gør grupperne bedre',
    [replay.KIND_UPHILL]: 'Gør det værre med vilje — for at komme videre',
    [replay.KIND_RULE]: 'Opfylder en regel',
    [replay.KIND_JOINT]: 'Efterpas',
    [replay.KIND_DEAL]: 'Deler ud — den første fordeling',
};
const kindLabel = computed(() => {
    const r = rp.value;
    return r && r.last ? (KIND_TEXT[r.last.kind] || '') : '';
});

const speed = computed({
    get: () => (rp.value ? rp.value.speed : replay.DEFAULT_SPEED_MS),
    set: (v) => replay.setSpeed(v),
});

// Escape, klik udenfor, fokus der forlader menuen, fokus ind ved åbning og
// tilbage til knappen ved lukning — reglerne bor i useBarMenuDismiss.js, som
// alle fire menuer på bundbjælken deler.
//
// HVORFOR TASTATURET SKAL KUNNE LUKKE DEN (4/9): musen havde en vej ud (klik
// udenfor lukker, og lukningen stopper afspilningen). Tastaturet havde ingen:
// Tab bar fokus videre ud i bundbjælken, mens menuen blev stående OG
// afspilningen kørte videre. Målt: start afspilningen, flyt fokus til
// "Kopiér", tryk Enter — på skærmen står NUL gruppekort (motoren er midt i at
// dele ud), og udklipsholderen får alle tre grupper med tolv elever.
// Afspilningen er et kig, ikke en tilstand: slipper den, når man går væk fra
// menuen, kan ingen udgang længere være uenig med skærmen.
//
// Menuen skifter selv indhold, når afspilningen starter — "Se kørslen"
// forsvinder under fingeren, og fokus falder et øjeblik på <body>. Derfor
// tæller <body> ikke som "udenfor" (ellers stoppede afspilningen i samme
// sekund, den blev startet), og fokus flyttes til Pause nedenfor.
//
// Er der ingen optagelse, er "Se kørslen" slået fra og kan ikke få fokus; så
// tager roden selv imod fokus (den har `tabindex="-1"` og et navn), og
// forklaringen inde i menuen bliver læst op.
const { onRootFocusOut } = useBarMenuDismiss(rootRef, {
    anchorClass: 'replay-anchor',
    onClose: () => emit('close'),
});

// Når afspilningen starter, byttes "Se kørslen" ud med afspillerens fem
// knapper. Den knap, læreren lige trykkede på, forsvinder altså under hende,
// og fokus falder på <body> — målt: `document.activeElement` er BODY, og de
// fem nye knapper er der uden at noget peger på dem. Fokus flyttes derfor til
// Pause, den knap man skal bruge som det næste.
watch(() => !!rp.value, (running) => {
    if (!running) return;
    nextTick(() => {
        const inside = rootRef.value?.contains(document.activeElement);
        // Kun hvis fokus faldt på gulvet eller stod i menuen i forvejen —
        // ellers ville vi rive markøren væk fra et helt andet sted på siden.
        if (document.activeElement !== document.body && !inside) return;
        rootRef.value?.querySelector('.play-toggle')?.focus();
    });
});
</script>

<template>
  <!-- role="group": et <div> uden rolle er `generic`, og ARIA forbyder et
       navn på den — så `aria-label` blev droppet igen, og menuen åbnede sig
       tavst for en skærmlæser, netop i det tilfælde hvor roden selv tager imod
       fokus (ingen optagelse => "Se kørslen" er slået fra og kan ikke
       fokuseres). Med en rigtig rolle bliver navnet læst op, og
       aria-describedby sørger for, at FORKLARINGEN følger med — det var det,
       fokus på roden skulle opnå. -->
  <div ref="rootRef" class="replay-menu" :style="menuStyle" @focusout="onRootFocusOut"
       tabindex="-1" role="group" aria-label="Se kørslen"
       :aria-describedby="rp ? null : 'replay-menu-intro'">
    <div class="arrow" :style="arrowStyle"></div>

    <template v-if="!rp">
      <button class="start" @click="emit('start')" :disabled="!canReplay || !recordingMatches">
        <Clapperboard :size="14" />
        <span>Se kørslen</span>
      </button>
      <p v-if="attemptsText" class="attempts">{{ attemptsText }}</p>
      <p v-if="blockedReason" id="replay-menu-intro" class="warning">{{ blockedReason }}</p>
      <p v-else-if="!canReplay" id="replay-menu-intro" class="help">
        Der er ingen kørsel at vise endnu. Tryk {{ UI_NAMES.generate }}, så optages den
        automatisk — og her kan du bagefter se, hvordan grupperne blev til.
      </p>
      <p v-else id="replay-menu-intro" class="help">
        Se den gemte vej fra uddelingen til resultatet. Dine grupper røres ikke.
      </p>
    </template>

    <template v-else>
    <div class="row">
      <button class="btn" @click="replay.restart()"
              :disabled="!rp.frameIndex"
              title="Forfra — se uddelingen igen" aria-label="Start forfra">
        <RotateCcw :size="14" />
      </button>

      <!-- .play-toggle: fokus lander her, når afspilningen starter og
           "Se kørslen" forsvinder under fingeren. -->
      <button class="btn play-toggle" @click="replay.toggle()"
              :title="rp.playing ? 'Pause' : 'Afspil'"
              :aria-label="rp.playing ? 'Pause' : 'Afspil'">
        <Pause v-if="rp.playing" :size="14" />
        <Play v-else :size="14" />
      </button>

      <input class="scrubber" type="range" min="0" :max="rp.total"
             :value="rp.frameIndex" :disabled="!rp.total"
             aria-label="Spol i afspilningen"
             @input="replay.seek($event.target.value)" />

      <button class="btn" @click="replay.toEnd()" :disabled="!rp.total"
              title="Hop til slut" aria-label="Hop til slut">
        <SkipForward :size="14" />
      </button>
    </div>

    <div class="row">
      <label class="speed-field">
        <span>ms pr. bytte</span>
        <input type="number" :min="replay.MIN_SPEED_MS" :max="replay.MAX_SPEED_MS" step="10"
               v-model.number="speed"
               aria-label="Hastighed i millisekunder pr. bytte" />
      </label>

      <select v-if="rp.recording.runs.length > 1" class="runs"
              :value="rp.runIndex" aria-label="Vælg kørsel"
              @change="replay.selectRun($event.target.value)">
        <option v-for="(run, i) in rp.recording.runs" :key="i" :value="i">
          Kørsel {{ i + 1 }}{{ run.won ? ' (vandt)' : '' }}
        </option>
      </select>
    </div>

    <p class="status">{{ status }}</p>
    <p v-if="attemptsText" class="attempts">{{ attemptsText }}</p>

    <p v-if="kindLabel" class="kind" :data-kind="rp.last ? rp.last.kind : ''">{{ kindLabel }}</p>

    <!-- Et slutbillede der LIGNER lærerens grupper uden at være dem, er værre
         end ingen animation. Etiketten står fast, ikke som et tooltip. -->
    <p v-if="currentRun && !currentRun.won" class="warning">
      Denne kørsel blev valgt fra — det er ikke dine grupper.
    </p>
    <!-- Den nye motor: for mange trin til at vise alle, så slutningen er lagt
         sammen til ét spring. Grupperne til sidst er stadig de rigtige. -->
    <p v-if="currentRun && currentRun.merged" class="warning">
      Der var for mange bytter til at vise dem alle — slutningen er samlet i ét spring.
    </p>
    <p v-if="currentRun && currentRun.truncated" class="warning">
      Optagelsen stopper efter {{ rp.total - rp.dealCount }} bytter — slutningen vises ikke.
    </p>
    </template>
  </div>
</template>

<style scoped>
/* Flade, ramme, skygge og knappernes udseende står i BetaStyles.vue (samme
   som de andre menuer, der svæver), som vinder over de scoped regler. */
.replay-menu {
    position: absolute;
    /* Lige over knappen — samme mål som kørselshistorikken. */
    inset-block-end: calc(100% + 10px);
    inset-inline-start: 0;
    z-index: 20;
    padding: 10px;
    box-sizing: border-box;
    /* Fast bredde — se begrundelsen i useBarPopover.js. Sættes også i JS,
       som skrumper den på en smal skærm. */
    inline-size: 320px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-align: start;
}

/* Den lille pil ned mod knappen */
.arrow {
    position: absolute;
    inset-block-start: 100%;
    inline-size: 12px;
    block-size: 6px;
    border-inline: 1px solid;
    border-block-end: 1px solid;
    clip-path: polygon(0 0, 100% 0, 50% 100%);
}

.row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.help {
    margin: 0;
    font-size: 11px;
    line-height: 1.4;
    color: var(--text-muted);
}

.start {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-block-size: 32px;
    font-size: 12px;
    cursor: pointer;
}

.start:disabled { opacity: 0.45; cursor: not-allowed; }

.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    /* 44 px er minimum for en finger — knappen er lille, så feltet omkring
       den bærer resten. */
    min-inline-size: 34px;
    min-block-size: 30px;
    cursor: pointer;
}

.btn:disabled { opacity: 0.45; cursor: not-allowed; }

.scrubber {
    flex: 1 1 auto;
    min-inline-size: 0;
    accent-color: var(--primary);
    cursor: pointer;
}

.speed-field {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
}

.speed-field input {
    inline-size: 64px;
    padding-inline: 6px;
    padding-block: 4px;
    border: 1px solid var(--border-input);
    border-radius: 8px;
    background: var(--bg-input);
    color: var(--text-main);
    font-size: 12px;
}

.runs {
    flex: 1 1 auto;
    min-inline-size: 0;
    padding-inline: 6px;
    padding-block: 4px;
    border: 1px solid var(--border-input);
    border-radius: 8px;
    background: var(--bg-input);
    color: var(--text-main);
    font-size: 12px;
}

/* Hvilket forsøg grupperne kom fra. Mørkere end hjælpeteksten:
   det er et svar, ikke en forklaring. */
.attempts {
    margin: 0;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-main);
    font-variant-numeric: tabular-nums;
    line-height: 1.4;
}

.status {
    margin: 0;
    font-size: 11px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    line-height: 1.4;
}

/* Farven bærer forklaringen: næsten halvdelen af bytterne er motoren, der
   gør det VÆRRE med vilje for at slippe ud af en blindgyde. Uden den skelnen
   ser afspilningen ud som om programmet flytter rundt i blinde. */
.kind {
    margin: 0;
    align-self: flex-start;
    padding-inline: 8px;
    padding-block: 3px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    background: var(--surface-tint);
    color: var(--text-link);
}

.kind[data-kind="0"] { background: var(--color-success-bg); color: var(--color-success); }
.kind[data-kind="1"] { background: var(--color-warning-bg); color: var(--color-warning); }

.warning {
    margin: 0;
    padding-inline: 8px;
    padding-block: 4px;
    border-radius: 8px;
    background: var(--color-warning-bg);
    color: var(--color-warning);
    font-size: 11px;
    font-weight: 600;
    line-height: 1.4;
}
</style>
