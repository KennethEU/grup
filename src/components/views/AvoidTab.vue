<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import { reactiveState } from '../../js/modules/reactiveState.js';
import { studentById } from '../../js/modules/lookups.js';
import { UNNAMED_STUDENT } from '../../js/modules/utils.js';
import { mergeTogether, deadTogetherIndexes } from '../../js/modules/together.js';
import { autoSave, coveredSeparationIndexes } from '../../js/modules/classActions.js';

const props = defineProps({
    together: { type: Boolean, default: false }
});

// Listen i klassen, fanen viser: "Skal sammen" eller "Undgå".
const listKey = computed(() => props.together ? 'togetherGroups' : 'separations');

/**
 * Undgåelserne med det, listen ikke sagde før: om de stadig GØR noget.
 *
 * En undgåelse peger på elevernes _rowId, og id'et overlever, når eleven
 * gør det ikke. Sletter læreren en elev, bliver rækken stående i listen —
 * og den viste bare "(uden navn)", samme tekst som en elev der er i klassen
 * men mangler et navn i visningskolonnen. To vidt forskellige ting, ét ord.
 *
 * Og vigtigere: er der under to elever tilbage i lokalet, sender
 * generation.js slet ikke undgåelsen til motoren (se validIds dér). Den står
 * altså på listen og tælles i badget, men gør ingenting. Det skal siges.
 *
 * Opslaget går gennem det delte kort (ét Map-opslag), ikke gennem en
 * gennemløbning af hele elevlisten pr. elev pr. gennemtegning.
 */
const separations = computed(() => {
    const cls = reactiveState.currentClass;
    const agreements = cls?.[listKey.value];
    if (!Array.isArray(agreements)) return [];

    const byId = studentById.value;
    const col = reactiveState.displayColumn;
    const connected = props.together ? mergeTogether(agreements) : [];
    // En større undgåelse dækker sine delmængder. Rækken bliver stående —
    // læreren har ikke trukket den tilbage — men den skal kunne ses som det,
    // den er: uden virkning så længe den større regel står.
    const covered = props.together ? new Set() : coveredSeparationIndexes(agreements);
    // "Skal sammen" kan binde gennem en slettet elev — se deadTogetherIndexes.
    const deadTogether = props.together ? deadTogetherIndexes(agreements, cls.data || []) : null;
    // Åbnet fra en advarsel ("Vis aftalen"): markér de aftaler, der rører
    // advarslens elever. Kun på Skal sammen-fanen — det er den, der åbnes.
    const highlight = new Set(props.together ? (reactiveState.agreementHighlight || []) : []);

    return agreements.map((sep, index) => {
        const members = (Array.isArray(sep.ids) ? sep.ids : []).map(rawId => {
            // Kortet er bygget på _rowId — identiteten er altid _rowId.
            const student = byId.get(String(rawId ?? '').trim());
            if (!student) return { name: 'Ikke længere i klassen', status: 'gone' };
            const val = col ? String(student[col] ?? '').trim() : '';
            return {
                name: val || UNNAMED_STUDENT,
                status: student._excluded ? 'absent' : 'ok',
            };
        });

        // Kun elever der faktisk er i lokalet holder undgåelsen i live.
        const presentCount = members.filter(m => m.status === 'ok').length;
        const connectedIds = connected.find(ids => ids.some(id => sep.ids.includes(id)));
        const effectiveCount = connectedIds ? connectedIds.filter(id => {
            const student = byId.get(id);
            return student && !student._excluded;
        }).length : presentCount;
        // "Væk" og "fraværende" er to forskellige ting. Er der under to af
        // aftalens elever TILBAGE I KLASSEN, kommer den aldrig i brug igen —
        // det er ikke et "lige nu", og det skal den ikke sige.
        //
        // For "Skal sammen" er det ikke nok at tælle aftalens egne elever:
        // Anna+Bo og Bo+Sara holder Anna og Sara sammen, også når Bo er
        // slettet. Rækken sagde før både "Gælder stadig" og "Gælder ikke
        // længere" på én gang, og oprydningen fjernede en binding, motoren
        // brugte.
        const stillHere = members.filter(m => m.status !== 'gone').length;
        const dead = props.together ? deadTogether.has(index) : stillHere < 2;
        const highlighted = (sep.ids || []).some(id => highlight.has(String(id ?? '').trim()));
        return { index, members, dead, highlighted,
            // En død række er grå, også når dens ene elev er med i en
            // anden aftale — det er den anden aftale, der virker.
            inactive: dead || effectiveCount < 2,
            linked: !dead && presentCount < 2 && effectiveCount >= 2,
            covered: covered.has(index) };
    });
});

/**
 * De aftaler der aldrig kan gøre noget igen: under to af eleverne står
 * stadig i klassen.
 *
 * Fraværende elever tæller MED her — fraværet gælder i dag, aftalen gælder
 * til den bliver fjernet. Kun en slettet elevrække er endelig.
 */
const deadRows = computed(() => separations.value.filter(sep => sep.dead));

/**
 * Ryd op i dem, der ikke gælder længere.
 *
 * Sker ikke af sig selv, når eleven slettes: aftalen kan være det eneste sted,
 * en beslutning om to elever står skrevet, og læreren skal kunne se den, før
 * den ryger. Derfor en knap frem for en automatisk sletning.
 *
 * Kun HELT døde aftaler ryddes. Er tre elever aftalt og én slettet, virker
 * aftalen stadig mellem de to andre — den bliver stående med det slettede
 * navn synligt, så det læreren kan læse, er det aftalen faktisk gør.
 */
function removeDead() {
    if (reactiveState.isGenerating) return;
    const doomed = new Set(deadRows.value.map(sep => sep.index));
    if (doomed.size === 0) return;
    const list = reactiveState.currentClass[listKey.value];
    // Bagfra, så de resterende indeks ikke flytter sig under os.
    for (let i = list.length - 1; i >= 0; i--) {
        if (doomed.has(i)) list.splice(i, 1);
    }
    autoSave();
    window.notifyInfo?.(doomed.size === 1
        ? (props.together ? 'Aftalen er fjernet.' : 'Undgåelsen er fjernet.')
        : `${doomed.size} ${props.together ? 'aftaler' : 'undgåelser'} er fjernet.`);
    keepFocus(0);
}

// Rul den første markerede aftale frem — listen kan være lang.
const tableRef = ref(null);
onMounted(() => nextTick(() => {
    tableRef.value?.querySelector('.avoid-row--highlight')?.scrollIntoView({ block: 'nearest' });
}));

// Fokus efter en sletning med tastaturet. Rækkerne har nøgle efter deres plads
// i listen, så et kryds midt i listen bliver stående og hører nu til den næste
// aftale — fint. Men fjernes den SIDSTE række (eller den eneste), forsvinder
// knappen med fokus, og markøren faldt ud af vinduet til siden bagved. Det
// samme skete med oprydningsknappen, der forsvinder, når der er ryddet op.
// Derfor: rækkens kryds på samme plads, ellers den forrige, ellers den valgte
// fane øverst i vinduet. Kun hvis fokus faktisk er faldet ud.
function keepFocus(index) {
    const dialog = tableRef.value?.closest('[role="dialog"]');
    nextTick(() => {
        const a = document.activeElement;
        if (a && a !== document.body && a.isConnected) return;
        const buttons = [...(tableRef.value?.querySelectorAll('.btn-remove:not(:disabled)') || [])];
        const target = buttons[Math.min(index, buttons.length - 1)]
            || dialog?.querySelector('[role="tab"][aria-selected="true"]');
        target?.focus();
    });
}

function removeSeparation(index) {
    if (reactiveState.isGenerating) return;
    reactiveState.currentClass[listKey.value].splice(index, 1);
    autoSave();
    keepFocus(index);
}
</script>

<template>
    <div class="avoid-inline">
        <p v-if="together" class="avoid-hint">
            Eleverne holdes samlet ved næste dannelse af stamgrupper. Resten af gruppen kan skifte.
            Aftalen bliver gemt, til du fjerner den. Fraværende elever springes over.
            Aftaler med fælles elever gælder samlet. Matrixgrupper følger deres egne regler.
        </p>
        <p v-if="together && separations.length === 0" class="avoid-hint">
            Luk vinduet, markér mindst to elever og vælg <strong>Lav aftale → Skal sammen</strong>.
        </p>
        <p v-if="!together && separations.length === 0" class="avoid-hint">
            Luk vinduet, markér mindst to elever og vælg <strong>Lav aftale → Undgå hinanden</strong>.
            Så kommer de aldrig i gruppe sammen.
        </p>

        <p v-if="deadRows.length" class="avoid-cleanup">
            <button type="button" class="avoid-cleanup-btn" :disabled="reactiveState.isGenerating" @click="removeDead">
                Fjern {{ deadRows.length === 1
                    ? (together ? 'aftalen' : 'undgåelsen')
                    : deadRows.length + (together ? ' aftaler' : ' undgåelser') }}, der ikke gælder længere
            </button>
        </p>

        <div v-if="separations.length" ref="tableRef" class="avoid-table-container">
            <div v-for="sep in separations" :key="sep.index" class="avoid-row"
                 :class="{ 'avoid-row--inactive': sep.inactive, 'avoid-row--highlight': sep.highlighted }">
                <div class="col-students">
                    <div class="student-names">
                        <template v-for="(m, ni) in sep.members" :key="ni">
                            <span v-if="ni > 0" class="separator"> {{ together ? '+' : '×' }} </span><span class="member-name"
                                :class="{ 'name--gone': m.status === 'gone', 'name--absent': m.status === 'absent' }"
                            >{{ m.name }}</span><span v-if="m.status === 'absent'" class="name-note"> (fraværende)</span>
                        </template>
                    </div>
                    <p v-if="sep.highlighted" class="avoid-note avoid-note--highlight">
                        Det er denne aftale, advarslen over grupperne handler om.
                    </p>
                    <p v-if="sep.covered" class="avoid-note">
                        Gør ingen forskel lige nu — de samme elever indgår allerede i en større undgåelse.
                    </p>
                    <p v-if="sep.linked" class="avoid-note">
                        Gælder stadig gennem andre Skal sammen-aftaler med fælles elever.
                    </p>
                    <p v-if="sep.dead" class="avoid-note">
                        Gælder ikke længere — under to af eleverne står i klassen.
                    </p>
                    <p v-else-if="sep.inactive" class="avoid-note">
                        Gør ingenting lige nu — der er under to af eleverne i klassen og til stede.
                    </p>
                </div>
                <div class="col-action">
                    <button class="btn-remove" :title="together ? 'Fjern aftale' : 'Fjern undgåelse'" :aria-label="together ? 'Fjern aftale' : 'Fjern undgåelse'" :disabled="reactiveState.isGenerating" @click="removeSeparation(sep.index)">&times;</button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.avoid-inline {
    max-inline-size: 900px;
}

.avoid-hint {
    color: var(--text-muted);
    font-size: var(--font-sm);
    line-height: 1.5;
    margin: 0;
    padding: 8px 12px;
}

.avoid-table-container {
    border-radius: var(--radius-sm);
    overflow: hidden;
}

.avoid-cleanup {
    margin: 0;
    padding-block: 0 8px;
    padding-inline: 12px;
}

/* Diskret: oprydningen er et tilbud, ikke sidens ærinde. */
.avoid-cleanup-btn {
    background: none;
    border: 1px dashed var(--border-medium);
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    font-family: inherit;
    font-size: var(--font-xs);
    padding-block: 6px;
    padding-inline: 10px;
    min-block-size: 44px;
    cursor: pointer;
    text-align: start;
}

.avoid-cleanup-btn:hover:not(:disabled) {
    background: var(--bg-surface-hover);
    color: var(--text-main);
}

.avoid-cleanup-btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
}

.avoid-row {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    border-block-end: 1px solid var(--border-subtle);
    transition: background 0.15s;
    border-radius: var(--radius-sm);
}

.avoid-row:hover {
    background: var(--bg-surface-hover);
}

.avoid-row:last-child {
    border-block-end: none;
}

/* Aftalen advarslen handler om. Samme gule tone som advarsler ellers har. */
.avoid-row--highlight,
.avoid-row--highlight:hover {
    background: var(--color-warning-bg);
    border-inline-start: 3px solid var(--color-warning);
}

.avoid-note.avoid-note--highlight {
    color: var(--text-main);
}

/* min-inline-size: 0 — ellers kan en flex-kolonne ikke blive smallere end
   sit længste ord, og et navn uden mellemrum skubbede fjern-knappen ud. */
.col-students { flex: 1; min-inline-size: 0; }
.col-action { inline-size: 44px; text-align: end; }

.student-names {
    font-weight: 500;
    font-size: var(--font-sm);
    color: var(--text-main);
}

/* Et navn brydes som ÉN enhed: "Anna Holm + Mads Ærø" må gå over to linjer
   ved plusset, ikke mellem for- og efternavn. inline-block holder navnet
   samlet; max-inline-size lader et navn, der er længere end hele linjen,
   bryde inde i sig selv i stedet for at løbe ud over vinduet. */
.member-name {
    display: inline-block;
    max-inline-size: 100%;
    overflow-wrap: anywhere;
}

.separator {
    color: var(--text-muted);
    margin: 0 2px;
}

/* En undgåelse der ikke gør noget, skal ikke se lige så levende ud som en
   der gør — men den skal stadig kunne læses, så den kan fjernes. */
.avoid-row--inactive .student-names {
    color: var(--text-muted);
}

.name--gone {
    text-decoration: line-through;
    color: var(--text-muted);
}

.name--absent {
    color: var(--text-muted);
}

.name-note {
    color: var(--text-muted);
    font-weight: 400;
}

.avoid-note {
    margin-block: 4px 0;
    color: var(--text-muted);
    font-size: var(--font-xs);
    line-height: 1.4;
}

.btn-remove {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 18px;
    cursor: pointer;
    padding-block: 2px;
    padding-inline: 8px;
    min-inline-size: 44px;
    min-block-size: 44px;
    border-radius: var(--radius-sm);
    transition-property: var(--ctl-transition);
    transition-duration: 0.15s;
    line-height: 1;
}

.btn-remove:hover {
    background: var(--color-error-hover);
    color: var(--color-error);
}
</style>
