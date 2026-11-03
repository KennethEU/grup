import { test, expect, Page } from '@playwright/test';
import { createClassAndGoToGroups, addRecipeRule, pickInToken, generateGroups } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "Opdel" er en særregel: motoren bruger KUN den første, den deler klassen i
// puljer, og alle andre regler arbejder inde i puljerne. Listen skal vise dét
// — ikke lade som om den er en regel på linje med de øvrige.
//
// Målt før spærringen: to Opdel-regler på en skæv klasse gav 100 % på den
// øverste og brud i 2 af 3 grupper på den anden. Gik tallene op, så begge ud
// til at virke — tilfældigt held man bygger videre på.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ruleTypes = (page: Page) => page.evaluate(() =>
    (window as any).appDebug.state.currentClass.rules.map((r: any) => r.type));
const ruleLine = (page: Page, i: number) =>
    page.locator(`dialog.recipe-dialog[open] .recipe__line--rule[data-rule-index="${i}"]`);
const typeOption = (page: Page, i: number, name: string) =>
    ruleLine(page, i).locator('.rtok__pop .recipe-opt')
        .filter({ has: page.locator('strong', { hasText: new RegExp(`^${name}`) }) });

test('Opdel lægger sig øverst, uanset hvor den blev valgt', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Opdel Oeverst');
    await addRecipeRule(page);
    await addRecipeRule(page);
    await addRecipeRule(page);
    // Vælg Opdel på den NEDERSTE regel.
    await pickInToken(page, ruleLine(page, 2), 'Regel', 'Opdel');
    expect((await ruleTypes(page))[0]).toBe('aggregate');
    // Og den står øverst i opskriften.
    await expect(page.locator('dialog.recipe-dialog[open] .recipe__line--rule').first())
        .toHaveAttribute('data-rule-index', '0');
});

test('Der kan kun vælges én Opdel — muligheden slås fra i menuen', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Opdel Kun En');
    await addRecipeRule(page, { type: 'Opdel' });
    await addRecipeRule(page);

    // I den ANDEN regel skal "Opdel" være slået fra og forklare sig.
    await ruleLine(page, 1).locator('.rtok__btn[aria-label^="Regel:"]').click();
    await expect(typeOption(page, 1, 'Opdel')).toBeDisabled();
    await expect(typeOption(page, 1, 'Opdel')).toContainText('kun én');
});

test('Opdel kan ikke flyttes, og ingen regel kan skubbes op forbi den', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Opdel Fast');
    await addRecipeRule(page, { type: 'Opdel' });
    await addRecipeRule(page);
    await addRecipeRule(page);

    // Pilene står kun, når rækkefølgen er en prioritering. Står de, er de
    // slået fra på Opdel og på "op" i reglen lige under den.
    const enabled = (i: number, name: string) =>
        ruleLine(page, i).locator(`button[aria-label="${name}"]:not([disabled])`);
    await expect(enabled(0, 'Flyt op (vigtigere)')).toHaveCount(0);
    await expect(enabled(0, 'Flyt ned')).toHaveCount(0);
    await expect(enabled(1, 'Flyt op (vigtigere)')).toHaveCount(0);
    expect((await ruleTypes(page))[0]).toBe('aggregate');
});

test('Opdel forklarer sig selv i regelmenuen', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Opdel Note');
    await addRecipeRule(page);
    await ruleLine(page, 0).locator('.rtok__btn[aria-label^="Regel:"]').click();
    await expect(typeOption(page, 0, 'Opdel')).toContainText('Ligger altid øverst');
    await expect(typeOption(page, 0, 'Opdel')).toContainText('deler klassen op først');
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Linjen under reglerne skal sige sandheden om rækkefølgen.
//
// Den sagde før, at rækkefølgen betyder noget, "når Balancér/Ensartede/Saml/
// Opdel IKKE er med" — altså at motorvalget afgjorde det. Målt 2026-08-28:
// BEGGE motorer sorterer reglerne efter type, før de kører (Engine B i
// `rule_key` lige før den gamle motor startes):
//
//   Læreren skrev:  Fordel(Køn), Klyng(Hold)
//   motoren kører:  Klyng(Hold), Fordel(Køn)     ← typen vandt
//
// Sorteringen efter trin er stabil, så to regler af SAMME type beholder lærerens
// indbyrdes orden. Det er dér — og kun dér — rækkefølgen betyder noget.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function hintFor(page, ruleTypes: string[]) {
    await page.evaluate((t) => {
        (window as any).appDebug.state.currentClass.rules =
            t.map((x, i) => ({ type: x, column: ['Køn', 'Karakter', 'Navn'][i % 3], value: '' }));
    }, ruleTypes);
    await page.waitForTimeout(400);
    return (await page.locator('dialog.recipe-dialog[open] .recipe__ordernote').innerText()).trim();
}

test('Hintet: reglerne står i trin; der kan byttes om, når et trin har mindst to regler', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Hint Raekkefoelge');

    // Fordel og Klyng står i hver sit trin, én regel i hvert: intet at bytte.
    let note = await hintFor(page, ['distribute', 'cluster']);
    expect(note).toContain('Reglerne står i trin');
    expect(note).not.toContain('Træk i en regel');

    // To mål i samme trin: rækkefølgen er en prioritering, den øverste vejer mest.
    note = await hintFor(page, ['distribute', 'distribute']);
    expect(note).toContain('den øverste vejer mest');
    expect(note).toContain('Træk i en regel');

    // En Skal sammen-aftale ændrer intet ved det (motoren tager aftalerne først).
    await page.evaluate(() => {
        const cls = (window as any).appDebug.state.currentClass;
        cls.togetherGroups = [{ ids: cls.data.slice(0, 2).map((r: any) => r._rowId) }];
    });
    expect(await hintFor(page, ['distribute', 'distribute'])).toContain('Træk i en regel');
});

for (const [label, firstRule] of [['Ensartede', 'minimizediff'], ['Fordel', 'distribute']]) {
    test(`${label}: afspilningens sidste billede matcher de afleverede grupper`, async ({ page }, testInfo) => {
        await createClassAndGoToGroups(page, `${label} Afspilning`);
        await page.evaluate((firstRule) => {
            (window as any).appDebug.state.currentClass.rules = [
                { type: firstRule, column: 'Karakter', value: '' },
                { type: 'distribute', column: 'Køn', value: '' },
            ];
        }, firstRule);
        await generateGroups(page);
        await page.getByTitle('Optag og afspil kørslen', { exact: true }).click();
        await page.getByRole('button', { name: 'Se kørslen', exact: true }).click();
        // Første elev kontrollerer også det omdøbte groupIndex i statuslinjen.
        await page.locator('.replay-menu input[type="range"]').fill('1');
        await expect(page.locator('.replay-menu')).toContainText(/Deler ud · elev 1 af 12 → gruppe \d+/);
        await page.getByRole('button', { name: 'Hop til slut', exact: true }).click();
        const result = await page.evaluate(() => {
            const state = (window as any).appDebug.state;
            const replay = state.replay;
            return {
                played: replay.seating.map(group => [...group]),
                actual: state.storedStandardGroups.map(group => [...group.members]),
            };
        });
        expect(result.played).toEqual(result.actual);
        // Vent på Vue's tegning og afsluttede overgange, ikke kun state:
        // udgående kort kan stadig ligge i DOM'en med det gamle elevantal.
        await page.evaluate(() => new Promise(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await expect(page.locator('.group-list-enter-active, .group-list-leave-active, .list-enter-active, .list-leave-active')).toHaveCount(0);
        await expect(page.locator('.group-card')).toHaveCount(result.actual.length);
        await expect(page.locator('.group-card .member-name-text')).toHaveCount(12);
        const rendered = await page.locator('.group-card').evaluateAll(cards =>
            cards.map(card => [...card.querySelectorAll('.group-members-list li')]
                .map(member => member.getAttribute('data-id'))));
        expect(rendered).toEqual(result.actual);
        await page.screenshot({ path: testInfo.outputPath('engine-replay.png'), fullPage: true });
        await page.keyboard.press('Escape');
        await expect(page.locator('.replay-menu')).toHaveCount(0);
        await expect(page.locator('.group-card')).toHaveCount(result.actual.length);
    });
}
