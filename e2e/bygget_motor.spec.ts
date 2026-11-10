import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { DEFAULT_CSV, skipGuides } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Det BYGGEDE program (public/grupper) bag den rigtige server-kæde: Express
// med compression, routes/grupper-assets.js (de færdigpakkede .br-filer) og
// express.static — som grup.dk i app.js. Byg først (npm run build).
//
// Det, der kun kan gå galt her: motorens trådfiler (engine-worker-XXXX.js og
// worker-XXXX.js) hentes med brotli af en tråd, ikke af siden. Kan en
// forsøgs-tråd ikke starte, regner motoren STILLE videre på én kerne — samme
// grupper, ingen fejl, bare langsommere. Derfor tjekker testen, at kørslen
// faktisk brugte flere kerner, og hvad serveren sendte.
// (`cores > 1` er ikke tidsafhængigt: kun en fejl fra en tråd — onerror eller
// en fejlbesked i solve.js' runPool — giver én kerne; en langsom tråd ventes på.)
//
// Chromium og Firefox beder om brotli også over http og får .br-filen;
// WebKit (Safari) beder kun om brotli over https og får reservevejen (gzip,
// pakket undervejs) — målt 4/11 2026. Begge veje prøves altså.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ROOT = resolve(import.meta.dirname, '..', '..');
const require = createRequire(resolve(ROOT, 'routes', 'grupper-assets.js'));
const express = require('express');
const compression = require('compression');

/** Hvad serveren sendte med status 200: filnavn → Content-Encoding ('' = upakket). */
let served: Map<string, string>;
let server: any;
let origin: string;

test.beforeEach(async () => {
    served = new Map();
    const app = express();
    app.use((req: any, res: any, next: any) => {
        res.on('finish', () => {
            // Kun svar med indhold: WebKit spørger igen efter en fil, den har
            // (304 — ingen krop, ingen pakning).
            if (res.statusCode !== 200) return;
            const name = req.originalUrl.split('?')[0].split('/').pop();
            served.set(name, String(res.getHeader('Content-Encoding') || ''));
        });
        next();
    });
    app.use(compression());
    // Samme rækkefølge som grup.dk i app.js: .br-routen, så de rå filer.
    app.use('/assets', require(resolve(ROOT, 'routes', 'grupper-assets.js'))());
    app.use(express.static(resolve(ROOT, 'public', 'grupper')));
    // Skrifttyperne kommer fra dida.dk's fælles public/.
    app.use(express.static(resolve(ROOT, 'public')));
    app.use((req: any, res: any) => res.status(404).type('text/plain').send('Not found'));
    server = await new Promise((done, fail) => {
        const listening = app.listen(0, '127.0.0.1', () => done(listening));
        listening.on('error', fail);
    });
    origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterEach(async () => {
    if (server) await new Promise(done => server.close(done));
});

test('det byggede program danner grupper på flere kerner med de pakkede trådfiler', async ({ page, browserName }) => {
    test.setTimeout(120000);
    const failed: string[] = [];
    page.on('requestfailed', r => failed.push(r.url()));

    await skipGuides(page);
    await page.goto(origin + '/');
    await page.waitForFunction(() => (window as any).appDebug?.pyBridge?.isReady === true, null, { timeout: 30000 });

    // En klasse, som createClass() i helpers.ts (den går til baseURL).
    await page.getByRole('button', { name: 'Indsæt klasseliste fra Excel / Sheets' }).click();
    await page.getByRole('button', { name: 'Indsæt tekst / Excel' }).click();
    await page.getByPlaceholder('F.eks. 1.g Dansk').fill('Bygget');
    await page.locator('textarea:visible').first().fill(DEFAULT_CSV);
    await page.getByRole('button', { name: /Opret klasse/i }).click();
    await expect(page.locator('th').filter({ hasText: 'Navn' })).toBeVisible({ timeout: 30000 });

    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();
    await page.evaluate(() => { (window as any).appDebug.state.currentClass.rules = [{ type: 'distribute', column: 'Køn' }]; });
    const dialog = page.locator('dialog.recipe-dialog[open]');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await dialog.locator('.recipe__go').click();
    await expect(page.locator('.group-card')).toHaveCount(3, { timeout: 90000 });

    const stats = await page.evaluate(() => (window as any).appDebug.nextStats);
    expect(stats.status).toBe('ok');
    // Faldt en forsøgs-tråd fra, ville der stå 1 her (og intet andet sted).
    // Med to kerner bruger motoren kun én (den ene er sidens) — intet at måle.
    test.skip(await page.evaluate(() => navigator.hardwareConcurrency) <= 2, 'maskinen har for få kerner');
    expect(stats.cores).toBeGreaterThan(1);

    const engineWorker = [...served.keys()].find(name => /^engine-worker-.*\.js$/.test(name));
    const trialWorker = [...served.keys()].find(name => /^worker-.*\.js$/.test(name));
    expect(engineWorker, 'engine-worker blev ikke hentet').toBeTruthy();
    expect(trialWorker, 'forsøgs-trådens fil blev ikke hentet').toBeTruthy();
    const expected = browserName === 'webkit' ? 'gzip' : 'br';
    expect(served.get(engineWorker!)).toBe(expected);
    expect(served.get(trialWorker!)).toBe(expected);
    expect(failed).toEqual([]);
});
