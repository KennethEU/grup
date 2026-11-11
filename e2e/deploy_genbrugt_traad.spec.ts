import { test, expect, Page } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { skipGuides } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// En åben fane efter en deploy, når motorens tråd genbruges (89. gennemsyn).
//
// Siden 11/11 2026 genbruges kørslens tråd (nextEngine.js, "Kørslens tråd
// genbruges"). Før hentede hver "Dan grupper" motorens fil igen; var den væk
// efter en deploy (rsync --delete), fejlede kørslen, og læreren fik beskeden
// "grup.dk er blevet opdateret … Genindlæs siden". Med en genbrugt tråd
// hentes filen ikke igen, så uden mere ville fanen tie og den gamle motor
// regne videre — målt med denne sonde, før rettelsen: ingen besked.
//
// Den BYGGEDE udgave serveres på /bygget/ (som del_kan_ikke_hentes.spec.ts):
// efter første kørsel "deployes" der — trådfilerne giver 404, og index.html
// peger på en ny hovedfil. Byg (npm run build), før testen køres efter en
// ændring i src/.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BUILD = resolve(import.meta.dirname, '..', '..', 'public', 'grupper');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const NEW_BUILD = 'grup.dk er blevet opdateret, mens siden stod åben';

async function generate(page: Page) {
    const go = page.locator('dialog.recipe-dialog[open] .recipe__go');
    if (await go.count()) await go.click();
    else await page.keyboard.press('ControlOrMeta+Enter');
    await page.waitForTimeout(300);
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.isGenerating), { timeout: 60000 }).toBe(false);
}

test('efter en deploy siger en genbrugt tråd stadig, at der er en ny udgave', async ({ page, context }) => {
    let deployed = false;
    // context.route: trådenes hentninger går ikke gennem page.route
    await context.route(/\/bygget\//, (route) => {
        const path = new URL(route.request().url()).pathname.replace(/^\/bygget\/?/, '') || 'index.html';
        if (deployed && /^assets\/(engine-)?worker-.*\.js$/.test(path)) return route.fulfill({ status: 404, body: 'ukendt' });
        const file = join(BUILD, path);
        if (!existsSync(file)) return route.fulfill({ status: 404, body: 'ukendt' });
        let body: Buffer | string = readFileSync(file);
        if (path === 'index.html' && deployed) body = body.toString().replace(/index-[\w-]+\.js/, 'index-NYUDGAVE.js');
        route.fulfill({ status: 200, body, headers: { 'content-type': TYPES[extname(file)] || 'application/octet-stream' } });
    });
    await skipGuides(page);
    await page.goto('/bygget/');
    await page.waitForFunction(() => (window as any).appDebug?.pyBridge?.isReady === true, null, { timeout: 30000 });
    await page.getByRole('button', { name: 'Indsæt klasseliste fra Excel / Sheets' }).click();
    await page.getByRole('button', { name: 'Indsæt tekst / Excel' }).click();
    await page.getByPlaceholder('F.eks. 1.g Dansk').fill('Deploy');
    const rows = ['Navn\tKøn'];
    for (let i = 0; i < 40; i++) rows.push(`Elev ${i + 1}\t${i % 2 ? 'M' : 'K'}`);
    await page.locator('textarea:visible').first().fill(rows.join('\n'));
    await page.getByRole('button', { name: /Opret klasse/i }).click();
    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();
    await page.waitForFunction(() => !!document.querySelector('dialog.recipe-dialog[open]'), null, { timeout: 10000 });

    await generate(page);
    await expect(page.locator('.group-card').first()).toBeVisible();
    await expect(page.locator('.toast').filter({ hasText: NEW_BUILD })).toHaveCount(0);

    deployed = true;
    // Kørslen bruger den genbrugte tråd: grupperne lander, og beskeden kommer.
    await page.evaluate(() => { (window as any).appDebug.state.lastRecording.standard.__seen = true; });
    await generate(page);
    expect(await page.evaluate(() => !(window as any).appDebug.state.lastRecording?.standard?.__seen)).toBe(true);
    await expect(page.locator('.toast').filter({ hasText: NEW_BUILD })).toHaveCount(1);
});
