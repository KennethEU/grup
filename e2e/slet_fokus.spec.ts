import { test, expect, Page } from '@playwright/test';
import { createClass, closeRecipe } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FOKUS EFTER SLETNING (168. gennemsyn, tematik 197).
//
// Samme fejl som i Historik (167.): et vindue giver fokus tilbage til
// knappen, der åbnede det, men når knappen forsvinder med det, den slettede,
// står fokus på <body>. Med tastatur eller skærmlæser begynder læreren så
// forfra øverst på siden. Målt med document.activeElement, ikke med øjet.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CSV = 'Navn\tKøn\nAnna\tK\nBob\tM\nClara\tK';

const focused = (page: Page) => page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return 'BODY';
    // Navnet først (aria-label, ellers title), så id og klasser.
    return [el.getAttribute('aria-label') || el.getAttribute('title') || '', el.id, el.className].join('|');
});

async function confirmIn(page: Page, title: string, button: string) {
    const dialog = page.locator('.modal-overlay[role="dialog"]').filter({ hasText: title });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: button, exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
}

test('Slet elev: fokus går til slet-krydset i rækken, der rykker op', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await createClass(page, '7k', CSV);
    const slet = (name: string) => page.getByRole('button', { name: `Slet ${name}`, exact: true });

    // Midterste: Clara rykker op.
    await slet('Bob').focus();
    await page.keyboard.press('Enter');
    await confirmIn(page, 'Slet elev', 'Slet');
    await expect(slet('Bob')).toHaveCount(0);
    await expect.poll(() => focused(page)).toMatch(/^Slet Clara\|/);

    // Nederste: fokus til den nye nederste.
    await page.keyboard.press('Enter');
    await confirmIn(page, 'Slet elev', 'Slet');
    await expect.poll(() => focused(page)).toMatch(/^Slet Anna\|/);

    // Den sidste: listen selv.
    await page.keyboard.press('Enter');
    await confirmIn(page, 'Slet elev', 'Slet');
    await expect(page.getByText('Ingen elever endnu')).toBeVisible();
    await expect.poll(() => focused(page)).toContain('|table-container|');

    // Fortryd fra den tomme liste: Ctrl+Z (Cmd+Z på Mac) henter Anna tilbage.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(slet('Anna')).toBeVisible();

    expect(errors).toEqual([]);
});

test('Slet elev, men fortryd: fokus tilbage på samme slet-kryds', async ({ page }) => {
    await createClass(page, '7l', CSV);
    await page.getByRole('button', { name: 'Slet Bob', exact: true }).focus();
    await page.keyboard.press('Enter');
    await confirmIn(page, 'Slet elev', 'Annuller');
    await expect.poll(() => focused(page)).toMatch(/^Slet Bob\|/);
});

test('klassemenuen: efter Slet, Annuller og valg står fokus på klassepillen', async ({ page }) => {
    await createClass(page, '7m', CSV);
    await closeRecipe(page);
    const trigger = page.locator('.class-trigger');

    // Omdøb med tastaturet: Enter i feltet sender intet klik, så menuen
    // står åben, og fokus kommer tilbage på Omdøb (holdt, ikke en fejl).
    await trigger.focus();
    await page.keyboard.press('Enter');
    const row = page.locator('.class-list .class-item').filter({ hasText: '7m' });
    await row.locator('.edit-btn').focus();
    await page.keyboard.press('Enter');
    const input = page.locator('.modal-overlay input[type="text"]').first();
    await input.fill('7n');
    await page.keyboard.press('Enter');
    await expect(trigger).toContainText('7n');
    await expect.poll(() => focused(page)).toMatch(/^Omdøb klasse\|/);
    await page.keyboard.press('Escape');
    await expect.poll(() => focused(page)).toContain('class-trigger');

    // Annuller Slet med tastaturet (Enter på Annuller)
    await page.keyboard.press('Enter');
    await page.locator('.class-list .class-item').filter({ hasText: '7n' }).locator('.delete-btn').focus();
    await page.keyboard.press('Enter');
    await confirmIn(page, 'Slet klasse', 'Annuller');
    await expect.poll(() => focused(page)).toContain('class-trigger');

    // Vælg klassen med Enter: menuen lukker, fokus på pillen.
    await page.keyboard.press('Enter');
    await page.locator('.class-list .class-item button.name').filter({ hasText: '7n' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.glass-dropdown')).toHaveCount(0);
    await expect.poll(() => focused(page)).toContain('class-trigger');

    // Slet
    await page.keyboard.press('Enter');
    await page.locator('.class-list .class-item').filter({ hasText: '7n' }).locator('.delete-btn').focus();
    await page.keyboard.press('Enter');
    await confirmIn(page, 'Slet klasse', 'Slet');
    await expect.poll(() => focused(page)).toContain('class-trigger');
});

test('Kategoriser: Fjern regel giver fokus til næste regels kryds, ikke <body>', async ({ page }) => {
    await createClass(page, '7o', CSV);
    await page.locator('#cat-btn').click();
    await expect(page.getByRole('heading', { name: 'Kategorisér Data' })).toBeVisible();
    await page.getByRole('button', { name: '+ Tilføj regel' }).click();
    await page.getByRole('button', { name: '+ Tilføj regel' }).click();
    // Tre regler nu; fjern den første.
    await page.getByRole('button', { name: 'Fjern regel 1', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Fjern regel 3', exact: true })).toHaveCount(0);
    await expect.poll(() => focused(page)).toMatch(/^Fjern regel 1\|/);
    // Fjern den sidste: fokus til den nye sidste.
    await page.getByRole('button', { name: 'Fjern regel 2', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => focused(page)).toMatch(/^Fjern regel 1\|/);
});

test('klassemenuen: Slet en ANDEN klasse — fokus på pillen, læreren bliver i sin klasse', async ({ page }) => {
    await createClass(page, '7q', CSV);
    await closeRecipe(page);
    const trigger = page.locator('.class-trigger');
    // Ny klasse fra menuen (+); den bliver den åbne.
    await trigger.click();
    await page.locator('.glass-dropdown .add-btn').click();
    await page.locator('.modal-overlay input[type="text"]').first().fill('7r');
    await page.getByRole('button', { name: /^Opret$/ }).click();
    await expect(trigger).toContainText('7r');
    await closeRecipe(page);

    await trigger.focus();
    await page.keyboard.press('Enter');
    await page.locator('.class-list .class-item').filter({ hasText: '7q' }).locator('.delete-btn').focus();
    await page.keyboard.press('Enter');
    await confirmIn(page, 'Slet klasse', 'Slet');
    await expect.poll(() => focused(page)).toContain('class-trigger');
    await expect(trigger).toContainText('7r');
});

test('Import & backup: Slet den gemte kopi — fokus til den valgte fane', async ({ page }) => {
    await createClass(page, '7t', CSV);
    await page.evaluate(() => localStorage.setItem('grupdk_unreadable_classes', '{ikke json'));
    await page.locator('.nav-tab').filter({ hasText: 'Import' }).click();
    const sletDen = page.getByRole('button', { name: 'Slet den' });
    await expect(sletDen).toBeVisible();
    await sletDen.focus();
    await page.keyboard.press('Enter');
    await confirmIn(page, 'Slet den gemte kopi', 'Slet');
    await expect(sletDen).toHaveCount(0);
    await expect.poll(() => focused(page)).toContain('pill-btn active');
});
