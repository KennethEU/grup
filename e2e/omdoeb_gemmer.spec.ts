import { test, expect, Page } from '@playwright/test';
import { createClass, addRecipeRule, closeRecipe, goToGroups } from './helpers';

/**
 * At omdøbe den åbne klasse må ikke æde lærerens sidste ændring.
 *
 * Opskriften gemmer en ny regel efter 1 sek. (BetaGroupsTab.debouncedAutoSave).
 * Indtil da findes reglen KUN på klassen i hukommelsen. Før 124. gennemsyn
 * hentede omdøbningen klassen forfra fra lageret og satte den nye udgave ind
 * på skærmen — uden reglen. Når det ventende gem så kørte, var der intet nyt
 * at gemme, og reglen var væk uden en lyd. Nu skiftes kun navnet.
 *
 * Testen omdøber med vilje hurtigere, end forsinkelsen er lang.
 */

/** Klassens gemte udgave i lageret, slået op på filnavnet (navnet skifter). */
function storedByFilename(page: Page, filename: string) {
    return page.evaluate((f) => {
        const list = JSON.parse(localStorage.getItem('grupdk_classes') || '[]');
        return list.find((c: any) => c.filename === f) ?? null;
    }, filename);
}

async function renameOpenClass(page: Page, oldName: string, newName: string) {
    await page.locator('.class-trigger').click();
    const row = page.locator('.class-list .class-item').filter({ hasText: oldName }).first();
    await row.locator('.rename-btn, button[title*="Omdøb"]').first().click();
    const input = page.locator('.modal-overlay input[type="text"]').first();
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill(newName);
    await page.getByRole('dialog').getByRole('button', { name: /^(Gem|OK|Omdøb)$/ }).first().click();
}

test('en ny regel overlever en hurtig omdøbning af den åbne klasse', async ({ page }) => {
    await createClass(page, '2a Omdøb');
    await goToGroups(page);
    const filename = await page.evaluate(() => JSON.parse(localStorage.getItem('grupdk_classes') || '[]')
        .find((c: any) => c.name === '2a Omdøb')?.filename);
    expect(filename).toBeTruthy();

    await addRecipeRule(page);
    await closeRecipe(page);
    // Straks — før den ene sekunds forsinkelse er gået
    await renameOpenClass(page, '2a Omdøb', '2a Nyt');
    await expect(page.locator('.class-trigger')).toContainText('2a Nyt');

    // Vent til forsinkelsen er gået, og lidt til
    await page.waitForTimeout(1500);
    const stored = await storedByFilename(page, filename);
    expect(stored?.name).toBe('2a Nyt');
    expect(stored?.content?.rules?.length ?? 0).toBe(1);

    // …og skærmen viser stadig reglen efter en genindlæsning
    await page.reload();
    await expect(page.locator('.class-trigger')).toContainText('2a Nyt', { timeout: 30000 });
    const after = await storedByFilename(page, filename);
    expect(after?.content?.rules?.length ?? 0).toBe(1);
});
