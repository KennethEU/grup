<script setup>
import { ref, onMounted } from 'vue';
import { Users, Lock, FlaskConical, ClipboardPaste, Download } from 'lucide-vue-next';
import * as api from '../../js/modules/api.js';
import { reactiveState as state } from '../../js/modules/reactiveState.js';
import { fetchWwwGrupperEntries } from '../../js/modules/wwwCheck.js';
import {
  adoptWwwEntries, countWwwClasses, wwwSettled, markWwwSettled,
} from '../../js/modules/adoptWww.js';
import ConfirmModal from '../ConfirmModal.vue';

// ─── Klasser på www.dida.dk ─────────────────────────────────────────────────
// dida.dk og www.dida.dk har hvert sit lager i browseren. Har Grupper ingen
// klasser her, spørges www — en lærer der fremover går direkte til dida.dk,
// kommer aldrig forbi mellemsiden på www, der ellers flytter dem (se
// wwwCheck.js og adoptWww.js). Tjekket kører kun på https://dida.dk.
const wwwEntries = ref(null);
const wwwCount = ref(0);
const importingWww = ref(false);

onMounted(async () => {
    // Afklaret én gang for alle: klasserne er hentet, eller www havde ingen.
    // www ryddes aldrig, så uden det her kom tilbuddet igen, hver gang læreren
    // havde slettet sine klasser her (se wwwSettled() i adoptWww.js).
    if (wwwSettled()) return;
    try {
        const here = await api.fetchClasses();
        if (Array.isArray(here) && here.length > 0) return;
        const entries = await fetchWwwGrupperEntries();
        // null: www svarede ikke, eller vi er ikke på dida.dk — spørg næste gang.
        if (!entries) return;
        const count = countWwwClasses(entries);
        if (count === 0) {
            markWwwSettled();
            return;
        }
        wwwEntries.value = entries;
        wwwCount.value = count;
    } catch (e) {
        console.error('[wwwCheck]', e);
    }
});

async function importFromWww() {
    if (!wwwEntries.value) return;
    importingWww.value = true;
    try {
        const res = await adoptWwwEntries(wwwEntries.value);
        if (res && !res.error) {
            // Forsøget er gjort — kortet går væk, også når alt allerede var
            // her. Kom noget ikke med, har beskeden sagt hvor det ligger.
            wwwEntries.value = null;
            wwwCount.value = 0;
            if (res.written > 0) {
                document.dispatchEvent(new CustomEvent('classCreated', {
                    detail: { filename: res.writtenFilenames?.at(-1) },
                }));
            } else if (!(res.failed?.length) && !(res.invalid?.length)) {
                window.notifyInfo?.('Der var ingen nye klasser at hente fra www.dida.dk.');
            }
        }
    } finally {
        importingWww.value = false;
    }
}

function goToImport() {
    // Genvejen siger "Indsæt" — så skal læreren lande på fanen, hvor man indsætter.
    state.importModeRequest = 'paste';
    state.navView = 'import';
}

const loading = ref(false);
const askOverwrite = ref(false);

const TEST_DATA = [{
  filename: '2a-testdata.csv',
  name: '2.a (testdata)',
  columns: ['Navn', 'Køn', 'Fagligt niveau', 'Aktivitetsniveau'],
  data: [
    { Navn: 'Emma Hansen', Køn: 'P', 'Fagligt niveau': '8', Aktivitetsniveau: 'Høj' },
    { Navn: 'Oliver Nielsen', Køn: 'D', 'Fagligt niveau': '6', Aktivitetsniveau: 'Middel' },
    { Navn: 'Ida Pedersen', Køn: 'P', 'Fagligt niveau': '9', Aktivitetsniveau: 'Høj' },
    { Navn: 'Noah Andersen', Køn: 'D', 'Fagligt niveau': '4', Aktivitetsniveau: 'Lav' },
    { Navn: 'Freja Jensen', Køn: 'P', 'Fagligt niveau': '7', Aktivitetsniveau: 'Middel' },
    { Navn: 'William Larsen', Køn: 'D', 'Fagligt niveau': '5', Aktivitetsniveau: 'Middel' },
    { Navn: 'Alma Sørensen', Køn: 'P', 'Fagligt niveau': '6', Aktivitetsniveau: 'Høj' },
    { Navn: 'Lucas Rasmussen', Køn: 'D', 'Fagligt niveau': '8', Aktivitetsniveau: 'Middel' },
    { Navn: 'Clara Jørgensen', Køn: 'P', 'Fagligt niveau': '3', Aktivitetsniveau: 'Lav' },
    { Navn: 'Oscar Christensen', Køn: 'D', 'Fagligt niveau': '7', Aktivitetsniveau: 'Høj' },
    { Navn: 'Ella Thomsen', Køn: 'P', 'Fagligt niveau': '5', Aktivitetsniveau: 'Middel' },
    { Navn: 'Victor Madsen', Køn: 'D', 'Fagligt niveau': '9', Aktivitetsniveau: 'Høj' },
    { Navn: 'Nora Møller', Køn: 'P', 'Fagligt niveau': '4', Aktivitetsniveau: 'Lav' },
    { Navn: 'Emil Olsen', Køn: 'D', 'Fagligt niveau': '6', Aktivitetsniveau: 'Middel' },
    { Navn: 'Sofie Kjær', Køn: 'P', 'Fagligt niveau': '8', Aktivitetsniveau: 'Høj' },
    { Navn: 'Magnus Poulsen', Køn: 'D', 'Fagligt niveau': '3', Aktivitetsniveau: 'Lav' },
    { Navn: 'Laura Frederiksen', Køn: 'P', 'Fagligt niveau': '7', Aktivitetsniveau: 'Middel' },
    { Navn: 'Sebastian Holm', Køn: 'D', 'Fagligt niveau': '5', Aktivitetsniveau: 'Lav' },
    { Navn: 'Karla Eriksen', Køn: 'P', 'Fagligt niveau': '6', Aktivitetsniveau: 'Middel' },
    { Navn: 'Mathias Dahl', Køn: 'D', 'Fagligt niveau': '8', Aktivitetsniveau: 'Høj' },
    { Navn: 'Astrid Lund', Køn: 'P', 'Fagligt niveau': '4', Aktivitetsniveau: 'Middel' },
    { Navn: 'Frederik Bak', Køn: 'D', 'Fagligt niveau': '7', Aktivitetsniveau: 'Høj' },
    { Navn: 'Olivia Bruun', Køn: 'P', 'Fagligt niveau': '9', Aktivitetsniveau: 'Høj' },
    { Navn: 'Mikkel Nygaard', Køn: 'D', 'Fagligt niveau': '2', Aktivitetsniveau: 'Lav' },
    { Navn: 'Maja Krogh', Køn: 'P', 'Fagligt niveau': '5', Aktivitetsniveau: 'Lav' },
    { Navn: 'Rasmus Vestergaard', Køn: 'D', 'Fagligt niveau': '6', Aktivitetsniveau: 'Middel' },
    { Navn: 'Josefine Winther', Køn: 'P', 'Fagligt niveau': '7', Aktivitetsniveau: 'Middel' },
    { Navn: 'Tobias Munk', Køn: 'D', 'Fagligt niveau': '4', Aktivitetsniveau: 'Lav' }
  ],
  rules: [
    { type: 'distribute', column: 'Køn', value: '' },
    { type: 'distribute', column: 'Aktivitetsniveau', value: '' }
  ],
  id_column: 'Navn',
  separations: [],
  settings: { groupMode: 'size', groupTarget: 4, groupMod: '+' },
  matrixSettings: {},
  matrixRules: []
}];

// Knappen går gennem den samme gendannelses-vej som en backup, og den vej
// ERSTATTER som udgangspunkt en klasse med samme filnavn. Findes testklassen
// allerede, ryddes dens grupper, emner, historik og gemte sessioner med i
// samme greb — så et andet klik ville rulle alt hvad læreren havde bygget i
// den, tilbage til de 28 rækker herover. Import-vejen spørger i sådan et
// tilfælde, og det skal den her også.
async function loadTestData() {
  const inspected = await api.inspectBackup(TEST_DATA);
  if (!inspected.error && inspected.collisions?.length > 0) {
    askOverwrite.value = true;
    return;
  }
  writeTestData();
}

async function writeTestData() {
  askOverwrite.value = false;
  loading.value = true;
  try {
    const res = await api.restoreBackup(TEST_DATA);
    if (res.error) {
      window.notifyError?.("Fejl: " + res.error);
    } else {
      window.notifySuccess?.(`Testklasse oprettet med ${TEST_DATA[0].data.length} elever!`);
      // Filnavnet med: skrives testklassen oven i en eksisterende, står den
      // ikke sidst i listen, og så åbnede appen en anden klasse.
      document.dispatchEvent(new CustomEvent('classCreated', {
        detail: { filename: res.writtenFilenames?.at(-1) },
      }));
    }
  } catch (e) {
    window.notifyError?.("Kunne ikke oprette testdata: " + e.message);
  }
  loading.value = false;
}
</script>

<template>
  <div id="view-dashboard" class="content-view empty-state">
    <div class="icon"><Users :size="48" /></div>
    <h2>Velkommen</h2>
    <h3>Ingen klasse valgt</h3>
    <!-- role="status": kortet dukker op, når svaret fra www kommer, og en
         skærmlæser skal have det at vide. -->
    <section v-if="wwwCount > 0" class="www-card" role="status" aria-labelledby="www-card-title">
      <strong id="www-card-title">
        Vi fandt {{ wwwCount }} {{ wwwCount === 1 ? 'klasse' : 'klasser' }} på www.dida.dk
      </strong>
      <p class="www-card-text">
        Din browser gemmer dida.dk og www.dida.dk hver for sig, så {{ wwwCount === 1 ? 'den' : 'de' }}
        er ikke med her endnu. Hent {{ wwwCount === 1 ? 'den' : 'dem' }}, så kan du bruge
        {{ wwwCount === 1 ? 'den' : 'dem' }} på dida.dk.
      </p>
      <button class="import-shortcut-btn" @click="importFromWww" :disabled="importingWww">
        <Download :size="15" />
        {{ importingWww ? 'Henter …' : (wwwCount === 1 ? 'Hent den' : 'Hent dem') }}
      </button>
    </section>
    <p>
      Vælg en klasse i klassemenuen øverst til højre, eller opret en ny for at komme i gang.
    </p>
    <button class="import-shortcut-btn" @click="goToImport">
      <ClipboardPaste :size="15" />
      Indsæt klasseliste fra Excel / Sheets
    </button>
    <p class="import-hint">Kopiér cellerne i Excel eller Google Sheets og indsæt dem direkte — nemmeste måde at komme i gang.</p>
    <button class="test-data-btn" @click="loadTestData" :disabled="loading">
      <FlaskConical :size="16" />
      {{ loading ? 'Opretter...' : 'Prøv med testdata' }}
    </button>
    <span class="privacy-badge"><Lock :size="14" style="margin-right:6px; vertical-align:-2px;" /> Data gemmes kun lokalt i din browser</span>

    <ConfirmModal
      v-if="askOverwrite"
      title="Testklassen findes allerede"
      message="Der ligger allerede en testklasse. Laver du en ny, erstattes den — også dens grupper, emner, historik og gemte sessioner."
      confirm-text="Erstat testklassen"
      cancel-text="Behold den"
      variant="danger"
      @confirm="writeTestData"
      @cancel="askOverwrite = false"
    />
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  text-align: center;
  color: var(--text-muted);
  padding-block: 40px;
  margin-block-start: -5%;
}

.icon {
  font-size: 4rem;
  margin-bottom: 12px;
  filter: drop-shadow(0 0 20px var(--primary-glow));
}

h2 {
  font-size: 2rem;
  color: var(--text-main);
  margin-bottom: 6px;
}

h3 {
  font-size: 1.5rem;
  color: var(--text-muted);
  font-weight: normal;
  margin-top: 0;
}

p {
  max-width: 400px;
  line-height: 1.6;
  margin-top: 12px;
}

.import-shortcut-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 24px;
  margin-bottom: 6px;
  padding: 10px 20px;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 0.95rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.15s;
}

.import-shortcut-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Kortet om klasser på www.dida.dk. Det skal ses som det første — det er
   lærerens egne klasser, der mangler — men uden at ligne en fejl. */
.www-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  max-inline-size: 440px;
  margin-block: 16px 4px;
  padding: 16px 20px;
  border: 1px solid var(--primary-border);
  border-radius: 12px;
  background: var(--primary-light);
  color: var(--text-main);
}

.www-card-text {
  margin-block: 4px 0;
  font-size: 0.9em;
  color: var(--text-muted);
}

.www-card .import-shortcut-btn {
  margin-block: 12px 0;
}

.import-shortcut-btn:disabled {
  opacity: 0.6;
  cursor: wait;
  transform: none;
}

.import-hint {
  font-size: 0.82em;
  color: var(--text-muted);
  max-width: 340px;
  margin-block: 0 18px;
  line-height: 1.4;
}

.test-data-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 0;
  margin-bottom: 16px;
  padding: 10px 20px;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 0.95rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.15s;
}

.test-data-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.test-data-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.privacy-badge {
  font-size: 0.9em;
  background: var(--bg-surface);
  border: 1px solid var(--border-medium);
  padding: 6px 12px;
  border-radius: 20px;
  backdrop-filter: blur(8px);
  color: var(--text-muted);
}
</style>
