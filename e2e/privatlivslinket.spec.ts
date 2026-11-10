import { test, expect } from '@playwright/test';
import { createClass } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Privatlivspolitikken bag skjoldet, og intet felt oven på elevlisten.
//
// Før 10/11 2026 lagde /privacy-link.js (fælles for hele dida.dk) et fast felt
// med linket "Privatlivspolitik" i vinduets nederste højre hjørne. Det lå
// oven på elevlistens nederste række, lige dér hvor slet-krydset står: et
// klik på krydset ramte linket, og fanen forlod Grupper til privatlivssiden.
// Nu henter Grupper ikke længere scriptet (index.html). Linket står øverst på
// siden bag skjoldet "Privatliv & GDPR" i topbjælken (GdprView.vue), og
// elevlisten går igen til 8 px over kanten.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const rows = Array.from({ length: 40 }, (_, i) => `Elev ${i + 1}\tK\t${(i % 12) + 1}`).join('\n');

test('skjoldet "Privatliv & GDPR" viser linket til privatlivspolitikken øverst', async ({ page }) => {
    await page.goto('/');
    // Intet løst felt nederst til højre: det eneste link til politikken er det
    // på siden bag skjoldet, og den side er ikke åben endnu
    await expect(page.getByRole('link', { name: /privatlivspolitik/i })).toHaveCount(0);

    await page.getByRole('button', { name: 'Privatliv & GDPR' }).click();
    const view = page.locator('#view-gdpr');
    await expect(view).toBeVisible({ timeout: 10000 });
    const link = view.getByRole('link', { name: 'Læs privatlivspolitikken for grup.dk' });
    await expect(link).toBeVisible();
    // Det står lige under titlen og undertitlen: før de to farvede bokse
    const before = await page.evaluate(() => {
        const a = [...document.querySelectorAll('#view-gdpr a')].find((x) => /Læs privatlivspolitikken/.test(x.textContent || ''))!;
        const box = document.querySelector('#view-gdpr .feature-grid')!;
        return !!(a.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(before).toBe(true);
    // Relativt (virker både på grup.dk og dida.dk/grupper) og i en ny fane,
    // så læreren ikke forlader Grupper
    await expect(link).toHaveAttribute('href', 'privatliv.html');
    await expect(link).toHaveAttribute('target', '_blank');
});

test('slet-krydset i tabellens nederste række rammer krydset, ikke noget oven på det', async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await createClass(page, 'Privatlivslinket', `Navn\tKøn\tKarakter\n${rows}`);
    // "Klasse oprettet!" står nederst til højre i nogle sekunder og dækker
    // med vilje det, der ligger under den (NotificationManager.vue) — vent
    await expect(page.locator('.toast')).toHaveCount(0, { timeout: 15000 });
    const url = page.url();

    for (const [width, height] of [[1280, 720], [760, 600]]) {
        await page.setViewportSize({ width, height });
        // Værktøjslinjen måles om efter en ændring af vinduet (StudentsTab.vue),
        // og tabellens højde følger efter — vent, til målet passer, før
        // punktet regnes ud
        await expect.poll(() => page.evaluate(() => {
            const bar = document.querySelector('.students-header-sticky')!.getBoundingClientRect().height;
            const set = getComputedStyle(document.querySelector('.table-container')!)
                .getPropertyValue('--students-toolbar-h').trim();
            return set === `${Math.ceil(bar)}px`;
        }), { message: `${width}×${height}` }).toBe(true);
        await page.waitForTimeout(100);
        // Rul tabellen i skridt på 9 px (rækkerne er ca. 45 px), så det
        // nederste kryds står forskellige steder i forhold til vinduets bund
        for (let y = 0; y <= 45; y += 9) {
            const point = await page.evaluate((y) => {
                const box = document.querySelector('.table-container') as HTMLElement;
                box.scrollTop = y;
                const area = box.getBoundingClientRect();
                const visibleBottom = area.top + box.clientHeight; // uden vandret rullebjælke
                // Det nederste kryds, der står helt inden for tabellens synlige del
                const crosses = [...box.querySelectorAll('.delete-row-btn')]
                    .map((b) => b.getBoundingClientRect())
                    .filter((r) => r.top >= area.top && r.bottom <= visibleBottom);
                const r = crosses[crosses.length - 1];
                return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            }, y);
            await page.mouse.click(point.x, point.y);
            await expect(page.locator('.message'), `${width}×${height}, rullet ${y} px`)
                .toContainText('Er du sikker på, at du vil slette');
            expect(page.url()).toBe(url);
            await page.keyboard.press('Escape');
            await expect(page.locator('.message')).toHaveCount(0);
        }
    }
});
