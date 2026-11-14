import { Page, expect } from '@playwright/test';

export const DEFAULT_CSV =
    'Navn\tKøn\tKarakter\n' +
    'Anna\tK\t10\nBob\tM\t7\nClara\tK\t12\nDavid\tM\t4\n' +
    'Emma\tK\t10\nFrank\tM\t7\nGitte\tK\t12\nHans\tM\t4\n' +
    'Ida\tK\t10\nJens\tM\t7\nKaren\tK\t12\nLars\tM\t4';

/**
 * Første-gangs-guiderne (opskriften og elevlisten) og telefonbeskeden dækker
 * siden, første gang læreren kommer forbi. Specs, der ikke handler om guiderne, slår dem fra.
 * Kaldes før page.goto; den gælder for alle senere indlæsninger i fanen.
 */
export async function skipGuides(page: Page) {
    await page.addInitScript(() => {
        try {
            localStorage.setItem('grupper-opskrift-guide-set', '1');
            localStorage.setItem('grupper-elevliste-guide-set', '1');
            // Og beskeden om, at Grupper er lavet til computer (under 700 px)
            localStorage.setItem('grupper-smal-skaerm-set', '1');
        } catch { /* uden lager vises guiden */ }
    });
}

/**
 * Gå til appen og vent, til den er klar til at blive brugt (appDebug sat,
 * klasserne læst). Indtil 3/11 2026 skulle Python-motoren (Pyodide) også
 * hentes først, og ventetiden var 120 sek.; `isReady` er nu sand med det samme.
 */
export async function gotoAppReady(page: Page, { guides = false } = {}) {
    if (!guides) await skipGuides(page);
    await page.goto('/');
    await expect(page.locator('#vue-modals')).toBeAttached({ timeout: 15000 });
    await page.waitForFunction(
        () => (window as any).appDebug?.pyBridge?.isReady === true,
        null,
        { timeout: 30000 },
    );
}

/**
 * Opret en klasse ved at indsætte en liste fra velkomstskærmen.
 * `guides: true` lader første-gangs-guiderne komme (til specs om guiderne).
 * Hver test starter i en frisk browser-kontekst (tomt localStorage), så
 * velkomstskærmen med genvejen til at indsætte står der altid.
 */
export async function createClass(page: Page, name = 'Test Klasse E2E', csv: string = DEFAULT_CSV,
    { guides = false } = {}) {
    await gotoAppReady(page, { guides });

    await page.getByRole('button', { name: 'Indsæt klasseliste fra Excel / Sheets' }).click();
    await page.getByRole('button', { name: 'Indsæt tekst / Excel' }).click();

    const nameInput = page.getByPlaceholder('F.eks. 1.g Dansk');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill(name);

    await page.locator('textarea:visible').first().fill(csv);
    await page.getByRole('button', { name: /Opret klasse/i }).click();

    // Klassens tabel viser, at klassen er indlæst. 30 sek.: med 3 browsere ×
    // 16 tests side om side kan tegningen tage langt over de sædvanlige 10.
    await expect(page.locator('th').filter({ hasText: 'Navn' })).toBeVisible({ timeout: 30000 });
    // selectClass() gemmer det, indlæsningen har rettet, med setTimeout(autoSave, 0)
    // — og tabellen kan stå der, før det gem er sket. En test, der derefter
    // skriver i lageret (localStorage.setItem på grupdk_classes) og genindlæser,
    // kunne så få sin rettelse skrevet over af fanens gem. En setTimeout(0) i
    // siden kører efter den, der allerede venter, og gemmet er synkront
    // (updateClass), så her er det sket (123. gennemsyn, tematik 114).
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
}

/**
 * Skift til Grupper-fanen og vent på opskriftens bjælke. Uden grupper åbner
 * opskriftens vindue af sig selv; med grupper står det lukket.
 */
export async function goToGroups(page: Page) {
    // Står vi allerede på Grupper med opskriften åben, dækker den fanerne
    await closeRecipe(page);
    const tab = page.locator('.nav-tab').filter({ hasText: 'Grupper' });
    const alreadyThere = /\bactive\b/.test(await tab.getAttribute('class') || '');
    await tab.click();
    await expect(page.locator('.recipe-bar')).toBeVisible({ timeout: 10000 });
    if (alreadyThere) return;   // fanen tegnes ikke om, og intet åbner af sig selv
    // Vent til fanen har lagt sig: uden grupper åbner opskriften af sig selv
    // (et øjeblik efter bjælken), med grupper står kortene der.
    await page.waitForFunction(() => !!(document.querySelector('dialog.recipe-dialog[open]')
        || document.querySelector('.group-card')), null, { timeout: 10000 });
}

export async function createClassAndGoToGroups(page: Page, name = 'Test Klasse E2E') {
    await createClass(page, name);
    await goToGroups(page);
}

/** Opskriftens vindue (åbnes, hvis det står lukket). */
export async function openRecipe(page: Page) {
    const dialog = page.locator('dialog.recipe-dialog[open]');
    if (!(await dialog.count())) await page.locator('.recipe-bar__open').click();
    await expect(dialog).toBeVisible();
    return dialog;
}

/** Luk opskriftens vindue, hvis det står åbent. */
export async function closeRecipe(page: Page) {
    // Escape lukker først et åbent ord (RecipeToken), så vinduet
    const dialog = page.locator('dialog.recipe-dialog[open]');
    for (let i = 0; i < 3 && await dialog.count(); i++) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
    }
    await expect(dialog).toHaveCount(0);
}

/**
 * Tryk "Dan grupper" (i vinduet, hvis det står åbent, ellers i bjælken) og
 * vent på gruppekortene. Generøs ventetid: motoren starter sine tråde første
 * gang, og flere tests kører samtidig.
 */
export async function generateGroups(page: Page) {
    const dialog = page.locator('dialog.recipe-dialog[open]');
    const button = (await dialog.count())
        ? dialog.locator('.recipe__go')
        : page.locator('.recipe-bar .recipe__go');
    await button.click();
    await expect(page.locator('.group-card').first()).toBeVisible({ timeout: 90000 });
}

/**
 * Vælg i et af opskriftens ord (RecipeToken): åbn ordet med `label`
 * ("Regel", "Kolonne", "Værdi") og klik valget. Regeltyper står med navnet
 * i <strong> og en forklaring under; kolonner og værdier står alene.
 */
export async function pickInToken(page: Page, line: ReturnType<Page['locator']>, label: string, choice: string) {
    await line.locator(`.rtok__btn[aria-label^="${label}:"]`).click();
    const pop = line.locator('.rtok__pop');
    await expect(pop).toBeVisible();
    const exact = new RegExp(`^${choice.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
    const option = label === 'Regel'
        ? pop.locator('.recipe-opt').filter({ has: page.locator('strong', { hasText: exact }) })
        : pop.locator('.recipe-opt').filter({ hasText: exact });
    await option.first().click();
    await expect(pop).toHaveCount(0);
}

/**
 * Tilføj en regel i opskriften ("+ Tilføj regel") og udfyld den. `type` er
 * navnet, som læreren ser det ("Fordel", "Adskil", "Ensartede", "Balancér",
 * "Klyng", "Saml", "Opdel"). En ny regel er Fordel uden kolonne.
 * Returnerer regelens linje.
 */
export async function addRecipeRule(page: Page, opts: { type?: string; column?: string; value?: string } = {}) {
    const dialog = await openRecipe(page);
    const before = await dialog.locator('.recipe__line--rule').count();
    await dialog.getByRole('button', { name: '+ Tilføj regel' }).click();
    const line = dialog.locator(`.recipe__line--rule[data-rule-index="${before}"]`);
    await expect(line).toBeVisible();
    if (opts.type && opts.type !== 'Fordel') await pickInToken(page, line, 'Regel', opts.type);
    if (opts.column) await pickInToken(page, line, 'Kolonne', opts.column);
    if (opts.value) await pickInToken(page, line, 'Værdi', opts.value);
    return line;
}

/**
 * Sæt gruppernes størrelse i opskriften: `mode` 'size' = elever pr. gruppe,
 * 'number' = antal grupper. Gemmes efter 300 ms (debounce), så der ventes.
 */
export async function setGroupSize(page: Page, target: number, mode: 'size' | 'number' = 'size') {
    const dialog = await openRecipe(page);
    await dialog.locator('.rtok__btn[aria-label^="Gruppernes størrelse:"]').click();
    const pop = dialog.locator('.rtok__pop');
    await pop.getByRole('button', { name: mode === 'size' ? 'Elever pr. gruppe' : 'Antal grupper' }).click();
    const input = pop.locator('input[type=number]');
    await input.fill(String(target));
    await input.blur();
    await page.waitForTimeout(400);
    // Escape lukker kun ordets lille menu; vinduet bliver stående
    await page.keyboard.press('Escape');
    await expect(pop).toHaveCount(0);
}

/** Skift til matrix-runden (knappen i opskriftens bjælke; kræver stamgrupper). */
export async function goToMatrix(page: Page) {
    await page.getByRole('button', { name: /Matrix-runde/ }).click();
    await expect(page.locator('.recipe-bar')).toBeVisible();
}

/** Tilbage til stamgrupperne fra matrix-runden. */
export async function goToStandard(page: Page) {
    await page.getByRole('button', { name: /Stamgrupperne/ }).click();
    await expect(page.locator('.recipe-bar')).toBeVisible();
}

/** Én elev mere (+1) eller mindre (-1) pr. gruppe — "+"/"−" i opskriftens størrelse. */
export async function stepGroupSize(page: Page, delta: 1 | -1) {
    const dialog = await openRecipe(page);
    await dialog.locator('.rtok__btn[aria-label^="Gruppernes størrelse:"]').click();
    await dialog.locator('.rtok__pop').getByRole('button', { name: delta > 0 ? 'Flere' : 'Færre' }).click();
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await expect(dialog.locator('.rtok__pop')).toHaveCount(0);
}

/**
 * Tryk "Dan grupper" uden at vente på gruppekort (til kørsler, der må
 * stoppe uden grupper). Venter kun til kørslen er slut.
 */
export async function clickGenerate(page: Page) {
    const dialog = page.locator('dialog.recipe-dialog[open]');
    const button = (await dialog.count())
        ? dialog.locator('.recipe__go')
        : page.locator('.recipe-bar .recipe__go');
    await button.click();
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.isGenerating),
        { timeout: 90000 }).toBe(false);
}

/** Åbn "Gem session" (Gem-knappen i bundbjælken → "Gem i Historik"). */
export async function openSaveSession(page: Page) {
    await page.locator('.save-anchor .action-pill').click();
    await page.getByRole('menuitem', { name: /Gem i Historik/ }).click();
    await expect(page.getByRole('heading', { name: 'Gem session' })).toBeVisible();
}

/** Skriv emner i opskriftens Emner-ord ("Grupperne får … som emner"). */
export async function addTopics(page: Page, topics: string[]) {
    const dialog = await openRecipe(page);
    await dialog.locator('.rtok__btn[aria-label^="Emner:"]').click();
    const input = dialog.getByRole('textbox', { name: 'Nyt emne' });
    for (const t of topics) {
        await input.fill(t);
        await input.press('Enter');
        await expect(dialog.locator('.recipe-topics__name').filter({ hasText: t })).toHaveCount(1);
    }
    await page.keyboard.press('Escape');
    await expect(dialog.locator('.rtok__pop')).toHaveCount(0);
}

/** Åbn "Gem som kolonne" (Gem-knappen i bundbjælken → "Gem som kolonne i elevlisten"). */
export async function openSaveColumn(page: Page) {
    await page.locator('.save-anchor .action-pill').click();
    await page.getByRole('menuitem', { name: /Gem som kolonne/ }).click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
}
