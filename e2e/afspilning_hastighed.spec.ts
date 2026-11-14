import { test, expect, Page } from '@playwright/test';
import { createClassAndGoToGroups, generateGroups } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hastighedsfeltet i "Se kørslen" skrives ikke om, mens læreren taster
// (139. gennemsyn, tematik (142)).
//
// Før 14/11 2026 var feltet bundet direkte til den gemte hastighed, som altid
// er et helt tal mellem 1 og 2000. Slettede læreren tallet for at skrive et
// nyt, blev det tomme felt læst som "intet tal", hastigheden sat til 60, og
// feltet viste straks 60 igen. Skrev læreren så "5", stod der "605".
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const speedOf = (page: Page) => page.evaluate(() => (window as any).appDebug.state.replay?.speed);

async function openReplay(page: Page, name: string) {
    await createClassAndGoToGroups(page, name);
    await generateGroups(page);
    await page.locator('.replay-anchor .action-pill').click();
    await page.locator('.replay-menu .start').click();
    await expect(page.locator('.replay-menu .play-toggle')).toBeVisible();
    return page.getByLabel('Hastighed i millisekunder pr. bytte');
}

test('et slettet tal kan skrives forfra', async ({ page }) => {
    const field = await openReplay(page, 'Afspilning hastighed');
    await field.focus();
    await page.keyboard.press('End');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace');
    await expect(field).toHaveValue('');
    await page.keyboard.type('5');
    await expect(field).toHaveValue('5');
    await expect.poll(() => speedOf(page)).toBe(5);
});

test('et tal over grænsen rettes først, når feltet forlades', async ({ page }) => {
    const field = await openReplay(page, 'Afspilning graense');
    await field.fill('');
    await field.pressSequentially('3000');
    await expect(field).toHaveValue('3000');
    // Det, der gælder, er allerede det højeste tilladte.
    await expect.poll(() => speedOf(page)).toBe(2000);
    await field.blur();
    await expect(field).toHaveValue('2000');
});

test('et tomt felt får den gældende hastighed tilbage, når det forlades', async ({ page }) => {
    const field = await openReplay(page, 'Afspilning tomt');
    await field.fill('250');
    await expect.poll(() => speedOf(page)).toBe(250);
    await field.fill('');
    await field.blur();
    await expect(field).toHaveValue('250');
    await expect.poll(() => speedOf(page)).toBe(250);
});
