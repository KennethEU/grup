import { test, expect } from '@playwright/test';
import { createClassAndGoToGroups, generateGroups, goToMatrix, clickGenerate } from './helpers';

// Matrixens tomme felt sagde altid "Generér stamgrupper først" — også når de
// fandtes, og matrixen bare ikke kunne dannes (en hel stamgruppe fraværende).
// Så pegede teksten på et skridt, læreren allerede havde taget.

test('matrixens tomme felt nævner ikke stamgrupper, der allerede findes', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Matrix tom');
    const empty = page.locator('#matrix-display .empty-state');

    await generateGroups(page);
    // Hele første stamgruppe meldes fraværende → "Fuld repræsentation" giver 0.
    await page.evaluate(() => {
        const s = (window as any).appDebug.state;
        const ids = new Set(s.storedStandardGroups[0].members.map((m: any) => typeof m === 'object' ? m.id : m));
        s.currentClass.data.forEach((r: any) => { r._excluded = ids.has(r._rowId); });
    });
    await goToMatrix(page);
    // Matrix-runden danner intet af sig selv: læreren trykker "Dan matrixgrupper"
    await clickGenerate(page);

    // Motoren siger, hvilken stamgruppe der er tom (med lærerens navn for gruppen).
    await expect(page.getByText('Stamgruppen "Gruppe 1" har ingen elever').first()).toBeVisible();
    await expect(empty).toContainText('Tryk Dan matrixgrupper');
    await expect(empty).not.toContainText('stamgrupper først');
});
