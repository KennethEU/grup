import { test, expect } from '@playwright/test';
import { createClassAndGoToGroups, createClass, generateGroups, openRecipe, addRecipeRule, pickInToken, goToMatrix } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. APPEN INDLÆSES UDEN FEJL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Appen indlæses uden fejl', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await expect(page.locator('#vue-modals')).toBeAttached({ timeout: 15000 });

    // Ingen ufangede fejl under indlæsningen
    expect(errors).toHaveLength(0);
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. FORKLARINGER I OPSKRIFTEN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Emner: ordet i opskriften forklarer, hvad emner gør', async ({ page }) => {
    await createClassAndGoToGroups(page);
    const dialog = await openRecipe(page);
    await dialog.locator('.rtok__btn[aria-label^="Emner:"]').click();
    await expect(dialog.locator('.rtok__pop')).toContainText('Emnerne fordeles på grupperne, når de dannes.');
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. REGLER I OPSKRIFTEN: TILFØJ OG FJERN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Regler: tilføj og fjern en regel', async ({ page }) => {
    await createClassAndGoToGroups(page);
    const line = await addRecipeRule(page);
    await expect(line).toBeVisible();
    await line.getByRole('button', { name: 'Fjern reglen' }).click();
    await expect(page.locator('dialog.recipe-dialog[open] .recipe__line--rule')).toHaveCount(0);
});

test('Regel: kun Adskil har et værdi-ord', async ({ page }) => {
    // Værdien betyder KUN noget i "Adskil" (og undgåelsernes strenge variant).
    // Fordel, Klyng, Saml og Opdel arbejder på hele kolonnen — se
    // RULES_WITHOUT_VALUES i utils.js.
    await createClassAndGoToGroups(page);
    const line = await addRecipeRule(page, { column: 'Køn' });
    const valueToken = line.locator('.rtok__btn[aria-label^="Værdi:"]');

    // Standardreglen er Fordel: intet værdi-ord.
    await expect(valueToken).toHaveCount(0);

    // Adskil får det — og det mangler et valg.
    await pickInToken(page, line, 'Regel', 'Adskil');
    await expect(valueToken).toHaveCount(1);
    await expect(valueToken).toHaveClass(/is-missing/);

    // ... og det forsvinder igen på en regel, der ikke læser værdien.
    await pickInToken(page, line, 'Regel', 'Klyng');
    await expect(valueToken).toHaveCount(0);
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. MATRIX-RUNDEN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Matrix: "Én fra hver" er standard og viser antallet af matrixgrupper', async ({ page }) => {
    await createClassAndGoToGroups(page);
    await generateGroups(page);
    await goToMatrix(page);

    // Uden matrix åbner vinduet af sig selv
    const dialog = page.locator('dialog.recipe-dialog[open]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.recipe__note')).toContainText('matrixgrupper');

    await dialog.locator('.rtok__btn[aria-label^="Sådan blandes der:"]').click();
    await expect(dialog.locator('.rtok__pop').getByRole('button', { name: 'Én fra hver' }))
        .toHaveAttribute('aria-pressed', 'true');
});

test('Matrix: "Pr. gruppe" og "Antal" har et tal, "Én fra hver" har ikke', async ({ page }) => {
    await createClassAndGoToGroups(page);
    await generateGroups(page);
    await goToMatrix(page);

    const dialog = page.locator('dialog.recipe-dialog[open]');
    await dialog.locator('.rtok__btn[aria-label^="Sådan blandes der:"]').click();
    const pop = dialog.locator('.rtok__pop');
    await pop.getByRole('button', { name: 'Pr. gruppe' }).click();
    await expect(pop.locator('input[type="number"]')).toBeVisible();

    await pop.getByRole('button', { name: 'Én fra hver' }).click();
    await expect(pop.locator('input[type="number"]')).toHaveCount(0);
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. VINDUERNES ARIA OG ESCAPE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Escape lukker Kategori-vinduet', async ({ page }) => {
    await createClass(page, 'Escape Test');

    // Åbn Kategorisér-vinduet
    const catBtn = page.locator('#cat-btn');
    await expect(catBtn).toBeVisible({ timeout: 5000 });
    await catBtn.click();

    const catHeader = page.getByRole('heading', { name: 'Kategorisér Data' });
    await expect(catHeader).toBeVisible();

    // Vinduets overlay skal have ARIA-attributter
    const overlay = page.locator('.modal-overlay').filter({ has: catHeader });
    await expect(overlay).toHaveAttribute('role', 'dialog');
    await expect(overlay).toHaveAttribute('aria-modal', 'true');

    // Escape lukker
    await page.keyboard.press('Escape');
    await expect(catHeader).not.toBeVisible({ timeout: 3000 });
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. GRUPPERS SEGMENTEREDE KNAPPER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('GRUPPER: "Elever pr. gruppe" og "Antal grupper" skifter', async ({ page }) => {
    await createClassAndGoToGroups(page);
    const dialog = await openRecipe(page);
    await dialog.locator('.rtok__btn[aria-label^="Gruppernes størrelse:"]').click();
    const pop = dialog.locator('.rtok__pop');
    const sizeBtn = pop.getByRole('button', { name: 'Elever pr. gruppe' });
    const countBtn = pop.getByRole('button', { name: 'Antal grupper' });

    await expect(sizeBtn).toHaveAttribute('aria-pressed', 'true');
    await countBtn.click();
    await expect(countBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(sizeBtn).toHaveAttribute('aria-pressed', 'false');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveAttribute('aria-pressed', 'true');
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. TILSTANDEN FØLGER MED MELLEM VISNINGERNE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Grupperne bliver, når man skifter fane', async ({ page }) => {
    await createClassAndGoToGroups(page);

    // Dan grupper
    await generateGroups(page);
    const groupCount = await page.locator('.group-card').count();

    // Skift til Elevliste og tilbage
    await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();
    await expect(page.locator('th').filter({ hasText: 'Navn' })).toBeVisible();

    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();
    await expect(page.locator('.group-card').first()).toBeVisible();
    expect(await page.locator('.group-card').count()).toBe(groupCount);
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. BESKEDFUNKTIONERNE PÅ WINDOW
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Beskedfunktionerne findes globalt', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#vue-modals')).toBeAttached({ timeout: 15000 });

    const fns = await page.evaluate(() => ({
        info: typeof (window as any).notifyInfo === 'function',
        success: typeof (window as any).notifySuccess === 'function',
        error: typeof (window as any).notifyError === 'function',
    }));

    expect(fns.info).toBe(true);
    expect(fns.success).toBe(true);
    expect(fns.error).toBe(true);
});
