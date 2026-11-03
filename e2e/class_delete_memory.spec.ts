import { test, expect, Page } from '@playwright/test';
import { createClassAndGoToGroups, generateGroups, goToGroups, closeRecipe } from './helpers';

/**
 * Værn om hukommelsen omkring en sletning i klassemenuen — begge veje.
 *
 * `clearClassMemory()` rydder det, der hører til ÉN klasse: fortryd-stakken,
 * kørselshistorikken, optagelsen af sidste kørsel, markeringer og visning.
 * Den er rigtig at kalde, når læreren FORLADER en klasse — og forkert at
 * kalde, når hun bliver stående. Sletningen ramte den forkert i begge ender:
 *
 *   - Sletter man en ANDEN klasse, blev den kaldt alligevel. Både sletning og
 *     omdøbning sluttede med `loadClasses()`, som ikke bare henter listen, men
 *     også VÆLGER en klasse — og valget faldt på den, læreren allerede stod i.
 *     Målt i 2.a med en kørsel bag sig: Ctrl+Z-stakken gik fra 1 til 0 og
 *     "Se kørslen" fra optaget til tom, mens 3.b blev slettet.
 *   - Sletter man sin SIDSTE klasse, blev den aldrig kaldt. Der var ingen ny
 *     klasse at vælge, så elevrækkerne, grupperne og optagelsen blev liggende
 *     i fanen — om en klasse, læreren lige havde fået at vide var slettet.
 */

/** Læs et felt ud af app-tilstanden — samme vej som class_switch.spec.ts. */
function state(page: Page, path: string) {
    return page.evaluate(
        (p) => p.split('.').reduce((o: any, k: string) => (o == null ? o : o[k]),
            (window as any).appDebug.state),
        path,
    );
}

/** Opret endnu en klasse fra klassemenuen i topbaren. */
async function createSecondClass(page: Page, name: string) {
    // Uden grupper står opskriftens vindue åbent og dækker klassemenuen
    await closeRecipe(page);
    await page.locator('.class-trigger').click();
    await page.locator('.glass-dropdown .add-btn').click();
    const input = page.locator('.modal-overlay input[type="text"]').first();
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill(name);
    await page.getByRole('button', { name: /^Opret$/ }).click();
    await expect(page.locator('.class-trigger')).toContainText(name, { timeout: 30000 });
}

/** Vælg en klasse ved navn i klassemenuen — den vej læreren bruger. */
async function switchToClass(page: Page, name: string) {
    // Uden grupper står opskriftens vindue åbent og dækker klassemenuen
    await closeRecipe(page);
    await page.locator('.class-trigger').click();
    await page.locator('.class-list .class-item button.name')
        .filter({ hasText: name }).first().click();
    await expect(page.locator('.class-trigger')).toContainText(name, { timeout: 30000 });
}

/** Slet en klasse via klassemenuen. */
async function deleteClassByName(page: Page, name: string) {
    // Uden grupper står opskriftens vindue åbent og dækker klassemenuen
    await closeRecipe(page);
    await page.locator('.class-trigger').click();
    const row = page.locator('.class-list .class-item').filter({ hasText: name }).first();
    await row.locator('.delete-btn').click();
    // Scopet til dialogen: rækkens egen slette-knap hedder også "Slet klasse".
    await page.getByRole('dialog').getByRole('button', { name: 'Slet', exact: true }).click();
}

/**
 * Vent til en menu-handling har haft sin chance for at rydde forkert.
 *
 * Vi påstår her, at noget IKKE sker, og det kan ikke måles i det øjeblik
 * knappen slippes: den fejlramte vej var to asynkrone hentninger dyb
 * (`fetchClasses()` og så `fetchClass()`), og læses tilstanden før de er
 * landet, ser en tom stak stadig fuld ud. Begge hentninger går til
 * localStorage og tager brøkdele af et millisekund; to sekunder er derfor
 * rigelig plads til, at oprydningen ville have været igennem.
 */
async function letMenuActionSettle(page: Page) {
    await page.waitForTimeout(2000);
}

/**
 * Giv den åbne klasse en hukommelse værd at miste: en kørsel (optagelse +
 * aftryk) og en rettet celle (ét trin på fortryd-stakken).
 */
async function buildUpMemory(page: Page) {
    await goToGroups(page);
    await generateGroups(page);
    // matrixGroupsStale sættes til sidst i genereringen — det ærlige "færdig".
    await expect.poll(() => state(page, 'matrixGroupsStale'), { timeout: 90000 }).toBe(true);

    await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();
    const cell = page.locator('td[contenteditable]').first();
    await cell.click();
    await cell.fill('Anna Ændret');
    await page.locator('body').click();
    await expect.poll(() => state(page, '_undoStack.length'), { timeout: 10000 })
        .toBeGreaterThan(0);
}

test('sletning af en ANDEN klasse rører ikke den, læreren står i', async ({ page }) => {
    await createClassAndGoToGroups(page, '2a Beholdes');
    await createSecondClass(page, '3b Slettes');
    await switchToClass(page, '2a Beholdes');
    await buildUpMemory(page);

    await deleteClassByName(page, '3b Slettes');
    await letMenuActionSettle(page);

    // 2.a skal stå urørt: samme klasse, samme fortryd-stak, samme optagelse.
    expect(await state(page, 'currentClass.name')).toBe('2a Beholdes');
    expect(await state(page, '_undoStack.length')).toBeGreaterThan(0);
    expect(await state(page, 'lastRecording.standard')).not.toBeNull();
});

test('omdøbning af en ANDEN klasse rører ikke den, læreren står i', async ({ page }) => {
    await createClassAndGoToGroups(page, '2a Beholdes');
    await createSecondClass(page, '3b Omdøbes');
    await switchToClass(page, '2a Beholdes');
    await buildUpMemory(page);

    await page.locator('.class-trigger').click();
    const row = page.locator('.class-list .class-item').filter({ hasText: '3b Omdøbes' }).first();
    await row.locator('.rename-btn, button[title*="Omdøb"]').first().click();
    const input = page.locator('.modal-overlay input[type="text"]').first();
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('3b Nyt Navn');
    await page.getByRole('dialog').getByRole('button', { name: /^(Gem|OK|Omdøb)$/ }).first().click();
    await letMenuActionSettle(page);

    expect(await state(page, 'currentClass.name')).toBe('2a Beholdes');
    expect(await state(page, '_undoStack.length')).toBeGreaterThan(0);
    expect(await state(page, 'lastRecording.standard')).not.toBeNull();
});

test('sletning af den SIDSTE klasse efterlader intet om dens elever', async ({ page }) => {
    await createClassAndGoToGroups(page, '2a Eneste');
    await buildUpMemory(page);

    await deleteClassByName(page, '2a Eneste');
    await letMenuActionSettle(page);

    expect(await state(page, 'currentClass')).toBeNull();
    // Alt det, der beskrev den slettede klasse, skal være væk — ikke bare
    // usynligt. Grupperne bærer elevernes navne med sig.
    expect(await state(page, '_undoStack.length')).toBe(0);
    expect(await state(page, '_runHistory.length')).toBe(0);
    expect(await state(page, 'storedStandardGroups')).toBeNull();
    expect(await state(page, 'storedMatrixGroups')).toBeNull();
    expect(await state(page, 'lastGeneratedGroups')).toBeNull();
    expect(await state(page, 'lastRecording.standard')).toBeNull();
});

// Historikken husker visninger, ikke klasser. Efter at den SIDSTE klasse var
// slettet, førte browserens Tilbage-knap til en klassevisning uden klasse:
// "Ingen klasse valgt", ingen fane markeret — og en tekst, der pegede på en
// menu "til venstre", som sidder øverst til højre.
test('Tilbage efter sletning af den sidste klasse lander på Oversigt', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Eneste klasse');
    await closeRecipe(page);
    await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();
    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();
    await deleteClassByName(page, 'Eneste klasse');
    await expect.poll(() => state(page, 'navView')).toBe('dashboard');

    await page.goBack();
    await expect.poll(() => state(page, 'navView')).toBe('dashboard');
    // Oversigtens egne veje videre — ikke klassevisningens tomme felt.
    await expect(page.getByRole('button', { name: 'Prøv med testdata' })).toBeVisible();
    await expect(page.getByText('opret en ny med')).toHaveCount(0);
});
