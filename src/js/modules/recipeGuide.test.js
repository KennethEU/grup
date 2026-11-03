import { describe, it, expect, beforeEach } from 'vitest';
import { GUIDE_KEY, STUDENT_GUIDE_KEY, hasSeenGuide, markGuideSeen, resetGuideMemory, padRect, placeCard, clampStep } from './recipeGuide.js';

const vp = { width: 1280, height: 800 };
const card = { width: 320, height: 160 };

function fakeStorage() {
    const data = {};
    return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
}
const brokenStorage = {
    getItem() { throw new Error('blokeret'); },
    setItem() { throw new Error('blokeret'); },
};

describe('guidens hukommelse', () => {
    beforeEach(() => resetGuideMemory());

    it('er ikke set i en ren browser, og set bagefter', () => {
        const s = fakeStorage();
        expect(hasSeenGuide(s)).toBe(false);
        markGuideSeen(s);
        expect(s.getItem(GUIDE_KEY)).toBe('1');
        expect(hasSeenGuide(s)).toBe(true);
    });

    it('de to guider huskes hver for sig', () => {
        const s = fakeStorage();
        markGuideSeen(s, STUDENT_GUIDE_KEY);
        expect(hasSeenGuide(s, STUDENT_GUIDE_KEY)).toBe(true);
        expect(hasSeenGuide(s)).toBe(false);
    });

    it('et lager der kaster, giver stadig højst én visning pr. sideindlæsning', () => {
        expect(hasSeenGuide(brokenStorage)).toBe(false);
        markGuideSeen(brokenStorage);
        expect(hasSeenGuide(brokenStorage)).toBe(true);
    });
});

describe('placeCard', () => {
    it('lægger kortet under målet, når der er plads', () => {
        const p = placeCard({ left: 100, top: 20, width: 300, height: 40 }, card, vp);
        expect(p.side).toBe('below');
        expect(p.top).toBe(20 + 40 + 14);
    });

    it('lægger kortet over målet, når der ikke er plads under', () => {
        const p = placeCard({ left: 100, top: 700, width: 300, height: 60 }, card, vp);
        expect(p.side).toBe('above');
        expect(p.top + card.height).toBeLessThanOrEqual(700);
    });

    it('lægger kortet ved siden af et højt mål', () => {
        const p = placeCard({ left: 100, top: 20, width: 200, height: 760 }, card, vp);
        expect(p.side).toBe('right');
        expect(p.left).toBeGreaterThanOrEqual(300);
    });

    it('holder kortet på skærmen, også ved et mål helt ude i hjørnet', () => {
        for (const t of [
            { left: 0, top: 0, width: 80, height: 30 },
            { left: 1200, top: 0, width: 80, height: 30 },
            { left: 1200, top: 770, width: 80, height: 30 },
            { left: 0, top: 0, width: 1280, height: 800 },
        ]) {
            const p = placeCard(t, card, vp);
            expect(p.left).toBeGreaterThanOrEqual(0);
            expect(p.top).toBeGreaterThanOrEqual(0);
            expect(p.left + card.width).toBeLessThanOrEqual(vp.width);
            expect(p.top + card.height).toBeLessThanOrEqual(vp.height);
        }
    });
});

describe('padRect og clampStep', () => {
    it('padRect vokser på alle sider', () => {
        expect(padRect({ left: 10, top: 10, width: 20, height: 20 }, 4)).toEqual({ left: 6, top: 6, width: 28, height: 28 });
    });
    it('clampStep bliver inden for trinene', () => {
        expect(clampStep(0, -1, 5)).toBe(0);
        expect(clampStep(4, 1, 5)).toBe(4);
        expect(clampStep(2, 1, 5)).toBe(3);
    });
});
