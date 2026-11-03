import { test, expect } from '@playwright/test';
import { createClass, createClassAndGoToGroups, goToGroups, openRecipe, addRecipeRule, addTopics } from './helpers';

// Fire kolonner, der alle kan fordeles — så tre Fordel-regler er gentagne
// typer, og rækkefølgen er en prioritering (pilene vises)
const CSV_FOUR =
    'Navn\tKøn\tKarakter\tHold\tSprog\n' +
    'Anna\tK\t10\tA\tTysk\nBob\tM\t7\tB\tFransk\nClara\tK\t12\tA\tTysk\nDavid\tM\t4\tB\tFransk\n' +
    'Emma\tK\t10\tA\tTysk\nFrank\tM\t7\tB\tFransk\nGitte\tK\t12\tA\tTysk\nHans\tM\t4\tB\tFransk';

// Opskriftens ord-menuer og regellinjer med tastaturet alene. Fokus må aldrig
// falde ud af vinduet (til siden selv), og en knap skal virke igen ved næste
// tryk. Knapperne trykkes med Enter på en fokuseret knap — ikke klik — fordi
// det er tastaturvejen, der testes.

const ruleLine = (dialog, i: number) => dialog.locator(`.recipe__line--rule[data-rule-index="${i}"]`);
const ruleTexts = (dialog) => dialog.locator('.recipe__line--rule .recipe__text').allTextContents();

test('et fjernet emne giver fokus videre til næste emnes kryds', async ({ page }) => {
    await createClassAndGoToGroups(page);
    await addTopics(page, ['Alfa', 'Beta', 'Gamma']);
    const dialog = await openRecipe(page);
    await dialog.locator('.rtok__btn[aria-label^="Emner:"]').focus();
    await page.keyboard.press('Enter');
    const pop = dialog.locator('.rtok__pop');
    // Menuen åbner med fokus i feltet. Før stod feltet usynligt i 0,2 sek.
    // (en global `transition` på alt, også visibility), og fokus blev på ordet.
    await expect(pop.getByRole('textbox', { name: 'Nyt emne' })).toBeFocused();

    await pop.getByRole('button', { name: 'Fjern Beta' }).focus();
    await page.keyboard.press('Enter');
    await expect(pop.getByRole('button', { name: 'Fjern Gamma' })).toBeFocused();
    // Det sidste: fokus går til det forrige
    await page.keyboard.press('Enter');
    await expect(pop.getByRole('button', { name: 'Fjern Alfa' })).toBeFocused();
    // Det allersidste: fokus til feltet
    await page.keyboard.press('Enter');
    await expect(pop.getByRole('textbox', { name: 'Nyt emne' })).toBeFocused();
});

test('"Flyt ned" to gange flytter reglen to pladser', async ({ page }) => {
    await createClass(page, 'Fire kolonner', CSV_FOUR);
    await goToGroups(page);
    for (const column of ['Køn', 'Hold', 'Sprog', 'Karakter']) await addRecipeRule(page, { column });
    const dialog = await openRecipe(page);
    const before = await ruleTexts(dialog);
    const first = before[0];

    await ruleLine(dialog, 0).getByRole('button', { name: 'Flyt ned' }).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect.poll(() => ruleTexts(dialog).then(t => t.indexOf(first))).toBe(2);
    await expect(ruleLine(dialog, 2).getByRole('button', { name: 'Flyt ned' })).toBeFocused();
    // Helt nederst er "Flyt ned" grå; fokus går til "Flyt op" på samme linje
    await page.keyboard.press('Enter');
    await expect.poll(() => ruleTexts(dialog).then(t => t.indexOf(first))).toBe(3);
    await expect(ruleLine(dialog, 3).getByRole('button', { name: 'Flyt op (vigtigere)' })).toBeFocused();
});

test('"Fjern reglen" giver fokus videre — og til "+ Tilføj regel", når der ikke er flere', async ({ page }) => {
    await createClassAndGoToGroups(page);
    await addRecipeRule(page, { column: 'Køn' });
    await addRecipeRule(page, { type: 'Saml', column: 'Karakter' });
    const dialog = await openRecipe(page);
    const n = await dialog.locator('.recipe__line--rule').count();

    // Den sidste: fokus til den forrige linjes kryds
    await ruleLine(dialog, n - 1).getByRole('button', { name: 'Fjern reglen' }).focus();
    await page.keyboard.press('Enter');
    await expect(ruleLine(dialog, n - 2).getByRole('button', { name: 'Fjern reglen' })).toBeFocused();
    // Videre til der ikke er flere
    for (let i = n - 2; i > 0; i--) await page.keyboard.press('Enter');
    await expect(dialog.locator('.recipe__line--rule')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(dialog.locator('.recipe__line--rule')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '+ Tilføj regel' })).toBeFocused();
});

test('Tab ud af en ord-menu lukker den, og Escape bagefter flytter ikke fokus tilbage', async ({ page, browserName }) => {
    // Safari (og Playwrights WebKit) lader som standard Tab springe knapper
    // over, så fokus forlader menuen ad en anden vej end her
    test.skip(browserName === 'webkit', 'Tab rammer ikke knapper i WebKit');
    await createClassAndGoToGroups(page);
    await addRecipeRule(page, { column: 'Køn' });
    const dialog = await openRecipe(page);
    await ruleLine(dialog, 0).locator('.rtok__btn[aria-label^="Kolonne:"]').focus();
    await page.keyboard.press('Enter');
    const pop = dialog.locator('.rtok__pop');
    await expect(pop).toBeVisible();

    // Tab gennem menuens valg og videre ud
    let left = false;
    for (let i = 0; i < 10 && !left; i++) {
        await page.keyboard.press('Tab');
        left = await page.evaluate(() => !document.activeElement?.closest('.rtok__pop'));
    }
    expect(left).toBe(true);
    await expect(pop).toHaveCount(0);
    const where = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80));

    // Escape lukker nu vinduet (der er ingen menu at lukke) — ikke et spring tilbage til ordet
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.recipe-dialog[open]')).toHaveCount(0);
    expect(where).not.toContain('Kolonne:');
});

test('størrelses-menuen kan bruges med tastaturet alene', async ({ page }) => {
    await createClassAndGoToGroups(page);
    const dialog = await openRecipe(page);
    const token = dialog.locator('.rtok__btn[aria-label^="Gruppernes størrelse:"]');
    await token.focus();
    await page.keyboard.press('Enter');
    const pop = dialog.locator('.rtok__pop');
    await expect(pop.getByRole('button', { name: 'Elever pr. gruppe' })).toBeFocused();

    // Skift til "Antal grupper": ordet skifter tekst, men menuen må ikke
    // monteres om (så lukkede den, og fokus faldt ud af vinduet)
    await page.keyboard.press('ArrowDown');
    await expect(pop.getByRole('button', { name: 'Antal grupper' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(pop.getByRole('button', { name: 'Antal grupper' })).toHaveAttribute('aria-pressed', 'true');
    await expect(pop.getByRole('button', { name: 'Antal grupper' })).toBeFocused();
    await expect(token).toHaveAttribute('aria-label', /grupper?$/);

    // Talfeltet: pil op tæller op, og "Færre" tæller ned igen
    const field = pop.getByRole('spinbutton', { name: 'Antal grupper' });
    await field.focus();
    const start = Number(await field.inputValue());
    await page.keyboard.press('ArrowUp');
    await expect(field).toHaveValue(String(start + 1));
    await pop.getByRole('button', { name: 'Færre' }).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(field).toHaveValue(String(start - 1));
    await expect(pop.getByRole('button', { name: 'Færre' })).toBeFocused();
    await expect(token).toHaveAttribute('aria-label', new RegExp(`${start - 1} grupper?$`));

    // Escape lukker kun menuen og giver fokus tilbage på ordet
    await page.keyboard.press('Escape');
    await expect(pop).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(token).toBeFocused();
});
