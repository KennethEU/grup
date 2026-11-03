import { test, expect } from '@playwright/test';
import { createClass } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DEN GENDANNEDE KLASSE ER DEN, DER ÅBNES.
//
// Efter en import åbnede appen altid den SIDSTE klasse i listen. Det holder
// for en ny klasse, men "Overskriv mine" skriver klassen på dens gamle
// plads: læreren gendannede 2.a og landede i 3.b — og så lignede det, at
// gendannelsen ikke var sket.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('"Overskriv mine" åbner den gendannede klasse, ikke den sidste i listen', async ({ page }) => {
    await createClass(page, '2a');
    const first = await page.evaluate(() => (window as any).appDebug.state.currentClass.filename);

    // En klasse mere, så 2a ikke længere står sidst.
    await page.evaluate(() => (window as any).appDebug.pyBridge.createClass('3b', 'Navn\nBo\n', true));

    const backup = JSON.stringify([{
        filename: first,
        name: '2a gendannet',
        data: [{ Navn: 'Cecilie', _rowId: 'r1' }],
        columns: ['Navn'],
        rules: [],
        id_column: 'Navn',
    }]);

    await page.locator('.nav-tab').filter({ hasText: 'Import & backup' }).click();
    await page.getByRole('button', { name: 'Importér', exact: true }).click();
    await page.getByRole('button', { name: 'Upload fil eller gendan backup' }).click();
    await page.setInputFiles('input[type=file]', {
        name: 'backup.json',
        mimeType: 'application/json',
        buffer: Buffer.from(backup),
    });
    await page.getByRole('button', { name: /Importér Filer/i }).click();
    await page.getByRole('button', { name: 'Overskriv mine' }).click();

    await expect.poll(async () => await page.evaluate(() => {
        const cls = (window as any).appDebug.state.currentClass;
        return cls && { filename: cls.filename, name: cls.data?.[0]?.Navn };
    }), { timeout: 15000 }).toEqual({ filename: first, name: 'Cecilie' });
    await expect(page.locator('.class-trigger')).toContainText('2a gendannet');
});
