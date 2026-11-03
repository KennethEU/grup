import { test, expect } from '@playwright/test';
import { createClass, goToGroups, gotoAppReady, clickGenerate, openRecipe, closeRecipe } from './helpers';

test.setTimeout(120000);

async function addPair(page) {
    await page.getByRole('checkbox', { name: 'Anna med i aftale', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Bob med i aftale', exact: true }).check();
    if (test.info().project.name === 'chromium') {
        await page.locator('.settings-panel').screenshot({ path: '/tmp/grupper-together-toolbar.png' });
    }
    await page.locator('#create-agreement-btn').click();
    await page.locator('.agreement-menu').getByRole('menuitem', { name: /Skal sammen/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Aftaler', exact: true });
    await expect(dialog).toContainText('Anna');
    await expect(dialog).toContainText('Bob');
    return dialog;
}

async function generateAndWait(page) {
    for (const close of await page.locator('.toast .toast-close').all()) await close.click({ timeout: 2000 }).catch(() => {});
    await clickGenerate(page);
}

test('Skal sammen: opret, genåbn, genindlæs, dan grupper, backup, fjern', async ({ page }) => {
    await createClass(page, 'Skal sammen E2E');
    const dialog = await addPair(page);
    await dialog.screenshot({ path: '/tmp/grupper-together-dialog.png' });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await page.locator('#together-list-btn').click();
    await expect(dialog.locator('.avoid-row')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await page.reload();
    await gotoAppReady(page);
    await page.locator('#together-list-btn').click();
    await expect(dialog).toContainText('Anna');
    await page.keyboard.press('Escape');
    await goToGroups(page);
    await generateAndWait(page);
    await expect(page.locator('.group-card').filter({ hasText: 'Anna' })).toContainText('Bob');
    await page.screenshot({ path: '/tmp/grupper-together-groups.png', fullPage: true });

    // Brug de samme eksport- og gendannelsesindgange som Import & backup.
    const restored = await page.evaluate(async () => {
        const api = await import('/src/js/modules/api.js');
        const state = (window as any).appDebug.state;
        const data = await api.exportClasses([state.currentClass.filename]);
        const result = await api.restoreBackup(data.data, { collisionMode: 'rename' });
        return { result, classes: (window as any).appDebug.pyBridge.getClasses().map(c => c.content.togetherGroups) };
    });
    expect(restored.result.failed).toHaveLength(0);
    expect(restored.classes).toHaveLength(2);
    expect(restored.classes[1]).toEqual(restored.classes[0]);

    await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();
    await page.locator('#together-list-btn').click();
    await dialog.getByRole('button', { name: 'Fjern aftale', exact: true }).click();
    await expect(dialog.locator('.avoid-row')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.reload();
    await gotoAppReady(page);
    await page.locator('#together-list-btn').click();
    await expect(dialog.locator('.avoid-row')).toHaveCount(0);
});

test('Umulig størrelse og lås bevarer grupperne, og matrix bruger egne regler', async ({ page }) => {
    await createClass(page, 'Sammen grænser');
    const dialog = await addPair(page);
    await page.keyboard.press('Escape');
    await goToGroups(page);
    await generateAndWait(page);
    const before = await page.evaluate(() => JSON.stringify((window as any).appDebug.state.storedStandardGroups));
    await page.evaluate(() => {
        const state = (window as any).appDebug.state;
        state.currentClass.togetherGroups = [{ ids: state.currentClass.data.map(s => s._rowId) }];
    });
    await generateAndWait(page);
    await expect(page.getByText(/Skal sammen samler 12 elever/).first()).toBeVisible();
    // Lærerens indstilling, ikke en programfejl (før 24/9 stod der
    // "Python-fejl under gruppedannelse:" foran og en henvisning til konsollen).
    // Scopet til toasten: nyhedsvinduet citerer selv ordet "Python-fejl".
    await expect(page.locator('.toast').filter({ hasText: 'Python-fejl' })).toHaveCount(0);
    if (test.info().project.name === 'chromium') {
        await page.screenshot({ path: '/tmp/grupper-together-settings-error.png' });
    }
    expect(await page.evaluate(() => JSON.stringify((window as any).appDebug.state.storedStandardGroups))).toBe(before);
    await page.evaluate(() => {
        const state = (window as any).appDebug.state;
        const first = state.storedStandardGroups[0];
        const other = state.storedStandardGroups[1];
        first.locked = true;
        state.currentClass.togetherGroups = [{ ids: [first.members[0], other.members[0]] }];
    });
    const locked = await page.evaluate(() => JSON.stringify((window as any).appDebug.state.storedStandardGroups));
    await generateAndWait(page);
    // Bemærkningen står i opskriften ("Sidste dannelse"), ikke som en besked
    await openRecipe(page);
    await expect(page.locator('dialog.recipe-dialog[open]').getByText(/står i en låst gruppe og andre ikke/).first()).toBeVisible();
    await closeRecipe(page);
    expect(await page.evaluate(() => JSON.stringify((window as any).appDebug.state.storedStandardGroups))).toBe(locked);

    // Direkte kald til den samme handling som matrix-knappen bruger.
    await page.evaluate(async () => {
        const state = (window as any).appDebug.state;
        state.storedStandardGroups.forEach(g => { g.locked = false; });
        const module = await import('/src/js/modules/generation.js');
        await module.executeGeneration(true, { mode: 'number', target: 3, matrixStrategy: 'count' });
    });
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.storedMatrixGroups?.length), { timeout: 90000 }).toBe(3);
});

test('Adskil på en kolonne: aftalen stoppes før motoren — med navnene', async ({ page }) => {
    await createClass(page, 'Sammen mod Adskil');
    await addPair(page);
    await page.keyboard.press('Escape');
    await goToGroups(page);
    // Anna og Bob får samme værdi i en kolonne, som en Adskil-regel spreder.
    const column = await page.evaluate(() => {
        const cls = (window as any).appDebug.state.currentClass;
        const col = cls.columns.find(c => c !== 'Navn' && !c.startsWith('_'));
        cls.data.forEach(s => { s[col] = ['Anna', 'Bob'].includes(s.Navn) ? 'Formand' : 'Menig'; });
        cls.rules = [{ type: 'separate', column: col, value: 'Formand' }];
        return col;
    });
    // Advarslen står, før læreren trykker Generér …
    await expect(page.getByText(/Anna, Bob skal være sammen, men Adskil på/).first()).toBeVisible();
    // Læreren lukker advarslen og trykker Generér: kørslen stopper, og
    // advarslen kommer tilbage — den er forklaringen og har knapperne. Ingen
    // fast fejlbesked oven i, for den lå oven på knapperne.
    await page.locator('.gh-hint').filter({ hasText: 'skal være sammen, men Adskil på' })
        .getByRole('button', { name: 'Luk advarsel' }).click();
    await expect(page.getByText(/Anna, Bob skal være sammen, men Adskil på/)).toHaveCount(0);
    await generateAndWait(page);
    await expect(page.locator('.toast').filter({ hasText: 'Grupperne blev ikke dannet' })).toBeVisible();
    // Advarslen står i opskriften (bjælken tæller den: "1 advarsel")
    await expect(page.locator('.recipe-bar__warn')).toHaveText('1 advarsel');
    await openRecipe(page);
    // Advarslen står både over grupperne og i opskriften; her læses opskriftens.
    const recipeHints = page.locator('dialog.recipe-dialog[open] .gh-hint');
    await expect(recipeHints.filter({ hasText: `Adskil på "${column}"` })).toBeVisible();
    await expect(page.locator('.toast.error')).toHaveCount(0);
    await expect(page.getByText(/kolliderer med en Adskil-regel/)).toHaveCount(0);
    await expect(page.locator('.group-card')).toHaveCount(0);
    if (test.info().project.name === 'chromium') {
        await page.screenshot({ path: '/tmp/grupper-together-adskil.png' });
    }

    // "Vis aftalen" lukker opskriften og åbner Aftaler-vinduet, med aftalen markeret.
    const banner = recipeHints.filter({ hasText: 'skal være sammen, men Adskil på' });
    await banner.getByRole('button', { name: 'Vis aftalen' }).click();
    await expect(page.locator('dialog.recipe-dialog[open]')).toHaveCount(0);
    const dialog = page.getByRole('dialog', { name: 'Aftaler', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('tab', { name: /Skal sammen/ })).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.locator('.avoid-row--highlight')).toHaveCount(1);
    await expect(dialog.locator('.avoid-row--highlight')).toContainText('Anna');
    await expect(page.locator('.nav-tab').filter({ hasText: 'Grupper' })).toHaveClass(/active/);
    if (test.info().project.name === 'chromium') {
        await page.waitForTimeout(400);
        await page.screenshot({ path: '/tmp/grupper-together-vis-aftalen.png' });
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // "Dan grupper uden aftalen": grupperne dannes, aftalen bliver stående.
    await openRecipe(page);
    if (test.info().project.name === 'chromium') {
        await banner.screenshot({ path: '/tmp/grupper-together-banner-knapper.png' });
    }
    await banner.getByRole('button', { name: 'Dan grupper uden aftalen' }).click();
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.isGenerating), { timeout: 90000 }).toBe(false);
    await expect(page.locator('.group-card')).not.toHaveCount(0);
    await expect(page.locator('.toast').filter({ hasText: 'er tilsidesat i denne kørsel' })).toBeVisible();
    expect(await page.evaluate(() => (window as any).appDebug.state.currentClass.togetherGroups.length)).toBe(1);
    // Adskil-reglen gælder stadig: Anna og Bob er IKKE i samme gruppe.
    await expect(page.locator('.group-card').filter({ hasText: 'Anna' }).filter({ hasText: 'Bob' })).toHaveCount(0);
    // Næste almindelige Generér stopper igen — aftalen gælder.
    await generateAndWait(page);
    await expect(page.locator('.toast').filter({ hasText: 'Grupperne blev ikke dannet' }).first()).toBeVisible();
});

test('Dan grupper uden aftalen: to umulige aftaler tilsidesættes på én gang', async ({ page }) => {
    await createClass(page, 'To umulige aftaler');
    // To aftaler, begge umulige under samme Adskil-regel: Anna+Bob og Clara+David.
    await page.evaluate(() => {
        const cls = (window as any).appDebug.state.currentClass;
        const col = cls.columns.find(c => c !== 'Navn' && !c.startsWith('_'));
        const idOf = (n: string) => cls.data.find(s => s.Navn === n)._rowId;
        cls.togetherGroups = [
            { ids: [idOf('Anna'), idOf('Bob')], timestamp: 1 },
            { ids: [idOf('Clara'), idOf('David')], timestamp: 2 },
        ];
        cls.data.forEach(s => { s[col] = ['Anna', 'Bob', 'Clara', 'David'].includes(s.Navn) ? 'Formand' : 'Menig'; });
        cls.rules = [{ type: 'separate', column: col, value: 'Formand' }];
    });
    await goToGroups(page);
    const banner = page.locator('.gh-hint').filter({ hasText: 'skal være sammen, men Adskil på' });
    await expect(banner).toContainText('Anna, Bob');
    for (const close of await page.locator('.toast .toast-close').all()) await close.click({ timeout: 2000 }).catch(() => {});
    await banner.getByRole('button', { name: 'Dan grupper uden aftalen' }).click();
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.isGenerating), { timeout: 90000 }).toBe(false);
    // Motoren melder ALLE umulige blokke på én gang, og knappen fjerner dem
    // alle i denne kørsel (før stoppede kørslen bagefter på den næste blok).
    // Beskeden nævner begge aftaler, og grupperne er dannet.
    await expect(page.locator('.group-card').first()).toBeVisible();
    const skipped = page.locator('.toast').filter({ hasText: 'er tilsidesat i denne kørsel' });
    await expect(skipped).toContainText('Anna');
    await expect(skipped).toContainText('Clara');
});

test('Adskil på en kolonne: en helt låst aftale giver hverken advarsel eller stop', async ({ page }) => {
    await createClass(page, 'Sammen låst mod Adskil');
    await addPair(page);
    await page.keyboard.press('Escape');
    await goToGroups(page);
    await generateAndWait(page);
    const card = page.locator('.group-card').filter({ hasText: 'Anna' });
    await expect(card).toContainText('Bob');
    // Lås Anna og Bobs gruppe med kortets egen knap, og giv dem SÅ samme
    // værdi i en Adskil-kolonne.
    await card.getByRole('button', { name: 'Lås gruppe' }).click();
    await expect(card.getByRole('button', { name: 'Lås op' })).toBeVisible();
    const column = await page.evaluate(() => {
        const cls = (window as any).appDebug.state.currentClass;
        const col = cls.columns.find(c => c !== 'Navn' && !c.startsWith('_'));
        cls.data.forEach(s => { s[col] = ['Anna', 'Bob'].includes(s.Navn) ? 'Formand' : 'Menig'; });
        cls.rules = [{ type: 'separate', column: col, value: 'Formand' }];
        return col;
    });
    // En aftale, der står samlet i en låst gruppe, sendes ikke til motoren — så intet at rette.
    await expect(page.getByText(/skal være sammen, men Adskil på/)).toHaveCount(0);
    if (test.info().project.name === 'chromium') {
        for (const close of await page.locator('.toast .toast-close').all()) await close.click({ timeout: 2000 }).catch(() => {});
        await page.mouse.move(0, 0);
        await page.waitForTimeout(600);
        await page.screenshot({ path: '/tmp/grupper-together-adskil-laast.png' });
    }
    const lockedBefore = await card.innerText();
    await generateAndWait(page);
    await expect(page.locator('.toast').filter({ hasText: `Adskil på "${column}"` })).toHaveCount(0);
    expect(await page.locator('.group-card').filter({ hasText: 'Anna' }).innerText()).toBe(lockedBefore);
    // Låses gruppen op, gælder aftalen igen for motoren — og advarslen er tilbage.
    await page.locator('.group-card').filter({ hasText: 'Anna' }).getByRole('button', { name: 'Lås op' }).click();
    // Advarslen om opsætningen står i opskriften
    await openRecipe(page);
    await expect(page.locator('dialog.recipe-dialog[open]').getByText(/Anna, Bob skal være sammen, men Adskil på/).first()).toBeVisible();
});

test('Begge menupunkter fører til det SAMME vindue, på hver sin fane', async ({ page }) => {
    await createClass(page, 'Aftaler ét vindue');
    await addPair(page);
    await page.keyboard.press('Escape');

    // "Undgå hinanden" åbnede før et andet vindue uden faner — og det vindue
    // lå uden for Escape-testen. Nu er der ét vindue med to faner.
    await page.getByRole('checkbox', { name: 'Clara med i aftale', exact: true }).check();
    await page.getByRole('checkbox', { name: 'David med i aftale', exact: true }).check();
    await page.locator('#create-agreement-btn').click();
    await page.locator('.agreement-menu').getByRole('menuitem', { name: /Undgå hinanden/ }).click();

    const dialog = page.getByRole('dialog', { name: 'Aftaler', exact: true });
    await expect(dialog).toHaveCount(1);
    await expect(dialog.getByRole('tab', { name: /Undgå hinanden/ })).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.locator('.avoid-row')).toHaveCount(1);

    // Piletast mellem fanerne, og aftalen fra før står stadig på den anden.
    await dialog.getByRole('tab', { name: /Undgå hinanden/ }).press('ArrowLeft');
    await expect(dialog.getByRole('tab', { name: /Skal sammen/ })).toHaveAttribute('aria-selected', 'true');
    await expect(dialog).toContainText('Anna');

    // Den mindre undgåelse bliver stående, når en større oprettes — men den
    // skal kunne ses som virkningsløs.
    await page.keyboard.press('Escape');
    await page.getByRole('checkbox', { name: 'Clara med i aftale', exact: true }).check();
    await page.getByRole('checkbox', { name: 'David med i aftale', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Emma med i aftale', exact: true }).check();
    await page.locator('#create-agreement-btn').click();
    await page.locator('.agreement-menu').getByRole('menuitem', { name: /Undgå hinanden/ }).click();
    await expect(dialog.locator('.avoid-row')).toHaveCount(2);
    await expect(dialog.locator('.avoid-row').first()).toContainText('indgår allerede i en større undgåelse');
});

test('Aftalevinduet på mobil', async ({ page }) => {
    await createClass(page, 'Sammen mobil');
    const dialog = await addPair(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await dialog.screenshot({ path: '/tmp/grupper-together-mobile.png' });
    await page.setViewportSize({ width: 320, height: 740 });
    await dialog.screenshot({ path: '/tmp/grupper-together-small.png' });
    await expect(dialog.getByRole('button', { name: 'Fjern aftale' })).toBeInViewport();

    // Beskederne må ikke ligge hen over vinduets hoved. De dækkede før titlen,
    // begge faner og luk-knappen på netop denne bredde.
    await page.evaluate(() => (window as any).notifySuccess?.('Prøvebesked til målingen'));
    const toast = page.locator('.toast').last();
    await expect(toast).toBeVisible();
    const [toastBox, headBox] = await Promise.all([
        toast.boundingBox(),
        dialog.locator('.avoid-modal-header').boundingBox(),
    ]);
    expect(toastBox!.y).toBeGreaterThan(headBox!.y + headBox!.height);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
});

test('Overlap, fravær og en manuel flytning håndteres med de samme elev-id’er', async ({ page }) => {
    await createClass(page, 'Sammen overlap');
    await addPair(page);
    await page.keyboard.press('Escape');
    await page.getByRole('checkbox', { name: 'Bob med i aftale', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Clara med i aftale', exact: true }).check();
    await page.locator('#create-agreement-btn').click();
    await page.locator('.agreement-menu').getByRole('menuitem', { name: /Skal sammen/ }).click();
    await expect(page.getByRole('dialog', { name: 'Aftaler' }).locator('.avoid-row')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await page.getByRole('checkbox', { name: 'Bob er til stede', exact: true }).uncheck();
    await goToGroups(page);
    await generateAndWait(page);
    const home = page.locator('.group-card').filter({ hasText: 'Anna' });
    await expect(home).toContainText('Clara');
    await expect(page.locator('.group-card').filter({ hasText: 'Bob' })).toHaveCount(0);
    await home.locator('li').filter({ hasText: 'Anna' }).click();
    await page.locator('.receive-picked-btn').first().click();
    await expect(page.getByText(/Skal sammen er brudt/).first()).toBeVisible();
    await page.screenshot({ path: '/tmp/grupper-together-warning.png', fullPage: true });
});
