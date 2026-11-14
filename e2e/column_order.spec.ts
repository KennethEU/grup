import { test, expect, Page } from '@playwright/test';
import { createClass, goToGroups, generateGroups, openRecipe, closeRecipe, addRecipeRule, setGroupSize } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rangering af en tekstkolonne — "Lav < Middel < Høj".
//
// "Ensartede" og "Balancér" kan kun arbejde med tal. Vælger læreren en
// tekstkolonne, gør de bogstaveligt talt ingenting. Advarslen om det skal
// pege på sin egen udvej: en knap der åbner rangeringen. Og når kolonnen ER
// rangeret, skal advarslen tie — ellers skælder den ud over noget læreren
// lige har ordnet, og så holder man op med at læse hints.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 12 elever fordelt på tre niveauer, så 6 grupper à 2 kan blive rene.
const CSV =
    'Navn\tNiveau\n' +
    'Anna\tLav\nBo\tMiddel\nCarl\tHøj\nDorte\tLav\n' +
    'Emil\tMiddel\nFrida\tHøj\nGustav\tLav\nHanne\tMiddel\n' +
    'Ida\tHøj\nJens\tLav\nKaren\tMiddel\nLars\tHøj';

/**
 * En "Ensartede"-regel på Niveau. Opskriften lader ikke læreren vælge en
 * tekstkolonne til Ensartede uden at rangere den (kolonnen er slået fra med
 * en "Ranger"-knap ved siden af); men en regel kan stadig stå sådan — fra en
 * backup, eller når klasselisten skiftes ud. Derfor lægges den ind direkte.
 */
async function addUniformRule(page: Page) {
    await page.evaluate(() => {
        (window as any).appDebug.state.currentClass.rules =
            [{ type: 'minimizediff', column: 'Niveau', value: '' }];
    });
    await openRecipe(page);
}

const hint = (page: Page) => page.locator('dialog.recipe-dialog[open] .gh-hint').filter({ hasText: 'gør ingenting' });

test('advarslen om en tekstkolonne peger på sin egen udvej', async ({ page }) => {
    await createClass(page, 'Rang E2E', CSV);
    await goToGroups(page);
    await addUniformRule(page);

    await expect(hint(page)).toBeVisible();
    await expect(hint(page)).toContainText('kan kun arbejde med tal');
    await expect(hint(page).locator('.gh-hint-action')).toHaveText('Ranger værdierne…');
});

test('i kolonnevalget er en tekstkolonne slået fra til Ensartede — med "Ranger" ved siden af', async ({ page }) => {
    await createClass(page, 'Rang E2E', CSV);
    await goToGroups(page);
    const line = await addRecipeRule(page, { type: 'Ensartede' });
    await line.locator('.rtok__btn[aria-label^="Kolonne:"]').click();
    const row = line.locator('.rtok__pop .recipe-opt-row').filter({ hasText: 'Niveau' });
    await expect(row.locator('.recipe-opt')).toBeDisabled();
    await row.locator('.recipe-opt__rank').click();
    await expect(page.locator('#order-col')).toHaveValue('Niveau');
});

test('knappen åbner rangeringen på netop den kolonne, advarslen handler om', async ({ page }) => {
    await createClass(page, 'Rang E2E', CSV);
    await goToGroups(page);
    await addUniformRule(page);

    await hint(page).locator('.gh-hint-action').click();

    // Opskriften lukker, så rangeringen ikke åbner usynligt bag den
    await expect(page.locator('dialog.recipe-dialog[open]')).toHaveCount(0);
    await expect(page.locator('.modal-content')).toBeVisible();
    await expect(page.locator('#order-col')).toHaveValue('Niveau');
    // Værdierne står der, i dansk alfabetisk orden som udgangspunkt.
    await expect(page.locator('.order-row')).toHaveCount(3);
    await expect(page.locator('.order-row .col-name')).toHaveText(['Høj', 'Lav', 'Middel']);
});

test('rækkefølgen kan sættes uden mus, og advarslen forsvinder når den er gemt', async ({ page }) => {
    await createClass(page, 'Rang E2E', CSV);
    await goToGroups(page);
    await addUniformRule(page);
    await hint(page).locator('.gh-hint-action').click();

    // Høj, Lav, Middel → Lav, Middel, Høj. Træk-og-slip virker hverken på
    // touch eller tastatur, så pilene er den primære vej.
    const rows = page.locator('.order-row');
    await rows.nth(0).locator('.step').nth(1).click();   // Høj ned
    await rows.nth(1).locator('.step').nth(1).click();   // Høj ned igen
    await expect(page.locator('.order-row .col-name')).toHaveText(['Lav', 'Middel', 'Høj']);
    // Tallet er den rang motoren regner med — 1 er lavest.
    await expect(page.locator('.order-row .rank')).toHaveText(['1', '2', '3']);

    await page.getByRole('button', { name: 'Gem rækkefølge' }).click();

    await expect(page.locator('.modal-content')).toHaveCount(0);
    await openRecipe(page);
    await expect(hint(page)).toHaveCount(0);
});

test('efter rangeringen samler Ensartede eleverne på niveau', async ({ page }) => {
    await createClass(page, 'Rang E2E', CSV);
    await goToGroups(page);
    await addUniformRule(page);
    await hint(page).locator('.gh-hint-action').click();
    const rows = page.locator('.order-row');
    await rows.nth(0).locator('.step').nth(1).click();
    await rows.nth(1).locator('.step').nth(1).click();
    await page.getByRole('button', { name: 'Gem rækkefølge' }).click();

    // Størrelse 2 → 6 grupper, og hver af dem KAN være ren.
    await setGroupSize(page, 2);
    await generateGroups(page);

    // Læs hvert gruppekorts niveauer op og tæl de rene. `.member-name-text`
    // er NAVNET alene — hele li'en rummer også elevens tags ("BonivMiddel").
    const levels: Record<string, string> = {};
    for (const line of CSV.split('\n').slice(1)) {
        const [studentName, level] = line.split('\t');
        levels[studentName] = level;
    }
    const cards = await page.locator('.group-card').all();
    let uniformCards = 0;
    for (const k of cards) {
        const studentNames = await k.locator('.member-name-text').allTextContents();
        const levelsOnCards = studentNames.map(n => levels[n.trim()]).filter(Boolean);
        expect(levelsOnCards).toHaveLength(studentNames.length);   // navnene SKAL kunne slås op
        if (new Set(levelsOnCards).size === 1) uniformCards++;
    }
    // Uden rangering gjorde reglen ingenting og resultatet var tilfældigt.
    // Med den skal langt de fleste grupper være ensartede.
    expect(uniformCards).toBeGreaterThanOrEqual(4);
});

test('rangeringen kan fjernes igen — og så er advarslen tilbage', async ({ page }) => {
    await createClass(page, 'Rang E2E', CSV);
    await goToGroups(page);
    await addUniformRule(page);
    await hint(page).locator('.gh-hint-action').click();
    await page.getByRole('button', { name: 'Gem rækkefølge' }).click();
    // Knappen lukkede opskriften (så rangeringen kunne ses) — åbn den igen
    await openRecipe(page);
    await expect(hint(page)).toHaveCount(0);
    await closeRecipe(page);

    await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();
    await page.locator('#rank-btn').click();
    await page.getByRole('button', { name: 'Fjern rangering' }).click();

    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();
    await expect(hint(page)).toBeVisible();
});

// 4 elever er nok her — testen handler om ordene, ikke om grupperne.
const CSV_SMALL = 'Navn\tNiveau\nAnna\tLav\nBo\tMiddel\nCarl\tHøj\nDorte\tLav';

/** Skriv en ny værdi i Niveau-kolonnen for hver elev i listen. */
async function writeLevels(page: Page, cellValues: string[]) {
    await closeRecipe(page);
    await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();
    for (let i = 0; i < cellValues.length; i++) {
        const firstCell = page.locator('tbody tr').nth(i).locator('td.cell-data').nth(1);
        await firstCell.click();
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type(cellValues[i]);
        await firstCell.blur();
    }
}

test('en rangering ingen elev længere rammer, får advarslen tilbage', async ({ page }) => {
    // Fundet ved dobbelttjekket 2026-08-25: hintet tav, så snart der LÅ en
    // rækkefølge — også når klasselisten var skiftet ud med en, der bruger
    // helt andre ord. Så gør reglen lige så lidt som før, og læreren får ingen
    // besked om hvorfor.
    await createClass(page, 'Rang E2E', CSV_SMALL);
    await goToGroups(page);
    await addUniformRule(page);
    await hint(page).locator('.gh-hint-action').click();
    await page.getByRole('button', { name: 'Gem rækkefølge' }).click();
    // Knappen lukkede opskriften (så rangeringen kunne ses) — åbn den igen
    await openRecipe(page);
    await expect(hint(page)).toHaveCount(0);

    await writeLevels(page, ['A', 'B', 'C', 'A']);

    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();
    await expect(hint(page)).toBeVisible();
    await expect(hint(page)).toContainText('kan kun arbejde med tal');
    // Og den står ALENE (gennemsyn 101, 13/11 2026): den forældede rækkefølge
    // blev før sendt til motoren, som svarede "4 elever har en værdi i
    // "Niveau", som ikke står i rækkefølgen" — to advarsler om samme regel.
    const allHints = page.locator('dialog.recipe-dialog[open] .gh-hint');
    await expect(allHints.filter({ hasText: 'Niveau' })).toHaveCount(1);
    await expect(allHints.filter({ hasText: 'ikke står i rækkefølgen' })).toHaveCount(0);

    // Og rammer bare ÉN elev igen, tier den som før.
    await writeLevels(page, ['Lav', 'B', 'C', 'A']);
    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();
    await expect(hint(page)).toHaveCount(0);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tal i NOGLE FÅ celler (gennemsyn 100, 13/11 2026).
//
// Motoren regner med tal, så snart én celle er et tal: reglen bruges på de
// elever, og resten placeres frit. Advarslen sagde "gør ingenting" — det
// passede ikke, og den afløser motorens egen note om det samme.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test('få tal i en kolonne med ord: advarslen siger, at reglen kun virker for dem', async ({ page }) => {
    await createClass(page, 'Rang E2E', CSV.replace('Anna\tLav', 'Anna\t3').replace('Bo\tMiddel', 'Bo\t4'));
    await goToGroups(page);
    await addUniformRule(page);

    const few = page.locator('dialog.recipe-dialog[open] .gh-hint').filter({ hasText: 'virker kun for de få elever' });
    await expect(few).toBeVisible();
    await expect(few).toContainText('resten har tekst og placeres frit');
    await expect(few.locator('.gh-hint-action')).toHaveText('Ranger værdierne…');
    await expect(hint(page)).toHaveCount(0);
    // Kun ÉN besked om kolonnen — motorens "der ikke er et tal" fra
    // prøvekørslen står ikke ved siden af.
    await page.waitForTimeout(1500);
    await expect(page.locator('dialog.recipe-dialog[open] .gh-hint').filter({ hasText: 'der ikke er et tal' })).toHaveCount(0);
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
});

test('en gemt rangering med samme værdi to gange vises og gemmes med ét trin pr. værdi', async ({ page }) => {
    await createClass(page, 'Rang E2E', CSV);
    // Kun muligt fra en håndredigeret backup: "Lav" og "lav" som to trin.
    // Motoren giver rangen efter pladsen i listen, så dubletten gav et hul.
    await page.evaluate(() => {
        (window as any).appDebug.state.currentClass.columnOrders = { Niveau: ['Lav', 'lav', 'Middel', 'Høj'] };
    });
    await page.locator('button').filter({ hasText: /^\s*Ranger\s*$/ }).first().click();
    await expect(page.locator('#order-col')).toHaveValue('Niveau');
    await expect(page.locator('.order-row .col-name')).toHaveText(['Lav', 'Middel', 'Høj']);
    await page.getByRole('button', { name: 'Gem rækkefølge' }).click();
    const saved = await page.evaluate(() => (window as any).appDebug.state.currentClass.columnOrders.Niveau);
    expect(saved).toEqual(['Lav', 'Middel', 'Høj']);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tal-kolonne, men alle med et tal er fraværende (111. gennemsyn, 13/11 2026).
//
// Kolonnen er tal for klassen, så opskriften sagde intet. Men motoren ser kun
// de elever, der er til stede, og de har tekst: Balancér gør ingenting.
// Motoren sagde det selv, men den besked viser appen aldrig (den ville sige
// "kolonnen har ingen tal" om en kolonne fuld af tal). Nu siger appen det med
// den rigtige grund — og tier, så snart en elev med et tal er tilbage.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test('Balancér på en tal-kolonne, hvor alle med et tal er fraværende, siger til', async ({ page }) => {
    const csv = 'Navn\tPoint\n'
        + 'Anna\t3\nBo\t5\nCarl\t2\nDorte\t4\nEmil\t1\nFrida\t3\n'
        + 'Gustav\tMiddel\nHanne\tMiddel\nIda\tMiddel\nJens\tMiddel';
    const withNumber = ['Anna', 'Bo', 'Carl', 'Dorte', 'Emil', 'Frida'];
    // Fravær sættes, som læreren gør det: fluebenet i Elevliste.
    const setPresent = async (name: string, present: boolean) => {
        await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();
        const box = page.locator('tr').filter({ hasText: name }).locator('.cell-checkbox input').nth(1);
        if (present) await box.check(); else await box.uncheck();
    };
    const toGroups = () => page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();
    const stack = (p: Page) => p.locator('dialog.recipe-dialog[open] .gh-hint');
    const gap = (p: Page) => stack(p).filter({ hasText: 'fraværende eller låst fast' });

    await createClass(page, 'Point Fravaer', csv);
    await goToGroups(page);
    await addRecipeRule(page, { type: 'Balancér', column: 'Point' });
    // Alle til stede: kolonnen er tal, reglen virker. Motoren noterer de fire
    // med tekst ("… der ikke er et tal"), men ingen siger "gør ingenting".
    await expect(stack(page).filter({ hasText: 'ikke er et tal' })).toHaveCount(1);
    await expect(stack(page).filter({ hasText: 'gør ingenting' })).toHaveCount(0);
    await closeRecipe(page);

    // De seks med et tal er fraværende.
    for (const name of withNumber) await setPresent(name, false);
    await toGroups();
    await openRecipe(page);
    await expect(gap(page)).toBeVisible();
    await expect(gap(page)).toContainText('gør ingenting lige nu');
    // Ingen "Ranger"-knap: det er ikke kolonnen, der skal rettes.
    await expect(gap(page).locator('.gh-hint-action')).toHaveCount(0);
    // Og motorens egen besked ("kolonnen har ingen tal") står ikke ved siden af.
    await expect(stack(page).filter({ hasText: 'kolonnen har ingen tal' })).toHaveCount(0);
    await closeRecipe(page);

    // Én med et tal er tilbage: reglen virker igen, advarslen går.
    await setPresent('Anna', true);
    await toGroups();
    await openRecipe(page);
    await expect(gap(page)).toHaveCount(0);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Elevlisten sorterer en rangeret kolonne efter rækkefølgen (forslag 97,
// Kenneth sagde ja 14/11 2026). Før: alfabetisk (Høj, Lav, Middel), mens
// grupperne blev dannet på Lav < Middel < Høj. Værdier uden for rækkefølgen
// og tomme celler står til sidst — også når sorteringen vendes.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test('elevlisten sorterer en rangeret kolonne efter rækkefølgen', async ({ page }) => {
    const csv = 'Navn\tNiveau\nAnna\tHøj\nBo\tLav\nCarl\t\nDorte\tMiddel\nEmil\tukendt\nFrida\tLav';
    await createClass(page, 'Sortering E2E', csv);
    await page.evaluate(() => {
        (window as any).appDebug.state.currentClass.columnOrders = { Niveau: ['Lav', 'Middel', 'Høj'] };
    });
    const header = page.locator('thead th').filter({ hasText: 'Niveau' });
    // Niveau er den anden datakolonne (efter Navn), læst fra den viste tabel.
    const niveauer = () => page.locator('tbody tr').evaluateAll(rows =>
        rows.map(tr => (tr.querySelectorAll('td.cell-data')[1]?.textContent || '').trim()));

    await header.click();
    await expect.poll(niveauer).toEqual(['Lav', 'Lav', 'Middel', 'Høj', 'ukendt', '']);
    await header.click();
    await expect.poll(niveauer).toEqual(['Høj', 'Middel', 'Lav', 'Lav', 'ukendt', '']);
});
