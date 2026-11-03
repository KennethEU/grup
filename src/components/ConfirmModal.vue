<script setup>
import { ref } from 'vue';
import { useModalFocus } from '../composables/useModalFocus.js';

const props = defineProps({
    title: { type: String, default: 'Bekræft' },
    message: { type: String, default: '' },
    confirmText: { type: String, default: 'Bekræft' },
    cancelText: { type: String, default: 'Annuller' },
    variant: { type: String, default: 'primary' } // 'primary' | 'danger'
});

const emit = defineEmits(['confirm', 'cancel']);

// Fokus ind ved åbning, fanget mens vinduet er åbent, tilbage til knappen
// ved luk — og Escape lukker. Alle fire bor i useModalFocus.js.
const overlayRef = ref(null);
const { onBackdropClick } = useModalFocus(overlayRef, { onEscape: () => emit('cancel') });
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div ref="overlayRef" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="dlg-bekraeft" @click.self="onBackdropClick">
        <div class="modal-content">
          <h2 id="dlg-bekraeft">{{ title }}</h2>
          <p class="message">{{ message }}</p>
          <div class="actions">
            <button class="btn secondary" @click="emit('cancel')">{{ cancelText }}</button>
            <button class="btn" :class="variant" @click="emit('confirm')">{{ confirmText }}</button>
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
.message { margin: 0 0 20px 0; font-size: 13px; color: var(--text-muted); line-height: 1.5; }
.actions { display: flex; justify-content: flex-end; gap: 8px; }
.btn {
  height: 34px; padding: 0 18px; border-radius: 8px; border: none;
  font-weight: 600; cursor: pointer; font-size: 12px; transition-property: var(--ctl-transition); transition-duration: 0.2s;
}
.btn.primary { background: var(--primary); color: white; }
.btn.primary:hover { background: var(--primary-hover); }
.btn.danger { background: var(--color-error); color: white; }
.btn.danger:hover { background: var(--color-error); filter: brightness(0.9); }
.btn.secondary { background: var(--bg-surface); color: var(--text-muted); border: 1px solid var(--border-subtle); }
.btn.secondary:hover { background: var(--bg-body); color: var(--text-main); border-color: var(--border-strong); }

.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity 0.15s; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
</style>
