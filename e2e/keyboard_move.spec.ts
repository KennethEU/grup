import { test, expect } from '@playwright/test';
import { createClassAndGoToGroups, generateGroups, openSaveSession, closeRecipe, goToMatrix } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Betjening uden mus.
//
// Træk-og-slip findes ikke på touch (iPad/tavle-pc) og kan ikke betjenes fra
// tastaturet. Værnene her holder de tre veje åbne: markér med tastaturet,
// flyt med en knap, og fortryd med Escape. Går de i stykker, er der ingen
// måde at rette en gruppe på uden mus.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('En elev kan flyttes mellem grupper uden træk-og-slip', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Tastatur E2E');
    await generateGroups(page);

    const firstCard = page.locator('.group-card').nth(0);
    const secondCard = page.locator('.group-card').nth(1);
    const member = firstCard.locator('li').first();
    const name = (await member.locator('span').first().innerText()).trim();

    // Eleven skal kunne nås med tastaturet — uden tabindex er hun usynlig
    // for både Tab og skærmlæser.
    await expect(member).toHaveAttribute('tabindex', '0');

    // Markér med Enter (ikke med et klik) — det er tastatur-vejen.
    await member.focus();
    await page.keyboard.press('Enter');

    const status = page.locator('.pick-status');
    await expect(status).toContainText(name);

    // Kildegruppen må IKKE tilbyde at flytte eleven til sig selv.
    await expect(firstCard.locator('.receive-picked-btn')).toHaveCount(0);

    // Flyt med knappen på nabokortet.
    await secondCard.locator('.receive-picked-btn').click();

    await expect(secondCard.locator('li', { hasText: name })).toHaveCount(1);
    await expect(firstCard.locator('li', { hasText: name })).toHaveCount(0);
    // Markeringen — og dermed knapperne — er ryddet igen.
    await expect(page.locator('.receive-picked-btn')).toHaveCount(0);
});

test('Escape fortryder en markering', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Tastatur Escape E2E');
    await generateGroups(page);

    await page.locator('.group-card').nth(0).locator('li').first().click();
    await expect(page.locator('.receive-picked-btn').first()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.receive-picked-btn')).toHaveCount(0);
    await expect(page.locator('.pick-status')).toHaveText('');
});

test('En låst gruppe kan hverken afgive eller modtage en elev', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Tastatur Laas E2E');
    await generateGroups(page);

    const locked = page.locator('.group-card').nth(1);
    await locked.locator('.lock-btn').click();
    await expect(locked).toHaveAttribute('data-locked', 'true');

    // Modtager ikke: markér en elev i en anden gruppe.
    await page.locator('.group-card').nth(0).locator('li').first().click();
    await expect(locked.locator('.receive-picked-btn')).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Afgiver ikke: eleverne i den låste gruppe kan slet ikke markeres.
    await locked.locator('li').first().click();
    await expect(page.locator('.receive-picked-btn')).toHaveCount(0);
});

test('Fokus bliver inde i et modalvindue og vender tilbage bagefter', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Fokus E2E');
    await generateGroups(page);

    await openSaveSession(page);
    const overlay = page.locator('.modal-overlay');
    await expect(overlay).toBeVisible();

    // Fokus lander INDE i vinduet — ikke på knappen bagved.
    await expect
        .poll(() => page.evaluate(() => !!document.activeElement?.closest('.modal-overlay')))
        .toBe(true);

    // Tab må ikke kunne løbe ud i siden bagved.
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(
        () => !!document.activeElement?.closest('.modal-overlay'))).toBe(true);

    await page.keyboard.press('Escape');
    await expect(overlay).toHaveCount(0);

    // …og fokus er tilbage på knappen der åbnede vinduet.
    expect(await page.evaluate(
        () => document.activeElement?.textContent?.trim())).toContain('Gem');
});

test('Escape lukker opskriften og giver fokus tilbage til knappen', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Skuffe E2E');
    // Uden grupper åbner opskriften af sig selv — luk den, og åbn den med knappen
    await closeRecipe(page);

    // Med tastaturet: WebKit giver ikke en knap fokus ved et klik (Safaris
    // standard), så "fokus tilbage" kan kun måles, når knappen HAVDE fokus.
    const trigger = page.locator('.recipe-bar__open');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('dialog.recipe-dialog[open]')).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.recipe-dialog[open]')).toHaveCount(0);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();
});


test('En markering følger ikke med over i Matrix-visningen', async ({ page }) => {
    // Gruppenavne ("Group 1") og elev-id'er ("r7") går igen i BEGGE gruppesæt.
    // Blev markeringen stående efter skiftet, dukkede "Flyt hertil" op på
    // matrixkortene — og opslaget ved navn ramte en helt anden elev.
    await createClassAndGoToGroups(page, 'Markering visningsskift');
    await generateGroups(page);

    const member = page.locator('.group-card').nth(0).locator('li').first();
    await member.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.receive-picked-btn').first()).toBeVisible();

    // Skift til Matrix — markeringen hører til stamgrupperne og skal ryddes.
    await goToMatrix(page);
    await generateGroups(page);

    // Vent til matrixkortene faktisk står der — ellers ville testen bestå,
    // bare fordi der endnu ikke var noget at tegne knappen på.
    await expect(page.locator('#matrix-display .group-card').first()).toBeVisible({ timeout: 60000 });

    await expect(page.locator('.receive-picked-btn')).toHaveCount(0);
    await expect(page.locator('.pick-status')).not.toContainText('er markeret');
});


test('En elev kan meldes fraværende uden mus', async ({ page }) => {
    // Papirkurven i bundbjælken er en SLIP-zone og kun det: den kan hverken
    // tappes på en iPad eller nås fra tastaturet. Værktøjstippet på en elev
    // sagde oven i købet "træk til papirkurven" — en anvisning, halvdelen af
    // de skærme Grupper bruges på, ikke kan følge.
    await createClassAndGoToGroups(page, 'Fravaer uden mus');
    await generateGroups(page);

    const cards = page.locator('.group-card').nth(0);
    const firstMember = cards.locator('li').first();
    const memberName = (await firstMember.innerText()).trim();
    const countBefore = await cards.locator('li').count();

    await firstMember.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.pick-status')).toContainText('er markeret');

    // Knappen sidder i elevens EGEN række på kortet — ikke længere i en bred
    // linje over gitteret. Den brede linje er nu kun en usynlig aria-live-
    // besked (se .pick-status i GroupResultsPanel.vue).
    await firstMember.getByRole('button', { name: 'Meld fraværende' }).click();

    // Ude af gruppen …
    await expect(cards.locator('li')).toHaveCount(countBefore - 1);
    await expect(page.locator('.pick-status')).not.toContainText('er markeret');

    // … og markeret som fraværende i elevlisten (fluebenet "er til stede").
    await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();
    const studentRow = page.locator('tbody tr').filter({ hasText: memberName }).first();
    await expect(studentRow.locator('input[type=checkbox]').nth(1)).not.toBeChecked();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gennemsynet 9/9: flyt-flowet flyttede ned i elevens egen række 9/9 — og tog
// to huller med sig. Begge rammer KUN tastaturet, så de er usynlige for den,
// der prøver flowet med musen.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Enter virker på knapperne i den markerede elevs række', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Raekkens knapper');
    await generateGroups(page);

    const card = page.locator('.group-card').nth(0);
    const member = card.locator('li').first();
    const countBefore = await card.locator('li').count();

    await member.focus();
    await page.keyboard.press('Enter');
    const excludeButton = member.getByRole('button', { name: 'Meld fraværende' });
    await expect(excludeButton).toBeVisible();

    // Rækkens egen `@keydown.enter.prevent` sad på <li>, og knappens klik er
    // Enter-tastens DEFAULT — så preventDefault() på vej op aflyste det.
    // Målt før: intet click-event overhovedet. Vagten inde i handleren kunne
    // ikke redde det; `.prevent` kalder preventDefault() FØR handleren.
    await excludeButton.focus();
    await page.keyboard.press('Enter');
    await expect(card.locator('li')).toHaveCount(countBefore - 1);
});

test('Markøren bliver i gruppen efter et flyt — den falder ikke på gulvet', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Fokus efter flyt');
    await generateGroups(page);

    const firstCard = page.locator('.group-card').nth(0);
    const secondCard = page.locator('.group-card').nth(1);
    const member = firstCard.locator('li').first();
    const name = (await member.locator('.member-name-text').innerText()).trim();

    await member.focus();
    await page.keyboard.press('Enter');

    // "Flyt hertil" forsvinder fra alle kortene i samme øjeblik den virker.
    // Målt før: `document.activeElement` var BODY bagefter, og næste Tab
    // begyndte forfra øverst på siden — skal to elever bytte gruppe, startede
    // man altså forfra efter den første.
    await secondCard.locator('.receive-picked-btn').focus();
    await page.keyboard.press('Enter');
    await expect(secondCard.locator('li', { hasText: name })).toBeFocused();
});

test('Fortryd giver markøren tilbage til elevens egen række', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Fokus efter fortryd');
    await generateGroups(page);

    const member = page.locator('.group-card').nth(0).locator('li').first();
    await member.focus();
    await page.keyboard.press('Enter');

    // Krydset forsvinder med markeringen, men eleven bliver stående — så
    // hendes egen række er det oplagte sted at sætte markøren.
    await member.locator('.pick-action-cancel').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.receive-picked-btn')).toHaveCount(0);
    await expect(member).toBeFocused();
});
