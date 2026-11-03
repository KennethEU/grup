import { test, expect, Page } from '@playwright/test';
import { createClass } from './helpers';

// "Vis for klassen" (den nye udgave) ligger OVEN PÅ siden, men ligner en ny
// side. Læreren trykker derfor browserens Tilbage for at komme væk fra den —
// og blev før sendt helt ud af Grupper. Nu lukker Tilbage arket, og man står
// på Grupper.

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        try {
            localStorage.setItem('grupper-opskrift-guide-set', '1');
            localStorage.setItem('grupper-elevliste-guide-set', '1');
        } catch { /* uden lager vises guiden */ }
    });
});

// Klasse → Grupper → dan grupper (vinduet lukker af sig selv) → åbn arket
async function groupsAndShow(page: Page, name: string) {
    test.setTimeout(120000);
    await createClass(page, name);
    await page.waitForFunction(() => (window as any).appDebug?.pyBridge?.isReady === true, null, { timeout: 120000 });
    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();
    await page.getByRole('button', { name: /Dan grupper/ }).last().click();
    await expect(page.locator('.group-card').first()).toBeVisible({ timeout: 60000 });
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await page.getByRole('button', { name: /Vis for klassen/ }).click();
    await expect(page.locator('.show')).toBeVisible();
}

test('Tilbage lukker Vis for klassen — og man står stadig på Grupper', async ({ page }) => {
    await groupsAndShow(page, 'Tilbage Vis');
    await page.goBack();
    await expect(page.locator('.show')).toHaveCount(0);
    await expect(page.locator('.nav-tab[aria-current="page"]')).toContainText('Grupper');
});

test('Lukket med "Luk" — skridtet i historikken fjernes igen', async ({ page }) => {
    await groupsAndShow(page, 'Luk Vis');
    await page.locator('.show__close').click();
    await expect(page.locator('.show')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => !!history.state?.classShow)).toBe(false);
    await expect(page.locator('.nav-tab[aria-current="page"]')).toContainText('Grupper');
});

// Efter en genindlæsning huskes visningen først, når klassen er hentet. Luk
// sendte før læreren til "Ingen klasse valgt", fordi historikken stadig sagde Oversigt.
test('Lukket efter en genindlæsning — man står stadig på Grupper', async ({ page }) => {
    await groupsAndShow(page, 'Genindlaes Vis');
    await page.locator('.show__close').click();
    await page.reload();
    await expect(page.locator('.group-card').first()).toBeVisible({ timeout: 60000 });
    await page.getByRole('button', { name: /Vis for klassen/ }).click();
    await page.locator('.show__close').click();
    await expect(page.locator('.show')).toHaveCount(0);
    await expect(page.locator('.nav-tab[aria-current="page"]')).toContainText('Grupper');
    await expect(page.locator('.group-card').first()).toBeVisible();
    await expect(page.locator('#view-dashboard')).not.toBeVisible();
});

// Tilbage mellem fanerne må ikke tage skade af, at historikken holdes ajour.
test('Tilbage fra Grupper går stadig til Elevlisten', async ({ page }) => {
    await groupsAndShow(page, 'Tilbage faner');
    await page.locator('.show__close').click();
    await expect(page.locator('.show')).toHaveCount(0);
    await page.goBack();
    await expect(page.locator('.nav-tab[aria-current="page"]')).toContainText('Elevliste');
    await page.goForward();
    await expect(page.locator('.nav-tab[aria-current="page"]')).toContainText('Grupper');
});

// På en lav skærm (bærbar i et browservindue) skulle man før rulle for at se
// den sidste gruppe: alle størrelser fulgte skærmens BREDDE.
test('Arket kan ses i ét billede på en lav skærm', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 440 });
    await groupsAndShow(page, 'Lav skaerm');
    const { scroll, client } = await page.locator('.show').evaluate(el => ({ scroll: el.scrollHeight, client: el.clientHeight }));
    expect(scroll).toBeLessThanOrEqual(client + 1);
});

// Arket er et vindue som de andre: siden bagved må ikke kunne nås med
// tastaturet. Før kunne Ctrl+Enter danne nye grupper BAG arket (og klassen så
// dem skifte), og Tab gik videre ned i de skjulte knapper.
// Arket åbnes med tastaturet: WebKit giver ikke en knap fokus ved klik (som
// Safari), og så er der intet at give fokus tilbage til.
test('Siden bagved kan ikke nås med tastaturet, og Escape giver fokus tilbage', async ({ page }) => {
    await groupsAndShow(page, 'Tastatur Vis');
    await page.locator('.show__close').click();
    await expect(page.locator('.show')).toHaveCount(0);
    const showBtn = page.getByRole('button', { name: /Vis for klassen/ });
    await showBtn.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.show')).toBeVisible();

    // Gruppekortene bagved er sandheden: dannes der nye grupper, skifter de.
    // (Firefox lader Cmd+Enter trykke på den fokuserede "Luk", så arket kan
    // lukke — det er i orden, så længe grupperne er de samme.)
    const cards = () => page.locator('.group-card').allInnerTexts();
    const before = await cards();
    await page.keyboard.press('ControlOrMeta+Enter');
    await page.waitForTimeout(1500);
    expect(await cards()).toEqual(before);

    if (await page.locator('.show').count() === 0) {
        await showBtn.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('.show')).toBeVisible();
    }
    for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => !!document.activeElement?.closest('.show'))).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(page.locator('.show')).toHaveCount(0);
    await expect(showBtn).toBeFocused();
});
