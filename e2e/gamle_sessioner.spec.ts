import { test, expect } from '@playwright/test';

/**
 * GDPR-siden og privatlivspolitikken lover, at gemte sessioner højst lever
 * 90 dage. Før blev det kun holdt, når læreren gemte en ny session i netop
 * den klasse — en klasse fra august, der aldrig blev åbnet igen, beholdt sine
 * sessioner (med elevnavne) for evigt. Nu luges der ud ved hver opstart
 * (storage.pruneStaleHistories, kaldt fra AppTopbar).
 */
test('en session over 90 dage i en klasse, der ikke åbnes, er væk efter opstart', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
        const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
        const put = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
        localStorage.clear();
        put('grupdk_classes', [
            { filename: 'nu.csv', name: 'Nu', content: { data: [{ Navn: 'Bo' }], columns: ['Navn'] } },
            { filename: 'august.csv', name: 'August', content: { data: [{ Navn: 'Anna' }], columns: ['Navn'] } },
        ]);
        localStorage.setItem("grupdk_last_class", "nu.csv");
        put('grupdk_history_august.csv', [
            { id: 'gammel', date: daysAgo(120), name: 'Gammel' },
            { id: 'frisk', date: daysAgo(10), name: 'Frisk' },
        ]);
        put('grupdk_session_gammel', { id: 'gammel', groups: [{ name: 'Gruppe 1', members: [{ Navn: 'Anna' }] }] });
        put('grupdk_session_frisk', { id: 'frisk', groups: [{ name: 'Gruppe 1', members: [{ Navn: 'Anna' }] }] });
    });

    await page.reload();
    await expect(page.locator('.class-trigger')).toBeVisible();

    const after = await page.evaluate(() => ({
        history: JSON.parse(localStorage.getItem('grupdk_history_august.csv') || 'null'),
        old: localStorage.getItem('grupdk_session_gammel'),
        fresh: localStorage.getItem('grupdk_session_frisk'),
    }));
    expect(after.history.map((e: { id: string }) => e.id)).toEqual(['frisk']);
    expect(after.old).toBeNull();
    expect(after.fresh).not.toBeNull();
});
