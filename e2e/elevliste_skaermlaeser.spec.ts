// Elevlisten med skærmlæser. Målt 9/11 2026 i Chromiums tilgængelighedstræ:
// tabellen hed ingenting, slet-kolonnen havde en tom overskrift, sorteringens
// pil blev læst op oven i aria-sort ("NAVN sort pil op"), en skjult celle
// blev læst som fem prikker, og overskrifternes taster stod kun i det
// visuelle tip, som skærmlæseren aldrig hører.
import { test, expect } from '@playwright/test';
import { createClass } from './helpers';

test('Tabellen og slet-kolonnen har et navn', async ({ page }) => {
    await createClass(page, 'Skærmlæser navne');
    await expect(page.getByRole('table', { name: 'Elevliste' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Slet', exact: true })).toHaveCount(1);
});

test('Sorteringens pil er ikke en del af overskriftens navn', async ({ page }) => {
    await createClass(page, 'Skærmlæser sortering');
    const header = page.locator('th.col-header').first();
    await header.click();
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    // Pilen står der stadig for øjet …
    await expect(header).toContainText('▲');
    // … men navnet er kun kolonnens.
    await expect(page.getByRole('columnheader', { name: 'NAVN', exact: true })).toHaveCount(1);
});

test('Overskriften siger sine taster, og en skjult kolonne siger det', async ({ page }) => {
    await createClass(page, 'Skærmlæser skjult');
    const header = page.locator('th.col-header').nth(1);
    await expect(header).toHaveAttribute('aria-description', /F2 omdøber/);
    await expect(header).not.toHaveAttribute('aria-description', /skjult\./);

    // Højreklik skjuler kolonnens indhold (samme som menutasten).
    await header.click({ button: 'right' });
    await expect(header).toHaveAttribute('aria-description', /^Indholdet er skjult\./);

    const masked = page.locator('tbody tr').first().locator('td.cell-data').nth(1);
    await expect(masked).toHaveClass(/cell-hidden-masked/);
    await expect(masked).toHaveAccessibleName('Skjult');
});

test('Slet-vinduet nævner samme navn som knappen, også når Vis ikke er første kolonne', async ({ page }) => {
    await createClass(page, 'Skærmlæser slet');
    await page.locator('#id-column-select').selectOption('Karakter');
    const row = page.locator('tbody tr').first();
    const label = await row.locator('.delete-row-btn').getAttribute('aria-label');
    const shown = (label || '').replace(/^Slet /, '');
    await row.locator('.delete-row-btn').click();
    // Før stod den første kolonne (navnet) i vinduet, mens knappen sagde karakteren.
    await expect(page.locator('.message')).toHaveText(`Er du sikker på, at du vil slette '${shown}'?`);
});
