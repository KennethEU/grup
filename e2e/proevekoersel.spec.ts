import { test, expect } from '@playwright/test';
import { createClass, goToGroups, addRecipeRule, generateGroups, openRecipe } from './helpers';

// Prøvekørslen i baggrunden (trialRun.js, 12/11 2026): når opskriften har
// stået stille et øjeblik, danner motoren grupper én gang i sin egen tråd og
// viser i opskriften, hvordan det gik — FØR læreren trykker Dan grupper.
// Grupperne fra prøvekørslen bruges aldrig: skærmen står uden grupper, til
// læreren selv danner dem, og så viger prøvekørslen for det rigtige resultat.
//
// Advarslerne fra prøvekørslen står i SAMME stak øverst i opskriften som alle
// andre advarsler og ser ud som dem (Kenneth 12/11: ét sted, ingen forskel).
// Kun mærkerne ved reglerne er dæmpede.

test('Opskriften prøves i baggrunden: dæmpede mærker, advarslen i den fælles stak, og ingen grupper dannes', async ({ page }) => {
    await createClass(page, 'Prøvekørsel');
    await goToGroups(page);
    const line = await addRecipeRule(page, { type: 'Fordel', column: 'Køn' });
    const dialog = page.locator('dialog.recipe-dialog[open]');

    // Mærket ved reglen kommer af sig selv og siger, at det er en prøvekørsel.
    const mark = line.locator('.rule-mark');
    await expect(mark).toHaveAttribute('aria-label', 'Prøvekørsel: Opfyldt', { timeout: 15000 });
    await expect(mark).toHaveClass(/rule-mark--trial/);
    // Alt gik op: ingen advarsel, og der er ikke noget særligt sted til prøvekørslen.
    const stack = dialog.locator('.hints-stack');
    await expect(dialog).not.toContainText('Prøvekørsel');
    await expect(stack.getByText('er ikke helt opfyldt')).toHaveCount(0);

    // Intet er dannet: ingen gruppekort, og intet i lageret eller historikken.
    await expect(page.locator('.group-card')).toHaveCount(0);
    const stored = await page.evaluate(() => {
        const st = (window as any).appDebug.state;
        return { groups: (st.storedStandardGroups || []).length, generating: st.isGenerating };
    });
    expect(stored).toEqual({ groups: 0, generating: false });

    // Ændres opskriften, forsvinder mærket med det samme og kommer igen for den nye.
    await addRecipeRule(page, { type: 'Saml', column: 'Køn' });
    await expect(dialog.locator('.rule-mark--trial')).toHaveCount(2, { timeout: 15000 });
    // Fordel og Saml på samme kolonne kan ikke begge holdes: prøvekørslen
    // siger det som en almindelig advarsel i stakken øverst — uden gruppenavne
    // og uden "Prøv at danne igen" (der er ikke dannet noget).
    const warning = stack.getByText('Saml på "Køn" er ikke helt opfyldt.');
    await expect(warning).toBeVisible();
    await expect(stack).not.toContainText('Prøv at danne igen');
    await expect(stack).not.toContainText('Gruppe 1');
    await expect(dialog).not.toContainText('Prøvekørsel');

    // Dan grupper: det rigtige resultat afløser prøvekørslen.
    await generateGroups(page);
    await expect(page.locator('.group-card')).toHaveCount(3);
    const reopened = await openRecipe(page);
    await expect(reopened.locator('.rule-mark').first()).toBeVisible();
    await expect(reopened.locator('.rule-mark--trial')).toHaveCount(0);
    // Advarslen fra prøvekørslen er væk; resultatet står under "Sidste dannelse".
    await expect(reopened.locator('.hints-stack').getByText('Saml på "Køn" er ikke helt opfyldt.')).toHaveCount(0);
});

test('Prøvekørslen kører ikke på Elevliste-fanen', async ({ page }) => {
    await createClass(page, 'Prøvekørsel fane');
    // En regel lagt direkte i klassen, mens læreren står på Elevliste.
    await page.evaluate(() => {
        const st = (window as any).appDebug.state;
        st.currentClass.rules = [{ type: 'distribute', column: 'Køn', value: '' }];
    });
    // Tråde, siden starter herfra (motorens tråd hedder engine-worker).
    const started: string[] = [];
    page.on('worker', (w) => started.push(w.url()));
    await page.waitForTimeout(1500);
    expect(started.filter(u => /engine-worker/.test(u)).length).toBeLessThanOrEqual(1);   // højst det hurtige tjek
    await goToGroups(page);
    await expect(page.locator('dialog.recipe-dialog[open] .rule-mark--trial')).toHaveCount(1, { timeout: 15000 });
});

// 97. gennemsyn (13/11 2026): motoren starter ellers op til 8 hjælpetråde
// (worker.js) i hver kørsel. Prøvekørslen er tre forsøg på få millisekunder og
// kører ved hver ændring af opskriften, så den beder om én kerne. Før: 8
// hjælpetråde pr. prøvekørsel på en maskine med 10 kerner.
test('Prøvekørslen starter ingen hjælpetråde', async ({ page }) => {
    const started: string[] = [];
    page.on('worker', (w) => started.push(w.url().split('/').pop() || ''));
    await createClass(page, 'Prøvekørsel kerner');
    await goToGroups(page);
    const line = await addRecipeRule(page, { type: 'Fordel', column: 'Køn' });
    await expect(line.locator('.rule-mark')).toHaveAttribute('aria-label', 'Prøvekørsel: Opfyldt', { timeout: 15000 });
    await addRecipeRule(page, { type: 'Saml', column: 'Køn' });
    await expect(page.locator('dialog.recipe-dialog[open] .rule-mark--trial')).toHaveCount(2, { timeout: 15000 });
    await page.waitForTimeout(300);
    // Motorens tråd hedder engine-worker; dens hjælpetråde hedder worker.
    expect(started.filter(u => !/engine-worker/.test(u))).toEqual([]);
    // Tjekket og prøvekørslen: to tråde, uanset hvor mange gange opskriften ændres.
    expect(started.filter(u => /engine-worker/.test(u)).length).toBeLessThanOrEqual(2);
});

// En gammel fane efter en deploy kan ikke hente trådens fil. Prøvekørslen skal
// være stille — og holde op med at spørge serveren, ikke prøve igen ved hver
// ændring af opskriften (TRIAL_MAX_FAILURES).
test('Kan tråden ikke hentes, holder prøvekørslen op med at prøve', async ({ page }) => {
    await page.addInitScript(() => {
        const Original = window.Worker;
        (window as any).workersMade = 0;
        (window as any).breakWorkers = false;
        (window as any).Worker = class extends Original {
            constructor(url: string | URL, options?: WorkerOptions) {
                // En adresse, der ikke findes: samme fejl som en slettet fil.
                super((window as any).breakWorkers ? '/findes-ikke/engine-worker-gammel.js' : url, options);
                (window as any).workersMade++;
            }
        };
    });
    await createClass(page, 'Prøvekørsel gammel fane');
    await goToGroups(page);
    // Det hurtige tjek har sin tråd; herfra kan nye tråde ikke hentes.
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => { (window as any).breakWorkers = true; return (window as any).workersMade; });
    // Seks forskellige opskrifter efter hinanden (lagt direkte i klassen).
    const recipes = [
        [{ type: 'distribute', column: 'Køn', value: '' }],
        [{ type: 'cluster', column: 'Køn', value: '' }],
        [],
        [{ type: 'distribute', column: 'Køn', value: '' }, { type: 'cluster', column: 'Køn', value: '' }],
        [{ type: 'cluster', column: 'Køn', value: '' }, { type: 'distribute', column: 'Køn', value: '' }],
        [{ type: 'distribute', column: 'Køn', value: '' }],
    ];
    for (const rules of recipes) {
        await page.evaluate((r) => { (window as any).appDebug.state.currentClass.rules = r; }, rules);
        await page.waitForTimeout(900);   // længere end ventetiden før en prøvekørsel
    }
    const made = await page.evaluate(() => (window as any).workersMade) - before;
    expect(made).toBeGreaterThanOrEqual(1);   // den prøvede
    expect(made).toBeLessThanOrEqual(3);      // … og holdt op
    // Stille: ingen mærker fra en prøvekørsel, ingen fejlbesked.
    await openRecipe(page);
    await expect(page.locator('dialog.recipe-dialog[open] .recipe__line--rule')).toHaveCount(1);
    await expect(page.locator('dialog.recipe-dialog[open] .rule-mark--trial')).toHaveCount(0);
    await expect(page.locator('.toast')).toHaveCount(0);
});
