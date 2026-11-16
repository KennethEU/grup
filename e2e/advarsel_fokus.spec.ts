import { test, expect, Page } from '@playwright/test';
import { createClass, goToGroups, generateGroups, closeRecipe, goToMatrix, goToStandard, clickGenerate } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FOKUS EFTER ADVARSLERNE OVER GRUPPERNE (170. gennemsyn, tematik 199).
//
// En advarsels knap åbner et vindue ("Tilføj efternøler", "Vis aftalen").
// Løser læreren sagen i vinduet, forsvinder advarslen — og med den knappen,
// vinduet skulle give fokus tilbage til. Før stod fokus så på <body>, og
// med tastatur eller skærmlæser begyndte læreren forfra øverst på siden.
// Samme når knappen selv danner grupperne igen ("Dan matrixen igen").
// Målt med document.activeElement.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.setTimeout(120000);

const CSV = 'Navn\tKøn\nAnna\tK\nBob\tM\nClara\tK\nDavid\tM\nEmma\tK\nFrede\tM';

const focused = (page: Page) => page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return 'BODY';
    return [el.getAttribute('aria-label') || el.textContent?.trim() || '', el.className].join('|');
});

// Hvor i siden står fokus: i en advarsel, i gruppekortene eller andet sted?
const region = (page: Page) => page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return 'BODY';
    if (el.closest('.gh-hint')) return 'advarsel';
    if (el.closest('.groups-scroll-content')) return 'grupperne';
    return 'andet:' + el.className;
});

async function clearToasts(page: Page) {
    await page.locator('.toast .toast-close').evaluateAll(els => els.forEach(e => (e as HTMLElement).click()));
}

test('"Tilføj efternøler" over grupperne: efter tilføjelsen står fokus ikke på <body>', async ({ page }) => {
    await createClass(page, 'Efternøler fokus', CSV);
    await goToGroups(page);
    await generateGroups(page);
    // Emma tages ud af sin gruppe: "mødt, men står ikke i nogen gruppe".
    await page.evaluate(() => {
        const state = (window as any).appDebug.state;
        const emma = state.currentClass.data.find((s: any) => s.Navn === 'Emma')._rowId;
        for (const g of state.storedStandardGroups) {
            g.members = g.members.filter((m: any) => String(m?.id ?? m) !== emma);
        }
    });
    await clearToasts(page);
    const hint = page.locator('.gh-hint').filter({ hasText: 'står ikke i nogen gruppe' });
    await hint.getByRole('button', { name: 'Tilføj efternøler' }).focus();
    await page.keyboard.press('Enter');
    await page.locator('.student-item').filter({ hasText: 'Emma' }).locator('input[type="checkbox"]').check();
    await page.locator('.btn-confirm').focus();
    await page.keyboard.press('Enter');
    await expect(hint).toHaveCount(0);
    await expect.poll(() => region(page)).toBe('grupperne');
    // Ikke et element bag et vindue eller uden for siden.
    expect(await page.evaluate(() => !!document.activeElement?.closest('[inert]'))).toBe(false);
});

test('"Vis aftalen" over grupperne: aftalen slettes, Escape — fokus ikke på <body>', async ({ page }) => {
    await createClass(page, 'Aftale fokus', CSV);
    await goToGroups(page);
    await generateGroups(page);
    await page.evaluate(() => {
        const state = (window as any).appDebug.state;
        const [a, b] = state.storedStandardGroups;
        state.currentClass.togetherGroups = [{ ids: [a.members[0], b.members[0]], timestamp: 1 }];
    });
    await clearToasts(page);
    const hint = page.locator('.gh-hint').filter({ hasText: 'Skal sammen er brudt' });
    await hint.getByRole('button', { name: 'Vis aftalen' }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Aftaler', exact: true });
    await expect(dialog).toBeVisible();
    // Fjern aftalen (som læreren ville) og luk vinduet med Escape.
    await page.evaluate(() => { (window as any).appDebug.state.currentClass.togetherGroups = []; });
    await expect(hint).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => region(page)).toBe('grupperne');
});

test('vinduet lukkes, mens advarslen står: fokus tilbage på advarslens knap (som før)', async ({ page }) => {
    await createClass(page, 'Aftale fokus 2', CSV);
    await goToGroups(page);
    await generateGroups(page);
    await page.evaluate(() => {
        const state = (window as any).appDebug.state;
        const [a, b] = state.storedStandardGroups;
        state.currentClass.togetherGroups = [{ ids: [a.members[0], b.members[0]], timestamp: 1 }];
    });
    await clearToasts(page);
    const hint = page.locator('.gh-hint').filter({ hasText: 'Skal sammen er brudt' });
    await hint.getByRole('button', { name: 'Vis aftalen' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Aftaler', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect.poll(() => focused(page)).toMatch(/^Vis aftalen\|/);
});

test('"Dan matrixen igen": efter kørslen står fokus ikke på <body>', async ({ page }) => {
    await createClass(page, 'Matrix fokus', CSV);
    await goToGroups(page);
    await generateGroups(page);
    await goToMatrix(page);
    await generateGroups(page);
    await goToStandard(page);
    await generateGroups(page);
    await goToMatrix(page);
    await closeRecipe(page);
    await clearToasts(page);
    const stale = page.locator('.gh-hint', { hasText: 'dannet ud fra de forrige stamgrupper' });
    await stale.getByRole('button', { name: 'Dan matrixen igen' }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(
        () => page.evaluate(() => (window as any).appDebug.state.matrixGroupsStale),
        { timeout: 90000 }
    ).toBe(false);
    await expect(stale).toHaveCount(0);
    await expect.poll(() => region(page)).toBe('grupperne');
});

test('med musen: ingen fokusring efter "Tilføj efternøler"', async ({ page }) => {
    await createClass(page, 'Efternøler mus', CSV);
    await goToGroups(page);
    await generateGroups(page);
    await page.evaluate(() => {
        const state = (window as any).appDebug.state;
        const emma = state.currentClass.data.find((s: any) => s.Navn === 'Emma')._rowId;
        for (const g of state.storedStandardGroups) {
            g.members = g.members.filter((m: any) => String(m?.id ?? m) !== emma);
        }
    });
    await clearToasts(page);
    const hint = page.locator('.gh-hint').filter({ hasText: 'står ikke i nogen gruppe' });
    await hint.getByRole('button', { name: 'Tilføj efternøler' }).click();
    await page.locator('.student-item').filter({ hasText: 'Emma' }).locator('input[type="checkbox"]').check();
    await page.locator('.btn-confirm').click();
    await expect(hint).toHaveCount(0);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => !!document.querySelector(':focus-visible'))).toBe(false);
});

// 171. gennemsyn, tematik (202): motorens stop på en Skal sammen-aftale står
// over grupperne med "Dan grupper uden aftalen". Samme vej som "Dan matrixen
// igen" ovenfor, men ikke målt i 170. Grøn uden ændringer i koden; rød
// (BODY), når HintsStack ikke melder reserven.
test('"Dan grupper uden aftalen" over grupperne: efter kørslen står fokus ikke på <body>', async ({ page }) => {
    await createClass(page, 'Uden aftalen fokus', CSV);
    await page.evaluate(() => {
        const cls = (window as any).appDebug.state.currentClass;
        const idOf = (n: string) => cls.data.find((s: any) => s.Navn === n)._rowId;
        cls.togetherGroups = [{ ids: [idOf('Anna'), idOf('Bob')], timestamp: 1 }];
        cls.data.forEach((s: any) => { s.Køn = ['Anna', 'Bob'].includes(s.Navn) ? 'Formand' : 'Menig'; });
        cls.rules = [{ type: 'separate', column: 'Køn', value: 'Formand' }];
    });
    await goToGroups(page);
    for (const close of await page.locator('.toast .toast-close').all()) await close.click({ timeout: 2000 }).catch(() => {});
    await clickGenerate(page);
    const recipeOpen = page.locator('dialog.recipe-dialog[open]');
    if (await recipeOpen.count()) await page.keyboard.press('Escape');
    await expect(recipeOpen).toHaveCount(0);
    const stopHint = page.locator('.gh-hint:not(dialog.recipe-dialog .gh-hint)')
        .filter({ hasText: 'skal være sammen, men Adskil på' });
    await expect(stopHint).toHaveCount(1);
    await clearToasts(page);
    await stopHint.getByRole('button', { name: 'Dan grupper uden aftalen' }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.isGenerating), { timeout: 90000 }).toBe(false);
    await expect(page.locator('.group-card')).not.toHaveCount(0);
    await expect(stopHint).toHaveCount(0);
    // Aftalen er tilsidesat, så "Skal sammen er brudt" står nu over
    // grupperne: fokus går til den (den første advarsel, der står tilbage).
    await expect.poll(() => region(page)).toBe('advarsel');
    await expect(page.locator('.gh-hint').filter({ hasText: 'Skal sammen er brudt' })
        .getByRole('button', { name: 'Vis aftalen' })).toBeFocused();
});
