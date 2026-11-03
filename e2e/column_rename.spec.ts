import { test, expect, Page } from '@playwright/test';
import { createClass, goToGroups, generateGroups } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Omdøb en kolonne — og alt det, der peger på navnet.
//
// Et kolonnenavn står ikke ét sted: i kolonnelisten, i hver elevrække, i
// reglerne, i rangeringen og i lærerens valgte VISNINGSkolonne. Blev den
// sidste stående på det gamle navn, fandt opslaget ingen værdi, og hvert
// eneste medlem på hvert eneste gruppekort stod som "(uden navn)".
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CSV =
    'Navn\tKøn\tNiveau\n' +
    'Anna\tK\tLav\nBo\tM\tMiddel\nCarl\tM\tHøj\nDorte\tK\tLav\n' +
    'Emil\tM\tMiddel\nFrida\tK\tHøj\nGustav\tM\tLav\nHanne\tK\tMiddel';

/** Dobbeltklik på en kolonneoverskrift og skriv et nyt navn. */
async function renameColumn(page: Page, from: string, to: string) {
    // Ikke ankret regex: første klik i dobbeltklikket sorterer kolonnen og
    // hænger en pil på overskriften.
    await page.locator('th').filter({ hasText: from }).first().dblclick();
    const input = page.locator('.modal-content input[type="text"]');
    await expect(input).toBeVisible();
    await input.fill(to);
    // exact: klassepillen i topbaren er nu en rigtig knap, og dens navn
    // ("Klasse Omdøb E2E") indeholder ordet.
    await page.getByRole('button', { name: 'Omdøb', exact: true }).click();
}

test('gruppekortene beholder navnene, når visningskolonnen omdøbes', async ({ page }) => {
    await createClass(page, 'Omdøb E2E', CSV);
    await goToGroups(page);
    await generateGroups(page);

    await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();
    await renameColumn(page, 'Navn', 'Elevnavn');

    // Visningsvælgeren følger med — ellers slår gruppekortene op i en
    // kolonne der ikke findes.
    await expect(page.locator('#id-column-select')).toHaveValue('Elevnavn');

    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();
    await expect(page.locator('.group-card').first()).toBeVisible();
    await expect(page.locator('.group-card').filter({ hasText: '(uden navn)' })).toHaveCount(0);
    await expect(page.locator('.group-card').first()).toContainText(/Anna|Bo|Carl|Dorte|Emil|Frida|Gustav|Hanne/);
});

test('rangeringen følger med omdøbningen', async ({ page }) => {
    await createClass(page, 'Omdøb E2E', CSV);

    // Rangér Niveau: Lav → Middel → Høj (rækkefølgen er ligegyldig her —
    // det er bindingen til kolonnenavnet, testen handler om).
    await page.locator('button').filter({ hasText: 'Ranger' }).first().click();
    await page.locator('#order-col').selectOption('Niveau');
    await page.getByRole('button', { name: 'Gem rækkefølge' }).click();

    await renameColumn(page, 'Niveau', 'Fagligt niveau');

    // Rangeringen hører til KOLONNEN. Åbnes vinduet igen, starter det på den
    // kolonne der allerede ER rangeret — under sit nye navn.
    await page.locator('button').filter({ hasText: 'Ranger' }).first().click();
    await expect(page.locator('#order-col')).toHaveValue('Fagligt niveau');
    await expect(page.locator('.order-row')).toHaveCount(3);
});

test('et kolonnenavn med "_" afvises, og kolonnen står uændret', async ({ page }) => {
    await createClass(page, 'Omdøb E2E', CSV);

    await renameColumn(page, 'Køn', '_Køn');

    await expect(page.locator('.toast.error')).toContainText('må ikke begynde med');
    await expect(page.locator('th').filter({ hasText: 'Køn' }).first()).toBeVisible();
});
