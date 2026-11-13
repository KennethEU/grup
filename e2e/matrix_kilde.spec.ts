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

// (93), 109. gennemsyn: en gammel "Opdel" i matrix-reglerne (fra en ældre
// udgave eller en importeret klasse) gør ingenting — motoren får den aldrig.
// Opskriften siger det nu og har en knap, der fjerner den.
test('en gammel Opdel i matrix-reglerne: advarsel i opskriften og "Fjern reglen"', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Matrix opdel');
    await generateGroups(page);
    await goToMatrix(page);
    const dialog = page.locator('dialog.recipe-dialog[open]');
    await expect(dialog).toBeVisible();

    const column = await page.evaluate(() => {
        const cls = (window as any).appDebug.state.currentClass;
        const col = cls.columns.find((c: string) => c !== 'Navn' && !c.startsWith('_')) || cls.columns[0];
        cls.matrixRules = [...(cls.matrixRules || []), { type: 'aggregate', column: col }];
        return col;
    });

    const hint = dialog.locator('.gh-hint').filter({ hasText: 'gør ingenting i matrix-runden' });
    await expect(hint).toContainText(`Opdel på "${column}"`);
    // (94), 110. gennemsyn: linjen selv står dæmpet og gennemstreget, så den
    // ikke ligner en regel, der virker.
    const ignored = dialog.locator('.recipe__line--rule.is-ignored');
    await expect(ignored).toHaveCount(1);
    await expect(ignored.locator('.recipe__text')).toHaveCSS('text-decoration-line', 'line-through');
    await hint.screenshot({ animations: 'disabled', path: `/tmp/grupper-matrix-opdel-${test.info().project.name}.png` });
    await dialog.screenshot({ animations: 'disabled', path: `/tmp/grupper-matrix-opdel-hele-${test.info().project.name}.png` });

    await hint.getByRole('button', { name: 'Fjern reglen' }).click();
    await expect(hint).toHaveCount(0);
    await expect(ignored).toHaveCount(0);
    const types = await page.evaluate(() =>
        (window as any).appDebug.state.currentClass.matrixRules.map((r: any) => r.type));
    expect(types).not.toContain('aggregate');
});
