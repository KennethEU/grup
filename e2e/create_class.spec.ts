import { test, expect } from '@playwright/test';
import { gotoAppReady } from './helpers';

test('Opret en ny klasse ved at indsætte en liste', async ({ page }) => {
    await gotoAppReady(page);

    // 1. Velkomstskærmen har en genvej til at indsætte en liste
    await page.getByRole('button', { name: 'Indsæt klasseliste fra Excel / Sheets' }).click();

    // 2. Skift til at indsætte (vinduet åbner med upload)
    await page.getByRole('button', { name: 'Indsæt tekst / Excel' }).click();

    // 3. Udfyld navn og liste
    const nameInput = page.getByPlaceholder('F.eks. 1.g Dansk');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill('Playwright Test Klasse');

    const csvData = `Navn,Køn,Matematik\nPeter,M,10\nAnna,K,12\nJens,M,7`;
    await page.locator('textarea:visible').first().fill(csvData);

    // 4. Tryk Opret
    await page.getByRole('button', { name: /Opret klasse/i }).click();

    // 5. Beskeden om, at klassen er oprettet
    const toast = page.locator('.toast.success');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Klasse oprettet');

    // 6. Klassens data står i hovedvisningen
    await expect(page.locator('th').filter({ hasText: 'Navn' })).toBeVisible();
    // exact: afkrydsningerne i rækken hedder nu "Vælg Peter" og "Peter er til
    // stede", så en løs søgning rammer tre celler.
    await expect(page.getByRole('cell', { name: 'Peter', exact: true })).toBeVisible();

    // 7. Klassen er valgt i topbjælkens klassevælger
    await expect(page.getByRole('banner')).toContainText('Playwright Test Klasse');
});
