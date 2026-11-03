import { test, expect } from '@playwright/test';
import { createClass } from './helpers';

// Toasts ligger i højre side — præcis hvor topbarens ikoner sidder — og en
// fejlbesked bliver stående til den klikkes væk. Lå den oven på baren, var
// Nyheder, guide, GDPR, hjælp og tema-knappen utilgængelige, indtil man fandt
// det lille kryds. Placeringen måles derfor, ikke bare skrives ned.
for (const [viewportLabel, viewportWidth, viewportHeight] of [['desktop', 1280, 720], ['mobil', 375, 812]] as const) {
    test(`Toast lægger sig under topbaren, ikke oven på den — ${viewportLabel}`, async ({ page }) => {
        await page.setViewportSize({ width: viewportWidth, height: viewportHeight });
        await page.goto('/');

        // En lang, blivende besked — den slags der dækkede mest.
        await page.evaluate(() => (window as any).notifyError(
            'Testbesked der er lang nok til at fylde flere linjer, ' +
            'så toasten får sin fulde højde og et reelt overlap ville vise sig.'
        ));

        const toast = page.locator('.toast').first();
        await expect(toast).toBeVisible();

        const t = (await toast.boundingBox())!;
        const bar = (await page.locator('.topbar').boundingBox())!;
        expect(t.y).toBeGreaterThanOrEqual(bar.y + bar.height);

        // Ingen af topbarens knapper må ligge under toasten.
        const topbarButtons = page.locator('.topbar-icon');
        for (let i = 0; i < await topbarButtons.count(); i++) {
            const k = (await topbarButtons.nth(i).boundingBox())!;
            const overlap = k.x < t.x + t.width && k.x + k.width > t.x
                && k.y < t.y + t.height && k.y + k.height > t.y;
            expect(overlap, `topbar-knap ${i} er dækket af toasten`).toBe(false);
        }
    });
}

// I klassevisningen ligger båndet lige under topbaren — Emner, Regler og
// Generér i Grupper-fanen, Elev/Kolonne/Flyt/Slet i elevlisten. Stakken lå
// oven på dem: en besked efter en gruppedannelse dækkede Generér, og læreren
// kunne ikke danne grupper igen, før den var væk (målt 23/9 på 1280×720).
for (const [viewportLabel, viewportWidth, viewportHeight] of [['desktop', 1280, 720], ['mobil', 375, 812]] as const) {
    test(`Toast lægger sig under båndet i begge faner — ${viewportLabel}`, async ({ page }) => {
        await page.setViewportSize({ width: viewportWidth, height: viewportHeight });
        await createClass(page, 'Toast under baandet');

        for (const tab of ['Elevliste', 'Grupper']) {
            await page.locator('.nav-tab').filter({ hasText: tab }).click();
            const band = page.locator(tab === 'Grupper' ? '.groups-header-sticky' : '.students-header-sticky');
            await expect(band).toBeVisible();
            await page.evaluate(() => (window as any).notifyError(
                'Fordel på \'Køn\' kan ikke gå helt op: 14 elever har værdien \'Pige\', og der er kun plads til 12.'));

            await expect(page.locator('.toast').last()).toBeVisible();
            // HELE stakken — også "Klasse oprettet!" og beskeden fra forrige
            // fane — skal ligge under båndet. Den øverste er den, der dækkede.
            const b = (await band.boundingBox())!;
            const tops = await page.locator('.toast').evaluateAll(els =>
                els.map(e => e.getBoundingClientRect().top));
            for (const top of tops) {
                expect(top, `toasten dækker båndet i ${tab}`).toBeGreaterThanOrEqual(b.y + b.height);
            }
        }
    });
}

// "Klasse oprettet!" kommer, MENS appen skifter til klassevisningen — før
// båndet findes. Stakken blev målt i det øjeblik og stod derfor oven på det
// bånd, der dukkede op lige efter: Generér var dækket i 5,6 sekunder (målt
// 23/9 i testen af en klasse på 120 elever).
test('En besked fra FØR båndet fandtes, flytter ned under det', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await createClass(page, 'Toast foer baandet');
    await expect(page.locator('.toast').first()).toBeVisible();
    const band = (await page.locator('.students-header-sticky').boundingBox())!;
    await expect.poll(async () => Math.min(...await page.locator('.toast').evaluateAll(
        els => els.map(e => e.getBoundingClientRect().top))), { timeout: 2000 })
        .toBeGreaterThanOrEqual(band.y + band.height);
});
