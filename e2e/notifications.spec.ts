import { test, expect } from '@playwright/test';

test('Beskeder — direkte kald af funktionerne', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#vue-modals')).toBeAttached();

    // 1. Infobesked
    await page.evaluate(() => window.notifyInfo('Test Info Message'));
    const infoToast = page.locator('.toast.info');
    await expect(infoToast).toBeVisible();
    await expect(infoToast).toContainText('Test Info Message');

    // Luk den (ekstra tid til at forsvinde, især i Firefox)
    await infoToast.click({ force: true });
    await expect(infoToast).toBeHidden({ timeout: 10000 });

    // 2. Succesbesked
    await page.evaluate(() => window.notifySuccess('Test Success Message'));
    const successToast = page.locator('.toast.success');
    await expect(successToast).toBeVisible();
    await expect(successToast).toContainText('Test Success Message');

    // Luk den
    await successToast.click({ force: true });
    await expect(successToast).toBeHidden({ timeout: 10000 });

    // 3. Fejlbesked
    await page.evaluate(() => window.notifyError('Test Error Message'));
    const errorToast = page.locator('.toast.error');
    await expect(errorToast).toBeVisible();
    await expect(errorToast).toContainText('Test Error Message');
});

/**
 * Den nyeste besked må aldrig blive spist af sin egen ankomst.
 *
 * Fejl er klæbende — de bliver stående til krydset klikkes — så fem af dem på
 * skærmen er ikke et sært tilfælde. Før valgte loftet på fem synlige beskeder
 * sit offer blandt ALLE beskeder, også den der lige var lagt på: en frisk
 * "Grupperne er dannet" var den eneste success på skærmen, blev fundet som
 * "den mindst værdifulde" og fjernet igen, uden nogensinde at være tegnet.
 */
test('Beskeder — en ny besked vises, selv bag fem fejl, der bliver stående', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#vue-modals')).toBeAttached();

    await page.evaluate(() => {
        for (let i = 1; i <= 5; i++) window.notifyError('Fejl nummer ' + i);
    });
    await expect(page.locator('.toast.error')).toHaveCount(5);

    await page.evaluate(() => window.notifySuccess('Grupperne er dannet'));

    const success = page.locator('.toast.success');
    await expect(success).toBeVisible();
    await expect(success).toContainText('Grupperne er dannet');
    // Den ældste fejl gav plads — ikke den nye besked.
    await expect(page.locator('.toast')).toHaveCount(5);
    await expect(page.locator('.toast.error').filter({ hasText: 'Fejl nummer 1' })).toHaveCount(0);
});

/**
 * Beskedstakken skal blive inde på skærmen.
 *
 * Fem lange beskeder fyldte 782 px på en 1280×720-skærm. Den nederste var en
 * klæbende fejl, og dens kryds lå under skærmkanten — beskeden kunne altså
 * aldrig komme væk igen.
 */
test('Beskeder — en høj stak bliver på skærmen, og den sidste luk-knap kan nås', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expect(page.locator('#vue-modals')).toBeAttached();

    await page.evaluate(() => {
        const long = 'Bemærkninger til grupperingen:\n\nModstridende regler:\n'
            + 'Reglen "Ensartede: Niveau" og reglen "Blandede: Niveau" trækker i hver '
            + 'sin retning på den samme kolonne.\n\n3 elever har en værdi i "Niveau", '
            + 'der ikke står i rangeringen (fx "Meget høj", "Ukendt"). De er placeret '
            + 'frit efter de øvrige regler, som var feltet tomt.';
        for (let i = 1; i <= 5; i++) window.notifyError(long + ' (' + i + ')');
    });
    await expect(page.locator('.toast')).toHaveCount(5);

    const inside = await page.evaluate(() => {
        const c = document.querySelector('.notification-container') as HTMLElement;
        return c.offsetTop + c.offsetHeight <= window.innerHeight;
    });
    expect(inside).toBe(true);

    // Rul til bunden — som hjulet ville — og klik det nederste kryds væk.
    await page.evaluate(() => {
        const c = document.querySelector('.notification-container') as HTMLElement;
        c.scrollTop = c.scrollHeight;
    });
    await page.locator('.toast').last().locator('.toast-close').click();
    await expect(page.locator('.toast')).toHaveCount(4);
});

/**
 * Stakkens ramme tager kun klik, når den kan rulle.
 *
 * Kassen om beskederne har 10 px luft hele vejen rundt (til skyggen) og 8 px
 * mellem beskederne. Med `pointer-events: auto` på kassen tog den luft klik:
 * "Klasse oprettet!" står de første sekunder nederst til højre i elevlisten,
 * og et klik lige ved siden af beskeden ramte kassen i stedet for det, der
 * stod bag den (målt 10/11 2026, 71. gennemsyn). Kassen skal kun tage imod
 * musen, når den har noget at rulle — så skal hjulet og rullebjælken virke.
 */
test('Beskeder — rammen om én besked lader klik gå igennem; en høj stak kan stadig rulles', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expect(page.locator('#vue-modals')).toBeAttached();

    // Det, der står i luften til venstre for beskeden, midt i dens højde.
    const gapHit = () => page.evaluate(() => {
        const c = document.querySelector('.notification-container') as HTMLElement;
        const t = c.querySelector('.toast')!.getBoundingClientRect();
        const el = document.elementFromPoint(t.left - 5, t.top + t.height / 2);
        return !!el && c.contains(el);
    });

    await page.evaluate(() => (window as any).notifyError('Én besked'));
    await expect(page.locator('.toast')).toHaveCount(1);
    await expect.poll(gapHit).toBe(false);
    // Beskeden selv og dens kryds kan stadig rammes
    await expect.poll(() => page.locator('.toast-close').evaluate((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!top && el.contains(top);
    })).toBe(true);

    // En stak, der ikke kan være der: nu tager kassen musen, og hjulet ruller
    await page.evaluate(() => {
        const long = 'Bemærkninger til grupperingen: reglen "Ensartede: Niveau" og reglen '
            + '"Blandede: Niveau" trækker i hver sin retning. '.repeat(4);
        // Fem lange: højst fem står ad gangen (MAX_VISIBLE), den korte ryger
        for (let i = 1; i <= 5; i++) (window as any).notifyError(`${long} (${i})`);
    });
    await expect(page.locator('.toast').filter({ hasText: 'Én besked' })).toHaveCount(0);
    await expect(page.locator('.toast')).toHaveCount(5);
    // Stakken skal rulle, når beskederne har lagt sig — ellers beviser resten intet
    await expect.poll(() => page.evaluate(() => {
        const c = document.querySelector('.notification-container') as HTMLElement;
        return c.scrollHeight > c.clientHeight;
    })).toBe(true);
    await expect.poll(gapHit).toBe(true);
    const box = (await page.locator('.notification-container').boundingBox())!;
    await page.mouse.move(box.x + 4, box.y + box.height / 2);   // i rammen, ikke på en besked
    // toPass: et hjul, mens beskederne stadig glider ind (0,28 sek.), kan gå tabt
    await expect(async () => {
        await page.mouse.wheel(0, 300);
        expect(await page.evaluate(() =>
            (document.querySelector('.notification-container') as HTMLElement).scrollTop)).toBeGreaterThan(0);
    }).toPass({ timeout: 5000 });

    // Lukkes de fleste, kan stakken ikke rulle mere — og rammen giver slip igen
    // (én ad gangen: en lukket besked står i DOM'en, mens den glider ud)
    for (let n = 5; n > 1; n--) {
        await page.locator('.toast').first().locator('.toast-close').click();
        await expect(page.locator('.toast')).toHaveCount(n - 1);
    }
    await expect.poll(gapHit).toBe(false);

    // Den tomme kasse (20×20 px luft) tager heller ikke klik
    await page.locator('.toast-close').click();
    await expect(page.locator('.toast')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => {
        const c = document.querySelector('.notification-container') as HTMLElement;
        const r = c.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!el && c.contains(el);
    })).toBe(false);
});
