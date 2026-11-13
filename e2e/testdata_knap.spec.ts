import { test, expect } from '@playwright/test';
import { gotoAppReady } from './helpers';

// "Prøv med testdata" på forsiden (DashboardView.vue). Kunne testklassen ikke
// skrives (fuld lagerplads), sagde den alligevel "Testklasse oprettet med 28
// elever!": gendannelsen lægger en fejlet klasse i `failed`, ikke i `error`
// (109. gennemsyn, 13/11 2026). Kun Chromium: kvoten er forskellig fra
// browser til browser.
test('fuldt lager: testdata giver en fejl, ikke en kvittering', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Kvoten måles kun i Chromium');
    await gotoAppReady(page);
    const button = page.getByRole('button', { name: 'Prøv med testdata' });
    await expect(button).toBeVisible();

    await page.evaluate(() => {
        const fill = (chunk: number) => {
            const value = 'x'.repeat(chunk);
            for (let i = 0; ; i++) {
                try { localStorage.setItem(`filler_${chunk}_${i}`, value); } catch { return; }
            }
        };
        fill(500_000);
        fill(10_000);
        fill(100);
    });

    await button.click();
    // Kun beskederne: nyhederne (i det lukkede vindue) citerer den gamle tekst.
    const toasts = page.locator('.toast');
    await expect(toasts.filter({ hasText: 'Testklassen kunne ikke oprettes' })).toBeVisible();
    await expect(toasts.filter({ hasText: 'Testklasse oprettet' })).toHaveCount(0);
});
