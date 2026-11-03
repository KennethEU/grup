<script setup>
// Opskriftens regellinjer — én linje pr. regel, i prioriteret rækkefølge.
// Bruges af både stamgruppe-opskriften (klassens `rules`) og matrix-runden
// (`matrixRules`). Ændringerne sker på listen selv via recipe.js, med de
// samme regler som den almindelige regelliste (kun én Opdel, øverst; ingen
// Opdel i matrix). Forælderen gemmer, når der kommer `changed`.
import { computed, nextTick, ref } from 'vue';
import { ChevronUp, ChevronDown, GripVertical, X } from 'lucide-vue-next';
import { reactiveState as state } from '../../js/modules/reactiveState.js';
import {
    RULE_OPTIONS, RULE_TYPES, RULE_DESCRIPTIONS, RULE_WEIGHT_NOTES, MATRIX_EXCLUDED_RULES,
    teacherColumns, canonicalSpellings, valueKey,
} from '../../js/modules/utils.js';
import { ruleSentence, ruleIsIncomplete, updateRuleField, deleteRule, columnFitness, findTwinRule, ruleDisplayOrder,
    tierIsOrdered, tierPositions, moveRuleInTier, setTierOrder } from '../../js/modules/recipe.js';
import { runStatusFor } from '../../js/modules/nextEngine.js';
import RuleMark from './RuleMark.vue';
import { useReorderDrag } from '../../composables/useReorderDrag.js';
import { modalActions } from '../../js/modules/modalState.js';
import RecipeToken from './RecipeToken.vue';
import './recipe.css';

const props = defineProps({
    rules: { type: Array, required: true },
    isMatrix: { type: Boolean, default: false },
    idColumn: { type: String, default: '' },
});
const emit = defineEmits(['changed']);

const rows = computed(() => state.currentClass?.data || []);
// Har klassen aftaler om bestemte elever? Så forklarer "Hvorfor?" også dem
// (kun i stamgrupperne — Skal sammen gælder ikke matrix-runden).
const hasAgreements = computed(() => !props.isMatrix
    && ((state.currentClass?.togetherGroups || []).length + (state.currentClass?.separations || []).length) > 0);
const hasAggregate = computed(() => props.rules.some(r => r?.type === RULE_TYPES.AGGREGATE));

const columnOptions = computed(() =>
    teacherColumns(state.currentClass?.columns).filter(c => c !== props.idColumn));

function valueOptions(rule) {
    if (!rule?.column || !rows.value.length) return [];
    return [...canonicalSpellings(rows.value, rule.column).values()]
        .sort((a, b) => a.localeCompare(b, 'da', { numeric: true }));
}
// Rullelisten i den almindelige opsætning matcher uden hensyn til store/små
// bogstaver (valueKey), så "høj" på reglen og "Høj" i kolonnen er samme valg.
const isCurrentValue = (rule, v) => !!rule.value && valueKey(v) === valueKey(String(rule.value).trim());
// En værdi, der allerede har sin egen Adskil-linje, er gråt — den ville være en tvilling.
const valueTaken = (rule, v, index) => !isCurrentValue(rule, v) && findTwinRule(props.rules, rule.type, rule.column, v, index) >= 0;

// Hvad klassen indeholder lige nu — så ruleSentence kan se, hvad der er blevet slettet.
const sentenceContext = computed(() => ({
    columns: teacherColumns(state.currentClass?.columns),
    rows: rows.value,
}));

const orders = computed(() => state.currentClass?.columnOrders || {});

// Linjerne i den rækkefølge, de vises: i trin efter type (ruleDisplayOrder i
// recipe.js), og INDEN FOR et trin som i listen — der er rækkefølgen en
// prioritering (se "Rækkefølgen inden for et trin" i recipe.js). Motoren får
// reglerne i præcis den rækkefølge (buildEngineInput).
const displayed = computed(() => {
    const base = ruleDisplayOrder(props.rules);
    // Under et træk: trinnets regler i den rækkefølge, de står under musen.
    // Klassens liste ændres først ved slip (se "Træk-og-slip" nedenfor).
    const pos = dragPositions.value;
    if (!pos.length) return base;
    return base.map(d => {
        const k = pos.indexOf(d.index);
        return k < 0 ? d : { ...d, rule: dragWork.value[k] };
    });
});
const lineNo = computed(() => new Map(displayed.value.map((d, pos) => [d.index, pos + 1])));
// Pile og trækhåndtag i et trin med mindst to regler.
const tierCounts = computed(() => {
    const counts = {};
    for (const d of displayed.value) counts[d.tier] = (counts[d.tier] || 0) + 1;
    return counts;
});
const tierMovable = (tier) => tierIsOrdered(tier) && (tierCounts.value[tier] || 0) >= 2;
const anyMovable = computed(() => Object.keys(tierCounts.value).some(tierMovable));
// Hvad blev opfyldt ved sidste kørsel? (null, når opskriften, klassen eller
// grupperne er ændret siden — se runStatusFor i nextEngine.js)
// Under et træk vises ingen mærker: de hører til regler, der lige nu er på
// vej et andet sted hen.
const marks = computed(() => (dragPositions.value.length ? null : runStatusFor(props.isMatrix)?.rules || null));

// Står den samme regel allerede i en ANDEN linje? To ens linjer gør intet
// ekstra (hints.js advarer om netop det), så valget er gråt med linjen i
// stedet. "Ens" er type + kolonne + (for Adskil) værdi — se findTwinRule.
// Svarer med en tekst til menuen, eller ''.
function twinLine(type, column, value, index) {
    const at = findTwinRule(props.rules, type, column, value, index);
    if (at < 0) return '';
    return `linje ${lineNo.value.get(at)}`;
}
const fit = (column, type) => columnFitness(rows.value, column, type, orders.value);

// Menuen tilbyder kun det, der kan virke: en regeltype, kolonnen ikke passer
// til, er grå med forklaringen i stedet for beskrivelsen.
function typeOptions(rule, index) {
    return RULE_OPTIONS
        .filter(o => !(props.isMatrix && MATRIX_EXCLUDED_RULES.includes(o.value)))
        .map(o => {
            const onlyOne = o.value === RULE_TYPES.AGGREGATE && hasAggregate.value && rule.type !== RULE_TYPES.AGGREGATE;
            const f = rule.column ? fit(rule.column, o.value) : { ok: true };
            const misfit = !f.ok && o.value !== rule.type;
            const twin = o.value !== rule.type ? twinLine(o.value, rule.column, rule.value, index) : '';
            let desc = RULE_DESCRIPTIONS[o.value] || '';
            let weight = RULE_WEIGHT_NOTES[o.value] || '';
            if (misfit) { desc = `Passer ikke til ${rule.column}: ${f.note}.`; weight = ''; }
            else if (twin) { desc = `Står allerede på ${rule.column} i ${twin}.`; weight = ''; }
            return {
                ...o,
                onlyOne,
                desc,
                weight,
                disabled: onlyOne || misfit || !!twin,
            };
        });
}

// Kolonnerne, med dem der ikke kan bruges til reglen gråt ud. En tekstkolonne
// til Ensartede/Balancér kan rangeres direkte herfra.
function columnChoices(rule, index) {
    return columnOptions.value.map(c => {
        const f = fit(c, rule.type);
        // Skifter kolonnen, tømmes værdien (updateRuleField) — så tvillingen måles uden.
        const twin = c !== rule.column ? twinLine(rule.type, c, '', index) : '';
        const ok = (f.ok || c === rule.column) && !twin;
        const note = !f.ok ? f.note : (twin ? `står i ${twin}` : '');
        return { name: c, ok, note, rankable: !f.ok && f.reason === 'tekst' };
    });
}
function rank(column, close) {
    close?.(false);
    // Opskriften lukkes først — Ranger-vinduet er et almindeligt lag og
    // åbnede ellers usynligt bag opskriftens vindue (browserens øverste lag).
    window.dispatchEvent(new CustomEvent('recipe-dialog:request', { detail: { open: false } }));
    modalActions.openColumnOrder(column);
}

// Fokus efter en ændring med tastaturet. Linjerne har nøgle efter deres plads
// i listen, så efter en flytning står den knap, man trykkede på, ved en ANDEN
// regel: endnu et tryk på "Flyt ned" flyttede reglen tilbage igen. Og forsvinder
// linjen (Fjern reglen på den sidste) eller flytter Vue den i DOM'en, falder
// fokus ud af vinduet. Derfor findes knappen igen på reglens nye plads.
// `list` er linjernes <ol>, læst FØR ændringen (knappen kan være væk bagefter).
async function refocus(list, index, names) {
    await nextTick();
    const line = list?.querySelector(`.recipe__line--rule[data-rule-index="${index}"]`);
    for (const name of names) {
        const b = line?.querySelector(`button[aria-label="${name}"]:not(:disabled)`);
        if (b) { b.focus(); return; }
    }
    // Ingen regler tilbage: "+ Tilføj regel" i vinduets bund
    if (!line) list?.closest('dialog')?.querySelector('.recipe__add button')?.focus();
}
const listOf = (e) => e?.currentTarget?.closest?.('ol');

function setField(index, field, value, close, e) {
    const err = updateRuleField(props.rules, index, field, value);
    if (err) { window.notifyError?.(err); return; }
    const list = listOf(e);
    close?.();
    emit('changed');
    // Et nyt regelvalg kan flytte linjen (uden prioritet står linjerne efter
    // type). Kun hvis fokus faktisk er faldet ud, sættes det på ordet igen.
    const label = { type: 'Regel', column: 'Kolonne', value: 'Værdi' }[field];
    nextTick(() => {
        const a = document.activeElement;
        if (a && a !== document.body) return;
        list?.querySelector(`.recipe__line--rule[data-rule-index="${index}"] .rtok__btn[aria-label^="${label}:"]`)?.focus();
    });
}
function onMove(index, delta, e) {
    const list = listOf(e);
    // Byt med naboen i samme trin.
    const target = moveRuleInTier(props.rules, index, delta);
    if (target < 0) return;
    emit('changed');
    // Samme pil først; står reglen nu øverst/nederst, er den grå, og så den anden.
    // Fra trækhåndtaget (pil op/ned på tastaturet) bliver fokus på håndtaget.
    const fromHandle = e?.currentTarget?.classList?.contains('recipe__grip');
    const names = fromHandle ? ['Træk for at flytte'] : (delta < 0 ? ['Flyt op (vigtigere)', 'Flyt ned'] : ['Flyt ned', 'Flyt op (vigtigere)']);
    refocus(list, target, names);
}
function onDelete(index, e) {
    const list = listOf(e);
    if (!deleteRule(props.rules, index)) return;
    emit('changed');
    // Næste regels kryds — det forrige, hvis det var den sidste
    refocus(list, Math.min(index, props.rules.length - 1), ['Fjern reglen']);
}
const tierAt = (i) => { const p = tierPositions(props.rules, i); return { p, at: p.indexOf(i) }; };
const canMoveUp = (i) => tierAt(i).at > 0;
const canMoveDown = (i) => { const { p, at } = tierAt(i); return at >= 0 && at < p.length - 1; };

// ─── Træk-og-slip inden for et trin ─────────────────────────────────────────
// Kenneth vil kunne trække med musen; pilene er vejen for tastaturet. Den
// fælles useReorderDrag (som Ranger-vinduet og kolonnelisterne) skubber
// listen undervejs og lægger den tilbage, hvis man slipper uden for den. Her
// arbejder den på TRINNETS regler, og linjerne viser dens rækkefølge
// (displayed ovenfor). Klassens liste ændres først, når reglen slippes
// (setTierOrder) — skrev hvert lille ryk i klassen, ændrede opsætningen sig
// under musen: "Sidste dannelse" og mærkerne forsvandt, advarsler kom frem, og
// vinduet skiftede højde og sprang (Kenneth 3/11 2026). Et træk ind i et
// andet trin bliver ikke til noget.
const dragWork = ref([]);
const dragPositions = ref([]);
const drag = useReorderDrag(dragWork, {
    onCommit: () => {
        setTierOrder(props.rules, dragPositions.value, dragWork.value);
        emit('changed');
    },
});
function dragStart(index, e) {
    dragPositions.value = tierPositions(props.rules, index);
    dragWork.value = dragPositions.value.map(i => props.rules[i]);
    drag.onDragStart(dragPositions.value.indexOf(index), e);
}
function dragOver(index, e) {
    const at = dragPositions.value.indexOf(index);
    if (at < 0) return;              // ikke trinnets linje: intet sted at slippe
    drag.onDragOver(at, e);
}
function dragDrop(e) {
    drag.onDrop(e);
    dragPositions.value = [];
}
function dragEnd() {
    drag.onDragEnd();
    dragPositions.value = [];
}
const isDragged = (index) => dragPositions.value.length > 0 && dragPositions.value[drag.draggedIndex.value] === index;
</script>

<template>
    <template v-for="{ rule, index, heading, tier } in displayed" :key="'r' + index">
    <li v-if="heading && rules.length > 1" class="recipe__line recipe__tier" aria-hidden="true">
        <span class="recipe__no"></span>
        <span class="recipe__text">{{ heading }}</span>
    </li>
    <li class="recipe__line recipe__line--rule" :data-rule-index="index"
        :class="{ 'is-incomplete': ruleIsIncomplete(rule), 'is-dragging': isDragged(index) }"
        @dragover="dragOver(index, $event)" @drop="dragDrop($event)">
        <span class="recipe__no"><RuleMark v-if="marks && marks[index]" :mark="marks[index]" />{{ lineNo.get(index) }}</span>
        <span class="recipe__text">
            <template v-for="(p, i) in ruleSentence(rule, sentenceContext)" :key="'p' + i">
                <RecipeToken v-if="p.token === 'type'" :text="p.text" label="Regel" wide v-slot="{ close }">
                    <button v-for="o in typeOptions(rule, index)" :key="o.value" type="button" class="recipe-opt"
                            :class="{ on: o.value === rule.type }" :disabled="o.disabled"
                            @click="setField(index, 'type', o.value, close, $event)">
                        <strong>{{ o.label }}<template v-if="o.onlyOne"> — kun én</template></strong>
                        <small>{{ o.desc }}</small>
                        <small v-if="o.weight" class="recipe-opt__weight">{{ o.weight }}</small>
                    </button>
                </RecipeToken>
                <RecipeToken v-else-if="p.token === 'column'" :text="p.text" :missing="p.missing" label="Kolonne" v-slot="{ close }">
                    <span class="recipe-pop-kicker">Kolonne</span>
                    <span v-for="c in columnChoices(rule, index)" :key="c.name" class="recipe-opt-row">
                        <button type="button" class="recipe-opt recipe-opt--plain"
                                :class="{ on: c.name === rule.column }" :disabled="!c.ok"
                                @click="setField(index, 'column', c.name, close, $event)">
                            {{ c.name }}<small v-if="!c.ok" class="recipe-opt__why">{{ c.note }}</small>
                        </button>
                        <button v-if="!c.ok && c.rankable" type="button" class="recipe-opt__rank" @click="rank(c.name, close)">Ranger</button>
                    </span>
                    <span v-if="!columnOptions.length" class="recipe-pop-note">Klassen har ingen kolonner at vælge.</span>
                </RecipeToken>
                <RecipeToken v-else-if="p.token === 'value'" :text="p.text" :missing="p.missing" label="Værdi" v-slot="{ close }">
                    <span class="recipe-pop-kicker">Værdi i {{ rule.column || 'kolonnen' }}</span>
                    <button v-for="v in valueOptions(rule)" :key="v" type="button" class="recipe-opt recipe-opt--plain"
                            :class="{ on: isCurrentValue(rule, v) }" :disabled="valueTaken(rule, v, index)"
                            @click="setField(index, 'value', v, close, $event)">{{ v }}<small v-if="valueTaken(rule, v, index)" class="recipe-opt__why">står i en anden linje</small></button>
                    <span v-if="!valueOptions(rule).length" class="recipe-pop-note">Vælg først en kolonne.</span>
                </RecipeToken>
                <span v-else-if="p.punct" class="recipe__punct">{{ p.text }}</span>
                            <template v-else>{{ p.text }}</template>
            </template>
        </span>
        <span class="recipe__tools">
            <!-- Pile og trækhåndtag i et trin med mindst to regler (pil op/ned
                 virker også på håndtaget). På tværs af trin flyttes intet. -->
            <button v-if="tierMovable(tier)" type="button" class="recipe__grip" draggable="true"
                    aria-label="Træk for at flytte" title="Træk for at flytte inden for trinnet — eller brug pilene"
                    @dragstart="dragStart(index, $event)" @dragend="dragEnd"
                    @keydown.up.prevent="onMove(index, -1, $event)" @keydown.down.prevent="onMove(index, 1, $event)"><GripVertical :size="15" /></button>
            <template v-if="tierMovable(tier)">
                <button type="button" :disabled="!canMoveUp(index)" aria-label="Flyt op (vigtigere)" title="Flyt op (vigtigere)" @click="onMove(index, -1, $event)"><ChevronUp :size="15" /></button>
                <button type="button" :disabled="!canMoveDown(index)" aria-label="Flyt ned" title="Flyt ned" @click="onMove(index, 1, $event)"><ChevronDown :size="15" /></button>
            </template>
            <button type="button" aria-label="Fjern reglen" title="Fjern reglen" @click="onDelete(index, $event)"><X :size="15" /></button>
        </span>
    </li>
    </template>
    <!-- Samme forklaring som under den almindelige regelliste. -->
    <li v-if="rules.length > 1" class="recipe__line recipe__line--quiet recipe__line--order">
        <span class="recipe__no"></span>
        <span class="recipe__text recipe__ordernote">
            Reglerne står i trin efter, hvor tungt de vejer. Inden for et trin
            er rækkefølgen en <strong>prioritering</strong>: den
            <strong>øverste</strong> vejer mest.<template v-if="anyMovable"> Træk i
            en regel, eller brug pilene, for at bytte om.</template>
            <RecipeToken text="Hvorfor?" label="Hvorfor står reglerne sådan" quiet>
                <span class="recipe-pop-kicker">Når reglerne ikke kan gå op</span>
                <div class="recipe-why">
                    <p>Grupperne dannes, så alle regler holdes, hvis det kan lade sig gøre. Kan de ikke det, giver de lette efter for de tunge:</p>
                    <ul>
                        <li><strong>Deles op først</strong> — Opdel deler klassen, før noget andet sker.</li>
                        <li><strong>Brydes kun, hvis intet andet er muligt</strong> — Adskil altid står altid først.</li>
                        <li><strong>Vejer tungt</strong> — Klyng og Adskil. Kan to af dem ikke holdes samtidig, vinder den øverste altid.</li>
                        <li><strong>Mål</strong> — Fordel, Balancér og Ensartede kommer så tæt på, som de kan. Alle trækker, men den øverste vejer mest, den næste lidt mindre, og så videre.</li>
                        <li><strong>Hvis det kan lade sig gøre</strong> — Saml står altid sidst.</li>
                    </ul>
                    <p>Typen bestemmer trinnet. Inden for trinnet bestemmer du rækkefølgen: træk i en regel, eller brug pilene. En regel kan ikke flyttes til et andet trin.</p>
                    <p v-if="hasAgreements">Aftalerne om bestemte elever går forud for reglerne: <strong>Skal sammen</strong> brydes aldrig — kan den ikke holdes, dannes grupperne ikke, og du får besked. <strong>Undgå hinanden</strong> vejer lige efter Adskil altid, altså tungere end Klyng og Adskil, og brydes kun, hvis det slet ikke kan gå op.</p>
                </div>
            </RecipeToken>
        </span>
    </li>
</template>
