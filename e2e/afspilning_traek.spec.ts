import { test, expect, Page } from '@playwright/test';
import { createClassAndGoToGroups, generateGroups } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Et træk, der begynder i afspilningens billede, må ikke flytte nogen.
//
// Under en afspilning er gruppekortene et billede (`inert`). Trykket uden for
// afspilleren lukker den, og kortene skifter i samme øjeblik tilbage til de
// rigtige grupper — mens musen stadig er nede. Målt 3/11 midt i uddelingen:
// læreren greb Jens i billedet, og Chromium og WebKit trak i stedet den elev,
// der sad på pladsen i de rigtige grupper, over i en anden gruppe. Firefox
// startede intet træk. Nu holdes kortene låst, til musen slippes.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Navnene på kortene, som de står på skærmen. */
function shownNames(page: Page) {
    return page.locator('.group-card').evaluateAll(cards => cards.map(c =>
        [...c.querySelectorAll('.group-members-list > li')]
            .map(li => (li as HTMLElement).innerText.split('\n')[0])));
}

/** Medlemmerne i de rigtige grupper (ikke billedet). */
function storedGroups(page: Page) {
    return page.evaluate(() => JSON.stringify(
        ((window as any).appDebug.state.storedStandardGroups || [])
            .map((g: any) => g.members.map((m: any) => m._rowId))));
}

type Box = { x: number, y: number, width: number, height: number };

/** Et rigtigt musetræk fra midten af `from` til midten af `to`. */
async function mouseDrag(page: Page, from: Box, to: Box) {
    const sx = from.x + from.width / 2, sy = from.y + from.height / 2;
    const tx = to.x + to.width / 2, ty = to.y + to.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + 10, sy + 10, { steps: 3 });
    await page.mouse.move(tx, ty, { steps: 8 });
    // dragover kommer først ved næste bevægelse — et ekstra lille skridt
    await page.mouse.move(tx + 2, ty, { steps: 2 });
    await page.mouse.up();
}

test('Et træk i afspilningens billede flytter ingen elev', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Afspilning traek');
    await generateGroups(page);
    const real = await shownNames(page);
    const before = await storedGroups(page);

    // Midt i uddelingen: billedet er en anden fordeling end den rigtige.
    await page.locator('.replay-anchor .action-pill').click();
    await page.locator('.replay-menu .start').click();
    await expect(page.locator('.replay-menu .play-toggle')).toBeVisible();
    const frame = await page.evaluate(() =>
        Math.floor((window as any).appDebug.state.replay.dealCount / 2) + 1);
    await page.locator('.replay-menu input[type="range"]').evaluate((el: HTMLInputElement, v) => {
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }, frame);
    await expect.poll(() => page.evaluate(() =>
        (window as any).appDebug.state.replay?.frameIndex)).toBe(frame);
    await page.waitForTimeout(600);   // kortenes overgang

    // Find en plads, hvor billedet og de rigtige grupper har hver sin elev —
    // det er dér, den forkerte elev blev flyttet.
    const picture = await shownNames(page);
    let gi = -1, mi = -1;
    outer: for (let g = 0; g < picture.length; g++) {
        for (let m = 0; m < picture[g].length; m++) {
            if (real[g]?.[m] && real[g][m] !== picture[g][m]) { gi = g; mi = m; break outer; }
        }
    }
    expect(gi, 'billedet skal være en anden fordeling end den rigtige').toBeGreaterThanOrEqual(0);

    const li = page.locator('.group-card').nth(gi).locator('.group-members-list > li').nth(mi);
    const target = page.locator('.group-card').nth(gi === 0 ? 1 : 0);
    await mouseDrag(page, (await li.boundingBox())!, (await target.boundingBox())!);
    await page.waitForTimeout(600);

    // Afspilningen er lukket af trykket, og ingen er flyttet.
    await expect.poll(() => page.evaluate(() => !!(window as any).appDebug.state.replay)).toBe(false);
    expect(await storedGroups(page)).toBe(before);
    // Ingen elev blev heller markeret af klikket, der fulgte med.
    await expect(page.locator('.pick-status')).toHaveText('');

    // Og låsen er sluppet igen: et almindeligt træk virker bagefter.
    const first = page.locator('.group-card').nth(0).locator('.group-members-list > li').first();
    const second = page.locator('.group-card').nth(1);
    const count = await second.locator('.group-members-list > li').count();
    await mouseDrag(page, (await first.boundingBox())!, (await second.boundingBox())!);
    await expect(second.locator('.group-members-list > li')).toHaveCount(count + 1);
});
