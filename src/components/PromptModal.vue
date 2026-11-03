<script setup>
import { ref, onMounted } from 'vue';
import { useModalFocus, focusOnOpen } from '../composables/useModalFocus.js';

const props = defineProps({
    title: { type: String, default: 'Indtast' },
    message: { type: String, default: '' },
    placeholder: { type: String, default: '' },
    initialValue: { type: String, default: '' },
    confirmText: { type: String, default: 'OK' },
    cancelText: { type: String, default: 'Annuller' }
});

const emit = defineEmits(['confirm', 'cancel']);

const inputValue = ref(props.initialValue);
const inputRef = ref(null);

onMounted(() => {
    if (inputRef.value) {
        focusOnOpen(inputRef.value);
        inputRef.value.select();
    }
});

// Enter skal stoppes (.prevent i skabelonen). Ellers lukker vinduet, fokus
// springer tilbage til knappen der åbnede det, og browseren lader så samme
// Enter "klikke" på knappen — vinduet åbnede straks igen, og det næste man
// skrev, blev til endnu en kolonne.
function onSubmit() {
    const val = inputValue.value.trim();
    if (val) emit('confirm', val);
}

// Fokus ind i vinduet ved åbning, fanget mens det er åbent, og tilbage
// til den knap der åbnede det ved luk — se useModalFocus.js.
const overlayRef = ref(null);
const { onBackdropClick } = useModalFocus(overlayRef, { onEscape: () => emit('cancel') });
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div ref="overlayRef" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="dlg-prompt" @click.self="onBackdropClick">
        <div class="modal-content">
          <h2 id="dlg-prompt">{{ title }}</h2>
          <p v-if="message" class="message">{{ message }}</p>
          <input
            ref="inputRef"
            v-model="inputValue"
            type="text"
            class="input-field"
            :placeholder="placeholder"
            @keydown.enter.prevent="onSubmit"
          >
          <div class="actions">
            <button class="btn secondary" @click="emit('cancel')">{{ cancelText }}</button>
            <button class="btn primary" :disabled="!inputValue.trim()" @click="onSubmit">{{ confirmText }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: var(--bg-modal-overlay);
  display: flex; justify-content: center; align-items: center;
  z-index: 2000; backdrop-filter: blur(6px);
}
.modal-content {
  background: var(--bg-modal); backdrop-filter: var(--glass-blur-heavy);
  padding: 32px; border-radius: 16px;
  width: 90%; max-width: 420px; position: relative;
  box-shadow: var(--shadow-float), var(--glass-inset);
  border: 1px solid var(--border-medium); color: var(--text-main);
  animation: modalPop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes modalPop {
  from { opacity: 0; transform: scale(0.95) translateY(-8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

h2 { margin: 0 0 8px 0; font-size: 16px; font-weight: 700; color: var(--text-heading); }
.message { margin: 0 0 12px 0; font-size: 13px; color: var(--text-muted); line-height: 1.5; }
.input-field {
  width: 100%; height: 34px; padding: 0 12px; margin-bottom: 16px;
  border: 1px solid var(--border-subtle); border-radius: 8px;
  font-size: 13px; font-weight: 600; background: var(--bg-surface); color: var(--text-main);
  box-sizing: border-box; transition-property: var(--ctl-transition); transition-duration: 0.2s;
}
.input-field:hover { border-color: var(--primary); background: var(--bg-surface); }
.input-field:focus {
  outline: none; border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-light);
}
.actions { display: flex; justify-content: flex-end; gap: 8px; }
.btn {
  height: 34px; padding: 0 18px; border-radius: 8px; border: none;
  font-weight: 600; cursor: pointer; font-size: 12px; transition-property: var(--ctl-transition); transition-duration: 0.2s;
}
.btn.primary { background: var(--primary); color: white; }
.btn.primary:hover { background: var(--primary-hover); }
.btn.primary:disabled { opacity: 0.4; cursor: not-allowed; }
.btn.secondary { background: var(--bg-surface); color: var(--text-muted); border: 1px solid var(--border-subtle); }
.btn.secondary:hover { background: var(--bg-body); color: var(--text-main); border-color: var(--border-strong); }

.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity 0.15s; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
</style>
