import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { skipGuides } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// En del af programmet (en side, Excel-delen) kan ikke hentes, og der er IKKE
// kommet en ny udgave — typisk forbindelsen. Beskeden skal bede om en
// genindlæsning: Safari husker en fejlet hentning og spørger aldrig serveren
// igen i samme fane (målt 4/11 2026), så "prøv igen" virkede ikke dér.
//
// Den BYGGEDE udgave (public/grupper) serveres på /bygget/: kun dér melder
// Vite en manglende del med hændelsen vite:preloadError, som App.vue
// genkender. I udvikling hentes delene som løse filer, og den vej findes ikke.
// Byg derfor (npm run build), før testen køres efter en ændring i src/.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BUILD = resolve(import.meta.dirname, '..', '..', 'public', 'grupper');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

/**
 * Server buildet på /bygget/ — men lad delene, der matcher `missing`, fejle.
 *   deployed: false → forbindelsen svigter (hentningen afbrydes)
 *   deployed: true  → en ny udgave er lagt op: delen giver 404, og
 *                     index.html peger på en ny hovedfil, når fanen spørger
 */
async function serveBuild(page, missing: RegExp, { deployed = false } = {}) {
    let pageLoaded = false;
    await page.route(/\/bygget\//, (route) => {
        const path = new URL(route.request().url()).pathname.replace(/^\/bygget\/?/, '') || 'index.html';
        if (missing.test(path)) return deployed ? route.fulfill({ status: 404, body: 'ukendt' }) : route.abort('failed');
        const file = join(BUILD, path);
        if (!existsSync(file)) return route.fulfill({ status: 404, body: 'ukendt' });
        let body: Buffer | string = readFileSync(file);
        if (path === 'index.html') {
            if (deployed && pageLoaded) body = body.toString().replace(/index-[\w-]+\.js/, 'index-NYUDGAVE.js');
            pageLoaded = true;
        }
        route.fulfill({ status: 200, body, headers: { 'content-type': TYPES[extname(file)] || 'application/octet-stream' } });
    });
}

async function gotoBuild(page) {
    await skipGuides(page);
    await page.goto('/bygget/');
    await page.waitForFunction(() => (window as any).appDebug?.pyBridge?.isReady === true, null, { timeout: 30000 });
}

test('en side, der ikke kan hentes: beskeden beder om en genindlæsning', async ({ page }) => {
    await serveBuild(page, /^assets\/HelpView-.*\.js$/);
    await gotoBuild(page);
    await page.getByRole('button', { name: 'Om programmet' }).click();
    const banner = page.locator('.error-banner');
    await expect(banner).toContainText('En del af programmet kunne ikke hentes');
    await expect(banner).toContainText('genindlæs siden');
    await expect(banner).not.toContainText('prøv igen');
});

test('Excel-delen, der ikke kan hentes: skabelonen beder om en genindlæsning', async ({ page }) => {
    await serveBuild(page, /^assets\/xlsx-.*\.js$/);
    await gotoBuild(page);
    await page.getByRole('button', { name: 'Import & backup' }).click();
    await page.getByRole('button', { name: 'Importér', exact: true }).click();
    await page.getByRole('button', { name: 'Upload fil eller gendan backup' }).click();
    await page.getByRole('link', { name: 'Download Excel-skabelon' }).click();
    const toast = page.locator('.toast').filter({ hasText: 'Excel-delen af programmet kunne ikke hentes' });
    await expect(toast).toContainText('genindlæs siden');
    await expect(toast).not.toContainText('prøv igen');
});

// ── En rigtig deploy: delen er væk (404), og der ligger en ny udgave ──
// Lytteren i newBuild.js beder om en genindlæsning. Kaldstedet må ikke sige
// sit eget oveni — før kom to beskeder om det samme.

const NEW_BUILD = 'grup.dk er blevet opdateret, mens siden stod åben';

test('efter en deploy: en side, der er væk, giver ÉN besked om den nye udgave', async ({ page }) => {
    await serveBuild(page, /^assets\/HelpView-.*\.js$/, { deployed: true });
    await gotoBuild(page);
    await page.getByRole('button', { name: 'Om programmet' }).click();
    await expect(page.locator('.toast').filter({ hasText: NEW_BUILD })).toHaveCount(1);
    await page.waitForTimeout(500);
    await expect(page.locator('.error-banner')).toHaveCount(0);
    await expect(page.locator('.toast')).toHaveCount(1);
});

test('efter en deploy: Excel-skabelonen giver ÉN besked om den nye udgave', async ({ page }) => {
    await serveBuild(page, /^assets\/xlsx-.*\.js$/, { deployed: true });
    await gotoBuild(page);
    await page.getByRole('button', { name: 'Import & backup' }).click();
    await page.getByRole('button', { name: 'Importér', exact: true }).click();
    await page.getByRole('button', { name: 'Upload fil eller gendan backup' }).click();
    await page.getByRole('link', { name: 'Download Excel-skabelon' }).click();
    await expect(page.locator('.toast').filter({ hasText: NEW_BUILD })).toHaveCount(1);
    await page.waitForTimeout(500);
    await expect(page.locator('.toast')).toHaveCount(1);
});
