import { test, expect } from '@playwright/test';
import { createClass, goToGroups, generateGroups, closeRecipe, openSaveColumn } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fortryd (Ctrl+Z) — hvad den dækker, og hvad den skal holde fingrene fra.
//
// Fortryd-stakken gemmer ÉN ting: elevrækkerne (state.js: pushUndo snapshotter
// `currentClass.data`). Alt hvad der følger, er konsekvenser af netop det:
//
//   · Ændrer en handling SKEMAET — en kolonne kommer til, forsvinder eller
//     skifter navn — kan ingen ældre snapshot bruges bagefter. De sider hører
//     til et andet regneark. Reglen i koden er "nulstil stakken", og den skal
//     gælde ALLE veje der laver en kolonne, ikke kun værktøjslinjens.
//   · Er elevlisten ikke på skærmen, er der intet et Ctrl+Z kan vise. Så skal
//     den lade være — ellers ruller den noget tilbage, læreren ikke kan se.
//   · Et snapshot skal svare til en ÆNDRING. Et snapshot pr. celle man kigger
//     på fylder bare de rigtige ud af en stak, der kun er 50 dyb.
//
// Testene her er skrevet efter fund; hver enkelt fejlede før sin rettelse.
// (Gennemsyn 2026-09-01.)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Celle (række, kolonne) i elevlisten — nul-indekseret, uden afkrydsningerne. */
function cell(page, row: number, col: number) {
    return page.locator('tbody tr').nth(row).locator('td.cell-data').nth(col);
}

/** Klik et sted uden for tabellen, så cellen mister fokus og værdien bindes. */
async function leaveCell(page) {
    await page.locator('.settings-panel').click();
}

async function typeInCell(page, row: number, col: number, text: string) {
    const c = cell(page, row, col);
    await c.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type(text);
    await leaveCell(page);
    await expect(c).toHaveText(text);
}

const tab = (page, name: string) => page.locator('.nav-tab').filter({ hasText: name });

test('Ctrl+Z rører ikke elevlisten, når man står et andet sted', async ({ page }) => {
    await createClass(page, 'Fortryd Anden Fane E2E');
    await typeInCell(page, 0, 0, 'TESTNAVN');

    // Væk fra elevlisten. Målt før rettelsen: genvejen var global og rullede
    // celleredigeringen tilbage ét skærmbillede væk fra det, læreren kiggede
    // på — samme fejltype som Ctrl+Z bag et åbent vindue (column_layout.spec).
    await tab(page, 'Grupper').click();
    await expect(page.locator('.recipe-bar')).toBeVisible({ timeout: 10000 });
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForTimeout(300);
    // Uden grupper står opskriftens vindue åbent — luk det, før fanen skiftes
    await closeRecipe(page);

    await tab(page, 'Elevliste').click();
    await expect(cell(page, 0, 0)).toHaveText('TESTNAVN');

    // Og på elevlisten virker den som altid.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(cell(page, 0, 0)).toHaveText('Anna');
});

test('at kigge sig gennem cellerne bruger ikke fortryd-stakken op', async ({ page }) => {
    await createClass(page, 'Fortryd Stak E2E');
    await typeInCell(page, 0, 0, 'TESTNAVN');

    // En lærer der læser listen igennem klikker sig ned gennem cellerne uden
    // at rette noget. Før lå snapshottet på @focus, så hvert eneste klik lagde
    // en kopi på stakken — 50 pladser, og den rigtige ændring blev skubbet ud
    // bagi. Ctrl+Z lagde så det samme tilbage, igen og igen, og så ud til
    // ikke at gøre noget.
    for (let r = 1; r <= 4; r++) {
        for (let c = 0; c <= 2; c++) {
            await cell(page, r, c).click();
        }
    }
    await leaveCell(page);

    // ÉT tryk skal være nok.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(cell(page, 0, 0)).toHaveText('Anna');
});

test('fluebenet der sætter hele klassen fraværende kan fortrydes', async ({ page }) => {
    await createClass(page, 'Fortryd Fravaer E2E');
    const rowCount = await page.locator('tbody tr').count();

    // Fluebenet i tabelhovedet vender hele klassen på ét klik og sidder lige
    // over den enkelte elevs eget. Før var det den eneste ændring i
    // elevlisten, Ctrl+Z ikke kunne tage tilbage.
    await page.locator('thead th').nth(1).click();
    await expect(page.locator('tbody tr.row-excluded')).toHaveCount(rowCount);

    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('tbody tr.row-excluded')).toHaveCount(0);
});

test('Ctrl+Z fortryder en elev meldt fraværende, mens fluebenet har fokus', async ({ page }) => {
    await createClass(page, 'Fortryd Flueben E2E');
    // Chrome, Edge og Safari giver fluebenet fokus ved et klik. Før sprang
    // genvejen over alle <input>, så Ctrl+Z gjorde ingenting lige her.
    const box = page.getByRole('checkbox', { name: 'Anna er til stede' });
    await box.click();
    await expect(page.locator('tbody tr.row-excluded')).toHaveCount(1);
    await box.focus();

    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('tbody tr.row-excluded')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(page.locator('tbody tr.row-excluded')).toHaveCount(1);
});

test('Ctrl+Z sletter ikke den kolonne, "Gem som kolonne" lige lavede', async ({ page }) => {
    await createClass(page, 'Fortryd Ny Spalte E2E');

    // Noget på stakken FØR kolonnen findes — det er hele fælden.
    await typeInCell(page, 0, 0, 'TESTNAVN');

    await goToGroups(page);
    await generateGroups(page);
    await openSaveColumn(page);
    await page.locator('#gk-navn').fill('Runde 1');
    await page.locator('.modal-overlay').getByRole('button', { name: 'Gem kolonne' }).click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0);

    await tab(page, 'Elevliste').click();
    const headers = page.locator('th.col-header');
    await expect(headers.filter({ hasText: 'RUNDE 1' })).toHaveCount(1);
    await expect(cell(page, 0, 3)).not.toHaveText('');

    // Målt før rettelsen: snapshottet er taget FØR kolonnen fandtes, så
    // Ctrl+Z lagde rækker tilbage uden den — kolonnen stod tom for hele
    // klassen og forsvandt helt ved næste gem (updateClass udleder
    // kolonnelisten af nøglerne i data[0]). Læreren mistede altså den kolonne,
    // hun lige havde gemt, ved at fortryde noget helt andet.
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForTimeout(300);

    await expect(headers.filter({ hasText: 'RUNDE 1' })).toHaveCount(1);
    await expect(cell(page, 0, 3)).not.toHaveText('');
});

test('et Ctrl+Z der ikke fortryder noget, lægger heller ikke noget på stakken', async ({ page }) => {
    await createClass(page, 'Fortryd Stak Uroert E2E');
    await typeInCell(page, 0, 0, 'TESTNAVN');

    const stackSize = () => page.evaluate(
        () => (window as any).appDebug.state._undoStack.length);
    expect(await stackSize()).toBe(1);

    // Cellerne i elevlisten er contenteditable, og browseren fører sin EGEN
    // fortryd-historik for dem. Sender vi tasten videre — fordi vi netop ikke
    // vil fortryde noget her — ruller Chromium den seneste indtastning tilbage
    // i DOM'en uden at Vue eller `data` opdager det, og input-eventet fra den
    // rulning landede før som et snapshot på appens stak. Målt: stakken voksede
    // fra 1 til 2 ved et tryk, der ikke måtte gøre noget som helst.
    await page.locator('#col-layout-btn').click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForTimeout(300);
    expect(await stackSize()).toBe(1);

    await page.getByRole('button', { name: 'Annuller' }).click();

    // Samme prøve uden for elevlisten.
    await tab(page, 'Grupper').click();
    await expect(page.locator('.recipe-bar')).toBeVisible({ timeout: 10000 });
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForTimeout(300);
    // Uden grupper står opskriftens vindue åbent — luk det, før fanen skiftes
    await closeRecipe(page);
    expect(await stackSize()).toBe(1);

    // Og den ene rigtige ændring kan stadig tages tilbage.
    await tab(page, 'Elevliste').click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(cell(page, 0, 0)).toHaveText('Anna');
});

test('papirkurven kan fortrydes — og tager ikke en ældre rettelse med', async ({ page }) => {
    await createClass(page, 'Fortryd Papirkurv E2E');

    // Noget på stakken FØR papirkurven bruges — det er hele fælden. Uden et
    // snapshot for papirkurven springer stakken den handling over, og det
    // FØRSTE Ctrl+Z ruller så denne celleredigering tilbage, mens eleven
    // stille bliver meldt til stede igen uden at komme tilbage i sin gruppe.
    await typeInCell(page, 1, 0, 'TESTNAVN');

    await goToGroups(page);
    await generateGroups(page);

    // Papirkurven uden mus: markér eleven, og meld hende fraværende med
    // knappen. Samme vej gennem excludeMember() som et slip på kurven.
    const member = page.locator('.group-card').nth(0).locator('li').first();
    const name = (await member.locator('span').first().innerText()).trim();
    await member.click();
    await page.getByRole('button', { name: 'Meld fraværende' }).click();
    await expect(page.locator('.group-card li', { hasText: name })).toHaveCount(0);

    await tab(page, 'Elevliste').click();
    const row = page.locator('tbody tr', { hasText: name }).first();
    await expect(row).toHaveClass(/row-excluded/);

    // Første Ctrl+Z tager papirkurven.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(row).not.toHaveClass(/row-excluded/);
    // …og lader celleredigeringen stå.
    await expect(cell(page, 1, 0)).toHaveText('TESTNAVN');

    // Andet Ctrl+Z tager celleredigeringen.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(cell(page, 1, 0)).not.toHaveText('TESTNAVN');
});

test('"Tilføj elev" kan fortrydes — og tager ikke en ældre rettelse med', async ({ page }) => {
    await createClass(page, 'Fortryd Efternoeler E2E');

    // Igen: noget på stakken FØR vinduet bruges. Vinduet sætter `_excluded`
    // tilbage til falsk på hver elev det henter ind, og det er elevdata.
    await typeInCell(page, 1, 0, 'TESTNAVN');

    await goToGroups(page);
    await generateGroups(page);

    // Meld en elev fraværende, så hun står på vinduets liste.
    const member = page.locator('.group-card').nth(0).locator('li').first();
    const name = (await member.locator('span').first().innerText()).trim();
    await member.click();
    await page.getByRole('button', { name: 'Meld fraværende' }).click();

    // …og hent hende ind igen med "Tilføj elev".
    // Knappen slås op på sin klasse og sin title: tooltip.js ejer
    // aria-label og skriver den om ved første hover.
    await page.locator('button.action-pill[title="Tilføj efternøler"]').click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await page.locator('.modal-overlay input[type="checkbox"]').first().check();
    await page.locator('.modal-overlay').getByRole('button', { name: 'Tilføj til gruppe' }).click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0);

    await tab(page, 'Elevliste').click();
    const row = page.locator('tbody tr', { hasText: name }).first();
    await expect(row).not.toHaveClass(/row-excluded/);

    // Første Ctrl+Z tager "Tilføj elev" — ikke celleredigeringen.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(row).toHaveClass(/row-excluded/);
    await expect(cell(page, 1, 0)).toHaveText('TESTNAVN');
});

test('Ctrl+Shift+Z gentager — både uden for cellerne og inde i en celle', async ({ page }) => {
    await createClass(page, 'Fortryd Gentag E2E');
    await typeInCell(page, 0, 0, 'TESTNAVN');
    const firstName = () => page.evaluate(
        () => (window as any).appDebug.state.currentClass.data[0].Navn);

    // Med Shift nede kommer tasten som et STORT "Z". Før sammenlignede
    // genvejen kun med 'z', så gentag med Ctrl+Shift+Z (Windows, Chromebook,
    // Firefox) gjorde ingenting. Målt: cellen blev stående på "Anna".
    await page.keyboard.press('ControlOrMeta+z');
    await expect(cell(page, 0, 0)).toHaveText('Anna');
    await page.keyboard.press('ControlOrMeta+Shift+KeyZ');
    await expect(cell(page, 0, 0)).toHaveText('TESTNAVN');
    expect(await firstName()).toBe('TESTNAVN');

    // Samme tur med markøren i en celle: dér tog browserens EGEN gentag
    // over, bag om appens stak.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(cell(page, 0, 0)).toHaveText('Anna');
    await cell(page, 1, 0).click();
    await page.keyboard.press('ControlOrMeta+Shift+KeyZ');
    await expect(cell(page, 0, 0)).toHaveText('TESTNAVN');
    expect(await firstName()).toBe('TESTNAVN');
});

// ── Knapperne Fortryd og Gentag ────────────────────────────────────────────
// Før fandtes kun genvejen, og den skulle man kende. Knapperne bruger samme
// stak, og de er slukket (aria-disabled), når der intet er at fortryde.
test('Fortryd- og Gentag-knapperne i elevlisten', async ({ page }) => {
    await createClass(page, 'Fortryd Knap');
    const undoBtn = page.locator('#undo-btn');
    const redoBtn = page.locator('#redo-btn');
    await expect(undoBtn).toHaveAttribute('aria-disabled', 'true');
    await expect(redoBtn).toHaveAttribute('aria-disabled', 'true');

    const original = (await cell(page, 0, 0).innerText()).trim();
    await typeInCell(page, 0, 0, 'Rettet Navn');
    await expect(undoBtn).toHaveAttribute('aria-disabled', 'false');

    await undoBtn.click();
    await expect(cell(page, 0, 0)).toHaveText(original);
    await expect(redoBtn).toHaveAttribute('aria-disabled', 'false');

    await redoBtn.click();
    await expect(cell(page, 0, 0)).toHaveText('Rettet Navn');
    await expect(redoBtn).toHaveAttribute('aria-disabled', 'true');

    // Det fortrudte er også GEMT — det står der stadig efter en genindlæsning
    await undoBtn.click();
    await expect(cell(page, 0, 0)).toHaveText(original);
    await page.reload();
    await expect(cell(page, 0, 0)).toHaveText(original, { timeout: 30000 });
});
