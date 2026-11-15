import { test, expect, type Page } from '@playwright/test';

/**
 * En lang besked skal kunne læses til ende (157. gennemsyn, (180) og (æ)).
 *
 * En besked ruller efter ca. seks linjer. Målt 15/11 2026 ved 1280×720:
 * importens fulde besked har 3 af 9 linjer under kanten, og motorens stop-fejl
 * med tre problemer har det tredje helt under kanten. Rullebjælken ses ikke på
 * macOS, og i Safari kunne tastaturet ikke rulle beskeden. Og en info-besked
 * talte ned, mens læreren rullede i den.
 */

const LONG = '1 række var skjult i Excel og er kommet med: slet eleven i elevlisten, hvis den ikke skal være med. '
    + 'Kolonne C var skjult i Excel og er kommet med (fx et CPR-nummer). Slet kolonnen i elevlisten, hvis den ikke skal bruges. '
    + 'Kolonne "Klasse" havde flettede celler: værdien er givet til hver elev, cellen dækkede (rækkerne 2–7). '
    + 'Det andet ark ("Noter") er ikke importeret. Arket "Elever" er importeret, fordi du valgte det.';

async function ready(page: Page) {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expect(page.locator('#vue-modals')).toBeAttached();
    // Musen et sted langt fra beskederne (de står nederst til højre).
    await page.mouse.move(100, 100);
}

const toast = (page: Page, text: string) =>
    page.locator('.toast:not(.toast-leave-active)').filter({ hasText: text });

test('en besked, der ruller, kan få fokus; en kort kan ikke', async ({ page }) => {
    await ready(page);
    await page.evaluate((m) => { (window as any).notify(m, 'info', 0); }, LONG);
    await page.evaluate(() => { (window as any).notify('Kort besked', 'info', 0); });

    const long = toast(page, 'Kolonne C').locator('.toast-message');
    const short = toast(page, 'Kort besked').locator('.toast-message');
    await expect(long).toHaveAttribute('tabindex', '0');
    await expect(short).not.toHaveAttribute('tabindex');

    // Tastaturet kan rulle den (ellers kan Safari ikke).
    await long.focus();
    await page.keyboard.press('End');
    await expect.poll(() => long.evaluate((el: HTMLElement) =>
        el.scrollTop + el.clientHeight >= el.scrollHeight - 1)).toBe(true);
});

test('en lang besked viser en skygge nederst, så længe der er mere at læse', async ({ page }) => {
    await ready(page);
    await page.evaluate((m) => { (window as any).notify(m, 'info', 0); }, LONG);
    const msg = toast(page, 'Kolonne C').locator('.toast-message');
    await expect(msg).toHaveAttribute('tabindex', '0');
    // Skyggerne er baggrundslag: to dækflader, der ruller med teksten, over
    // to skygger, der står fast.
    const attach = await msg.evaluate((el) => getComputedStyle(el).backgroundAttachment);
    expect(attach.replace(/\s/g, '')).toBe('local,local,scroll,scroll');
});

test('en info-besked bliver stående, mens musen bevæges i den, og går igen bagefter', async ({ page }) => {
    await ready(page);
    // 2 sek. at leve i.
    await page.evaluate((m) => { (window as any).notify(m, 'info', 2000); }, LONG);
    const t = toast(page, 'Kolonne C');
    await expect(t).toBeVisible();

    const box = (await t.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width / 2 + 5, box.y + box.height / 2 + 5);
    await page.mouse.wheel(0, 40);
    // Langt over de 2 sek.
    await page.waitForTimeout(3500);
    await expect(t).toBeVisible();

    // Musen ud: mindst 3 sek. endnu, så væk.
    await page.mouse.move(100, 100);
    await page.waitForTimeout(1500);
    await expect(t).toBeVisible();
    await expect(t).toHaveCount(0, { timeout: 5000 });
});

test('en besked, der dukker op under en mus, der ligger stille, går væk af sig selv', async ({ page }) => {
    await ready(page);
    // Find beskedens plads, og læg musen dér, før den næste besked kommer.
    await page.evaluate(() => { (window as any).notify('Måling', 'info', 0); });
    const box = (await toast(page, 'Måling').boundingBox())!;
    await page.evaluate(() => { document.querySelector<HTMLElement>('.toast .toast-close')!.click(); });
    await expect(toast(page, 'Måling')).toHaveCount(0);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    await page.evaluate(() => { (window as any).notify('Under musen', 'info', 1500); });
    await expect(toast(page, 'Under musen')).toBeVisible();
    await expect(toast(page, 'Under musen')).toHaveCount(0, { timeout: 5000 });
});

test('fokus i beskeden holder den, til fokus forlader den', async ({ page }) => {
    await ready(page);
    await page.evaluate((m) => { (window as any).notify(m, 'info', 1500); }, LONG);
    const msg = toast(page, 'Kolonne C').locator('.toast-message');
    await expect(msg).toHaveAttribute('tabindex', '0');
    await msg.focus();
    await page.waitForTimeout(3000);
    await expect(toast(page, 'Kolonne C')).toBeVisible();
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    await expect(toast(page, 'Kolonne C')).toHaveCount(0, { timeout: 6000 });
});
