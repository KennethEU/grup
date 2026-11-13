<script setup>
// Boksen øverst i Import & backup, der kun vises, når en klasseliste, som
// browseren ikke kunne læse, ligger gemt til side (py_bridge._keepUnreadableCopy).
//
// HVORFOR: kopien indeholder elevnavne for alle klasserne dengang, også dem
// læreren siden har slettet, og appen sletter den aldrig selv. Før kunne
// læreren kun komme af med den ved at rydde browserdata for grup.dk. Nu kan
// hun gemme den som fil (fx til at få hjælp) og så slette den.
// Kenneth sagde ja 13/11 2026.
import { ref, onMounted, onUnmounted } from 'vue';
import { FileWarning, Download, Trash2 } from 'lucide-vue-next';
import { unreadableCopy, deleteUnreadableCopy } from '../../js/modules/storage.js';
import { UNREADABLE_CLASSES_KEY } from '../../js/modules/storageKeys.js';
import { todayStamp } from '../../js/modules/utils.js';
import ConfirmModal from '../ConfirmModal.vue';

const hasCopy = ref(false);
const showConfirm = ref(false);

function refresh() {
    hasCopy.value = unreadableCopy() !== null;
}

// En anden fane kan lægge kopien til side eller slette den.
function onStorage(e) {
    if (!e.key || e.key === UNREADABLE_CLASSES_KEY) refresh();
}

onMounted(() => {
    refresh();
    window.addEventListener('storage', onStorage);
});
onUnmounted(() => window.removeEventListener('storage', onStorage));

function saveAsFile() {
    const raw = unreadableCopy();
    if (raw === null) { refresh(); return; }
    // Den rå tekst, præcis som den lå. Den kunne ikke læses som en
    // klasseliste, så den skrives ikke om — det er hele pointen med kopien.
    const blob = new Blob([raw], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grupdk_ulaeselig_klasseliste_${todayStamp()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Samme ventetid som backuppen: slippes adressen med det samme, kan
    // nogle browsere nå at miste filen.
    setTimeout(() => URL.revokeObjectURL(url), 40000);
}

function confirmDelete() {
    showConfirm.value = false;
    if (deleteUnreadableCopy()) {
        window.notifySuccess?.('Den gemte kopi er slettet.');
    } else {
        window.notifyError?.('Kopien kunne ikke slettes. Prøv igen, eller ryd browserdata for grup.dk.');
    }
    refresh();
}
</script>

<template>
    <section v-if="hasCopy" class="unreadable-copy" aria-labelledby="unreadable-copy-title">
        <div class="unreadable-copy__icon" aria-hidden="true"><FileWarning :size="20" /></div>
        <div class="unreadable-copy__body">
            <h3 id="unreadable-copy-title">En klasseliste, der ikke kunne læses, ligger gemt til side</h3>
            <p>
                Engang kunne browseren ikke læse din klasseliste, og Grupper lagde den gamle liste til side,
                så dine klasser kunne reddes. Den indeholder elevnavne, også fra klasser, du har slettet.
                Så længe den ligger her, rydder Grupper heller ikke op efter slettede klasser.
            </p>
            <div class="unreadable-copy__actions">
                <button class="btn secondary" @click="saveAsFile"><Download :size="15" aria-hidden="true" /> Gem som fil</button>
                <button class="btn secondary danger-text" @click="showConfirm = true"><Trash2 :size="15" aria-hidden="true" /> Slet den</button>
            </div>
        </div>
    </section>

    <ConfirmModal
        v-if="showConfirm"
        title="Slet den gemte kopi"
        message="Kopien er den sidste vej tilbage til de gamle klasser. Gem den som fil først, hvis du er i tvivl. Det kan ikke fortrydes."
        confirm-text="Slet"
        variant="danger"
        @confirm="confirmDelete"
        @cancel="showConfirm = false"
    />
</template>

<style scoped>
.unreadable-copy {
    display: flex;
    gap: 14px;
    max-inline-size: 960px;
    margin-inline: auto;
    margin-block-end: 28px;
    padding: 16px 18px;
    border: 1px solid var(--rule);
    border-inline-start: 3px solid var(--color-warning);
    border-radius: 8px;
}

.unreadable-copy__icon {
    color: var(--ink-3);
    padding-block-start: 2px;
}

.unreadable-copy__body h3 {
    margin: 0 0 6px;
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
    text-transform: none;
}

.unreadable-copy__body p {
    margin: 0 0 12px;
    font-size: 13px;
    line-height: 1.55;
    color: var(--ink-2);
    text-wrap: pretty;
}

.unreadable-copy__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.unreadable-copy__actions .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding-inline: 14px;
    font-size: 12px;
    font-weight: 600;
}

.danger-text { color: var(--color-error); }
</style>
