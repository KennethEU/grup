import { test, expect, Page } from '@playwright/test';
import { createClass } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Slet en kolonne — og den ene sletning der ikke må ske.
//
// "Slet kolonne" tilbød ALLE lærerens kolonner, også når der kun var én
// tilbage. En indsat navneliste ER en klasse med én kolonne, så det var to
// klik væk: `columns` blev tom, visningskolonnen blev '', hver række stod
// tilbage med kun sit `_rowId` — og fordi den tomme visningskolonne er falsk,
// blev beskeden om det sprunget over. Vinduet rydder samtidig fortryd-
// stakken, så der var ingen vej tilbage overhovedet.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Åbn "Slet kolonne", vælg en kolonne og tryk Slet.
 *
 * Knappen slås op på sit id, ikke på sit navn. tooltip.js flytter `title`
 * over i `aria-label` og fjerner attributten, første gang musen har været
 * forbi, så knappens accessible name SKIFTER undervejs: "Slet kolonne" (den synlige
 * tekst) før hover, "Slet en kolonne fra elevlisten" bagefter. En test der
 * sletter to gange, møder derfor ét navn i første kald og et andet i næste —
 * det ligner en knap der forsvinder, men er ren locator-støj.
 */
async function deleteColumn(page: Page, col: string) {
    await page.locator('#del-col-btn').click();
    await page.locator('#slet-kol').selectOption(col);
    // I vinduet: værktøjslinjens knap hedder nu også "Slet kolonne"
    await page.getByRole('dialog').getByRole('button', { name: 'Slet kolonne', exact: true }).click();
}

test('den sidste kolonne kan ikke slettes — klassen beholder sine navne', async ({ page }) => {
    await createClass(page, 'Kun Navne E2E', 'Navn\nAnna\nBo\nClara\nDavid');

    await deleteColumn(page, 'Navn');

    // Nej — med en begrundelse, ikke i tavshed.
    await expect(page.locator('.toast.error')).toContainText('eneste kolonne');

    // Vinduet bliver stående, så læreren kan vælge noget andet.
    await expect(page.locator('#slet-kol')).toBeVisible();
    await page.getByRole('button', { name: 'Annuller' }).click();

    // Og intet er rørt: kolonnen står der, og navnene med den.
    await expect(page.locator('th').filter({ hasText: 'Navn' })).toBeVisible();
    await expect(page.locator('td').filter({ hasText: 'Anna' }).first()).toBeVisible();
});

test('en kolonne kan stadig slettes, når der er mere end én', async ({ page }) => {
    await createClass(page, 'To Kolonner E2E', 'Navn\tKøn\nAnna\tK\nBo\tM\nClara\tK\nDavid\tM');

    await deleteColumn(page, 'Køn');

    await expect(page.locator('th').filter({ hasText: 'Køn' })).toHaveCount(0);
    await expect(page.locator('th').filter({ hasText: 'Navn' })).toBeVisible();
    await expect(page.locator('td').filter({ hasText: 'Anna' }).first()).toBeVisible();

    // Og nu ER "Navn" den sidste — så den er beskyttet.
    await deleteColumn(page, 'Navn');
    await expect(page.locator('.toast.error')).toContainText('eneste kolonne');
});
