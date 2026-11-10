import { test, expect, Page } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gotoAppReady, createClass, goToGroups, generateGroups } from './helpers';

/**
 * Tilbage-knappen og browserens hurtig-cache ("bfcache").
 *
 * Går læreren fra Grupper til en anden side i SAMME fane og trykker Tilbage,
 * viser browseren siden fra hukommelsen uden at indlæse den igen. Mens den
 * ligger dér, får den ingen storage-hændelser, og de kommer heller ikke
 * bagefter. Dannede hun grupper i en anden fane imens, fik den her fane aldrig
 * beskeden "ændret i en anden fane", og hendes næste træk skrev dem væk.
 * Rettelsen: storage.js (rememberStorageAtHide / checkStorageAfterRestore).
 *
 * HVORFOR KUN FIREFOX OG DEN BYGGEDE UDGAVE (målt 10/11 2026):
 *  - Playwrights Chromium bruger aldrig hurtig-cachen (Chromes egen forklaring
 *    via CDP: "BackForwardCacheDisabledForDelegate" — testværktøjet slår den
 *    fra, også uden `--disable-back-forward-cache`). WebKit gør det heller ikke.
 *  - Firefox gør det med de to indstillinger herunder.
 *  - Vites udviklingsserver holder en websocket åben (genindlæsning ved
 *    rettelser), og den holder siden ude af cachen. Derfor serveres
 *    `public/grupper` på /bygget/ — byg først (`npm run build`).
 *
 * Playwright mister siden, når den kommer fra cachen ("Execution context was
 * destroyed"), så fane A kan ikke spørges direkte bagefter. Siden skriver
 * selv svaret i lageret, og fane B læser det.
 */

test.use({ launchOptions: { firefoxUserPrefs: { 'browser.sessionhistory.max_total_viewers': 8, 'fission.bfcacheInParent': true } } });

// E2E_BUILD_DIR: kør testen mod en anden udgave (fx den udgivne, for at se den rød)
const BUILD = process.env.E2E_BUILD_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'grupper');
const TYPES: Record<string, string> = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
    '.json': 'application/json', '.woff2': 'font/woff2',
};

test('en kørsel i en anden fane, mens siden lå i hurtig-cachen, siges højt ved Tilbage', async ({ context, browserName }) => {
    test.skip(browserName !== 'firefox', 'kun Firefox bruger hurtig-cachen under Playwright (se øverst)');
    test.skip(!existsSync(join(BUILD, 'index.html')), 'byg først: npm run build');
    test.setTimeout(120000);

    await context.route(/\/bygget\//, (route) => {
        const path = new URL(route.request().url()).pathname.replace(/^\/bygget\/?/, '') || 'index.html';
        const file = join(BUILD, path);
        if (!existsSync(file)) return route.fulfill({ status: 404, body: 'ukendt' });
        route.fulfill({ status: 200, body: readFileSync(file), headers: { 'content-type': TYPES[extname(file)] || 'application/octet-stream' } });
    });

    const groupsIn = (page: Page) => page.evaluate(() =>
        JSON.stringify(((window as any).appDebug.state.storedStandardGroups || []).map((g: any) => g.members)));

    // Klassen oprettes på udviklingsserveren (samme adresse, samme lager),
    // så hjælperne kan bruges; selve forsøget kører i den byggede udgave.
    const setup = await context.newPage();
    await createClass(setup, '2a Tilbage');
    await setup.close();

    const tabA = await context.newPage();
    await tabA.goto('/bygget/');
    await expect(tabA.locator('.class-trigger')).toContainText('2a Tilbage', { timeout: 30000 });
    await goToGroups(tabA);
    await generateGroups(tabA);
    const shownInA = await groupsIn(tabA);
    // Sidekanalen: når siden kommer frem igen, skriver den, om den kom fra
    // cachen, og om beskeden står på skærmen.
    await tabA.evaluate(() => {
        window.addEventListener('pageshow', (e) => {
            setTimeout(() => {
                const toasts = [...document.querySelectorAll('.toast')].map(t => t.textContent || '');
                localStorage.setItem('e2e_tilbage', JSON.stringify({
                    persisted: (e as PageTransitionEvent).persisted,
                    warned: toasts.filter(t => t.includes('ændret i en anden fane')).length,
                }));
            }, 1000);
        });
    });
    await tabA.goto('/bygget/privatliv.html');

    // Fane B danner nye grupper, mens A ligger i cachen
    const tabB = await context.newPage();
    await gotoAppReady(tabB);
    await expect(tabB.locator('.class-trigger')).toContainText('2a Tilbage', { timeout: 30000 });
    await goToGroups(tabB);
    let fresh = shownInA;
    for (let i = 0; i < 8 && fresh === shownInA; i++) { await generateGroups(tabB); fresh = await groupsIn(tabB); }
    expect(fresh).not.toBe(shownInA);
    await expect.poll(async () => {
        const a = await groupsIn(tabB);
        await tabB.waitForTimeout(800);
        return a === await groupsIn(tabB) ? a : null;
    }, { timeout: 20000 }).not.toBeNull();

    await tabA.bringToFront();
    tabA.evaluate(() => history.back()).catch(() => { /* siden skifter under kaldet */ });

    await expect.poll(() => tabB.evaluate(() => localStorage.getItem('e2e_tilbage')), { timeout: 15000 }).not.toBeNull();
    const res = JSON.parse(await tabB.evaluate(() => localStorage.getItem('e2e_tilbage')) as string);
    // Kom siden IKKE fra cachen, beviser testen intet — sig det højt
    expect(res.persisted, 'siden skal komme fra hurtig-cachen, ellers måler testen ikke noget').toBe(true);
    expect(res.warned).toBe(1);
});
