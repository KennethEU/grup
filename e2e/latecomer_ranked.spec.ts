import { test, expect, Page } from '@playwright/test';
import { createClass, goToGroups, generateGroups } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "Tilføj efternøler" med Balancér på en RANGERET tekstkolonne (fund 24/9).
//
// Gruppedannelsen regner "Lav < Middel < Høj" om til 1, 2, 3, men
// placeringen læste cellen direkte: "Høj" var ikke et tal, reglen blev
// sprunget over, og en lodtrækning afgjorde, hvor eleven kom hen.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.setTimeout(120000);

const CSV =
    'Navn\tNiveau\n' +
    'Anna\tLav\nBob\tLav\nClara\tHøj\nDavid\tHøj\nEmma\tHøj';

/** Emma meldes fraværende og tages ud af sin gruppe; G1 = de lave, G2 = de høje. */
async function arrange(page: Page) {
    await page.evaluate(() => {
        const state = (window as any).appDebug.state;
        const idOf = (name: string) =>
            state.currentClass.data.find((s: any) => s.Navn === name)._rowId;
        const [g1, g2] = state.storedStandardGroups;
        g1.members = [idOf('Anna'), idOf('Bob')];
        g2.members = [idOf('Clara'), idOf('David')];
        state.storedStandardGroups.slice(2).forEach((g: any) => { g.members = []; g.locked = true; });
        state.currentClass.data.find((s: any) => s.Navn === 'Emma')._excluded = true;
    });
}

test('En efternøler med "Høj" sættes i gruppen med de lave — hver gang', async ({ page }) => {
    await createClass(page, 'Efternøler rangeret', CSV);
    await page.evaluate(() => {
        const cls = (window as any).appDebug.state.currentClass;
        cls.columnOrders = { Niveau: ['Lav', 'Middel', 'Høj'] };
        cls.rules = [{ type: 'balance', column: 'Niveau' }];
        cls.settings = { ...(cls.settings || {}), groupTarget: '2', groupMod: '+' };
    });
    await goToGroups(page);
    await generateGroups(page);

    const groupOf = () => page.evaluate(() => {
        const state = (window as any).appDebug.state;
        const emma = state.currentClass.data.find((s: any) => s.Navn === 'Emma')._rowId;
        const g = state.storedStandardGroups.find((x: any) =>
            x.members.some((m: any) => String(m?.id ?? m) === emma));
        return g ? state.storedStandardGroups.indexOf(g) : -1;
    });

    // Lodtrækning mellem to lige store grupper: med fejlen rammer fem forsøg
    // i træk kun G1 med sandsynlighed 1/32.
    for (let i = 0; i < 5; i++) {
        await arrange(page);
        // Toasts forsvinder af sig selv — luk dem i ét greb i siden, så en
        // der når at gå, ikke efterlader Playwright ventende på den.
        await page.locator('.toast .toast-close').evaluateAll(els => els.forEach(e => (e as HTMLElement).click()));
        await expect(page.locator('.toast').filter({ hasText: 'Tilføjet' })).toHaveCount(0);
        await page.getByRole('button', { name: 'Tilføj efternøler' }).click();
        await page.locator('.student-item').filter({ hasText: 'Emma' })
            .locator('input[type="checkbox"]').check();
        await page.locator('.btn-confirm').click();
        await expect(page.locator('.toast').filter({ hasText: 'Tilføjet' }).first()).toBeVisible();
        expect(await groupOf()).toBe(0);
    }
});
