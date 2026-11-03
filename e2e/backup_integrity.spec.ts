import { test, expect } from '@playwright/test';
import { createClass } from './helpers';

test('Ufuldstændig backup downloades med synlig advarsel og læsbare elever', async ({ page }) => {
    await createClass(page, 'Backup Integrity');
    await page.evaluate(() => {
        const filename = (window as any).appDebug.state.currentClass.filename;
        // Ødelæg kun emnekortet efter opstartens oprydning.
        localStorage.setItem(`grupdk_topics_${filename}`, '{');
    });
    await page.locator('.nav-tab').filter({ hasText: 'Import & backup' }).click();
    await page.getByRole('button', { name: 'Eksportér', exact: true }).click();
    await page.getByRole('button', { name: /Vælg alle/i }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download backup/i }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream!) chunks.push(chunk);
    const backup = JSON.parse(Buffer.concat(chunks).toString());
    expect(backup[0].data).toHaveLength(12);
    expect(backup[0].groupTopics).toEqual({});
    await expect(page.getByText(/Filen er ufuldstændig:.*emner kunne ikke læses/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Download backup/i })).toBeEnabled();
    await page.locator('.toast.error').screenshot({ animations: 'disabled', path: `/tmp/grupper-backup-warning-${test.info().project.name}.png` });
});

test('Manglende session giver delvis gendannelse i brugerfladen', async ({ page }) => {
    await createClass(page, 'Restore Integrity');
    await page.locator('.nav-tab').filter({ hasText: 'Import & backup' }).click();
    const backup = [{ filename: 'missing_session.csv', data: [{ Navn: 'Anna', _rowId: 'r1' }],
        id_column: 'Navn', history: [{ id: 'missing', name: 'Modul 1' }], sessions: {} }];
    await page.getByRole('button', { name: 'Upload fil eller gendan backup' }).click();
    await page.setInputFiles('input[type=file]', {
        name: 'missing.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)),
    });
    await page.getByRole('button', { name: /Importér Filer/i }).click();
    await expect(page.getByText(/historik kunne ikke gendannes for missing_session.csv/)).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('grupdk_history_missing_session.csv'))).toBeNull();
});

for (const alreadyExists of [true, false]) {
    test(`Importér som kopi bevarer hver klasse ved navnekollisioner (eksisterende: ${alreadyExists})`, async ({ page }) => {
        await createClass(page, 'Collision Integrity');
        const backup = await page.evaluate((alreadyExists) => {
            const filename = alreadyExists ? (window as any).appDebug.state.currentClass.filename : 'new_class.csv';
            Date.now = () => 1234;
            return ['Bo', 'Cecilie'].map(name => ({ filename, data: [{ Navn: name, _rowId: 'r1' }], id_column: 'Navn' }));
        }, alreadyExists);
        await page.locator('.nav-tab').filter({ hasText: 'Import & backup' }).click();
        await page.getByRole('button', { name: 'Upload fil eller gendan backup' }).click();
        await page.setInputFiles('input[type=file]', {
            name: 'collisions.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)),
        });
        await page.getByRole('button', { name: /Importér Filer/i }).click();
        await page.locator('dialog[open]').screenshot({ animations: 'disabled',
            path: `/tmp/grupper-backup-dialog-${alreadyExists}-${test.info().project.name}.png` });
        await page.getByRole('button', { name: /Importér som kopi/i }).click();
        await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('grupdk_classes') || '[]').length)).toBe(3);
        const classes = await page.evaluate(() => JSON.parse(localStorage.getItem('grupdk_classes') || '[]'));
        expect(classes.map((entry: any) => entry.content.data[0].Navn).sort()).toEqual(['Anna', 'Bo', 'Cecilie']);
    });

}
