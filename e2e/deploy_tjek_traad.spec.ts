import { test, expect, Page } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { skipGuides } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tjek-tråden i en fane, der blev åbnet før en deploy (115. gennemsyn).
//
// Fanen står på forsiden uden en åben klasse, så tjek-tråden (check() i
// nextEngine.js) er aldrig startet. Så "deployes" der: trådfilerne giver 404,
// og index.html peger på en ny hovedfil. Læreren opretter en klasse og retter
// i opskriften. Før: en ny tråd blev startet — og fejlede — ved hver ændring
// (6 forgæves hentninger i sonden), og ingen besked; opskriften stod uden
// motorens advarsler, til Dan grupper sagde "genindlæs". Nu: beskeden om den
// nye udgave én gang, og ingen nye forsøg.
//
// Den BYGGEDE udgave serveres på /bygget/ (som deploy_genbrugt_traad.spec.ts).
// Byg (npm run build), før testen køres efter en ændring i src/.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BUILD = resolve(import.meta.dirname, '..', '..', 'public', 'grupper');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const NEW_BUILD = 'grup.dk er blevet opdateret, mens siden stod åben';

test('en fane fra før en deploy siger én gang, at den skal genindlæses, når tjek-tråden ikke kan hentes', async ({ page, context }) => {
    let deployed = false;
    let workerHits = 0;
    await context.route(/\/bygget\//, (route) => {
        const path = new URL(route.request().url()).pathname.replace(/^\/bygget\/?/, '') || 'index.html';
        if (/^assets\/(engine-)?worker-.*\.js$/.test(path) && deployed) { workerHits++; return route.fulfill({ status: 404, body: 'ukendt' }); }
        const file = join(BUILD, path);
        if (!existsSync(file)) return route.fulfill({ status: 404, body: 'ukendt' });
        let body: Buffer | string = readFileSync(file);
        if (path === 'index.html' && deployed) body = body.toString().replace(/index-[\w-]+\.js/, 'index-NYUDGAVE.js');
        route.fulfill({ status: 200, body, headers: { 'content-type': TYPES[extname(file)] || 'application/octet-stream' } });
    });
    await skipGuides(page);
    await page.goto('/bygget/');
    await page.waitForFunction(() => (window as any).appDebug?.pyBridge?.isReady === true, null, { timeout: 30000 });
    deployed = true;
    await page.getByRole('button', { name: 'Indsæt klasseliste fra Excel / Sheets' }).click();
    await page.getByRole('button', { name: 'Indsæt tekst / Excel' }).click();
    await page.getByPlaceholder('F.eks. 1.g Dansk').fill('Deploy');
    const rows = ['Navn\tKøn'];
    for (let i = 0; i < 40; i++) rows.push(`Elev ${i + 1}\t${i % 2 ? 'M' : 'K'}`);
    await page.locator('textarea:visible').first().fill(rows.join('\n'));
    await page.getByRole('button', { name: /Opret klasse/i }).click();
    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();
    // Beskeden kommer, uden at læreren har trykket Dan grupper.
    const toast = page.locator('.toast').filter({ hasText: NEW_BUILD });
    await expect(toast).toHaveCount(1, { timeout: 15000 });
    const hitsAtMessage = workerHits;
    expect(hitsAtMessage).toBeGreaterThan(0);

    // Flere ændringer i opskriften: ingen nye forsøg på at hente tråden.
    for (let i = 0; i < 4; i++) {
        await page.evaluate((i) => { (window as any).appDebug.state.currentClass.settings.groupTarget = 3 + i; }, i);
        await page.waitForTimeout(400);
    }
    expect(workerHits).toBe(hitsAtMessage);
    await expect(toast).toHaveCount(1);
});
