<script setup>
import { modalState, modalActions } from '../js/modules/modalState.js';
import NotificationManager from './NotificationManager.vue';
import CategoryModal from './CategoryModal.vue';
import SaveSessionModal from './SaveSessionModal.vue';
import LatecomerModal from './LatecomerModal.vue';
import SaveColumnModal from './SaveColumnModal.vue';
import DeleteColumnModal from './DeleteColumnModal.vue';
import CopyOptionsModal from './CopyOptionsModal.vue';
import PreviewSessionModal from './PreviewSessionModal.vue';
import ColumnOrderModal from './ColumnOrderModal.vue';
import ColumnLayoutModal from './ColumnLayoutModal.vue';
import RestoreGroupsModal from './RestoreGroupsModal.vue';
import AvoidModal from './AvoidModal.vue';
import { reactiveState } from '../js/modules/reactiveState.js';

// Aftaler-vinduet lå før under Elevliste-fanen og fandtes derfor kun dér.
// Advarslen over GRUPPERNE skal kunne åbne det ("Vis aftalen") uden at rive
// læreren væk fra de grupper, advarslen handler om — så det bor her nu.
function closeAgreements() {
    reactiveState.showAgreementsModal = false;
    reactiveState.agreementHighlight = [];
    // Kom læreren fra opskriften, åbnes den igen — hun lukkede den kun for at
    // Aftaler kunne ligge øverst.
    if (modalState.agreementsReturnToRecipe) {
        modalState.agreementsReturnToRecipe = false;
        // Udskudt: åbner vi et modalt <dialog> midt i et Escape-tryk, lukker
        // browserens egen Escape-håndtering det igen i samme øjeblik.
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('recipe-dialog:request', { detail: { open: true } }));
        }, 0);
    }
}

// ESCAPE LIGGER IKKE HER MERE. Her stod en kæde med et flag pr. vindue, der
// lukkede det øverste af dem. Den skulle holdes i sync med modalState i
// hånden — et nyt vindue uden en linje i kæden fik i stilhed ingen Escape —
// og den lå i en anden fil end de vinduer, den handlede om, så en søgning
// efter "Escape" i det enkelte vindue fandt ingenting. Hvert vindue lukker
// nu sig selv gennem useModalFocus(), som også afgør hvem der er øverst.
</script>

<template>
  <div id="vue-modals" class="modals-root">
      <NotificationManager />

      <CategoryModal
        v-if="modalState.showCategory"
        @close="modalActions.closeCategory"
      />

      <SaveSessionModal
        v-if="modalState.showSaveSession"
        @close="modalActions.closeSaveSession"
      />

      <LatecomerModal
        v-if="modalState.showLatecomer"
        @close="modalActions.closeLatecomer"
      />

      <SaveColumnModal
        v-if="modalState.showSaveColumn"
        @close="modalActions.closeSaveColumn"
      />

      <DeleteColumnModal
        v-if="modalState.showDeleteColumn"
        @close="modalActions.closeDeleteColumn"
      />

      <CopyOptionsModal
        v-if="modalState.showCopyOptions"
        @close="modalActions.closeCopyOptions"
      />

      <PreviewSessionModal
        v-if="modalState.showPreviewSession"
        :session-id="modalState.previewSessionId"
        @close="modalActions.closePreviewSession"
      />

      <ColumnOrderModal
        v-if="modalState.showColumnOrder"
        :column="modalState.columnOrderColumn"
        @close="modalActions.closeColumnOrder"
      />

      <ColumnLayoutModal
        v-if="modalState.showColumnLayout"
        @close="modalActions.closeColumnLayout"
      />

      <RestoreGroupsModal
        v-if="modalState.showRestoreGroups"
        :start-tab="modalState.restoreGroupsTab"
        @close="modalActions.closeRestoreGroups"
      />

      <!-- v-if'et HER, ikke inde i komponenten: så følger useModalFocus'
           livscyklus vinduet. -->
      <Transition name="modal-fade">
        <AvoidModal
          v-if="reactiveState.showAgreementsModal && reactiveState.currentClass"
          @close="closeAgreements"
        />
      </Transition>
  </div>
</template>
