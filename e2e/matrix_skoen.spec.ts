import { test, expect } from '@playwright/test';
import { createClassAndGoToGroups, generateGroups, goToMatrix, openRecipe, clickGenerate } from './helpers';

// Matrix-opskriftens skøn ("→ 3 matrixgrupper") ved "Én fra hver" skal være
// det antal, motoren danner — også når en matrixgruppe er låst. Før regnede
// skønnet, som om de låste elever skulle fordeles igen: her stod der 4, og
// der kom 3 (13/11 2026). Regnestykket holdes op mod motoren i
// matrixVsEngine.test.js; testen her viser, at vinduet bruger det.
test('matrix-skønnet tæller de låste matrixgrupper, og motoren danner det samme antal', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Matrix skøn');
    await generateGroups(page);                     // 12 elever → 3 stamgrupper på 4
    await goToMatrix(page);
    await generateGroups(page);                     // 4 matrixgrupper på 3
    const cards = page.locator('#matrix-display .group-card').filter({ visible: true });
    await expect(cards).toHaveCount(4);

    // Lås matrixgruppe 1, og flyt en elev mere fra SAMME stamgruppe ind i den.
    // Så har den stamgruppe kun 2 frie elever tilbage: 2 nye + den låste = 3.
    await page.evaluate(() => {
        const s: any = (window as any).appDebug.state;
        const idOf = (m: any) => (typeof m === 'object' ? m.id : m);
        const home = s.storedStandardGroups[0].members.map(idOf);
        const [first, second] = s.storedMatrixGroups;
        first.locked = true;
        const at = second.members.findIndex((m: any) => home.includes(idOf(m)));
        first.members.push(...second.members.splice(at, 1));
    });

    const dialog = await openRecipe(page);
    await expect(dialog.locator('.recipe__note').first()).toContainText('→ 3 matrixgrupper');

    await clickGenerate(page);
    await expect(cards).toHaveCount(3);
});

// Skønnet i antal-tilstand delte eleverne med det TASTEDE antal: 30 grupper
// til 12 elever gav "ca. 0,4 elever pr. gruppe". Motoren danner aldrig flere
// grupper end elever (her 12 med én i hver), og det er det tal, skønnet bruger nu.
test('skønnet i antal-tilstand regner på de grupper, der bliver dannet', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Antal skøn');
    const dialog = await openRecipe(page);
    await dialog.locator('.rtok__btn[aria-label^="Gruppernes størrelse:"]').click();
    const pop = dialog.locator('.rtok__pop');
    await pop.getByRole('button', { name: 'Antal grupper' }).click();
    await pop.locator('input[type=number]').fill('30');
    await expect(pop.locator('.recipe-pop-note')).toHaveText('ca. 1 elev pr. gruppe');
    await pop.locator('input[type=number]').fill('5');
    await expect(pop.locator('.recipe-pop-note')).toHaveText('ca. 2,4 elever pr. gruppe');
});
