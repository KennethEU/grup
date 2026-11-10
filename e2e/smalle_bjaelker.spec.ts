import { test, expect } from '@playwright/test';
import { createClass, goToGroups, addRecipeRule, addTopics, generateGroups, closeRecipe } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Bjælkerne i smalle vinduer (10/11 2026, 68. gennemsyn).
//
// 1) Opskriftens bjælke på Grupper: handlingerne (elevtal, Matrix-runde, Vis
//    for klassen, Dan grupper igen) stod som løse led i bjælken. Ved 1.024 px
//    faldt "Dan grupper igen" alene ned i VENSTRE side af en ny række, mens
//    "Matrix-runde" blev stående ovenover til højre. Nu er de én gruppe, der
//    flytter samlet og står til højre (RecipeLayout.vue, .recipe-bar__actions).
// 2) Topbjælken mellem 701 og 900 px: klassenavnet fik 34 px ved 850 px og
//    0 px under 800 px, og under 780 px lå klassepillen oven i ikonerne. Nu
//    bliver topbjælken to rækker allerede under 900 px (AppTopbar.vue og
//    --header-height i style.css).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function actionRows(page) {
    return page.evaluate(() => {
        const bar = document.querySelector('.recipe-bar')!.getBoundingClientRect();
        const pick = (sel: string, text?: string) => [...document.querySelectorAll(`.recipe-bar ${sel}`)]
            .find((e) => !text || (e.textContent || '').includes(text))!.getBoundingClientRect();
        const matrix = pick('.recipe__soft', 'Matrix-runde');
        const show = pick('.recipe__soft', 'Vis for klassen');
        const go = pick('.recipe__go');
        return {
            sameRow: Math.round(matrix.top) === Math.round(go.top) && Math.round(show.top) === Math.round(go.top),
            // "Dan grupper" står yderst til højre (bjælkens polstring er 32 px)
            goAtRight: Math.abs(bar.right - 32 - go.right) <= 1,
        };
    });
}

test('opskriftens bjælke: handlingerne brydes samlet og står til højre', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 800 });
    await createClass(page, '3.g Samfundsfag A');
    await goToGroups(page);
    // En almindelig opskrift: to regler og emner — så er bjælken for bred
    // til én række ved 1.024 px
    await addRecipeRule(page, { column: 'Køn' });
    await addRecipeRule(page, { type: 'Balancér', column: 'Karakter' });
    await addTopics(page, ['Klima', 'Migration', 'Ulighed']);
    await generateGroups(page);
    await closeRecipe(page);

    for (const width of [1440, 1280, 1024, 960, 800]) {
        await page.setViewportSize({ width, height: 800 });
        await expect.poll(() => actionRows(page), { message: `${width} px` })
            .toEqual({ sameRow: true, goAtRight: true });
    }
    // Sonden skal faktisk have ramt to rækker ved 1.024 px
    await page.setViewportSize({ width: 1024, height: 800 });
    await expect.poll(async () => (await page.locator('.recipe-bar').boundingBox())!.height)
        .toBeGreaterThan(80);
});

function topbar(page) {
    return page.evaluate(() => {
        const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
        const pill = r('.class-trigger');
        const icons = r('.nav-right');
        // Ligger pillen og ikonerne på samme række, må de ikke overlappe
        const sameRow = pill.bottom > icons.top && pill.top < icons.bottom;
        return {
            nameVisible: r('.class-name').width > 60,
            noOverlap: !sameRow || pill.right <= icons.left,
            height: Math.round(r('.topbar').height),
        };
    });
}

test('topbjælken mellem 701 og 900 px: klassenavnet kan læses og ligger ikke over ikonerne', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await createClass(page, '2.a Samfundsfag');

    for (const width of [900, 850, 800, 760, 701]) {
        await page.setViewportSize({ width, height: 800 });
        await expect.poll(async () => {
            const t = await topbar(page);
            return { nameVisible: t.nameVisible, noOverlap: t.noOverlap };
        }, { message: `${width} px` }).toEqual({ nameVisible: true, noOverlap: true });
    }
    // Over 900 px er bjælken stadig én række (lav_skaerm og long_text måler ved 911 px)
    await page.setViewportSize({ width: 911, height: 800 });
    await expect.poll(async () => (await topbar(page)).height).toBeLessThan(70);
});

// 3) Klassemenuen i smalle vinduer. Reglerne for den stod FØR grundreglen i
//    AppTopbar.vue og virkede aldrig (samme vægt, den sidste vinder): ved
//    375 px stod menuen 11 px uden for venstre kant.
test('klassemenuen står inden for vinduet ved 375, 800 og 1.280 px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await createClass(page, '2.a Samfundsfag');
    for (const width of [375, 800, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        await page.locator('.class-trigger').click();
        const menu = page.locator('.glass-dropdown');
        await expect(menu).toBeVisible();
        await expect.poll(() => menu.evaluate((el) => {
            const r = el.getBoundingClientRect();
            return r.left >= 0 && r.right <= window.innerWidth;
        }), { message: `${width} px` }).toBe(true);
        await page.keyboard.press('Escape');
        await expect(menu).toHaveCount(0);
    }
});
