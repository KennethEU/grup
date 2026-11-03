// useBarPopover.js — placeringen af en popup over en knap i bundbjælken.
//
// HVORFOR DEN LIGGER FOR SIG: to menuer hænger nu på den flydende
// værktøjslinje — kørselshistorikken og afspilningen af en kørsel — og de skal
// stå præcis samme sted i forhold til hver sin knap. Regnestykket stod
// oprindeligt inde i RunHistoryMenu; skrevet af to gange ville de før eller
// siden drive fra hinanden, og det er netop den slags, der ikke opdages, før
// den ene menu står halvt uden for skærmen på en telefon.
//
// DET SVÆRE, DEN LØSER: menuen er `position: absolute` inde i et anker, der kun
// er ikonknappens 34 px bredt. Et absolut placeret element krymper til sin
// containing block, så en automatisk bredde blev 13-17 px med ét ord pr.
// linje. Derfor: fast bredde, og den vandrette placering måles i JS med
// bjælken (offsetParent) som holdepunkt.

import { ref, onMounted, onUnmounted, nextTick } from 'vue';

/**
 * @param {import('vue').Ref} rootRef  menuens rod-element
 * @param {string} anchorClass         klassen på knappens indpakning
 * @param {number} preferredWidth      ønsket bredde i px (skrumper på smal skærm)
 */
export function useBarPopover(rootRef, anchorClass, preferredWidth = 296) {
    const menuStyle = ref({});
    const arrowStyle = ref({});

    function position() {
        const menu = rootRef.value;
        const anchor = menu?.closest(`.${anchorClass}`);
        const bar = menu?.offsetParent;
        if (!menu || !anchor || !bar) return;

        const gap = 8;
        // Skærmbredden. Falder tilbage på den ønskede bredde, hvis browseren
        // svarer 0 eller noget meningsløst — en menu i fuld bredde er stadig
        // bedre end en på nul pixels.
        const screenWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const width = screenWidth > 120
            ? Math.min(preferredWidth, screenWidth - 2 * gap)
            : preferredWidth;
        menu.style.inlineSize = `${width}px`;

        const bRect = bar.getBoundingClientRect();
        const aRect = anchor.getBoundingClientRect();

        const buttonCenter = aRect.left + aRect.width / 2;
        let left = buttonCenter - width / 2;

        // Hold menuen inden for skærmen — men kun når der ER en skærm at måle
        // imod, ellers ville klemningen skubbe den et vilkårligt sted hen.
        if (screenWidth > 0) {
            left = Math.max(gap, Math.min(left, screenWidth - width - gap));
        }

        menuStyle.value = { insetInlineStart: `${left - bRect.left}px` };
        // Pilen bliver ved knappen, også når menuen er skubbet ind fra kanten.
        arrowStyle.value = { insetInlineStart: `${buttonCenter - left - 6}px` };
    }

    onMounted(() => {
        nextTick(position);
        window.addEventListener('resize', position);
    });

    onUnmounted(() => {
        window.removeEventListener('resize', position);
    });

    return { menuStyle, arrowStyle, position };
}
