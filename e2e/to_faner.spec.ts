import { test, expect, Page } from '@playwright/test';
import { createClass, gotoAppReady, goToGroups, generateGroups, goToMatrix, openRecipe } from './helpers';

/**
 * To faner, ét lager.
 *
 * Læreren har tit Grupper åben to steder — et link fra Lectio åbner en ny
 * fane frem for at finde den gamle frem. Begge faner skriver i det SAMME
 * localStorage, og der findes ingen server til at holde styr på hvem der har
 * ret.
 *
 * Det der gik galt før: slettede hun klassen i den ene fane, opdagede den
 * anden det aldrig. Et tastetryk dér — eller bare at LUKKE fanen, hvor
 * `flushPendingWrites()` gemmer en sidste gang — skrev klassen tilbage i
 * listen. Den kom igen uden sine grupper, sin historik og sine emner (de var
 * slettet med klassen), og elevernes navne var tilbage i browseren efter at
 * læreren havde slettet dem.
 *
 * `persistence.test.js` værner om selve afvisningen i `updateClass()`. Den
 * her værner om ledningen: at den anden fane opdager sletningen i det
 * øjeblik den sker, siger det, og lukker klassen.
 *
 * BEMÆRK: begge sider skal ligge i SAMME browser-kontekst. En ny kontekst er
 * et nyt lager, og så deler de to faner ingenting.
 */

/** Slet en klasse via klassemenuen — den vej læreren bruger. */
async function deleteClass(page: Page, name: string) {
    await page.locator('.class-trigger').click();
    const row = page.locator('.class-list .class-item').filter({ hasText: name }).first();
    await row.locator('.delete-btn').click();
    // Scopet til dialogen: rækkens egen slette-knap hedder også "Slet klasse".
    await page.getByRole('dialog').getByRole('button', { name: 'Slet', exact: true }).click();
}

test('sletning i den ene fane lukker klassen i den anden — og den kommer ikke igen', async ({ context }) => {
    const tabA = await context.newPage();
    await createClass(tabA, '2a To Faner');

    // Fane B åbnes bagefter og lander på den samme klasse.
    const tabB = await context.newPage();
    await gotoAppReady(tabB);
    await expect(tabB.locator('.class-trigger')).toContainText('2a To Faner', { timeout: 30000 });

    // Læreren sletter klassen i fane B.
    await deleteClass(tabB, '2a To Faner');

    // Fane A skal sige det — og lukke klassen frem for at lade hende arbejde
    // videre i noget, der ikke kan gemmes.
    await expect(tabA.locator('.toast, .notification').filter({ hasText: 'slettet i en anden fane' }))
        .toBeVisible({ timeout: 10000 });
    await expect.poll(
        () => tabA.evaluate(() => (window as any).appDebug.state.currentClass),
        { timeout: 10000 },
    ).toBeNull();

    // Og fane A's sidste gem ved lukning må ikke skrive klassen tilbage.
    await tabA.close({ runBeforeUnload: true });
    await expect.poll(
        () => tabB.evaluate(() => JSON.parse(localStorage.getItem('grupdk_classes') || '[]').length),
        { timeout: 10000 },
    ).toBe(0);
});

/**
 * Værnet i selve skrivningen — uden hjælp fra beskeden ovenfor.
 *
 * Testen over den her lukker klassen, så snart storage-hændelsen lander, og
 * DERFOR er der intet at gemme, når fanen lukkes. Men hændelsen er ikke et
 * løfte: den kan komme for sent, den kommer slet ikke i den fane der selv
 * skrev, og en fane der lukkes i samme sekund når måske aldrig at behandle
 * den. Så `updateClass()` skal sige nej på egen hånd.
 *
 * Sletningen efterlignes med en skrivning i fane A's EGEN fane: en fane får
 * ikke sin egen storage-hændelse, så appen ved intet — præcis den tilstand,
 * værnet skal kunne stå alene i.
 */
test('et gem skriver ikke en slettet klasse tilbage — også uden beskeden', async ({ page }) => {
    await createClass(page, '2a To Faner');

    // Klassen forsvinder fra lageret, uden at fanen får besked om det.
    await page.evaluate(() => localStorage.setItem('grupdk_classes', '[]'));
    expect(await page.evaluate(
        () => (window as any).appDebug.state.currentClass?.filename)).toBeTruthy();

    // Fanen lukkes — flushPendingWrites() gemmer en sidste gang.
    await page.close({ runBeforeUnload: true });

    const confirmation = await page.context().newPage();
    await gotoAppReady(confirmation);
    expect(await confirmation.evaluate(
        () => JSON.parse(localStorage.getItem('grupdk_classes') || '[]').length)).toBe(0);
});

test('en klasse oprettet i den ene fane dukker op i den andens menu', async ({ context }) => {
    const tabA = await context.newPage();
    await createClass(tabA, '2a To Faner');

    const tabB = await context.newPage();
    await gotoAppReady(tabB);
    await expect(tabB.locator('.class-trigger')).toContainText('2a To Faner', { timeout: 30000 });

    // Fane B opretter en klasse mere.
    await tabB.locator('.class-trigger').click();
    await tabB.locator('.glass-dropdown .add-btn').click();
    const input = tabB.locator('.modal-overlay input[type="text"]').first();
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('3b To Faner');
    await tabB.getByRole('button', { name: /^Opret$/ }).click();
    await expect(tabB.locator('.class-trigger')).toContainText('3b To Faner', { timeout: 30000 });

    // Fane A's menu skal kende den. Før viste den en liste fra dengang fanen
    // blev åbnet, og læreren kunne ikke skifte til sin nye klasse uden F5.
    await tabA.locator('.class-trigger').click();
    await expect(tabA.locator('.class-list .class-item').filter({ hasText: '3b To Faner' }))
        .toBeVisible({ timeout: 10000 });
});

/**
 * Grupperne dannes i fane A, mens fane B står på den samme klasse. B siger
 * det — og tilbyder at hente A's grupper ind, i stedet for at læreren skal
 * genindlæse siden (eller arbejde videre og skrive A's kørsel væk).
 */
test('"Hent de nye grupper" henter den anden fanes grupper ind', async ({ context }) => {
    const tabA = await context.newPage();
    await createClass(tabA, '2a To Faner');
    await goToGroups(tabA);
    await generateGroups(tabA);

    const tabB = await context.newPage();
    await gotoAppReady(tabB);
    await expect(tabB.locator('.class-trigger')).toContainText('2a To Faner', { timeout: 30000 });
    const groupsIn = (page: Page) => page.evaluate(() =>
        JSON.stringify(((window as any).appDebug.state.storedStandardGroups || []).map((g: any) => g.members)));
    const before = await groupsIn(tabB);

    // Fane A danner nye grupper (indtil fordelingen faktisk er en anden).
    let fresh = before;
    for (let i = 0; i < 5 && fresh === before; i++) {
        await generateGroups(tabA);
        fresh = await groupsIn(tabA);
    }
    expect(fresh).not.toBe(before);
    // Fane A gemmer igen lidt efter en kørsel (og nogle gange en ny fordeling).
    // Vent, til A står stille, så det er DE grupper, B henter.
    await expect.poll(async () => {
        const a = await groupsIn(tabA);
        await tabA.waitForTimeout(1000);
        return a === await groupsIn(tabA) ? a : null;
    }, { timeout: 20000 }).not.toBeNull();
    fresh = await groupsIn(tabA);

    // Fane B foran: i en fane i baggrunden fryser browseren overgangene, og
    // en lukket besked bliver hængende midt i sin udgang.
    await tabB.bringToFront();
    const toast = tabB.locator('.toast').filter({ hasText: 'ændret i en anden fane' });
    await expect(toast).toBeVisible({ timeout: 10000 });
    // B viser stadig de gamle — intet skiftes af sig selv
    expect(await groupsIn(tabB)).toBe(before);

    await toast.getByRole('button', { name: 'Hent de nye grupper' }).click();
    await expect.poll(() => groupsIn(tabB), { timeout: 10000 }).toBe(fresh);
    await expect(toast).toHaveCount(0);
});

/**
 * "Hent de nye grupper" skifter hele fordelingen ud. Noterne om fane B's egen
 * sidste kørsel ("… par ender i samme gruppe (Gruppe 1)") handler så om
 * grupper, der ikke står der længere, og skal væk (106. gennemsyn,
 * forgetRunResults i setupNotices.js).
 */
test('"Hent de nye grupper": "Sidste dannelse" nævner ikke fanens egne, forladte grupper', async ({ context }) => {
    const csv = 'Navn\tKøn\n' +
        'Anna\tK\nBo\tM\nCarl\tM\nDan\tM\nEmil\tM\nFrode\tM\nGustav\tM\nHans\tM\nIb\tM\nJens\tM\nKurt\tM\nLis\tK';
    const separateBoys = (page: Page) => page.evaluate(() => {
        (window as any).appDebug.state.currentClass.rules = [{ type: 'separate', column: 'Køn', value: 'M' }];
    });
    const groupsIn = (page: Page) => page.evaluate(() =>
        JSON.stringify(((window as any).appDebug.state.storedStandardGroups || []).map((g: any) => g.members)));

    const tabA = await context.newPage();
    await createClass(tabA, '2a Faner Noter', csv);
    await separateBoys(tabA);
    await goToGroups(tabA);
    await generateGroups(tabA);

    const tabB = await context.newPage();
    await gotoAppReady(tabB);
    await expect(tabB.locator('.class-trigger')).toContainText('2a Faner Noter', { timeout: 30000 });
    await separateBoys(tabB);
    await goToGroups(tabB);
    await generateGroups(tabB);
    const recipeB = await openRecipe(tabB);
    await expect(recipeB.locator('.gh-hint--last', { hasText: 'ender i samme gruppe' })).not.toHaveCount(0);
    await tabB.keyboard.press('Escape');
    const before = await groupsIn(tabB);

    // Fane A danner nye grupper, indtil fordelingen er en anden.
    await tabA.bringToFront();
    let fresh = before;
    for (let i = 0; i < 5 && fresh === before; i++) {
        await generateGroups(tabA);
        fresh = await groupsIn(tabA);
    }
    expect(fresh).not.toBe(before);

    await tabB.bringToFront();
    const toast = tabB.locator('.toast').filter({ hasText: 'ændret i en anden fane' });
    await expect(toast).toBeVisible({ timeout: 10000 });
    await toast.getByRole('button', { name: 'Hent de nye grupper' }).click();
    await expect.poll(() => groupsIn(tabB), { timeout: 10000 }).not.toBe(before);

    const after = await openRecipe(tabB);
    await expect(after.locator('.gh-hint--last', { hasText: 'ender i samme gruppe' })).toHaveCount(0);
});

/**
 * Et klik i en celle er ikke en rettelse.
 *
 * Før gemte elevlisten HELE klassen, hver gang markøren forlod en celle —
 * også når læreren bare havde klikket eller tabbet forbi. Med samme klasse
 * åben i to faner betød det: retter hun et navn i fane A, og klikker hun
 * bagefter blot i en celle i fane B (som stadig viser den gamle udgave),
 * skrev B sin gamle udgave over A's rettelse ét sekund senere. Nu gemmer
 * cellen kun, når teksten faktisk er en anden.
 */
test('et klik i en celle i den anden fane skriver ikke en rettelse væk', async ({ context }) => {
    const tabA = await context.newPage();
    await createClass(tabA, '2a To Faner');
    const tabB = await context.newPage();
    await gotoAppReady(tabB);
    await expect(tabB.locator('.class-trigger')).toContainText('2a To Faner', { timeout: 30000 });
    await expect(tabB.locator('#table-container tbody tr')).toHaveCount(12);

    // Klassen, som den ligger i lageret (som tekst: navnet skal bare stå i den)
    const storedNames = (page: Page) => page.evaluate(() =>
        JSON.stringify(JSON.parse(localStorage.getItem('grupdk_classes') || '[]')[0]?.content ?? null));

    // Fane A retter Anna til Annika og forlader cellen; gemmet kommer efter 1 sek.
    await tabA.bringToFront();
    const cellA = tabA.locator('#table-container tbody tr').first().locator('td.cell-data').first();
    await expect(cellA).toHaveText('Anna');
    await cellA.click();
    await tabA.keyboard.press('End');
    await tabA.keyboard.type('ka');
    await tabA.keyboard.press('Tab');
    await expect.poll(() => storedNames(tabA), { timeout: 10000 }).toContain('Annaka');

    // Fane B: læreren klikker i en anden elevs celle og går videre uden at skrive.
    await tabB.bringToFront();
    const cellB = tabB.locator('#table-container tbody tr').nth(3).locator('td.cell-data').first();
    await cellB.click();
    await tabB.keyboard.press('Tab');
    // Længere end gemmets ventetid (1 sek.)
    await tabB.waitForTimeout(2500);

    expect(await storedNames(tabB)).toContain('Annaka');
});

/**
 * Samme fejl, større: at LUKKE den gamle fane.
 *
 * `flushPendingWrites()` gemmer en sidste gang, når en fane lukkes — for at
 * redde en celle, læreren stod i. Men den gemte også, når fanen intet havde
 * rørt. Åbnede læreren Grupper igen fra Lectio, arbejdede i den nye fane og
 * lukkede så den gamle, skrev den gamle sin udgave over ALT det nye (målt
 * 10/11 2026). Nu skriver en fane kun det, den selv har ændret.
 */
test('lukkes den urørte anden fane, skriver den ikke en rettelse væk', async ({ context }) => {
    const tabA = await context.newPage();
    await createClass(tabA, '2a To Faner');
    const tabB = await context.newPage();
    await gotoAppReady(tabB);
    await expect(tabB.locator('#table-container tbody tr')).toHaveCount(12);
    const stored = (page: Page) => page.evaluate(() =>
        JSON.stringify(JSON.parse(localStorage.getItem('grupdk_classes') || '[]')[0]?.content ?? null));

    // Fane A retter et navn og danner grupper (de ligger i deres egen nøgle).
    await tabA.bringToFront();
    const cellA = tabA.locator('#table-container tbody tr').first().locator('td.cell-data').first();
    await cellA.click();
    await tabA.keyboard.press('End');
    await tabA.keyboard.type('ka');
    await tabA.keyboard.press('Tab');
    await expect.poll(() => stored(tabA), { timeout: 10000 }).toContain('Annaka');
    await goToGroups(tabA);
    await generateGroups(tabA);

    // Vent, til fane A står stille, og tag et billede af HELE lageret.
    const everything = (page: Page) => page.evaluate(() =>
        JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
    await expect.poll(async () => {
        const a = await everything(tabA);
        await tabA.waitForTimeout(1200);
        return a === await everything(tabA) ? a : null;
    }, { timeout: 20000 }).not.toBeNull();
    const before = await everything(tabA);

    // Den urørte fane B lukkes — og gemmer en sidste gang (flushPendingWrites).
    await tabB.close({ runBeforeUnload: true });
    await tabA.waitForTimeout(1500);

    expect(await stored(tabA)).toContain('Annaka');
    // Intet andet er heller skrevet: grupperne, historikken og indstillingerne
    // ligger i egne nøgler og gemmes kun, når der venter noget (debounce.flush).
    expect(await everything(tabA)).toBe(before);
});

/**
 * En backup i den gamle fane er heller ikke en rettelse.
 *
 * Fanen husker, hvilken udgave af klassen den har på skærmen, og skriver kun,
 * når den selv har ændret noget (_hasOwnChange i py_bridge.js). Men backuppen
 * læste klasserne gennem samme vej som indlæsningen og flyttede dermed fanens
 * "set" til lagerets NYE udgave — mens skærmen stadig viste den gamle. Tog
 * læreren en backup i den gamle fane og lukkede den bagefter, skrev den sin
 * gamle udgave over den nye fanes rettelser, og uden advarsel. Målt 10/11 2026.
 */
test('en backup i den urørte anden fane skriver ikke en rettelse væk, når den lukkes', async ({ context }) => {
    const tabA = await context.newPage();
    await createClass(tabA, '2a To Faner');
    const tabB = await context.newPage();
    await gotoAppReady(tabB);
    await expect(tabB.locator('#table-container tbody tr')).toHaveCount(12);
    const stored = (page: Page) => page.evaluate(() =>
        JSON.stringify(JSON.parse(localStorage.getItem('grupdk_classes') || '[]')[0]?.content ?? null));

    // Fane A retter Anna til Annaka.
    await tabA.bringToFront();
    const cellA = tabA.locator('#table-container tbody tr').first().locator('td.cell-data').first();
    await cellA.click();
    await tabA.keyboard.press('End');
    await tabA.keyboard.type('ka');
    await tabA.keyboard.press('Tab');
    await expect.poll(() => stored(tabA), { timeout: 10000 }).toContain('Annaka');

    // Fane B (viser stadig Anna) tager en backup af alle klasser.
    await tabB.bringToFront();
    await tabB.locator('.nav-tab').filter({ hasText: 'Import & backup' }).click();
    await tabB.getByRole('button', { name: 'Eksportér', exact: true }).click();
    await tabB.getByRole('button', { name: /Vælg alle/i }).click();
    const pending = tabB.waitForEvent('download');
    await tabB.getByRole('button', { name: /Download backup/i }).click();
    await pending;

    // Fane B lukkes — flushPendingWrites() gemmer en sidste gang.
    await tabB.close({ runBeforeUnload: true });
    await tabA.waitForTimeout(1500);

    expect(await stored(tabA)).toContain('Annaka');
});

/**
 * Et klik i gruppestørrelsen er heller ikke en rettelse.
 *
 * Ældre klasser har størrelsen gemt som tekst ("4"), feltet giver et tal (4).
 * Bare at klikke i feltet og videre talte derfor som en ændring, og den
 * gamle fane gemte HELE sin udgave af klassen — oven i den nye fanes
 * rettelser. Målt 10/11 2026. Se sameSettings() i BetaGroupsTab.vue.
 */
test('et klik i gruppestørrelsen i den anden fane skriver ikke en rettelse væk', async ({ context }) => {
    const tabA = await context.newPage();
    await createClass(tabA, '2a To Faner');
    const tabB = await context.newPage();
    await gotoAppReady(tabB);
    await expect(tabB.locator('#table-container tbody tr')).toHaveCount(12);
    const stored = (page: Page) => page.evaluate(() =>
        JSON.stringify(JSON.parse(localStorage.getItem('grupdk_classes') || '[]')[0]?.content ?? null));

    await tabA.bringToFront();
    const cellA = tabA.locator('#table-container tbody tr').first().locator('td.cell-data').first();
    await cellA.click();
    await tabA.keyboard.press('End');
    await tabA.keyboard.type('ka');
    await tabA.keyboard.press('Tab');
    await expect.poll(() => stored(tabA), { timeout: 10000 }).toContain('Annaka');

    // Fane B: læreren åbner gruppestørrelsen og går ud af feltet uden at ændre det.
    await tabB.bringToFront();
    await goToGroups(tabB);
    const dialog = await openRecipe(tabB);
    await dialog.locator('.rtok__btn[aria-label^="Gruppernes størrelse:"]').click();
    const input = dialog.locator('.rtok__pop input[type=number]');
    await input.focus();
    await input.blur();
    // Længere end indstillingernes (300 ms) og gemmets (1 sek.) ventetid
    await tabB.waitForTimeout(2500);

    expect(await stored(tabA)).toContain('Annaka');
});

/**
 * Matrix-runden i den gamle fane.
 *
 * Har stamgrupperne ingen emner, skifter matrix-opskriften selv til
 * "Stamgruppe" — og gemte før hele klassen i samme øjeblik, så bare at
 * åbne Matrix-runden i den gamle fane skrev den nye fanes rettelser væk.
 * Et klik på det, der allerede er valgt ("Én fra hver"), gjorde det samme.
 * Målt 10/11 2026.
 */
test('at åbne Matrix-runden i den anden fane skriver ikke en rettelse væk', async ({ context }) => {
    const tabA = await context.newPage();
    await createClass(tabA, '2a To Faner');
    await goToGroups(tabA);
    await generateGroups(tabA);
    const tabB = await context.newPage();
    await gotoAppReady(tabB);
    await expect(tabB.locator('.class-trigger')).toContainText('2a To Faner', { timeout: 30000 });
    const stored = (page: Page) => page.evaluate(() =>
        JSON.stringify(JSON.parse(localStorage.getItem('grupdk_classes') || '[]')[0]?.content ?? null));

    // Fane A går tilbage til elevlisten og retter Anna til Annaka.
    await tabA.bringToFront();
    await tabA.locator('.nav-tab').filter({ hasText: /Elevliste|Elever/ }).first().click();
    const cellA = tabA.locator('#table-container tbody tr').first().locator('td.cell-data').first();
    await cellA.click();
    await tabA.keyboard.press('End');
    await tabA.keyboard.type('ka');
    await tabA.keyboard.press('Tab');
    await expect.poll(() => stored(tabA), { timeout: 10000 }).toContain('Annaka');

    // Fane B: Matrix-runden, opskriften, og et klik på det, der allerede er valgt.
    await tabB.bringToFront();
    await goToGroups(tabB);
    await goToMatrix(tabB);
    const dialog = await openRecipe(tabB);
    await dialog.locator('.rtok__btn[aria-label^="Sådan blandes der"]').click();
    await dialog.locator('.rtok__pop').getByRole('button', { name: 'Én fra hver', exact: true }).click();
    // Længere end indstillingernes (300 ms) og gemmets (1 sek.) ventetid
    await tabB.waitForTimeout(2500);

    expect(await stored(tabA)).toContain('Annaka');
});

/**
 * En klasse gemt af en ældre udgave af Grupper.
 *
 * Indlæsningen retter en del i hukommelsen: regler i det gamle format
 * (`attribute` i stedet for `column`), og felter, som nyere udgaver altid
 * gemmer (`hiddenColumns`, `togetherGroups`, `columnOrders` …). Før 10/11 2026
 * blev det ikke gemt med det samme, så fanens første gem var en "ændring" —
 * også det sidste gem, når en urørt fane blev lukket. Den skrev så hele sin
 * gamle udgave over det, læreren havde rettet i den anden fane. Målt med en
 * sonde over 17 gamle klasseformer; nu gemmes rettelserne, mens fanen
 * indlæser (AppTopbar `selectClass`).
 */
test('en klasse fra en ældre udgave: den urørte anden fane skriver ikke en rettelse væk', async ({ context }) => {
    const tabA = await context.newPage();
    await createClass(tabA, '2a To Faner');
    const stored = (page: Page) => page.evaluate(() =>
        JSON.stringify(JSON.parse(localStorage.getItem('grupdk_classes') || '[]')[0]?.content ?? null));
    await expect.poll(() => stored(tabA), { timeout: 10000 }).toContain('hiddenColumns');

    // Klassen ligger i lageret, som en ældre udgave gemte den.
    await tabA.evaluate(() => {
        const list = JSON.parse(localStorage.getItem('grupdk_classes') || '[]');
        const c = list[0].content;
        delete c.hiddenColumns;
        delete c.togetherGroups;
        delete c.columnOrders;
        c.rules = [{ type: 'distribute', attribute: 'Køn', value: '' }];
        localStorage.setItem('grupdk_classes', JSON.stringify(list));
    });

    // Fane B åbner den, som den ligger.
    const tabB = await context.newPage();
    await gotoAppReady(tabB);
    await expect(tabB.locator('#table-container tbody tr')).toHaveCount(12);
    await tabB.waitForTimeout(500);

    // Fane A retter Anna til Annaka.
    await tabA.bringToFront();
    const cellA = tabA.locator('#table-container tbody tr').first().locator('td.cell-data').first();
    await cellA.click();
    await tabA.keyboard.press('End');
    await tabA.keyboard.type('ka');
    await tabA.keyboard.press('Tab');
    await expect.poll(() => stored(tabA), { timeout: 10000 }).toContain('Annaka');

    // Den urørte fane B lukkes — flushPendingWrites() gemmer en sidste gang.
    await tabB.close({ runBeforeUnload: true });
    await tabA.waitForTimeout(1500);

    expect(await stored(tabA)).toContain('Annaka');
});

/**
 * Vis-kolonnen efter en genindlæsning i Hjælp.
 *
 * Vis-kolonnen blev før kun sat af elevlistens side (ClassView), som ikke
 * findes, når siden er genindlæst, mens læreren står i Hjælp. Så stod den
 * tom, og det sidste gem, når fanen blev lukket, skrev den første kolonne
 * ind i stedet for lærerens valg — og var dermed også en "ændring", der
 * skrev hele klassen. Nu sætter indlæsningen den (`syncDisplayColumn`).
 */
test('lukkes fanen efter en genindlæsning i Hjælp, bliver lærerens Vis-kolonne stående', async ({ context }) => {
    const tab = await context.newPage();
    await createClass(tab, '2a To Faner');
    await expect.poll(() => tab.evaluate(() =>
        JSON.parse(localStorage.getItem('grupdk_classes') || '[]')[0]?.content?.hiddenColumns), { timeout: 10000 })
        .toBeTruthy();

    // Læreren har valgt "Vis: Køn" og står i Hjælp, da siden genindlæses.
    await tab.evaluate(() => {
        const list = JSON.parse(localStorage.getItem('grupdk_classes') || '[]');
        list[0].content.id_column = 'Køn';
        localStorage.setItem('grupdk_classes', JSON.stringify(list));
        sessionStorage.setItem('grupdk_nav_view', 'help');
    });
    await tab.reload();
    await tab.waitForFunction(() => (window as any).appDebug?.state?.currentClass?.filename, null, { timeout: 30000 });
    expect(await tab.evaluate(() => (window as any).appDebug.state.navView)).toBe('help');
    expect(await tab.evaluate(() => (window as any).appDebug.state.displayColumn)).toBe('Køn');

    await tab.close({ runBeforeUnload: true });
    const st = await context.storageState();
    const raw = st.origins.flatMap(o => o.localStorage).find(e => e.name === 'grupdk_classes')!.value;
    expect(JSON.parse(raw)[0].content.id_column).toBe('Køn');
});

/**
 * Vis-kolonnen efter en tur i Hjælp — uden genindlæsning.
 *
 * Elevlistens side tegnes forfra, hver gang læreren kommer tilbage til den,
 * og den satte Vis-kolonnen ud fra klassens gemte `id_column`. Men valget
 * under "Vis:" skrev kun til skærmen, aldrig til klassen, så efter Hjælp →
 * Elevliste stod den gamle kolonne der igen, og næste gem skrev den tilbage.
 * Fundet 10/11 2026 (75. gennemsyn). Nu gemmes valget med det samme.
 */
test('Vis-kolonnen bliver stående efter en tur i Hjælp', async ({ page }) => {
    await createClass(page, '2a To Faner');
    await page.locator('#id-column-select').selectOption('Køn');
    await expect.poll(() => page.evaluate(() =>
        JSON.parse(localStorage.getItem('grupdk_classes') || '[]')[0]?.content?.id_column), { timeout: 10000 })
        .toBe('Køn');

    await page.getByRole('button', { name: 'Om programmet' }).click();
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.navView)).toBe('help');
    await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();
    await expect(page.locator('#table-container tbody tr')).toHaveCount(12);

    expect(await page.evaluate(() => (window as any).appDebug.state.displayColumn)).toBe('Køn');
    await page.close({ runBeforeUnload: true });
    const st = await page.context().storageState();
    const raw = st.origins.flatMap(o => o.localStorage).find(e => e.name === 'grupdk_classes')!.value;
    expect(JSON.parse(raw)[0].content.id_column).toBe('Køn');
});

/**
 * Beskeden lukket med krydset — og den anden fane danner igen.
 *
 * Før huskede fanen bare "sagt til om denne klasse", til læreren trykkede
 * "Hent de nye grupper". Lukkede hun beskeden med krydset, var den brugt op:
 * dannede den anden fane grupper én gang til, kom der ingen ny besked, og et
 * træk i den gamle fane skrev den nye kørsel væk uden en lyd. Nu kommer
 * beskeden igen, når den anden fane gemmer en anden fordeling.
 */
test('en ny kørsel i den anden fane siges højt igen, når beskeden er lukket med krydset', async ({ context }) => {
    const tabA = await context.newPage();
    await createClass(tabA, '2a Kryds');
    await goToGroups(tabA);
    await generateGroups(tabA);

    const tabB = await context.newPage();
    await gotoAppReady(tabB);
    await expect(tabB.locator('.class-trigger')).toContainText('2a Kryds', { timeout: 30000 });
    const groupsIn = (page: Page) => page.evaluate(() =>
        JSON.stringify(((window as any).appDebug.state.storedStandardGroups || []).map((g: any) => g.members)));
    const shownInB = await groupsIn(tabB);

    /** Lad A danne, til fordelingen er en anden end `than`, og vent, til A står stille. */
    async function newRunInA(than: string[]) {
        let fresh = await groupsIn(tabA);
        for (let i = 0; i < 8 && than.includes(fresh); i++) {
            await generateGroups(tabA);
            fresh = await groupsIn(tabA);
        }
        expect(than).not.toContain(fresh);
        await expect.poll(async () => {
            const a = await groupsIn(tabA);
            await tabA.waitForTimeout(1000);
            return a === await groupsIn(tabA) ? a : null;
        }, { timeout: 20000 }).not.toBeNull();
        return groupsIn(tabA);
    }

    const firstRun = await newRunInA([shownInB]);
    await tabB.bringToFront();
    const toast = tabB.locator('.toast').filter({ hasText: 'ændret i en anden fane' });
    await expect(toast).toBeVisible({ timeout: 10000 });
    await toast.getByRole('button', { name: 'Luk' }).click();
    await expect(toast).toHaveCount(0);

    await tabA.bringToFront();
    await newRunInA([shownInB, firstRun]);
    await tabB.bringToFront();
    await expect(toast).toBeVisible({ timeout: 10000 });
    // B viser stadig sine egne — intet skiftes af sig selv
    expect(await groupsIn(tabB)).toBe(shownInB);
});
