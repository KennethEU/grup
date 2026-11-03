import { test, expect, Page } from '@playwright/test';
import { createClassAndGoToGroups, generateGroups, openRecipe, closeRecipe } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Browserens Tilbage/Frem lukker et åbent vindue, når fanen skifter.
//
// Tilbage-knappen, et swipe og Alt+← / ⌘[ sender intet tryk ind i siden, så
// vinduerne i ModalsRoot (Gendan, Gem i Historik, Aftaler …) blev stående over
// den nye fane. Målt 3/11: "Gendan grupper" stod over Elevlisten — en
// gendannelse dér skiftede grupperne ud, uden at læreren kunne se dem — og
// Frem igen viste stadig vinduet.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const tab = (page: Page) => page.evaluate(() => (window as any).appDebug.state.classViewTab);

async function expectNoWindow(page: Page) {
    await expect(page.locator('.modal-overlay, .avoid-modal-backdrop')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveClass(/\bhas-modal\b/);
}

test('Tilbage med "Gendan grupper" åben lukker vinduet', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Vindue tilbage');
    await generateGroups(page);
    await closeRecipe(page);
    await page.locator('.action-pill').filter({ hasText: 'Gendan' }).click();
    await expect(page.locator('.modal-overlay')).toBeVisible();

    await page.goBack();
    await expect.poll(() => tab(page)).toBe('students');
    await expectNoWindow(page);

    // Frem igen: grupperne, ikke vinduet
    await page.goForward();
    await expect.poll(() => tab(page)).toBe('groups');
    await expect(page.locator('.group-card').first()).toBeVisible();
    await expectNoWindow(page);
});

// Aftaler åbnet fra opskriften åbner opskriften igen, når det lukkes. Lukkes
// det af Tilbage, må opskriften IKKE komme igen — hverken på Elevlisten eller
// når læreren trykker Frem til grupperne (som har grupper, så opskriften
// ikke åbner af sig selv).
test('Tilbage med Aftaler fra opskriften lukker uden at åbne opskriften', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Aftale tilbage');
    await page.evaluate(() => {
        const c = (window as any).appDebug.state.currentClass;
        c.togetherGroups = [{ ids: c.data.slice(0, 2).map((r: any) => r._rowId) }];
    });
    await generateGroups(page);
    await openRecipe(page);
    await page.locator('.recipe-tokenlike').click();
    await expect(page.locator('.avoid-modal-backdrop')).toBeVisible();

    await page.goBack();
    await expect.poll(() => tab(page)).toBe('students');
    await expectNoWindow(page);

    await page.goForward();
    await expect.poll(() => tab(page)).toBe('groups');
    await expect(page.locator('.group-card').first()).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page.locator('dialog.recipe-dialog[open]')).toHaveCount(0);
    await expectNoWindow(page);
});

// "Vis for klassen" fjerner sit eget skridt i historikken, når det lukkes
// (history.back()). Den popstate lander på samme fane og må ikke lukke andet.
test('"Vis for klassen" lukket med Luk lader fanen stå', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Vis tilbage');
    await generateGroups(page);
    await closeRecipe(page);
    await page.getByRole('button', { name: /Vis for klassen/ }).click();
    await expect(page.locator('.show')).toBeVisible();
    await page.locator('.show').getByRole('button', { name: 'Luk' }).click();
    await expect(page.locator('.show')).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(await tab(page)).toBe('groups');
    await expect(page.locator('.group-card').first()).toBeVisible();
});
