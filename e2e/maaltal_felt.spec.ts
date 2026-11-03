import { test, expect, Page } from '@playwright/test';
import { createClassAndGoToGroups, openRecipe } from './helpers';

/** Talfeltet i opskriftens størrelses-ord. */
async function sizeField(page: Page) {
    const dialog = await openRecipe(page);
    await dialog.locator('.rtok__btn[aria-label^="Gruppernes størrelse:"]').click();
    return dialog.locator('.rtok__pop input[type=number]');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Måltalsfeltet — det tal, hele gruppedannelsen hviler på.
//
// Feltet blev før rettet ved hvert tastetryk. Sletter man "4" med backspace
// for at skrive 24, er feltet tomt et øjeblik, og et tomt felt er mindre end
// 1 — så appen skrev et 1-tal ind, og de to cifre landede efter det: 124.
// Tallet er inden for det tilladte, så intet sagde fra.
//
// Værnet her holder de to ting fra hinanden: feltet er i fred mens der
// tastes, og tallet klemmes når feltet forlades.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Måltallet kan tastes forfra uden at appen skriver med', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Maaltal E2E');
    const field = await sizeField(page);
    await expect(field).toHaveValue('4');

    await field.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await expect(field).toHaveValue('');   // feltet må stå tomt mens der tastes

    await page.keyboard.type('24');
    await expect(field).toHaveValue('24');
});

test('Et tomt felt overlever en tænkepause', async ({ page }) => {
    // Den ANDEN vej ind i det samme 1-tal: panelet gemmer indstillingerne 300
    // ms efter sidste tastetryk, og lytteren der fanger ændringer udefra
    // læste sin egen skrivning ind igen, fordi et tomt felt aldrig var "det
    // samme" som det gemte tal. En lærer der slettede "4" og tænkte sig om,
    // fandt et 1-tal i feltet og skrev 124.
    await createClassAndGoToGroups(page, 'Maaltal Pause E2E');
    const field = await sizeField(page);

    await field.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(1200);   // længere end de 300 ms + gem
    await expect(field).toHaveValue('');

    await page.keyboard.type('24');
    await expect(field).toHaveValue('24');
});

test('Måltallet klemmes til 1-999, når feltet forlades', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Maaltal Klem E2E');
    const field = await sizeField(page);

    const typeAndLeave = async (text: string) => {
        await field.click();
        await page.keyboard.press('ControlOrMeta+a');
        if (text) await page.keyboard.type(text);
        else await page.keyboard.press('Backspace');
        await page.keyboard.press('Tab');
    };

    await typeAndLeave('');
    await expect(field).toHaveValue('1');

    await typeAndLeave('0');
    await expect(field).toHaveValue('1');

    await typeAndLeave('1000');
    await expect(field).toHaveValue('999');
});
