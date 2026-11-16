import { test, expect, Page } from '@playwright/test';
import { createClass, closeRecipe, goToGroups, openRecipe } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FOKUS EFTER LUK (169. gennemsyn, tematik 198).
//
// Samme fejl som efter en sletning (168.), men uden et vindue: knappen
// forsvinder med det, den lukker. Beskedernes luk-kryds og deres egen knap
// ("Hent de nye grupper" osv.) og krydset på advarslerne over grupperne.
// Med tastatur eller skærmlæser stod fokus bagefter på <body>, og læreren
// begyndte forfra øverst på siden. Målt med document.activeElement.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CSV = 'Navn\tKøn\nAnna\tK\nBob\tM\nClara\tK';

// Navnet på det, der har fokus, og teksten i den besked, det står i.
const focused = (page: Page) => page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return 'BODY';
    const toast = el.closest('.toast, .gh-hint');
    const where = toast ? toast.querySelector('.toast-message, .gh-hint-text')?.textContent?.trim() : '';
    return [el.getAttribute('aria-label') || el.textContent?.trim() || '', where, el.className].join('|');
});

const toast = (page: Page, text: string) => page.locator('.toast').filter({ hasText: text });

// "Klasse oprettet!" står stadig, når klassen er lavet, og ville være nabo.
async function clearToasts(page: Page) {
    const close = page.locator('.toast:not(.toast-leave-active) .toast-close');
    while (await close.count()) await close.first().click();
    await expect(page.locator('.toast')).toHaveCount(0);
}

test('beskedernes kryds: fokus til næste besked, og til sidst tilbage, hvor læreren kom fra', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await createClass(page, '8a', CSV);
    await closeRecipe(page);
    await clearToasts(page);
    await page.locator('.class-trigger').focus();

    await page.evaluate(() => {
        (window as any).notifyError('Fejl et');
        (window as any).notifyError('Fejl to');
    });
    await expect(toast(page, 'Fejl to')).toBeVisible();

    // Luk den første: krydset på den næste.
    await toast(page, 'Fejl et').getByRole('button', { name: 'Luk' }).focus();
    await page.keyboard.press('Enter');
    await expect(toast(page, 'Fejl et')).toHaveCount(0);
    await expect.poll(() => focused(page)).toMatch(/^Luk\|Fejl to\|/);

    // Luk den sidste: tilbage til klassepillen, hvor fokus kom fra.
    await page.keyboard.press('Enter');
    await expect(toast(page, 'Fejl to')).toHaveCount(0);
    await expect.poll(() => focused(page)).toContain('class-trigger');

    expect(errors).toEqual([]);
});

test('den nederste besked lukkes: fokus til den ovenover', async ({ page }) => {
    await createClass(page, '8b', CSV);
    await closeRecipe(page);
    await clearToasts(page);
    await page.evaluate(() => {
        (window as any).notifyError('Fejl et');
        (window as any).notifyError('Fejl to');
    });
    await toast(page, 'Fejl to').getByRole('button', { name: 'Luk' }).focus();
    await page.keyboard.press('Enter');
    await expect(toast(page, 'Fejl to')).toHaveCount(0);
    await expect.poll(() => focused(page)).toMatch(/^Luk\|Fejl et\|/);
});

test('beskedens egen knap: fokus tilbage, hvor læreren kom fra', async ({ page }) => {
    await createClass(page, '8c', CSV);
    await closeRecipe(page);
    await clearToasts(page);
    await page.locator('.class-trigger').focus();
    await page.evaluate(() => {
        (window as any).notifyError('Fejl med knap', { label: 'Gør det', run() { (window as any).__ran = true; } });
    });
    await toast(page, 'Fejl med knap').getByRole('button', { name: 'Gør det' }).focus();
    await page.keyboard.press('Enter');
    await expect(toast(page, 'Fejl med knap')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__ran)).toBe(true);
    await expect.poll(() => focused(page)).toContain('class-trigger');
});

test('med musen: intet flyttes, og ingen fokusring', async ({ page }) => {
    await createClass(page, '8d', CSV);
    await closeRecipe(page);
    await clearToasts(page);
    await page.evaluate(() => (window as any).notifyError('Fejl et'));
    await toast(page, 'Fejl et').getByRole('button', { name: 'Luk' }).click();
    await expect(toast(page, 'Fejl et')).toHaveCount(0);
    // Ingen tvungen fokusring nogen steder efter et klik.
    expect(await page.evaluate(() => !!document.querySelector(':focus-visible'))).toBe(false);
});

test('beskedens knap åbner et vindue: efter Escape står fokus, hvor læreren kom fra', async ({ page }) => {
    await createClass(page, '8e', CSV);
    await clearToasts(page);
    const origin = page.getByRole('button', { name: 'Slet Bob', exact: true });
    await origin.focus();
    await page.evaluate(() => {
        (window as any).notifyError('Fejl med vindue', {
            label: 'Kategorisér',
            run() { (document.querySelector('#cat-btn') as HTMLElement).click(); },
        });
    });
    await toast(page, 'Fejl med vindue').getByRole('button', { name: 'Kategorisér' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Kategorisér Data' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Kategorisér Data' })).toHaveCount(0);
    await expect.poll(() => focused(page)).toMatch(/^Slet Bob\|/);
});

// ─── Advarslerne i opskriftens vindue (HintsStack) ─────────────────────────
// To tekstkolonner med "Ensartede" giver to advarsler med "Ranger værdierne…".
// Reglerne lægges ind direkte, som i column_order.spec.ts.
const RANK_CSV = 'Navn\tNiveau\tTrin\nAnna\tLav\tA\nBo\tMiddel\tB\nCarl\tHøj\tC\nDorte\tLav\tA\nEmil\tMiddel\tB\nFrida\tHøj\tC';
async function withTextRules(page: Page, columns: string[]) {
    await createClass(page, 'Rang', RANK_CSV);
    await goToGroups(page);
    await page.evaluate((cols) => {
        (window as any).appDebug.state.currentClass.rules =
            cols.map(column => ({ type: 'minimizediff', column, value: '' }));
    }, columns);
    await openRecipe(page);
}
const hint = (page: Page, column: string) =>
    page.locator('dialog.recipe-dialog[open] .gh-hint').filter({ hasText: 'gør ingenting' }).filter({ hasText: column });

test('advarslernes kryds: næste advarsel, og efter den sidste opskriftens første linje (ikke <body>)', async ({ page }) => {
    await withTextRules(page, ['Niveau', 'Trin']);
    await expect(hint(page, 'Trin')).toBeVisible();
    await hint(page, 'Niveau').locator('.gh-hint-dismiss').focus();
    await page.keyboard.press('Enter');
    await expect(hint(page, 'Niveau')).toHaveCount(0);
    await expect.poll(() => focused(page)).toMatch(/^Luk advarsel\|.*Trin/);

    await page.keyboard.press('Enter');
    await expect(hint(page, 'Trin')).toHaveCount(0);
    // Stadig i vinduet, på det første efter stakken.
    await expect.poll(() => page.evaluate(() => {
        const el = document.activeElement;
        return !!el && el !== document.body && !!el.closest('dialog.recipe-dialog[open]') && !el.closest('.hints-stack');
    })).toBe(true);
});

for (const how of ['Escape', 'Gem rækkefølge']) {
    test(`"Ranger værdierne…" fra advarslen, så ${how}: fokus på opskriftens bjælke`, async ({ page }) => {
        await withTextRules(page, ['Niveau']);
        await hint(page, 'Niveau').locator('.gh-hint-action').focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('#order-col')).toBeVisible();
        if (how === 'Escape') await page.keyboard.press('Escape');
        else {
            await page.getByRole('button', { name: how }).focus();
            await page.keyboard.press('Enter');
        }
        await expect(page.locator('#order-col')).toHaveCount(0);
        await expect.poll(() => focused(page)).toContain('recipe-bar__open');
    });
}

test('advarslens kryds med musen: ingen fokusring', async ({ page }) => {
    await withTextRules(page, ['Niveau']);
    await hint(page, 'Niveau').locator('.gh-hint-dismiss').click();
    await expect(hint(page, 'Niveau')).toHaveCount(0);
    expect(await page.evaluate(() => !!document.querySelector(':focus-visible'))).toBe(false);
});
