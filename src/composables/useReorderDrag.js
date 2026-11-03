// useReorderDrag.js — træk-og-slip i en liste der skal SKUBBE undervejs.
//
// HVORFOR DEN FINDES: Grupper havde tre lister man kan trække i, og de gav
// tre forskellige svar på "hvor lander det her?".
//
//   gruppekortene    en pladsholder med elevens navn glider ind, og de andre
//                    skubbes til side (GroupCard.membersWithPreview)
//   reglerne         en tynd streg viste pladsen (RuleBuilder)
//   kolonnelisterne  INTET — målt: listen stod helt stille under trækket,
//                    og det eneste tegn på liv var at det trukne blev
//                    halvgennemsigtigt
//
// Den sidste er den værste: man trækker i blinde og opdager først ved at
// slippe, om man ramte rigtigt. Composable'en her giver omarrangerings-
// listerne samme opførsel som gruppekortene.
//
// FORSKELLEN PÅ DE TO SLAGS TRÆK: gruppekortene flytter en elev MELLEM to
// lister, og dér SKAL der en pladsholder til — eleven findes jo ikke i
// mållisten endnu. Her omarrangerer vi INDEN FOR én liste, og så er den rene
// løsning at flytte elementet rigtigt med det samme. Med en <TransitionGroup>
// om listen skubber de øvrige sig på plads af sig selv, og hele
// drop-bogholderiet ("flytter man nedad, skal der trækkes én fra") forsvinder.
//
// AFBRUDTE TRÆK: fordi listen ændrer sig undervejs, gemmes udgangspunktet ved
// dragstart. Slipper man uden for listen, lægges den oprindelige rækkefølge
// tilbage. Uden det ville et fortrudt træk efterlade rækkefølgen, hvor man
// tilfældigvis holdt musen.
import { nextTick, ref } from 'vue';

/**
 * MUTERER listen frem for at erstatte den. To grunde: RuleBuilder giver os en
 * `computed`, der peger direkte på `currentClass.rules` — den kan ikke tildeles
 * — og selv hvor det er en almindelig `ref`, er det arrayets INDHOLD der skal
 * ændres, ikke referencen. Vue fanger `splice` på begge slags.
 *
 * @param {import('vue').Ref<Array>} list  arbejdslisten der omarrangeres
 * @param {object} [options]
 * @param {() => void} [options.onCommit]  kaldes KUN når trækket faktisk
 *        slippes i listen — ikke ved hvert lille ryk. Det er her man gemmer.
 * @param {() => boolean} [options.canDrag]  returnér false for at slå trækket
 *        fra (fx en låst liste).
 */
export function useReorderDrag(list, options = {}) {
    const { onCommit, canDrag } = options;

    // Elementets NUVÆRENDE plads i listen — den flytter sig, mens man trækker.
    const draggedIndex = ref(-1);

    let originalOrder = null;   // rækkefølgen før trækket begyndte
    let wasDropped = false;

    function onDragStart(index, e) {
        if (canDrag && !canDrag()) return;
        draggedIndex.value = index;
        originalOrder = [...list.value];
        wasDropped = false;
        if (e?.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            // Sat for at alle tre lister opfører sig ens. Kommentaren her sagde
            // før, at Firefox slet ikke starter et træk uden data — det holder
            // ikke længere: efterprøvet i Playwrights Firefox, hvor både
            // regelrækken og elevkortet startede og landede uden setData.
            // Reglen stammer fra ældre Firefox-versioner. Data koster
            // ingenting og gør trækket læsbart uden for appen.
            try { e.dataTransfer.setData('text/plain', String(index)); } catch (_) { /* ligegyldigt */ }
        }
    }

    /**
     * Flyt elementet med det samme, mens markøren er over række `index`.
     *
     * Midtpunkts-testen er ikke bare pynt. Byttede vi, så snart markøren rørte
     * naboen, ville de to elementer vippe frem og tilbage under musen: det
     * flyttede element lander jo dér hvor markøren er, og så peger markøren
     * straks på naboen igen. Derfor kræves det, at markøren er kommet FORBI
     * midten i den retning man trækker — så er der en hel elementhøjde mellem
     * de to skift.
     */
    function onDragOver(index, e) {
        e?.preventDefault();
        if (draggedIndex.value === -1 || draggedIndex.value === index) return;

        const box = e?.currentTarget?.getBoundingClientRect();
        if (box) {
            const aboveMidpoint = e.clientY < box.top + box.height / 2;
            if (draggedIndex.value < index && aboveMidpoint) return;   // på vej ned
            if (draggedIndex.value > index && !aboveMidpoint) return;  // på vej op
        }

        const items = list.value;
        const [moved] = items.splice(draggedIndex.value, 1);
        items.splice(index, 0, moved);
        draggedIndex.value = index;
    }

    function onDrop(e) {
        e?.preventDefault();
        if (draggedIndex.value === -1) return;
        wasDropped = true;
        const changed = originalOrder
            && list.value.some((item, i) => item !== originalOrder[i]);
        reset();
        if (changed && onCommit) onCommit();
    }

    /**
     * Slap man uden for listen, fyrer `drop` aldrig — kun `dragend`. Så skal
     * rækkefølgen tilbage, som den var: læreren har trukket elementet ud af
     * listen for netop IKKE at flytte det.
     */
    function onDragEnd() {
        if (!wasDropped && originalOrder) {
            list.value.splice(0, list.value.length, ...originalOrder);
        }
        reset();
    }

    function reset() {
        draggedIndex.value = -1;
        originalOrder = null;
        wasDropped = false;
    }

    return { draggedIndex, onDragStart, onDragOver, onDrop, onDragEnd };
}

/**
 * Flyt med pilene: pil op/ned på trækhåndtaget og knapperne ▲/▼ i hver række.
 *
 * Bruges af "Flyt kolonner" (ColumnLayoutModal) og "Ranger værdier"
 * (ColumnOrderModal), der før havde hver sin kopi ord for ord. Rækkerne skal
 * have klassen `.order-row`, trækhåndtaget `.drag-handle` og pilene `.step`
 * (i rækkefølgen [op, ned]).
 *
 * @param {import('vue').Ref<Array>} list  arbejdslisten (en almindelig ref —
 *        den erstattes med en ny liste ved hvert flyt)
 * @param {import('vue').Ref<HTMLElement|null>} containerRef  vinduet, rækkerne
 *        står i — fokus findes igen herinde efter flytningen
 */
export function useReorderKeys(list, containerRef) {
    /**
     * Hvilken knap flyttede rækken — trækhåndtaget eller en af de to pile?
     *
     * Svaret bruges til at give fokus tilbage bagefter. `null` betyder "ingen af
     * dem", fx et museklik i Safari, der ikke flytter fokus til knappen — og så
     * skal vi heller ikke flytte den.
     */
    function usedControl(el) {
        if (!el || !el.classList) return null;
        if (el.classList.contains('drag-handle')) return 'handle';
        if (!el.classList.contains('step')) return null;
        // Pilene ligger i rækkefølgen [op, ned] i hver række.
        return el.parentElement?.querySelectorAll('.step')[0] === el ? 'up' : 'down';
    }

    function move(index, direction) {
        const target = index + direction;
        if (target < 0 || target >= list.value.length) return;
        const used = usedControl(document.activeElement);
        const items = [...list.value];
        [items[index], items[target]] = [items[target], items[index]];
        list.value = items;

        // ─── Fokus følger rækken (gennemsynet 9/9) ──────────────────────────
        // Rækken bliver FLYTTET i DOM'en (TransitionGroup sætter <li> ind på
        // ny), og et element der sættes ind igen, taber fokus — også når det
        // ikke bliver deaktiveret. Målt: ét tryk på pil op flyttede kolonnen,
        // og `document.activeElement` var BODY bagefter. Andet tryk gjorde
        // derfor ingenting, og listen kunne i praksis kun betjenes ÉN gang med
        // tastaturet. Rettelsen 27/8 fangede kun det tilfælde, hvor rækken
        // landede i en ENDE og knappen blev deaktiveret; i midten faldt
        // markøren hver eneste gang.
        //
        // Vi noterer derfor hvilken knap der blev brugt, og giver fokus
        // tilbage til den samme knap på rækkens nye plads. Rammer rækken
        // enden, er den pil slået fra, og den modsatte tager over.
        if (!used) return;
        nextTick(() => {
            const row = containerRef.value?.querySelectorAll('.order-row')[target];
            if (!row) return;
            if (used === 'handle') { row.querySelector('.drag-handle')?.focus(); return; }
            const arrows = row.querySelectorAll('.step');
            const wanted = used === 'up' ? arrows[0] : arrows[1];
            const opposite = used === 'up' ? arrows[1] : arrows[0];
            (wanted && !wanted.disabled ? wanted : opposite)?.focus();
        });
    }

    // Pil op/ned på trækhåndtaget — trækket selv virker ikke med tastaturet.
    function onHandleKey(i, e) {
        if (e.key === 'ArrowUp') { e.preventDefault(); move(i, -1); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); move(i, 1); }
    }

    return { move, onHandleKey };
}
