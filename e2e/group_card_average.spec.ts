import { test, expect, Page } from '@playwright/test';
import { createClass, goToGroups, addRecipeRule, generateGroups } from './helpers';

// Snittet på gruppekortet skal være DET TAL, motoren balancerede på.
//
// `parseFloat("7,5")` er 7 — kommaet stopper læsningen. Gruppekortet regnede
// sit snit med parseFloat, mens motoren (`solvers._safe_float`) læser kommaet
// som decimaltegn. På en karakterkolonne skrevet 7,5 og 2,5 stod der derfor
// "Snit: 4.5" på kortet, hvor grupperne faktisk havde snittet 5,0 — og
// punktummet var oven i købet ikke dansk.
//
// Klassen er lavet så SVARET er det samme uanset fordelingen: fire elever med
// 7,5 og fire med 2,5 i to grupper à fire giver 5,0 i begge, hvis Balancér
// virker. Testen kan derfor ikke falde på, hvem der endte hvor.
const CSV =
    'Navn\tKøn\tSnit\n' +
    'Anna\tK\t7,5\nBob\tM\t7,5\nClara\tK\t7,5\nDavid\tM\t7,5\n' +
    'Emma\tK\t2,5\nFrank\tM\t2,5\nGitte\tK\t2,5\nHans\tM\t2,5';

// Snittet står på sin egen linje under overskriften (siden 24/9) og følger
// Tags-knappen, som er slået fra, når klassen åbnes.
async function addBalance(page: Page, column: string) {
    await addRecipeRule(page, { type: 'Balancér', column });
}

test('Gruppekortets snit læser kommaet som decimaltegn', async ({ page }) => {
    await createClass(page, 'Komma-snit E2E', CSV);
    await goToGroups(page);
    await addBalance(page, 'Snit');

    await generateGroups(page);
    const cards = page.locator('.group-card');
    expect(await cards.count()).toBe(2);

    // Tags er slået fra: snittet står der ikke.
    await expect(page.locator('.group-average').first()).toBeHidden();
    await page.getByRole('button', { name: 'Tags' }).click();

    for (let i = 0; i < 2; i++) {
        // 5,0 og ikke 4.5: både tallet og decimaltegnet.
        await expect(cards.nth(i).locator('.group-average'), `gruppekort ${i + 1}`)
            .toHaveText(/Snit\s*Snit 5,0/);
        // Overskriften er bare gruppens navn.
        await expect(cards.nth(i).locator('.group-title')).not.toContainText('Snit');
    }
});

test('Snittet viser hver Balancér-kolonne og tæller kun dem, der er her', async ({ page }) => {
    const csv =
        'Navn\tKarakter\tFravær\n' +
        'Anna\t12\t2\nBob\t2\t4\nClara\t7\t6\nDavid\t10\t8';
    await createClass(page, 'Snit to kolonner E2E', csv);
    await goToGroups(page);
    await addBalance(page, 'Karakter');
    await addBalance(page, 'Fravær');
    await generateGroups(page);

    // Ét kort med alle fire, så tallene ikke afhænger af fordelingen.
    await page.evaluate(() => {
        const state = (window as any).appDebug.state;
        const ids = state.currentClass.data.map((s: any) => s._rowId);
        state.storedStandardGroups.forEach((g: any, i: number) => { g.members = i === 0 ? ids : []; });
    });
    await page.getByRole('button', { name: 'Tags' }).click();
    const line = page.locator('.group-card').first().locator('.group-average');
    await expect(line).toHaveText(/Karakter 7,8\s*Fravær 5,0/);

    // David meldes fraværende: han står stadig på kortet, men tæller ikke.
    await page.evaluate(() => {
        const state = (window as any).appDebug.state;
        state.currentClass.data.find((s: any) => s.Navn === 'David')._excluded = true;
    });
    await expect(line).toHaveText(/Karakter 7,0\s*Fravær 4,0/);
});

test('En rangeret kolonne med tal i cellerne får intet snit', async ({ page }) => {
    // Læreren har rangeret "3" lavest og "1" højest (fx "1" = bedst). Motoren
    // balancerer så på RANGEN, ikke på tallet — et snit af cellernes tal ville
    // tale om noget, motoren ikke har regnet på (rest af 74, 112. gennemsyn).
    const csv =
        'Navn\tNiveau\tKarakter\n' +
        'Anna\t1\t12\nBob\t3\t2\nClara\t2\t7\nDavid\t1\t10';
    await createClass(page, 'Snit rangeret E2E', csv);
    await goToGroups(page);
    await addBalance(page, 'Niveau');
    await addBalance(page, 'Karakter');
    await generateGroups(page);

    await page.evaluate(() => {
        const state = (window as any).appDebug.state;
        const ids = state.currentClass.data.map((s: any) => s._rowId);
        state.storedStandardGroups.forEach((g: any, i: number) => { g.members = i === 0 ? ids : []; });
    });
    await page.getByRole('button', { name: 'Tags' }).click();
    const line = page.locator('.group-card').first().locator('.group-average');
    // Uden rangering: begge kolonner har et snit.
    await expect(line).toHaveText(/Niveau 1,8\s*Karakter 7,8/);

    await page.evaluate(() => {
        const state = (window as any).appDebug.state;
        state.currentClass.columnOrders = { Niveau: ['3', '2', '1'] };
    });
    await expect(line).toHaveText(/^\s*Snit\s*Karakter 7,8\s*$/);
    await expect(line).not.toContainText('Niveau');
});
