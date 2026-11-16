import { test, expect, Page } from '@playwright/test';
import { createClass, goToGroups } from './helpers';

// Dan grupper efter et kort netudfald (175. gennemsyn, 16/11 2026, tematik
// (210)). Kørslens tråd hentes forfra, når der ingen ledig tråd er (første
// Dan grupper i fanen, efter Stop eller efter en død tråd). Er nettet væk i
// det øjeblik, kan tråd-filen ikke hentes. Der er ingen ny udgave, så
// læreren skal have en besked om forbindelsen — og næste tryk skal virke,
// når nettet er tilbage, uden at siden genindlæses.

async function clickGo(page: Page) {
    const dialog = page.locator('dialog.recipe-dialog[open]');
    const button = (await dialog.count()) ? dialog.locator('.recipe__go') : page.locator('.recipe-bar .recipe__go');
    await button.click();
}

async function toastTexts(page: Page) {
    return page.locator('.toast').allInnerTexts();
}

test('Dan grupper under et netudfald: beskeden nævner forbindelsen, og næste tryk virker, når nettet er tilbage', async ({ page }) => {
    test.setTimeout(90000);
    let offline = false;
    let blocked = 0;
    // Kun motorens tråd-fil rammes; resten af siden er hentet i forvejen.
    await page.route(/engine-worker/, (route) => {
        if (!offline) return route.continue();
        blocked++;
        return route.abort('internetdisconnected');
    });
    // (211): hvor mange gange spørges der efter en ny udgave under udfaldet?
    let indexFetches = 0;
    page.on('request', (req) => { if (offline && /\/index\.html(\?|$)/.test(req.url())) indexFetches++; });
    await createClass(page, 'Netudfald');
    await goToGroups(page);
    // Tjek-tråden har sin tråd; herfra kan nye tråde ikke hentes.
    await page.waitForTimeout(300);
    offline = true;

    await clickGo(page);
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.isGenerating), { timeout: 30000 }).toBe(false);
    expect(blocked).toBeGreaterThanOrEqual(1);
    await expect(page.locator('.group-card')).toHaveCount(0);
    const texts = await toastTexts(page);
    const failure = texts.find(t => t.includes('Grupperne kunne ikke dannes'));
    expect(failure, JSON.stringify(texts)).toBeTruthy();
    // Beskeden peger på forbindelsen, ikke på en fejl i motoren.
    expect(failure).toContain('Tjek forbindelsen');
    expect(failure).not.toContain('stødte på en fejl');
    expect(texts.join(' ')).not.toContain('grup.dk er blevet opdateret');
    // Ét tryk, én fejl: index.html hentes én gang for at udelukke en ny udgave.
    expect(indexFetches).toBe(1);

    // Nettet er tilbage: næste tryk danner grupperne uden genindlæsning.
    offline = false;
    await clickGo(page);
    await expect(page.locator('.group-card')).toHaveCount(3, { timeout: 30000 });
});
