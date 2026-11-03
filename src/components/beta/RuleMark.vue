<script setup>
// Et lille mærke i opskriftens margen: hvordan gik det med reglen (eller
// aftalerne) ved sidste kørsel? Se ruleMarks.js.
//
//   opfyldt                 flueben (grønt)
//   det bedst mulige        streg (blå) — "Sidste dannelse" siger hvorfor
//   ikke opfyldt            pil rundt (blå) — en ny dannelse kan måske mere
//   skal rettes             kryds (rødt)
//
// Teksten (fx "Opfyldt i 2 af 3 puljer") står i aria-label og title, så en
// skærmlæser får den, og musen kan se den.
import { Check, Minus, RotateCcw, X } from 'lucide-vue-next';

defineProps({
    /** { state: 'met' | 'best' | 'open' | 'fix', label } */
    mark: { type: Object, required: true },
});
const ICONS = { met: Check, best: Minus, open: RotateCcw, fix: X };
</script>

<template>
    <span v-if="ICONS[mark.state]" class="rule-mark" :class="'rule-mark--' + mark.state"
          role="img" :aria-label="mark.label" :title="mark.label">
        <component :is="ICONS[mark.state]" :size="12" :stroke-width="2.5" aria-hidden="true" />
    </span>
</template>

<style scoped>
.rule-mark {
    display: inline-grid;
    place-items: center;
    inline-size: 14px;
    block-size: 14px;
    color: var(--primary);
}
.rule-mark--met { color: var(--color-success); }
.rule-mark--fix { color: var(--color-error); }
</style>
