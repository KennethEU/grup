import { test, expect, Page, Locator } from '@playwright/test';
import { createClassAndGoToGroups, generateGroups } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Eleven lander dér, hvor pladsholderen står.
//
// Trak læreren en elev NEDAD i sit eget kort, stod pladsholderen én række for
// højt, og eleven landede en række længere nede, end pladsholderen havde
// vist (fundet 3/11 2026: vist [David, P, Lars, Hans], landede efter Lars).
// getInsertIndex talte pladsen uden den trukne elev, mens kortet trak én fra,
// som om hun talte med. Se getInsertIndex i useDragDrop.js.
//
// Den langsomme gennemkørsel vogter samtidig mod, at pladsholderen hopper
// frem og tilbage, mens rækkerne glider (de måles midt i overgangen).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Samme grund som i swap.spec.ts: Playwrights WebKit slipper ikke et
// trin-for-trin-træk.
test.beforeEach(({ browserName }) => {
    test.skip(browserName === 'webkit', 'Playwrights WebKit slipper ikke et trin-for-trin-træk');
});

const rows = (card: Locator) =>
    card.locator('.group-members-list > li:not(.list-leave-active)');

/** Kortets rækkefølge, med "P" for pladsholderen. */
const order = (card: Locator) => rows(card).evaluateAll(els => els.map(e =>
    e.classList.contains('placeholder-item')
        ? 'P'
        : (e.querySelector('.member-name-text')?.textContent || '').trim()));

/** Små ryk på stedet: Playwright sender kun `dragover` ved en bevægelse. */
async function rest(page: Page, x: number, y: number, ms: number) {
    for (let t = 0; t < ms; t += 60) {
        await page.mouse.move(x + (t % 120 ? 1 : 0), y);
        await page.waitForTimeout(60);
    }
}

/** Grib rækken nr. `from` i kortet og løft den lidt. */
async function grab(page: Page, card: Locator, from: number) {
    const box = (await rows(card).nth(from).boundingBox())!;
    await page.mouse.move(box.x + 10, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 20, box.y + box.height / 2 + 3, { steps: 4 });
    // Lad pladsholderen komme og rækkerne glide på plads
    await rest(page, box.x + 20, box.y + box.height / 2 + 3, 400);
    return box.x + 20;
}

for (const dir of ['ned', 'op'] as const) {
    test(`Træk ${dir} i eget kort: eleven lander dér, hvor pladsholderen stod`, async ({ page }) => {
        await createClassAndGoToGroups(page, `Traek ${dir} E2E`);
        await generateGroups(page);
        const card = page.locator('.group-card').nth(0);
        const before = await order(card);
        const n = before.length;
        expect(n).toBeGreaterThanOrEqual(4);

        // Ned: den første elev, til nederste del af næstsidste række.
        // Op: den sidste elev, til øverste del af anden række.
        const from = dir === 'ned' ? 0 : n - 1;
        const dragged = before[from];
        const x = await grab(page, card, from);
        const target = (await rows(card).nth(dir === 'ned' ? n - 2 : 1).boundingBox())!;
        const y = target.y + target.height * (dir === 'ned' ? 0.75 : 0.25);
        await page.mouse.move(x, y, { steps: 10 });
        await rest(page, x, y, 500);

        const shown = await order(card);
        // Pladsholderen står under musen (ikke en række ved siden af)
        const p = (await card.locator('li.placeholder-item').boundingBox())!;
        expect(y).toBeGreaterThanOrEqual(p.y - 1);
        expect(y).toBeLessThanOrEqual(p.y + p.height + 1);

        await page.mouse.up();
        await expect.poll(() => order(card)).toEqual(shown.map(s => (s === 'P' ? dragged : s)));
    });
}

for (const own of [true, false]) {
    test(`Langsomt hen over ${own ? 'eget' : 'et andet'} kort: pladsholderen hopper ikke tilbage`, async ({ page }) => {
        await createClassAndGoToGroups(page, 'Traek glid E2E');
        await generateGroups(page);
        const source = page.locator('.group-card').nth(0);
        const card = own ? source : page.locator('.group-card').nth(1);
        await grab(page, source, 0);

        const list = (await card.locator('.group-members-list').boundingBox())!;
        const x = list.x + 30;
        await page.mouse.move(x, list.y + 4, { steps: 8 });
        await rest(page, x, list.y + 4, 400);

        // Pladsholderens plads efter hvert lille skridt; kun skift gemmes.
        async function sweep(y0: number, y1: number, step: number) {
            const seq: number[] = [];
            for (let y = y0; step > 0 ? y <= y1 : y >= y1; y += step) {
                await page.mouse.move(x, y);
                await page.waitForTimeout(16);
                const i = (await order(card)).indexOf('P');
                if (i !== -1 && seq[seq.length - 1] !== i) seq.push(i);
            }
            return seq;
        }
        const L = (await card.locator('.group-members-list').boundingBox())!;
        const down = await sweep(L.y + 2, L.y + L.height - 2, 4);
        const up = await sweep(L.y + L.height - 2, L.y + 2, -4);
        // Under trækket står den trukne elev ikke i listen (kun "P")
        const rowsWithoutDragged = (await order(card)).filter(s => s !== 'P').length;
        await page.mouse.up();

        // Ned går kun nedad og op kun opad — og hele vejen rundt
        expect(down).toEqual([...Array(rowsWithoutDragged + 1).keys()]);
        expect(up).toEqual([...Array(rowsWithoutDragged + 1).keys()].reverse());
    });
}
