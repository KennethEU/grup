import { test, expect, Page } from '@playwright/test';
import { createClassAndGoToGroups, generateGroups, openSaveColumn } from './helpers';

// Gendan grupper — de to indgange hele vejen gennem den rigtige app.
//
// Unit-testene i restoreGroups.test.js dækker parsing og planlægning. Det
// der kun kan afprøves her, er at knappen findes, at forhåndsvisningen
// tegner planen, og at elevlisten faktisk står anderledes bagefter.

/**
 * Knapperne i værktøjslinjen kan IKKE slås op på deres tilgængelige navn.
 *
 * `tooltip.js` flytter `title` over i `data-tooltip` + `aria-label`, første
 * gang musen rører knappen. Før den berøring hedder knappen sin synlige tekst
 * ("Gendan"); bagefter hedder den hele title-teksten. Et opslag på navnet
 * virker derfor i den ene halvdel af testen og fejler i den anden — set i
 * praksis, da anden gang vinduet skulle åbnes ikke kunne finde knappen.
 * Den synlige tekst er den samme hele vejen.
 */
function toolbarButton(page: Page, label: string) {
    return page.locator('.action-pill, .pill-btn-sm')
        .filter({ hasText: new RegExp(`^${label}$`) }).first();
}

async function openRestoreDialog(page: Page) {
    await toolbarButton(page, 'Gendan').click();
    await expect(page.getByRole('heading', { name: 'Gendan grupper' })).toBeVisible();
}

/** Alle tolv i DEFAULT_CSV, i den rækkefølge de står. */
const ALL_STUDENTS = [
    'Anna', 'Bob', 'Clara', 'David', 'Emma', 'Frank',
    'Gitte', 'Hans', 'Ida', 'Jens', 'Karen', 'Lars'
];

/** Er eleven markeret fraværende i elevlisten? */
async function isMarkedAbsent(page: Page, studentName: string) {
    const studentRow = page.locator('tbody tr').filter({ hasText: studentName }).first();
    return (await studentRow.getAttribute('class'))?.includes('row-excluded') ?? false;
}

test('gendanner grupper fra en indsat liste — med forslag, ny elev og fravær', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Gendan Tekst');
    await generateGroups(page);

    await openRestoreDialog(page);

    // "Davd" er stavet forkert, "Zenia Ukendt" findes slet ikke, og de otte
    // øvrige elever står ikke på listen. Gruppe 5 er valgt med vilje: tallet
    // skal overleve, selvom der ikke findes en Gruppe 2, 3 og 4.
    await page.locator('#rg-text').fill(
        'Gruppe 1\nAnna\nBob\n\nGruppe 5\nClara\nDavd\nZenia Ukendt\n');
    await page.getByRole('button', { name: 'Læs listen' }).click();

    await expect(page.locator('.preview-head')).toContainText('2 grupper med 5 elever');

    // Forslaget står som det valgte, men det ER synligt og kan fravælges.
    await expect(page.locator('.modal-content .row').filter({ hasText: 'Davd' }))
        .toContainText('Er det David?');
    await expect(page.locator('.modal-content .row').filter({ hasText: 'Zenia Ukendt' }))
        .toContainText('Tilføj som ny elev');

    // De otte der ikke står på listen, nævnes ved navn før der trykkes.
    await expect(page.locator('.checkline')).toContainText('(8)');

    await page.getByRole('button', { name: 'Gendan 2 grupper' }).click();

    // Gruppetallet er bevaret — ikke omdøbt til 1 og 2.
    await expect(page.locator('.group-card')).toHaveCount(2);
    const group1 = page.locator('.group-card').filter({ hasText: 'Gruppe 1' });
    await expect(group1).toContainText('Anna');
    await expect(group1).toContainText('Bob');
    const group5 = page.locator('.group-card').filter({ hasText: 'Gruppe 5' });
    await expect(group5).toBeVisible();
    await expect(group5).toContainText('David');       // forslaget blev fulgt
    await expect(group5).toContainText('Zenia Ukendt'); // den nye elev

    // Elevlisten: den nye elev er oprettet, og de otte er markeret fraværende.
    await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();
    await expect(page.locator('tbody tr').filter({ hasText: 'Zenia Ukendt' })).toBeVisible();
    expect(await isMarkedAbsent(page, 'Emma')).toBe(true);
    expect(await isMarkedAbsent(page, 'Anna')).toBe(false);
});

test('gendanner grupper fra en gemt kolonne', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Gendan Kolonne');
    await generateGroups(page);

    // Skriv den nuværende opdeling ned i en kolonne …
    const beforeRestore = await page.locator('.group-card').allInnerTexts();
    await openSaveColumn(page);
    await page.locator('input[placeholder="Runde 2"]').fill('Vismandsgrupper');
    await page.getByRole('button', { name: 'Gem kolonne', exact: true }).click();

    // … riv opdelingen ned, så der ER noget at gendanne. Én gruppe med hele
    // klassen, sat gennem tekst-fanen: en ny generering ville kunne give
    // samme fordeling igen, og så bestod testen uden at kolonnen gjorde
    // noget som helst.
    await openRestoreDialog(page);
    await page.locator('#rg-text').fill(
        'Gruppe 1\n' + ALL_STUDENTS.join('\n') + '\n');
    await page.getByRole('button', { name: 'Læs listen' }).click();
    await page.getByRole('button', { name: 'Gendan 1 gruppe' }).click();
    await expect(page.locator('.group-card')).toHaveCount(1);

    // … og hent den gemte tilbage.
    await openRestoreDialog(page);
    await page.getByRole('button', { name: 'Fra kolonne' }).click();
    await expect(page.locator('#rg-col')).toHaveValue('Vismandsgrupper');
    await expect(page.locator('.preview-head')).toContainText('elever');

    await page.locator('.modal-content .btn.primary').click();

    await expect(page.locator('.group-card').first()).toBeVisible();
    const afterRestore = await page.locator('.group-card').allInnerTexts();

    // Samme grupper, samme medlemmer — rækkefølgen inde i gruppen må gerne
    // være en anden, for kolonnen bærer elevlistens rækkefølge.
    const memberNames = (cards: string[]) => cards.map(k => {
        const lines = k.split('\n').map(l => l.trim()).filter(Boolean);
        return lines[0] + ': ' + lines.slice(1).sort().join(',');
    }).sort();
    expect(memberNames(afterRestore)).toEqual(memberNames(beforeRestore));
});
