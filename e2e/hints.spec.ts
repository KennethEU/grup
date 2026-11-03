import { test, expect, Page } from '@playwright/test';
import { createClass, goToGroups, generateGroups, setGroupSize, openRecipe, closeRecipe } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hint-banneret over gruppekortene. Det lover læreren TAL — hvor mange
// elever generering holder fri, og hvor mange der skal skilles ad — og de
// tal skal opgøres på de samme elever som generering faktisk arbejder med.
// Fraværende elever og spøgelser (medlemmer hvis elevrække er slettet) ser
// ud som alle andre i g.members, men er ingen af delene.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 8 elever, så 4 grupper à 2 giver et rundt regnestykke at læse hintet på.
const CSV =
    'Navn\tKøn\n' +
    'Anna\tK\nBo\tM\nCarl\tM\nDorte\tK\n' +
    'Emil\tM\nFrida\tK\nGustav\tM\nHanne\tK';

async function setAbsent(page: Page, name: string) {
    await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();
    const row = page.locator('tr').filter({ hasText: name });
    await row.locator('.cell-checkbox input').nth(1).uncheck();
}

/** Vælg elever i elevlisten og opret en undgåelse på dem. */
async function addAvoidance(page: Page, names: string[]) {
    await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();
    for (const n of names) {
        await page.locator('tr').filter({ hasText: n })
            .locator('.cell-checkbox input').first().check();
    }
    // Undgåelser laves nu fra "Lav aftale"-menuen; den gamle enkeltknap
    // findes ikke mere. Vinduet åbner sig selv bagefter — luk det igen.
    await page.locator('#create-agreement-btn').click();
    await page.locator('.agreement-menu').getByRole('menuitem', { name: /Undgå hinanden/ }).click();
    await page.locator('.avoid-modal-close').click();
}

/** Sæt gruppestørrelsen til 2 (default er 4), så 8 elever giver 4 grupper. */
const setGroupSize2 = (page: Page) => setGroupSize(page, 2);

const hintBanner = (page: Page) => page.locator('.gh-hint-text');

/**
 * Motorens advarsel om Undgå hinanden står i opskriften (check(), før
 * kørslen). Åbn opskriften, læs, og luk den igen.
 */
async function avoidWarnings(page: Page) {
    const dialog = await openRecipe(page);
    const texts = await dialog.locator('.gh-hint').filter({ hasText: 'Undgå hinanden:' }).allInnerTexts();
    await closeRecipe(page);
    return texts;
}

test('En fraværende elev tæller ikke med i den undgåelse, der skal fordeles', async ({ page }) => {
    await createClass(page, 'Hint Fravaer', CSV);
    await goToGroups(page);
    // "4 grupper" fast, ikke "2 pr. gruppe": advarslen regner med de grupper,
    // motoren VIL danne, og med 7 elever à 2 bliver det kun 3 — så ville fire
    // elever, der skal undgå hinanden, faktisk være for mange.
    await setGroupSize(page, 4, 'number');
    await generateGroups(page);

    // Fem elever der skal skilles ad på fire grupper er umuligt — der advares.
    await addAvoidance(page, ['Anna', 'Bo', 'Carl', 'Dorte', 'Emil']);
    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();
    await expect.poll(() => avoidWarnings(page)).toEqual([expect.stringContaining('5 elever')]);
    expect((await avoidWarnings(page))[0]).toContain('men der er kun 4 grupper');

    // Er én af de fem fraværende, er der fire tilbage til fire grupper — og
    // så FINDES umuligheden ikke. Talt på sep.ids.length stod advarslen der
    // stadig, og læreren fik at vide, at hun skulle lave flere grupper for at
    // løse et problem, der var gået væk af sig selv.
    //
    // Den her prøve stod før på hintet "Du har låst N grupper", som er væk
    // (2026-09-03: hængelåsen på kortet siger allerede det samme). Regnestykket
    // bag — hvem der tæller som en elev, generering skal placere — er det
    // samme, og det er DET, der måles på her.
    await setAbsent(page, 'Anna');
    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();
    await expect.poll(() => avoidWarnings(page)).toEqual([]);
});

// NB: advarslen hedder "Undgå hinanden:", ikke "Adskil:" — den bygger kun på
// aftalen "Undgå hinanden", mens "Adskil" er en anden linje i regel-menuen.
test('Undgåelser: en låst elev i undgåelsen udløser ikke en falsk umulighed', async ({ page }) => {
    await createClass(page, 'Hint Adskil', CSV);
    await goToGroups(page);
    await setGroupSize2(page);
    await generateGroups(page);

    // Lås gruppe 1 → generering danner 3 nye grupper.
    const lockedNames = (await page.locator('.group-card').first()
        .locator('.group-members-list li').allInnerTexts()).map(s => s.trim());
    await page.locator('.group-card').first().locator('.lock-btn').click();

    // Undgåelse på 4 elever, hvoraf ÉN sidder i den låste gruppe. Kun 3 skal
    // fordeles på 3 grupper — det er muligt, og der må ikke advares.
    const free = ['Anna', 'Bo', 'Carl', 'Dorte', 'Emil', 'Frida', 'Gustav', 'Hanne']
        .filter(n => !lockedNames.includes(n));
    await addAvoidance(page, [lockedNames[0], free[0], free[1], free[2]]);
    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();

    await expect.poll(() => avoidWarnings(page)).toEqual([]);

    // Fire FRIE elever på 3 grupper er derimod umuligt — advarslen skal stadig komme.
    await addAvoidance(page, [free[0], free[1], free[2], free[3]]);
    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();

    await expect.poll(() => avoidWarnings(page)).toEqual([expect.stringContaining('4 elever')]);
    expect((await avoidWarnings(page))[0]).toContain('men der er kun 3 grupper');
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Undgåelsen er et LØFTE, og løftet skal holdes efter gruppedannelsen også.
// Advarslerne ovenfor kigger på reglerne FØR kørslen; de her kigger på det
// der faktisk står på kortene. Tre veje udenom, som ingen regel-advarsel kan
// se: læreren flytter selv, begge elever er låst i samme gruppe, eller en
// gemt session kommer ind fra dengang undgåelsen ikke fandtes.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Flyt en elev fra hendes kort til `targetIndex` med den mus-frie knap. */
async function moveTo(page: Page, name: string, targetIndex: number) {
    await page.locator('.group-card').locator('li', { hasText: name }).first().click();
    await page.locator('.group-card').nth(targetIndex).locator('.receive-picked-btn').click();
}

const brokenBanner = (page: Page) => hintBanner(page).filter({ hasText: 'Undgåelse brudt' });

test('En undgåelse brudt i hånden siger til — og bliver tavs igen, når den rettes', async ({ page }) => {
    await createClass(page, 'Undgaa Brudt', CSV);
    await addAvoidance(page, ['Anna', 'Bo']);
    await goToGroups(page);
    await setGroupSize2(page);
    await generateGroups(page);

    // Gruppedannelsen holder undgåelsen af sig selv — intet at advare om.
    await expect(brokenBanner(page)).toHaveCount(0);

    // Læreren flytter selv Bo hen til Anna. Ingen regel kan se det ske.
    const annaCard = page.locator('.group-card').filter({ has: page.locator('li', { hasText: 'Anna' }) });
    const annaIndex = await page.locator('.group-card').evaluateAll(
        (cards, name) => cards.findIndex(c => c.textContent?.includes(name)), 'Anna');
    await moveTo(page, 'Bo', annaIndex);

    await expect(brokenBanner(page)).toHaveCount(1);
    await expect(brokenBanner(page)).toContainText('Anna og Bo');
    await expect(annaCard.locator('li', { hasText: 'Bo' })).toHaveCount(1);

    // Beskeden står øverst; markeringen står dér, hvor der skal handles.
    // Præcis de to — ikke deres gruppefæller.
    await expect(page.locator('.group-members-list li.avoid-conflict')).toHaveCount(2);
    await expect(annaCard.locator('li.avoid-conflict', { hasText: 'Anna' })).toHaveCount(1);
    await expect(annaCard.locator('li.avoid-conflict', { hasText: 'Bo' })).toHaveCount(1);

    // Flyt Bo videre til et kort uden Anna — advarslen skal forsvinde af sig selv.
    const otherIndex = await page.locator('.group-card').evaluateAll(
        (cards, name) => cards.findIndex(c => !c.textContent?.includes(name)), 'Anna');
    await moveTo(page, 'Bo', otherIndex);
    await expect(brokenBanner(page)).toHaveCount(0);
    await expect(page.locator('.group-members-list li.avoid-conflict')).toHaveCount(0);
});

test('Er gruppen låst, siger advarslen at en ny gruppedannelse ikke retter den', async ({ page }) => {
    await createClass(page, 'Undgaa Laast', CSV);
    await addAvoidance(page, ['Anna', 'Bo']);
    await goToGroups(page);
    await setGroupSize2(page);
    await generateGroups(page);

    const annaIndex = await page.locator('.group-card').evaluateAll(
        (cards, name) => cards.findIndex(c => c.textContent?.includes(name)), 'Anna');
    await moveTo(page, 'Bo', annaIndex);
    await page.locator('.group-card').nth(annaIndex).locator('.lock-btn').click();

    await expect(brokenBanner(page)).toContainText('Mindst én af grupperne er låst');
});

test('En fraværende elev udløser ingen falsk advarsel', async ({ page }) => {
    await createClass(page, 'Undgaa Fravaer', CSV);
    await addAvoidance(page, ['Anna', 'Bo']);
    await goToGroups(page);
    await setGroupSize2(page);
    await generateGroups(page);

    const annaIndex = await page.locator('.group-card').evaluateAll(
        (cards, name) => cards.findIndex(c => c.textContent?.includes(name)), 'Anna');
    await moveTo(page, 'Bo', annaIndex);
    await expect(brokenBanner(page)).toHaveCount(1);

    // Bo er ikke i lokalet — så er der ingen at holde adskilt.
    await setAbsent(page, 'Bo');
    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();
    await expect(brokenBanner(page)).toHaveCount(0);
});

test('Undgåelses-listen skelner mellem en elev uden navn og en slettet elev', async ({ page }) => {
    await createClass(page, 'Undgaa Liste', CSV);
    await addAvoidance(page, ['Anna', 'Bo']);

    // Slet Bo fra elevlisten. Undgåelsen bliver stående — den skal sige hvorfor
    // den ikke gør noget længere, i stedet for at kalde ham "(uden navn)".
    await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();
    await page.locator('tr').filter({ hasText: 'Bo' }).locator('.delete-row-btn').click();
    await page.locator('.modal-content .actions button', { hasText: /^Slet$/ }).click();

    await page.locator('#together-list-btn').click();
    await page.getByRole('tab', { name: /Undgå hinanden/ }).click();
    const row = page.locator('.avoid-row').first();
    await expect(row).toContainText('Ikke længere i klassen');
    await expect(row).not.toContainText('(uden navn)');
    // "Gør ingenting LIGE NU" er fraværs-sproget. Bo er slettet, ikke fraværende,
    // og undgåelsen kommer aldrig i brug igen — se AvoidTab.vue.
    await expect(row.locator('.avoid-note')).toContainText('Gælder ikke længere');
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Loftet på gruppetallet — beskeden ved MÅLTALSFELTET.
//
// "Antal grupper" gemmes pr. klasse, så et tal valgt til en fuld klasse står
// der stadig den dag, halvdelen er fraværende. Uden loft dannede motoren
// lydigt tomme gruppekort (målt: 8 elever, 14 ønskede grupper → 6 tomme).
// Loftet i generation.js skærer tallet ned, men beskeden skal komme FØR
// generering — læreren kan låse en gruppe op eller rette tallet, og det kan
// programmet ikke gøre for hende.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Beder man om flere grupper end elever, står det ved tallet — før man trykker Dan grupper', async ({ page }) => {
    await createClass(page, 'Hint Loft', CSV);   // 8 elever
    await goToGroups(page);

    // Skift til "Antal grupper" og bed om 20 grupper til 8 elever.
    await setGroupSize(page, 20, 'number');

    // Beskeden står ved størrelsen i opskriften — ikke i banneret over
    // grupperne, hvor den ville skubbe dem ned.
    const note = page.locator('dialog.recipe-dialog[open] .recipe__hints');
    await expect(note).toContainText('Du beder om 20 grupper, men der er kun 8 elever til rådighed');
    await expect(note).toContainText('Der dannes højst 8 grupper');

    // Og et tal der kan lade sig gøre, siger den ingenting om.
    await setGroupSize(page, 4, 'number');
    await expect(note).toHaveCount(0);
});

test('Loftet holder hele vejen: 20 ønskede grupper til 8 elever giver 8 kort — ingen tomme', async ({ page }) => {
    await createClass(page, 'Loft Generering', CSV);
    await goToGroups(page);
    await setGroupSize(page, 20, 'number');

    await generateGroups(page);

    await expect(page.locator('.group-card')).toHaveCount(8);
    // Ingen af kortene må være tomme — det var præcis dét, der skete før.
    const emptyCards = await page.locator('.group-card').evaluateAll(
        (cards) => cards.filter(c => c.querySelectorAll('.student-row, .member-row, li').length === 0).length,
    );
    expect(emptyCards).toBe(0);
});
