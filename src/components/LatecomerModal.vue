<script setup>
import { ref, computed, onMounted } from 'vue';
import { useModalFocus } from '../composables/useModalFocus.js';
import { UI_NAMES } from '../js/modules/beta.js';
import { reactiveState as state } from '../js/modules/reactiveState.js';
import { pushUndo } from '../js/modules/state.js';
import * as storage from '../js/modules/storage.js';
import { autoSave } from '../js/modules/classActions.js';
// Selve placerings-logikken (emne > undgåelse > størrelse > regler) bor i
// placement.js, hvor den er dækket af unit-tests — se placement.test.js.
import { separationConflictIds, partnersOutside, findBestGroup } from '../js/modules/placement.js';
import { mergeTogether } from '../js/modules/together.js';
import { ROW_ID, memberIdStr, memberDisplayName, groupDisplayName, matrixSourceById } from '../js/modules/utils.js';

const emit = defineEmits(['close']);

const selectedStudentIds = ref([]);
const isMatrixMode = ref(false);

onMounted(() => {
    if (!state.currentClass || !state.currentClass.data) { emit('close'); return; }

    isMatrixMode.value = state.activeView === 'matrix';

    const groups = isMatrixMode.value ? state.storedMatrixGroups : state.storedStandardGroups;
    if (!groups || groups.length === 0) {
        window.notifyInfo?.(`Tryk ${UI_NAMES.generate} først, så der er grupper at placere en efternøler i.`);
        emit('close');
        return;
    }

    if (eligibleStudents.value.length === 0) {
        window.notifyInfo?.('Alle elever er allerede i en gruppe.');
        emit('close');
    }
});

// Medlemmer bæres ALTID rundt som `_rowId` — det er dét `state.idColumn` er
// (se state.js). Faldt vi tilbage på klassens første kolonne, ville
// `assignedIds` indeholde rækkernes id'er, mens `eligibleStudents` slog op på
// et navn: ingen af delene ville matche, og HVER elev ville stå som "ikke
// tildelt", også dem der sad pænt i en gruppe. En forkert id-kolonne er ikke
// noget at falde tilbage på — så faldet går til ROW_ID.
const idCol = computed(() => state.idColumn || ROW_ID);

// All student IDs currently in any group
const assignedIds = computed(() => {
    const groups = isMatrixMode.value
        ? (state.storedMatrixGroups || [])
        : (state.storedStandardGroups || []);
    const ids = new Set();
    groups.forEach(g => {
        g.members.forEach(m => ids.add(memberIdStr(m)));
    });
    return ids;
});

// Students eligible for placement:
// 1. Excluded (previously absent) — now returning
// 2. Simply not in any group (came late, added after generation)
const eligibleStudents = computed(() => {
    if (!state.currentClass?.data) return [];
    return state.currentClass.data.filter(s => {
        if (s._excluded) return true; // was marked absent, want to add back
        const id = String(s[idCol.value] ?? '').trim();
        return id && !assignedIds.value.has(id); // not in any group
    });
});

const isReturning = (s) => !!s._excluded;

function getLabel(s) {
    // Lærerens visningskolonne — før gættede vi på "navn"/"name"/"elev" og
    // faldt ellers tilbage på ID-værdien (som nu ville være et _rowId).
    return memberDisplayName(s[ROW_ID], state.currentClass?.data, state.displayColumn);
}

function getId(s) { return s[idCol.value]; }

// Context for placement.js — topics apply only in standard view (matrix
// groups have no class topics).
//
// `togetherComponents` og `sourceById` er de to hensyn, placeringen tidligere
// var blind for. Aftalen er et krav i motoren, men blev slet ikke set her, så
// en elev der kom tilbage kunne blive sat væk fra dem, hun har en aftale med.
// Og i matrix-visningen bygger motoren en HÅRD Fordel-regel på
// `__MatrixSource__` inde i gruppedannelsen — den findes ikke i lærerens
// regelliste, så uden kilde-kortet her kunne én efternøler ødelægge
// én-pr.-stamgruppe-fordelingen, som er hele matrixens formål.
function placementCtx() {
    const cls = state.currentClass;
    const repType = (cls.matrixSettings || {}).matrixRepresentationType || 'topic';
    return {
        idCol: idCol.value,
        rules: (isMatrixMode.value ? cls.matrixRules : cls.rules) || [],
        separations: cls.separations || [],
        classTopics: isMatrixMode.value ? [] : (cls.topics || []),
        allStudents: cls.data || [],
        // Rangeringen af tekstkolonner (Lav < Middel < Høj). Uden den var
        // Balancér og Ensartede på en rangeret kolonne blinde her, selvom
        // gruppedannelsen regner dem med rangen.
        columnOrders: cls.columnOrders || null,
        // Aftaler gælder stamgrupperne (samme afgrænsning som generation.js).
        //
        // `mergeTogether` og IKKE `togetherComponents`: den sidste filtrerer
        // fraværende fra, og det er præcis forkert her. Vinduet er lavet til at
        // sætte en FRAVÆRENDE tilbage — hun er stadig markeret fraværende, når
        // placeringen regnes ud, så hendes egen aftale ville blive filtreret
        // væk under hende. Og sidder partneren fraværende i en gruppe, står han
        // der stadig: gruppen er hans, uanset om han er i lokalet i dag. Samme
        // valg som undgåelserne træffer i `separationConflictIds()`.
        togetherComponents: isMatrixMode.value
            ? []
            : mergeTogether(cls.togetherGroups || []),
        sourceById: isMatrixMode.value
            ? matrixSourceById(state.storedStandardGroups, repType,
                               name => storage.getTopic(name, 'S_'))
            : null,
    };
}

// Oversæt de konfliktende medlems-id'er til navne, læreren kan genkende, i advarslen.
function separationConflictNames(student, group) {
    return separationConflictIds(student, group, placementCtx()).map(mIdStr => {
        const mate = state.currentClass.data.find(d => String(d[idCol.value]).trim() === mIdStr);
        return mate ? getLabel(mate) : mIdStr;
    });
}

function confirmAdd() {
    if (!selectedStudentIds.value.length) return;

    const groups = isMatrixMode.value ? state.storedMatrixGroups : state.storedStandardGroups;

    // Fortryd-stakken skal have besked, FØR fluebenene vender. Vinduet sætter
    // `_excluded = false` på hver elev der kommer tilbage, og det er
    // elevdata — præcis det fortryd-stakken i elevlisten gemmer. Uden
    // snapshottet springer stakken denne handling over, og et Ctrl+Z i
    // elevlisten bagefter ville rulle en HELT ANDEN, ældre ændring tilbage og
    // i samme greb melde eleverne fraværende igen. Ét snapshot for hele
    // vinduets arbejde, så én fortryd svarer til ét tryk på "Tilføj".
    //
    // Kun hvis der ER et flueben at vende: listen rummer også elever der er
    // til stede, men står uden gruppe, og for dem ændrer vinduet kun
    // grupperne — som fortryd-stakken alligevel ikke dækker.
    const willChangeAttendance = selectedStudentIds.value.some(id => {
        const s = state.currentClass.data.find(r => r[idCol.value] == id);
        return s && s._excluded;
    });
    if (willChangeAttendance) pushUndo();
    const results  = [];
    const warnings = [];
    const notes    = [];
    const errors   = [];
    const placed   = [];   // { student, target } — til aftale-tjekket bagefter

    selectedStudentIds.value.forEach(studentId => {
        const student = state.currentClass.data.find(s => s[idCol.value] == studentId);
        if (!student) { errors.push(`Elev ${studentId} ikke fundet.`); return; }

        const idStr = String(studentId).trim();

        // En elev, der kommer tilbage (var meldt fraværende), kan stadig stå i
        // en gruppe fra før fraværet. Er den gruppe LÅST, bliver eleven, hvor
        // den står — låst betyder: rør ikke.
        const lockedHome = groups.find(g =>
            g.locked && g.members.some(m => memberIdStr(m) === idStr));
        if (lockedHome) {
            student._excluded = false;
            results.push(`${getLabel(student)} står allerede i låst ${groupDisplayName(lockedHome.name)}`);
            return;
        }

        if (!groups.some(g => !g.locked)) {
            errors.push(`Kunne ikke placere ${getLabel(student)} — alle grupper er låst.`);
            return;
        }

        // Fjern eleven fra enhver (ulåst) gruppe FØR placeringen, så eleven
        // ikke kan ende i to grupper på én gang — og så gruppestørrelser og
        // adskillelses-tjek ser det rigtige billede under scoringen.
        groups.forEach(g => {
            if (g.locked) return;
            g.members = g.members.filter(m => memberIdStr(m) !== idStr);
        });

        const ctx = placementCtx();
        const target = findBestGroup(student, groups, ctx);
        if (target) {
            const conflictNames = separationConflictNames(student, target);
            target.members.push(String(studentId));
            student._excluded = false;
            results.push(`${getLabel(student)} → ${groupDisplayName(target.name)}`);
            placed.push({ student, target });
            if (conflictNames.length > 0) {
                warnings.push(
                    `${getLabel(student)} er sat sammen med ${conflictNames.join(' og ')} i ` +
                    `${groupDisplayName(target.name)}, selvom de helst skal undgå hinanden — ` +
                    `emnefordelingen vejede tungere. Byt manuelt hvis det er et problem.`
                );
            }

            // Matrixgrupper dannes PÅ TVÆRS af stamgrupperne. Placerer vi en
            // elev her, som ikke står i nogen stamgruppe, har hun ingen
            // oprindelse at komme fra: hun står uden oprindelses-mærke på
            // matrixkortet, og i stamgruppe-visningen står hun slet ikke.
            // Modalen placerer kun i den visning læreren står i — så sig det
            // højt i stedet for at lade eleven falde mellem to stole.
            if (isMatrixMode.value) {
                const inHomeGroup = (state.storedStandardGroups || [])
                    .some(g => g.members.some(m => memberIdStr(m) === idStr));
                if (!inHomeGroup) {
                    notes.push(
                        `${getLabel(student)} står nu i en matrixgruppe, men i ingen stamgruppe. ` +
                        `Gå til Grupper og tilføj eleven dér også, hvis der skal være en.`
                    );
                }
            }
        } else {
            errors.push(`Kunne ikke placere ${getLabel(student)}.`);
        }
    });

    // En aftale, der ikke kunne opfyldes — typisk fordi de andre sidder i en
    // LÅST gruppe, som ikke er en kandidat. Motoren behandler aftalen som et
    // krav, så det må ikke ske i tavshed.
    //
    // Tjekket sker FØRST NU, når alle de valgte elever er sat ind. Inde i
    // løkken kom det for tidligt: valgte læreren Anna og Clara, der skal
    // sammen, stod Clara endnu ingen steder, da Anna blev placeret — og Anna
    // fik en advarsel, selvom Clara et øjeblik efter blev trukket hen til
    // hende. Og der advares kun om partnere, der SIDDER i en anden gruppe:
    // en slettet partner (som kan blive stående i en aftale, fordi den binder
    // to andre sammen — se deadTogetherIndexes i together.js) sidder ingen
    // steder og stod som "(uden navn)" i advarslen hver eneste gang. En
    // partner uden gruppe bliver trukket hertil, når hun selv placeres.
    if (placed.length) {
        const ctx = placementCtx();
        const seated = new Set();
        groups.forEach(g => g.members.forEach(m => seated.add(memberIdStr(m))));
        placed.forEach(({ student, target }) => {
            const missingPartners = partnersOutside(student, target, ctx)
                .filter(id => seated.has(id))
                .map(id => memberDisplayName(id, state.currentClass.data, state.displayColumn));
            if (missingPartners.length > 0) {
                warnings.push(
                    `${getLabel(student)} skulle sammen med ${missingPartners.join(' og ')}, ` +
                    `men er sat i ${groupDisplayName(target.name)} — de sidder i en anden ` +
                    `(eller låst) gruppe. Flyt manuelt, eller dan stamgrupper igen.`
                );
            }
        });
    }

    if (results.length > 0) {
        if (isMatrixMode.value) state.storedMatrixGroups = [...groups];
        else                    state.storedStandardGroups = [...groups];
        storage.saveGroupsToStorage();
        autoSave();
        window.notifySuccess?.(`Tilføjet:\n${results.join('\n')}`);
    }
    if (warnings.length > 0) window.notifyInfo?.(`OBS — en aftale kunne ikke overholdes:\n${warnings.join('\n')}`);
    if (notes.length > 0) window.notifyInfo?.(notes.join('\n'));
    // "Kunne ikke placere X" er en fejl, ikke en oplysning: eleven står
    // stadig uden gruppe, og beskeden stod i samme grå toast som kvitteringen
    // for de elever der KOM med.
    if (errors.length > 0) window.notifyError?.(errors.join('\n'));

    emit('close');
}

// Fokus ind i vinduet ved åbning, fanget mens det er åbent, og tilbage
// til den knap der åbnede det ved luk — se useModalFocus.js.
const overlayRef = ref(null);
const { onBackdropClick } = useModalFocus(overlayRef, { onEscape: () => emit('close') });
</script>

<template>
  <div ref="overlayRef" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="dlg-efternoeler" @click.self="onBackdropClick">
    <div class="modal-content">
      <button class="close-btn" aria-label="Luk" @click="$emit('close')">×</button>

      <h3 id="dlg-efternoeler">Tilføj elev til gruppe</h3>
      <p class="subtitle">
        Vælg én eller flere elever. Systemet finder den bedste gruppe automatisk
        — emnefordelingen vejer tungest, og du får en advarsel hvis en undgåelse
        ikke kan overholdes.
      </p>

      <div class="student-list">
        <label
          v-for="s in eligibleStudents"
          :key="getId(s)"
          class="student-item"
          :class="{ returning: isReturning(s) }"
        >
          <input type="checkbox" :value="getId(s)" v-model="selectedStudentIds" />
          <span class="student-name">{{ getLabel(s) }}</span>
          <span v-if="isReturning(s)" class="badge-returning">fraværende</span>
          <span v-else class="badge-new">ikke tildelt</span>
        </label>
      </div>

      <div class="actions">
        <button class="btn-cancel" @click="$emit('close')">Annuller</button>
        <button class="btn-confirm" @click="confirmAdd" :disabled="!selectedStudentIds.length">
          Tilføj til gruppe
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
    position: fixed;
    inset: 0;
    background: oklch(0 0 0 / 40%);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 2000;
    backdrop-filter: blur(6px);
}

.modal-content {
    background: var(--bg-modal);
    padding: 28px;
    border-radius: 14px;
    inline-size: 90%;
    max-inline-size: 420px;
    position: relative;
    box-shadow: 0 20px 60px oklch(0 0 0 / 20%);
    border: 1px solid var(--border-medium);
    color: var(--text-main);
}

.close-btn {
    position: absolute;
    inset-block-start: 14px;
    inset-inline-end: 14px;
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    color: var(--text-subtle);
    line-height: 1;
    padding: 2px 6px;
    border-radius: 4px;
}
.close-btn:hover { background: var(--bg-surface-hover); color: var(--text-main); }

h3 {
    margin: 0 0 6px;
    font-size: 15px;
    font-weight: 700;
    color: var(--text-main);
}

.subtitle {
    margin: 0 0 16px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-muted);
}

.student-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-block-size: 220px;
    overflow-y: auto;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 6px;
    background: var(--bg-surface);
    margin-block-end: 16px;
}

.student-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    cursor: pointer;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-main);
    transition: background 0.15s;
}
.student-item:hover { background: var(--bg-surface-hover); }

.student-item input[type="checkbox"] {
    accent-color: var(--primary);
    inline-size: 15px;
    block-size: 15px;
    flex-shrink: 0;
}

.student-name { flex: 1; }

.badge-returning,
.badge-new {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 100px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    flex-shrink: 0;
}
.badge-returning {
    background: oklch(0.94 0.06 75);
    color: oklch(0.45 0.12 75);
}
.badge-new {
    background: oklch(0.93 0.04 250);
    color: oklch(0.45 0.12 250);
}

.actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

.btn-cancel,
.btn-confirm {
    block-size: 34px;
    padding: 0 16px;
    border-radius: 8px;
    border: none;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
}
.btn-cancel {
    background: var(--bg-surface);
    color: var(--text-muted);
    border: 1px solid var(--border-subtle);
}
.btn-cancel:hover { background: var(--bg-surface-hover); color: var(--text-main); }
.btn-confirm {
    background: var(--primary);
    color: white;
}
.btn-confirm:hover:not(:disabled) { opacity: 0.88; }
.btn-confirm:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
