import { test, expect } from '@playwright/test';
import { gotoAppReady } from './helpers';

test('Vue-visningerne indlæses', async ({ page }) => {
    // Vent, til appen er helt klar — skifter testen visning,
    // mens opstarten stadig kører, bliver den nulstillet under den.
    await gotoAppReady(page);

    // Topbjælkens ikonknapper har deres navn fra title (tilgængeligt navn).
    // Visningerne hentes først, når de åbnes, så første gang får ekstra tid.
    await page.getByRole('button', { name: 'Pædagogisk guide' }).click();
    const eduView = page.locator('#view-edu-guide');
    await expect(eduView).toBeVisible({ timeout: 10000 });
    await expect(eduView).toContainText('Pædagogisk vejledning');
    await expect(eduView).toContainText('Denne guide hjælper dig');

    await page.getByRole('button', { name: 'Privatliv & GDPR' }).click();
    const gdprView = page.locator('#view-gdpr');
    await expect(gdprView).toBeVisible({ timeout: 10000 });
    await expect(gdprView).toContainText('GDPR & datasikkerhed');
    await expect(gdprView).toContainText('Elevernes oplysninger forlader aldrig din computer');
    // De to ting siden IKKE må holde op med at sige. Den første stod her fra
    // 2/9 som en indrømmelse — Python-motoren blev hentet fra jsDelivr, og lærerens
    // IP gik med. Fra 9/9 ligger motoren på dida.dk, og sætningen er vendt om:
    // nu er den et LØFTE om, at intet forlader dida.dk. Ændres det tilbage,
    // skal siden sige det igen. Den anden er den automatiske sletning af gemte
    // sessioner under overskriften "Hvornår slettes data?".
    await expect(gdprView).toContainText('ingen andre end');
    await expect(gdprView).toContainText('90 dage');

    await page.getByRole('button', { name: 'Om programmet' }).click();
    const helpView = page.locator('#view-help');
    await expect(helpView).toBeVisible({ timeout: 10000 });
    await expect(helpView).toContainText('Om grup.dk');
    await expect(helpView).toContainText('Credits & Licens');
});
