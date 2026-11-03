import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import { useReorderDrag } from './useReorderDrag.js';

/** Et falsk dragover-event der peger på række `i` i en liste af 40px rækker. */
function hoverTarget(i, half = 'under') {
    const top = i * 40;
    return {
        preventDefault() {},
        clientY: half === 'over' ? top + 10 : top + 30,
        currentTarget: { getBoundingClientRect: () => ({ top, height: 40 }) },
    };
}

const dragStartEvent = () => ({ dataTransfer: { effectAllowed: '', setData() {} } });

describe('useReorderDrag', () => {
    it('flytter elementet med det samme — listen skubber undervejs', () => {
        const list = ref(['A', 'B', 'C', 'D']);
        const d = useReorderDrag(list);

        d.onDragStart(0, dragStartEvent());
        d.onDragOver(1, hoverTarget(1));            // markøren forbi midten af B

        // Ikke først ved drop: listen ER flyttet nu.
        expect(list.value).toEqual(['B', 'A', 'C', 'D']);
        expect(d.draggedIndex.value).toBe(1);
    });

    it('venter til markøren er forbi midten, så elementerne ikke vipper', () => {
        const list = ref(['A', 'B', 'C']);
        const d = useReorderDrag(list);

        d.onDragStart(0, dragStartEvent());
        d.onDragOver(1, hoverTarget(1, 'over'));    // på vej NED, men kun i øverste halvdel
        expect(list.value).toEqual(['A', 'B', 'C']);

        d.onDragOver(1, hoverTarget(1, 'under'));   // forbi midten
        expect(list.value).toEqual(['B', 'A', 'C']);
    });

    it('samme regel den anden vej', () => {
        const list = ref(['A', 'B', 'C']);
        const d = useReorderDrag(list);

        d.onDragStart(2, dragStartEvent());
        d.onDragOver(1, hoverTarget(1, 'under'));   // på vej OP, men stadig i nederste halvdel
        expect(list.value).toEqual(['A', 'B', 'C']);

        d.onDragOver(1, hoverTarget(1, 'over'));
        expect(list.value).toEqual(['A', 'C', 'B']);
    });

    it('kan flytte hele vejen ned gennem listen', () => {
        const list = ref(['A', 'B', 'C', 'D']);
        const d = useReorderDrag(list);

        d.onDragStart(0, dragStartEvent());
        d.onDragOver(1, hoverTarget(1));
        d.onDragOver(2, hoverTarget(2));
        d.onDragOver(3, hoverTarget(3));
        expect(list.value).toEqual(['B', 'C', 'D', 'A']);
    });

    it('gemmer FØRST ved drop — ikke ved hvert lille ryk', () => {
        const onCommit = vi.fn();
        const list = ref(['A', 'B', 'C']);
        const d = useReorderDrag(list, { onCommit });

        d.onDragStart(0, dragStartEvent());
        d.onDragOver(1, hoverTarget(1));
        d.onDragOver(2, hoverTarget(2));
        expect(onCommit).not.toHaveBeenCalled();

        d.onDrop({ preventDefault() {} });
        expect(onCommit).toHaveBeenCalledTimes(1);
    });

    it('gemmer ikke, når elementet endte, hvor det startede', () => {
        const onCommit = vi.fn();
        const list = ref(['A', 'B']);
        const d = useReorderDrag(list, { onCommit });

        d.onDragStart(0, dragStartEvent());
        d.onDrop({ preventDefault() {} });
        expect(onCommit).not.toHaveBeenCalled();
    });

    it('lægger rækkefølgen tilbage, hvis man slipper uden for listen', () => {
        const onCommit = vi.fn();
        const list = ref(['A', 'B', 'C']);
        const d = useReorderDrag(list, { onCommit });

        d.onDragStart(0, dragStartEvent());
        d.onDragOver(2, hoverTarget(2));
        expect(list.value).toEqual(['B', 'C', 'A']);

        d.onDragEnd();                        // dragend uden drop
        expect(list.value).toEqual(['A', 'B', 'C']);
        expect(onCommit).not.toHaveBeenCalled();
    });

    it('lader et gennemført drop stå — dragend bagefter rører ikke listen', () => {
        const list = ref(['A', 'B', 'C']);
        const d = useReorderDrag(list);

        d.onDragStart(0, dragStartEvent());
        d.onDragOver(1, hoverTarget(1));
        d.onDrop({ preventDefault() {} });
        d.onDragEnd();                        // browseren sender altid dragend til sidst
        expect(list.value).toEqual(['B', 'A', 'C']);
    });

    it('rører intet, når trækket ikke er startet', () => {
        const list = ref(['A', 'B']);
        const d = useReorderDrag(list);
        d.onDragOver(1, hoverTarget(1));
        expect(list.value).toEqual(['A', 'B']);
        expect(d.draggedIndex.value).toBe(-1);
    });

    it('kan slås fra med kanFlyttes', () => {
        const list = ref(['A', 'B']);
        const d = useReorderDrag(list, { canDrag: () => false });
        d.onDragStart(0, dragStartEvent());
        expect(d.draggedIndex.value).toBe(-1);
        d.onDragOver(1, hoverTarget(1));
        expect(list.value).toEqual(['A', 'B']);
    });
});
