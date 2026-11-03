import { test, expect } from '@playwright/test';
import { createClassAndGoToGroups, addRecipeRule, pickInToken, openRecipe } from './helpers';

// Værdien på "Adskil" matcher præcist. Fandtes
// reglens værdi ikke længere i kolonnen — cellerne rettet, eller kolonnen
// overskrevet af "Kategoriser" — stod feltet TOMT, mens motoren stadig fik
// værdien. Motor B gav så nul grupper og en engelsk fejl (rettet samme dag
// i logic.py). Og skiftede læreren kolonne, blev den gamle værdi hængende
// usynligt på den nye. Opskriften skal vise begge dele.

// Ordene i opskriftens regel-linje: navnet står i knappens aria-label
// ("Kolonne: Karakter"), og et ord der mangler noget er markeret is-missing.
const token = (line, label: string) => line.locator(`.rtok__btn[aria-label^="${label}:"]`);

const addSeparateOnKarakter12 = (page) =>
    addRecipeRule(page, { type: 'Adskil', column: 'Karakter', value: '12' });

test('Adskil viser en værdi, der ikke findes i kolonnen længere', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Regelvaerdi mangler');
    const line = await addSeparateOnKarakter12(page);

    // Alle med 12 får rettet deres karakter.
    await page.evaluate(() => {
        const s = (window as any).appDebug.state;
        s.currentClass.data.forEach((r: any) => { if (r.Karakter === '12') r.Karakter = '10'; });
    });

    await expect(token(line, 'Værdi')).toHaveText('12 (findes ikke)');
    await expect(token(line, 'Værdi')).toHaveClass(/is-missing/);
});

test('Adskil rydder værdien, når kolonnen skiftes', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Regelvaerdi kolonneskift');
    const line = await addSeparateOnKarakter12(page);

    await pickInToken(page, line, 'Kolonne', 'Køn');

    await expect(token(line, 'Værdi')).toHaveText('vælg værdi');
    const rules = await page.evaluate(() =>
        (window as any).appDebug.state.currentClass.rules.map((r: any) => r.value));
    expect(rules).toEqual(['']);
});

// Samme fælde i kolonne-ordet: en regel på en kolonne, der er slettet siden
// (hentet tilbage med "tag alt med" fra en ældre kørsel eller fra en backup),
// så ud som en almindelig linje, mens motoren meldte "Kolonnen findes ikke".
test('regel-linjen viser en kolonne, der ikke findes længere', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Regelkolonne mangler');
    await page.evaluate(() => {
        (window as any).appDebug.state.currentClass.rules =
            [{ type: 'distribute', column: 'Hold', value: '' }];
    });
    const dialog = await openRecipe(page);
    const line = dialog.locator('.recipe__line--rule').first();
    await expect(token(line, 'Kolonne')).toHaveText('Hold (findes ikke)');
    await expect(token(line, 'Kolonne')).toHaveClass(/is-missing/);
});
