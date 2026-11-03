import { test, expect } from '@playwright/test';
import { createClass, createClassAndGoToGroups, goToGroups, generateGroups, openSaveSession } from './helpers';

test('Vinduerne Kategori og Gem session', async ({ page }) => {
    // 1. Opret først en klasse, så funktionerne er der
    await createClass(page, 'Refactor Test Class',
        'Navn,Hold\nAlice,A\nBob,B\nCharlie,A\nDiana,B\nErik,A\nFanny,B');

    // Luk beskeden, så den ikke dækker knapperne
    const successToast = page.locator('.toast.success');
    await expect(successToast).toBeVisible();
    await successToast.click({ force: true });

    // 2. Åbn Kategorisér-vinduet
    await page.locator('#cat-btn').click();
    const catModalHeader = page.getByRole('heading', { name: 'Kategorisér Data' });
    await expect(catModalHeader).toBeVisible();

    // 3. Sæt omsætningen op
    const sourceSelect = page.locator('#vue-modals select.full-width').first();
    await expect(sourceSelect).toBeVisible();
    await expect(sourceSelect.locator('option[value="Hold"]')).toBeAttached();
    await sourceSelect.selectOption('Hold');
    await expect(sourceSelect).toHaveValue('Hold');

    // Navnet på den nye kolonne
    await page.getByPlaceholder('F.eks. Niveau').fill('TestNiveau');

    // Omsætning: A -> Alpha. Værdierne vælges blandt kolonnens egne
    // værdier — de er ikke længere et fritekstfelt med kommaer imellem.
    await page.locator('.value-chip').filter({ hasText: 'A' }).first().click();
    await page.locator('.map-input.label').first().fill('Alpha');

    // 4. Opret kolonnen
    await page.getByRole('button', { name: 'Opret kolonne' }).click();

    // Vinduet er lukket, og kolonnen findes
    await expect(catModalHeader).not.toBeVisible();
    await expect(page.locator('th').filter({ hasText: 'TestNiveau' })).toBeVisible();

    // 5. Gå til Grupper og dan grupper
    await goToGroups(page);
    await generateGroups(page);

    // 6. Åbn Gem session-vinduet (Gem i bundbjælken → "Gem i Historik")
    await openSaveSession(page);

    // 7. Gem — navnefeltet er udfyldt med "<klassenavn> - <dato>"
    const nameInput = page.locator('#vue-modals input[type="text"]').first();
    expect(await nameInput.inputValue()).toContain('Refactor Test Class');

    // Afgræns til dialogen: knappen i værktøjslinjen hedder nu også
    // "Gem session", så et usaklet opslag rammer to knapper.
    await page.locator('#vue-modals').getByRole('button', { name: 'Gem session', exact: true }).click();

    // Beskeden (filtreret på tekst, så den ikke forveksles med tidligere beskeder)
    const saveToast = page.locator('.toast.success').filter({ hasText: 'gemt i historikken' });
    await expect(saveToast).toBeVisible();
});


test('et værktøjstip forsvinder, når elementet under musen bliver tegnet væk', async ({ page }) => {
    // Fundet 2026-08-25: forsvinder elementet under musen, affyres `mouseleave`
    // ALDRIG, og tippet blev stående midt på skærmen med en tekst om noget, der
    // ikke er der mere.
    //
    // Testen fjerner noden direkte — det er præcis dét Vue gør, når en liste
    // tegnes om. Vejen udenom er med vilje: lukker man i stedet vinduet med
    // Escape, giver fokus-gendannelsen et NYT tip, som skjuler fejlen. Netop
    // derfor kunne den ligge uset.
    await createClass(page, 'Tooltip Test',
        'Navn,Niveau\nAlice,Lav\nBob,Middel\nCharlie,Høj\nDiana,Lav');

    await page.locator('#rank-btn').click();
    const dragHandle = page.locator('.order-row .drag-handle').last();
    await expect(dragHandle).toBeVisible();

    await dragHandle.hover();
    const tip = page.locator('#global-tooltip');
    await expect(tip).toHaveClass(/visible/);
    await expect(tip).toHaveText(/^Flyt /);

    // Noden går væk under musen — ingen mouseleave, intet fokusskifte.
    await page.evaluate(() => {
        document.querySelectorAll('.order-row .drag-handle')[
            document.querySelectorAll('.order-row .drag-handle').length - 1].remove();
    });

    await expect(tip).not.toHaveClass(/visible/);
});

test('et værktøjstip forsvinder, når et vindue åbner oven på knappen', async ({ page }) => {
    // Samme rod som testen ovenfor — musen står stille, så `mouseleave` affyres
    // aldrig — men her forsvinder knappen ikke, den bliver DÆKKET. Tippet blev
    // hængende oven på værktøjslinjen bagefter. Gælder hver knap med et tip der
    // åbner et vindue; "Gendan" er bare den der afslørede det.
    await createClassAndGoToGroups(page, 'Tooltip Modal');
    await generateGroups(page);

    const restoreButton = page.locator('.action-pill').filter({ hasText: /^Gendan$/ }).first();
    await restoreButton.hover();

    const tip = page.locator('#global-tooltip');
    await expect(tip).toHaveClass(/visible/);

    await restoreButton.click();
    await expect(page.getByRole('heading', { name: 'Gendan grupper' })).toBeVisible();
    await expect(tip).not.toHaveClass(/visible/);
});

test('et langt værktøjstip bliver ombrudt og bliver på skærmen', async ({ page }) => {
    // Fundet 2026-09-09 på et skærmbillede fra læreren: `.custom-tooltip` havde
    // ingen max-width, så et langt tip blev én lang linje — målt til 1280px, dvs.
    // hele skærmens bredde. Og fordi tippet skubbes til VENSTRE for musen, når
    // der ikke er plads til højre, endte venstrekanten på et negativt tal: de
    // første ord lå uden for skærmen. `white-space: pre-line` havde hele tiden
    // tilladt ombrydning — der var bare aldrig en bredde at bryde ved.
    await createClass(page, 'Tooltip Bredde', 'Navn,Niveau\nAlice,Lav\nBob,Middel');

    // "Ranger" har et af de længste tips i værktøjslinjen (over 100 tegn).
    // "Vis:"-vælgeren har et længere, men dens usynlige <select> ligger ovenpå
    // og opfanger musen, så Playwright kan ikke hovere den.
    await page.locator('#rank-btn').hover();

    const tip = page.locator('#global-tooltip');
    await expect(tip).toHaveClass(/visible/);

    const box = await tip.boundingBox();
    const view = page.viewportSize();

    // Ombrudt: smallere end loftet, og højere end den ene linje det var før.
    expect(box.width).toBeLessThanOrEqual(361);
    expect(box.height).toBeGreaterThan(30);

    // Og hele tippet er inden for skærmen — det var venstrekanten ikke før.
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(view.width);
    expect(box.y + box.height).toBeLessThanOrEqual(view.height);
});
