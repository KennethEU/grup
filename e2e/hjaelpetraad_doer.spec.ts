import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { DEFAULT_CSV, skipGuides } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EN AF MOTORENS HJÆLPETRÅDE DØR MIDT I ET FORSØG (172. gennemsyn, (204)).
//
// Motoren (motor/engine/solve.js) regner forsøgene på flere kerner i
// hjælpetråde (worker-XXXX.js). Kaster en af dem en fejl, som den ikke selv
// fanger, skal motoren køre forsøgene om på én kerne — ikke vælte hele
// kørslen. Spørgsmålet var, om fejlen "bobler op" til motorens egen tråd og
// derfra til appens worker.onerror (så læreren fik "Grupperne kunne ikke
// dannes"). Målt 16/11 2026 i chromium, firefox og webkit: nej, grupperne
// lander på én kerne, uden fejlbesked. Testen holder det sådan.
//
// Den BYGGEDE udgave (public/grupper) serveres af en lille Express-server i
// testen, fordi Playwrights route ikke ser hjælpetrådenes egne hentninger.
// "ingen" er kontrollen: uden fejl bruges flere kerner.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ROOT = resolve(import.meta.dirname, '..', '..');
const require = createRequire(resolve(ROOT, 'routes', 'grupper-assets.js'));
const express = require('express');

for (const mode of ['async', 'sync', 'ingen']) test(`en hjælpetråd kaster (${mode}): grupperne lander alligevel`, async ({ page }) => {
    test.setTimeout(120000);
    let helperHits = 0;
    const app = express();
    app.use((req: any, res: any, next: any) => {
        if (/^\/assets\/worker-.*\.js$/.test(req.path) && mode !== 'ingen') {
            helperHits++;
            const body = mode === 'async'
                ? `self.onmessage = (e) => { if (e.data && e.data.type === 'attempt') setTimeout(() => { throw new Error('sonde'); }, 20); };`
                : `self.onmessage = (e) => { if (e.data && e.data.type === 'attempt') throw new Error('sonde'); };`;
            return res.type('text/javascript').send(body);
        }
        if (/^\/assets\/worker-.*\.js$/.test(req.path)) helperHits++;
        next();
    });
    app.use(express.static(resolve(ROOT, 'public', 'grupper')));
    app.use(express.static(resolve(ROOT, 'public')));
    const server: any = await new Promise((done) => { const l = app.listen(0, '127.0.0.1', () => done(l)); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    await skipGuides(page);
    await page.goto(origin + '/');
    await page.waitForFunction(() => (window as any).appDebug?.pyBridge?.isReady === true, null, { timeout: 30000 });
    await page.getByRole('button', { name: 'Indsæt klasseliste fra Excel / Sheets' }).click();
    await page.getByRole('button', { name: 'Indsæt tekst / Excel' }).click();
    await page.getByPlaceholder('F.eks. 1.g Dansk').fill('Sonde');
    await page.locator('textarea:visible').first().fill(DEFAULT_CSV);
    await page.getByRole('button', { name: /Opret klasse/i }).click();
    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();
    await page.evaluate(() => { (window as any).appDebug.state.currentClass.rules = [{ type: 'distribute', column: 'Køn' }]; });
    await page.locator('dialog.recipe-dialog[open] .recipe__go').click();
    await page.waitForFunction(() => (window as any).appDebug.nextStats || document.querySelector('.toast--error, .toast.error'), null, { timeout: 90000 }).catch(() => {});
    await page.waitForFunction(() => !(window as any).appDebug.state.isGenerating, null, { timeout: 90000 });
    const out = await page.evaluate(() => ({ groups: ((window as any).appDebug.state.storedStandardGroups || []).length, stats: (window as any).appDebug.nextStats, hc: navigator.hardwareConcurrency }));
    const toasts = await page.locator('.toast').allInnerTexts();
    await new Promise(done => server.close(done));
    expect(helperHits, 'hjælpetrådens fil blev aldrig hentet').toBeGreaterThan(0);
    expect(out.groups).toBe(3);
    expect(out.stats?.status).toBe('ok');
    expect(toasts.join('\n')).not.toMatch(/kunne ikke dannes|fejl/i);
    test.skip(out.hc <= 2, 'maskinen har for få kerner');
    if (mode === 'ingen') expect(out.stats.cores).toBeGreaterThan(1);
    else expect(out.stats.cores).toBe(1);
});
