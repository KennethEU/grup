import { test, expect, Page } from '@playwright/test';
import { createClass, goToGroups, setGroupSize, generateGroups, closeRecipe } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Et billede i afspilningen tegner kun de kort om, der har med det at gøre.
//
// Før tegnede ALLE kort sig om ved hvert eneste billede: billedet fik nye
// gruppe-objekter, og hvert kort læste `state.replay` (der udskiftes hver
// gang) direkte. Hver gentegning får Vues TransitionGroup til at lægge en
// kopi af en elevrække ind i kortet og måle den. Med 300 elever (75 kort) og
// 4× neddrosling holdt en afspilning på 60 ms siden travl hele tiden (målt
// 11/11: 56 lange opgaver, 3,1 s ud af 3,5 s). Nu tegnes kun kortet, der fik
// en elev, og kortet, hvis fremhævning skal væk.
//
// Testen tæller ændringer i DOM'en (MutationObserver) i hvert korts
// elevliste — kopien fra TransitionGroup er også en ændring, så den fanger
// præcis den fejl, uden at afhænge af hvor hurtig maskinen er.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function csv(n: number) {
    const rows = ['Navn\tKøn\tKarakter'];
    for (let i = 0; i < n; i++) rows.push(`Elev ${i + 1}\t${i % 2 ? 'M' : 'K'}\t${[4, 7, 10, 12][i % 4]}`);
    return rows.join('\n');
}

// Kort på vej ud (Vues overgang) står et øjeblik endnu i DOM'en; de tæller ikke.
const CARD = '.group-card:not(.group-list-leave-active)';

function seek(page: Page, frame: number) {
    return page.locator('.replay-menu input[type="range"]').evaluate((el: HTMLInputElement, v) => {
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }, frame);
}

/** Navnene på de kort, der lige nu har en fremhævet elev. */
function highlightedCards(page: Page): Promise<string[]> {
    return page.locator(CARD).evaluateAll(cards => cards
        .filter(c => c.querySelector('li.replay-moved'))
        .map(c => (c as HTMLElement).dataset.groupId || ''));
}

test('et skridt i afspilningen tegner kun de berørte kort om', async ({ page }) => {
    await createClass(page, 'Afspilning ydelse', csv(48));
    await goToGroups(page);
    await setGroupSize(page, 4);
    await generateGroups(page);
    await closeRecipe(page);
    await expect(page.locator('.group-card')).toHaveCount(12);

    await page.locator('.replay-anchor .action-pill').click();
    await page.locator('.replay-menu .start').click();
    await expect(page.locator('.replay-menu .play-toggle')).toBeVisible();
    await page.waitForTimeout(800);   // de rigtige kort er gledet ud

    // Midt i uddelingen, når alle kort står der: så flytter gitteret ikke
    // rundt på kortene, og hvert skridt lægger én elev i ét kort. Et kort
    // dukker først op, når det får sin første elev, og rækkefølgen er
    // motorens egen — derfor findes billedet ved at prøve sig frem.
    const deal = await page.evaluate(() => (window as any).appDebug.state.replay.dealCount);
    expect(deal).toBe(48);
    let frame = 24;
    for (; frame <= deal - 4; frame++) {
        await seek(page, frame);
        await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.replay?.frameIndex)).toBe(frame);
        if (await page.locator(CARD).count() === 12) break;
    }
    expect(frame, 'et billede i uddelingen med alle 12 kort').toBeLessThanOrEqual(deal - 4);
    await page.waitForTimeout(600);   // kortenes overgang
    await expect(page.locator(CARD)).toHaveCount(12);

    for (let step = 1; step <= 3; step++) {
        const before = await highlightedCards(page);
        expect(before.length, 'ét kort har den elev, der lige blev lagt').toBe(1);

        await page.evaluate((sel) => {
            const touched = new Set<string>();
            (window as any).__touched = touched;
            (window as any).__observers = [...document.querySelectorAll(sel)].map(card => {
                const name = (card as HTMLElement).dataset.groupId || '';
                const o = new MutationObserver(() => touched.add(name));
                o.observe(card.querySelector('.group-members-list')!,
                    { childList: true, attributes: true, subtree: true, characterData: true });
                return o;
            });
        }, CARD);
        await seek(page, frame + step);
        await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.replay?.frameIndex)).toBe(frame + step);
        await page.waitForTimeout(600);
        const touched: string[] = await page.evaluate(() => {
            (window as any).__observers.forEach((o: MutationObserver) => o.disconnect());
            return [...(window as any).__touched];
        });
        const after = await highlightedCards(page);
        expect(after.length).toBe(1);

        // Kun kortet, der fik eleven, og kortet, der havde fremhævningen før.
        const allowed = new Set([...before, ...after]);
        expect(touched.length, `kort tegnet om: ${touched.join(', ')}`).toBeGreaterThan(0);
        for (const i of touched) {
            expect(allowed.has(i), `kortet ${i} blev tegnet om uden at have noget med skridtet at gøre (berørte: ${touched.join(', ')})`).toBe(true);
        }
    }
});
