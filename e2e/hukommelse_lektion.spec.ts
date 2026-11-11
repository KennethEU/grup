import { test, expect, Page } from '@playwright/test';
import { createClass, goToGroups, setGroupSize, closeRecipe, openRecipe } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// En hel lektion med et stort hold hober intet op (89. gennemsyn, 11/11 2026).
//
// Runde efter runde: Dan grupper, Vis for klassen, opskriften, afspilningen,
// Elevliste og tilbage. Målt med 150 elever over 30 runder var sidens heap,
// DOM-noder og lyttere på window/document/body flade. Hver kørsel startede
// dengang en ny tråd til motoren; nu genbruges kørslens tråd ("Kørslens tråd
// genbruges" i nextEngine.js). 89. gennemsyn mente, at hver lukket tråd kostede
// 2–3 MB, men det var målt med RSS, som på macOS svinger flere hundrede MB.
// Med `phys_footprint` (90. gennemsyn) vokser ingen af de to måder målbart.
// Testen vogter derfor trådantallet (genbruget og deploy-tjekket bygger på
// det) og DOM/lyttere — ikke et hukommelsestal.
//
// Trådene tælles i siden selv (`new Worker`), så testen virker i alle tre
// browsere. Motorens egne hjælpetråde startes inde i kørslens tråd og tælles
// ikke her. At en fejl, tavshed, Stop uden svar og en afbrudt kørsel stadig
// lukker tråden, står i nextEngine.test.js ("genbrug af tråden").
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function csv(n: number) {
    const rows = ['Navn\tKøn\tKarakter'];
    for (let i = 0; i < n; i++) rows.push(`Elev ${i + 1}\t${i % 2 ? 'M' : 'K'}\t${[4, 7, 10, 12][i % 4]}`);
    return rows.join('\n');
}

/** Tæl de tråde, siden starter og lukker. Kaldes før siden åbnes. */
async function countWorkers(page: Page) {
    await page.addInitScript(() => {
        const Original = window.Worker;
        const log = { made: 0, terminated: 0 };
        (window as any).__workerLog = log;
        (window as any).Worker = class extends Original {
            constructor(url: string | URL, options?: WorkerOptions) { super(url, options); log.made++; }
            terminate() { log.terminated++; super.terminate(); }
        };
    });
}
const workerLog = (page: Page) => page.evaluate(() => ({ ...(window as any).__workerLog }));

/** Dan grupper med genvejen og vent, til NETOP denne kørsel er landet. */
async function runOnce(page: Page) {
    await page.evaluate(() => { (window as any).appDebug.state.lastRecording.standard.__seen = true; });
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect.poll(() => page.evaluate(() =>
        !(window as any).appDebug.state.isGenerating
        && !(window as any).appDebug.state.lastRecording?.standard?.__seen), { timeout: 60000 }).toBe(true);
}

/** Resten af en runde: vinduerne, afspilningen og et fanebesøg. */
async function lessonRound(page: Page) {
    await page.getByRole('button', { name: /Vis for klassen/ }).click();
    await page.locator('.show__close').click();
    await openRecipe(page);
    await closeRecipe(page);
    await page.locator('.replay-anchor .action-pill').click();
    await page.locator('.replay-menu .start').click();
    await page.locator('.replay-menu').getByRole('button', { name: 'Hop til slut' }).click();
    await page.keyboard.press('Escape');
    await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();
    await expect(page.locator('th').filter({ hasText: 'Navn' })).toBeVisible();
    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();
    await expect(page.locator('.group-card').first()).toBeVisible();
}

test('en lektion med 150 elever: én tråd til kørslerne, og intet vokser', async ({ page, browserName }) => {
    test.setTimeout(180000);
    await countWorkers(page);
    await createClass(page, 'Lektion 150', csv(150));
    await goToGroups(page);
    await setGroupSize(page, 4);
    await page.locator('dialog.recipe-dialog[open] .recipe__go').click();
    await expect(page.locator('.group-card').first()).toBeVisible({ timeout: 90000 });
    await closeRecipe(page);

    // Chromes egne tal (kun Chromium har CDP): DOM-noder og lyttere i siden.
    const cdp = browserName === 'chromium' ? await page.context().newCDPSession(page) : null;
    await cdp?.send('Performance.enable');
    const pageMetrics = async () => {
        if (!cdp) return null;
        await page.waitForTimeout(600);   // kort, der glider ud, er væk
        await cdp.send('HeapProfiler.collectGarbage');
        const { metrics } = await cdp.send('Performance.getMetrics');
        const m = Object.fromEntries(metrics.map(x => [x.name, x.value]));
        return { nodes: m.Nodes, listeners: m.JSEventListeners };
    };

    let afterWarmup: { nodes: number; listeners: number } | null = null;
    for (let round = 1; round <= 8; round++) {
        await runOnce(page);
        await lessonRound(page);
        if (round === 2) afterWarmup = await pageMetrics();
    }

    // Kørslernes tråd og check()-tråden: to i alt, uanset antallet af
    // kørsler. Før 89. gennemsyn: en ny tråd pr. kørsel (10 her).
    const log = await workerLog(page);
    expect(log.made).toBeLessThanOrEqual(2);
    expect(log.terminated).toBe(0);

    if (afterWarmup) {
        const end = (await pageMetrics())!;
        // Lidt luft (2 %) til et tip eller et kort på vej ud.
        expect(end.nodes).toBeLessThanOrEqual(afterWarmup.nodes * 1.02);
        expect(end.listeners).toBeLessThanOrEqual(afterWarmup.listeners * 1.02);
    }
});
