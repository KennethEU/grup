import { test, expect } from '@playwright/test';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EN ULÆSELIG KLASSELISTE SKRIVES IKKE VÆK AF EN GENDANNELSE.
//
// Kan klasselisten ikke læses, peger beskeden på "Import & backup". Før
// skrev gendannelsen en ny liste med kun backuppens klasse oven i de gamle
// bytes, og ved næste opstart slettede oprydningen grupperne og historikken
// for alle de andre klasser. Nu lægges den gamle liste til side først
// (grupdk_unreadable_classes), og oprydningen venter.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BROKEN = '[{"filename":"3a.csv","name":"3a" ØDELAGT';

test('gendan backup over en ulæselig klasseliste — de gamle data overlever genindlæsningen', async ({ page }) => {
    await page.goto('/');
    await page.evaluate((broken) => {
        localStorage.clear();
        localStorage.setItem('grupdk_classes', broken);
        localStorage.setItem('grupdk_groups_3a.csv', JSON.stringify({ standard: [{ name: 'Gruppe 1', members: ['r1'] }], matrix: [] }));
        localStorage.setItem('grupdk_history_3a.csv', JSON.stringify([{ id: 's1', name: 'Mandag', date: new Date().toISOString() }]));
        localStorage.setItem('grupdk_session_s1', JSON.stringify({ id: 's1', groups: [] }));
    }, BROKEN);
    await page.reload();
    await page.waitForFunction(() => (window as any).appDebug?.pyBridge);

    const backup = JSON.stringify([{
        filename: '2b.csv', name: '2b', data: [{ Navn: 'Cecilie', _rowId: 'r1' }],
        columns: ['Navn'], rules: [], id_column: 'Navn',
    }]);
    await page.locator('.nav-tab').filter({ hasText: 'Import & backup' }).click();
    await page.getByRole('button', { name: 'Importér', exact: true }).click();
    await page.getByRole('button', { name: 'Upload fil eller gendan backup' }).click();
    await page.setInputFiles('input[type=file]', {
        name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup),
    });
    await page.getByRole('button', { name: /Importér Filer/i }).click();
    await expect.poll(async () => await page.evaluate(() =>
        (window as any).appDebug.state.currentClass?.filename), { timeout: 15000 }).toBe('2b.csv');

    // Næste opstart: listen kan læses igen og kender kun 2b.
    await page.reload();
    await page.waitForFunction(() => (window as any).appDebug?.pyBridge);
    const left = await page.evaluate(() => ({
        rescue: localStorage.getItem('grupdk_unreadable_classes'),
        groups: localStorage.getItem('grupdk_groups_3a.csv') !== null,
        history: localStorage.getItem('grupdk_history_3a.csv') !== null,
        session: localStorage.getItem('grupdk_session_s1') !== null,
    }));
    expect(left).toEqual({ rescue: BROKEN, groups: true, history: true, session: true });
});
