import { test, expect } from '@playwright/test';
import { createClassAndGoToGroups, generateGroups, goToMatrix } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Matrix-opskriftens "Stamgruppe"/"Emne" (104. gennemsyn, 13/11 2026).
//
// Har stamgrupperne ingen emner, kan der kun blandes på stamgrupperne, og
// panelet viser "Stamgruppe". Når indstillingerne blev skiftet ud, mens panelet
// stod fremme ("Ja, tag alt med" i kørselshistorikken, med en kørsel uden det
// valg gemt), læste panelet "Emne" ind — knappen var slået fra, men valgt, og
// sætningen sagde "én fra hvert emne". Det viste valg kommer nu fra
// shownMatrixRepType() i recipe.js, samme regel hver gang.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function openMix(page) {
    const dialog = page.locator('dialog.recipe-dialog[open]');
    await expect(dialog).toBeVisible();
    const pop = dialog.locator('.rtok__pop');
    if (!(await pop.count())) await dialog.locator('.rtok__btn[aria-label^="Sådan blandes der:"]').click();
    await expect(pop).toBeVisible();
    return { dialog, pop };
}

test('uden emner viser matrix-opskriften "Stamgruppe" — også når indstillingerne skiftes ud', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Matrix kilde');
    await generateGroups(page);
    await goToMatrix(page);

    let { dialog, pop } = await openMix(page);
    await expect(pop.getByRole('button', { name: 'Stamgruppe' })).toHaveAttribute('aria-pressed', 'true');
    await expect(pop.getByRole('button', { name: 'Emne' })).toBeDisabled();

    // Som restoreRun: et helt nyt matrixSettings-objekt uden valget.
    await page.evaluate(() => {
        (window as any).appDebug.state.currentClass.matrixSettings = {
            groupMode: 'size', groupTarget: 4, groupMod: '+', matrixStrategy: 'full_strict',
        };
    });

    await expect(dialog.locator('.recipe__line').first()).toContainText('én fra hver stamgruppe');
    ({ pop } = await openMix(page));
    await expect(pop.getByRole('button', { name: 'Stamgruppe' })).toHaveAttribute('aria-pressed', 'true');
    await expect(pop.getByRole('button', { name: 'Emne' })).toHaveAttribute('aria-pressed', 'false');
});
