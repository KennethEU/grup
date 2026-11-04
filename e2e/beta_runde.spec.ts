import { test, expect, Page } from '@playwright/test';
import { createClass, skipGuides, closeRecipe, goToGroups } from './helpers';

// Rettelser fra gennemgangen 26/10: matrix-runden, beskederne og de små
// rettelser (Til stede, Annuller, Kopiér-fokus, indsæt-fanen).

// Guiderne dækker ellers siden første gang.
test.beforeEach(async ({ page }) => {
    await skipGuides(page);
});

// Den nye skærm ligger nu på forsiden.
async function openGroups(page: Page) {
    await page.goto('/');
    await page.waitForFunction(
        () => (window as any).appDebug?.pyBridge?.isReady === true,
        null,
        { timeout: 120000 },
    );
    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();
}

test('Matrix-runde danner intet af sig selv — vinduet åbner, og kun knappen danner', async ({ page }) => {
    test.setTimeout(120000);
    await createClass(page);
    await openGroups(page);

    // Stamgrupper først (vinduet står åbent uden grupper).
    await page.getByRole('button', { name: /Dan grupper/ }).last().click();
    await expect(page.locator('.group-card').first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator('dialog[open]')).toHaveCount(0);

    // Første klik: ingen matrix endnu → vinduet åbner, og der er INGEN grupper bag det.
    await page.getByRole('button', { name: /Matrix-runde/ }).click();
    await expect(page.locator('dialog.recipe-dialog[open]')).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.locator('.group-card')).toHaveCount(0);

    // Knappen i vinduet danner dem, og vinduet lukker.
    await page.locator('dialog.recipe-dialog[open]').getByRole('button', { name: /^Dan matrixgrupper/ }).click();
    await expect(page.locator('.group-card').first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator('dialog[open]')).toHaveCount(0);

    // Kopiér-vinduet lander på hovedknappen, ikke på krydset.
    await page.getByRole('button', { name: /Kopiér/ }).first().click();
    await expect(page.getByRole('button', { name: 'Kopiér nu' })).toBeFocused();
    await page.keyboard.press('Escape');

    // Tilbage og frem igen: matrixen står der, og vinduet åbner ikke.
    await page.getByRole('button', { name: /Stamgrupperne/ }).click();
    await page.getByRole('button', { name: /Matrix-runde/ }).click();
    await expect(page.locator('.group-card').first()).toBeVisible();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
});

test('beskeder ryddes ved fanebskifte (undtagen fejl) og står nederst til højre', async ({ page }) => {
    test.setTimeout(120000);
    await createClass(page);
    await openGroups(page);

    await page.evaluate(() => {
        (window as any).notifyInfo('Et gammelt hint');
        (window as any).notifyError('En fejl der bliver');
    });
    await expect(page.locator('.toast')).toHaveCount(2);

    // Placering: bunden af stakken ligger lige over bundlinjen, ikke foroven.
    const box = await page.locator('.notification-container').boundingBox();
    expect(box!.y + box!.height).toBeGreaterThan(900 / 2);

    // Uden grupper står opskriftens vindue åbent og dækker fanerne.
    await expect(page.locator('dialog.recipe-dialog[open]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();
    await expect(page.locator('.toast.info')).toHaveCount(0);
    await expect(page.locator('.toast.error')).toHaveCount(1);
});

test('Elevlisten: fremmødet står foran navnet, og overskriften tæller de mødte', async ({ page }) => {
    test.setTimeout(120000);
    await createClass(page);
    // Alle er mødt i en ny klasse; antallet står i knappens hjælpetekst
    await expect(page.locator('th.th-attendance input')).toHaveAttribute('title', /^Alle \d+ er mødt\./);
    await expect(page.getByRole('checkbox', { name: 'Alle til stede' })).toBeVisible();
});

test('Forsiden: "Indsæt klasseliste" lander på fanen Indsæt tekst / Excel', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#vue-modals')).toBeAttached();
    await page.getByRole('button', { name: 'Indsæt klasseliste fra Excel / Sheets' }).click();
    await expect(page.getByRole('button', { name: 'Indsæt tekst / Excel' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByPlaceholder('F.eks. 1.g Dansk')).toBeVisible();
});

test('Gendan grupper har en Annuller-knap', async ({ page }) => {
    test.setTimeout(120000);
    await createClass(page);
    await goToGroups(page);
    // Uden grupper står opskriftens vindue åbent oven på "gendan"-knappen
    await closeRecipe(page);
    await page.getByRole('button', { name: /gendan grupper du har brugt før/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Gendan grupper' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Annuller' }).click();
    await expect(dialog).toHaveCount(0);
});

// Én Gem-knap med en menu. Begge punkter åbner det rigtige vindue.
test('Gem-menuen — "Gem i Historik" og "Gem som kolonne" åbner hver deres vindue', async ({ page }) => {
    test.setTimeout(240000);
    await createClass(page, 'GemMenu', 'Navn\nA\nB\nC\nD\nE\nF\nG\nH');
    await openGroups(page);
    await page.getByRole('button', { name: /Dan grupper/ }).last().click();
    await expect(page.locator('.group-card').first()).toBeVisible({ timeout: 90000 });
    const save = page.locator('.floating-action-bar .save-anchor button[aria-haspopup="menu"]');
    await expect(save).toBeVisible({ timeout: 60000 });
    // Den gamle "Kolonne"-knap er væk
    await expect(page.locator('.floating-action-bar').getByRole('button', { name: 'Kolonne' })).toHaveCount(0);

    // Med tastaturet: Enter åbner, fokus på første punkt, pil ned til næste, Escape tilbage
    await save.focus();
    await page.keyboard.press('Enter');
    const items = page.getByRole('menuitem');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(items).toHaveCount(0);
    await expect(save).toBeFocused();

    // Med musen: Historik
    await save.click();
    await items.nth(0).click();
    await expect(page.getByRole('dialog')).toContainText(/Gem session/);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Kolonne
    await save.click();
    await items.nth(1).click();
    await expect(page.getByRole('dialog')).toContainText(/kolonne/i);
});

test('Aftaler åbnet fra opskriften — når Aftaler lukkes, er opskriften der igen', async ({ page }) => {
    test.setTimeout(120000);
    await createClass(page, 'Aftaler fra opskrift');
    await page.getByRole('checkbox', { name: 'Anna med i aftale', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Bob med i aftale', exact: true }).check();
    await page.locator('#create-agreement-btn').click();
    await page.locator('.agreement-menu').getByRole('menuitem', { name: /Skal sammen/ }).click();
    const aftaler = page.getByRole('dialog', { name: 'Aftaler', exact: true });
    await expect(aftaler).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(aftaler).toHaveCount(0);

    await openGroups(page);
    const opskrift = page.locator('dialog.recipe-dialog[open]');
    await expect(opskrift).toBeVisible();
    await opskrift.getByRole('button', { name: /aftale om bestemte elever/ }).click();
    await expect(aftaler).toBeVisible();
    await expect(opskrift).toHaveCount(0);

    // Escape lukker Aftaler, og opskriften åbner igen.
    await page.keyboard.press('Escape');
    await expect(aftaler).toHaveCount(0);
    await expect(opskrift).toBeVisible();

    // Det samme med Luk-knappen.
    await opskrift.getByRole('button', { name: /aftale om bestemte elever/ }).click();
    await aftaler.getByRole('button', { name: 'Luk' }).click();
    await expect(opskrift).toBeVisible();
});
