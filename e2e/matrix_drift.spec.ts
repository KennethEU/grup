import { test, expect } from '@playwright/test';
import { createClassAndGoToGroups, generateGroups, goToMatrix, goToStandard, addRecipeRule, openRecipe, closeRecipe, openSaveColumn } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Matrixen er dannet på et andet billede, end det der står nu.
//
// Matrixgrupper dannes PÅ TVÆRS af stamgrupperne. Flytter læreren bagefter en
// elev i hånden, rører det kun stamgrupperne: matrixen bliver stående og er nu
// skæv — to elever fra samme stamgruppe i én matrixgruppe, og en anden
// stamgruppe uden repræsentant. Vi danner ikke om af os selv (læreren kan have
// rettet i matrixen), men hun skal have det at vide, og en knap at gøre det med.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Skift mellem stamgrupperne og matrix-runden (knapperne i opskriftens bjælke). */
async function viewName(page, viewLabel: 'Grupper' | 'Matrix') {
    if (viewLabel === 'Matrix') await goToMatrix(page);
    else await goToStandard(page);
}

/** Dan stamgrupper, gå til matrix-runden, og dan matrixen. */
async function homeAndMatrix(page) {
    await generateGroups(page);
    await viewName(page, 'Matrix');
    // Uden matrix åbner opskriftens vindue af sig selv; "Dan matrixgrupper".
    await generateGroups(page);
    // Vent på at aftrykket er skrevet ned — DET er signalet om at matrixen
    // hører til de stamgrupper der står nu.
    await expect.poll(
        () => page.evaluate(() => !!(window as any).appDebug.state.matrixSourceFingerprint),
        { timeout: 90000 }
    ).toBe(true);
}

const hint = (page) => page.locator('.gh-hint', { hasText: 'Stamgrupperne er ændret' });

test('en flyttet elev i stamgrupperne udløser hintet i Matrix-visningen', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Matrix drift');
    await homeAndMatrix(page);

    // Intet er rørt endnu.
    await expect(hint(page)).toHaveCount(0);

    // Flyt en elev i stamgrupperne med markér-og-flyt.
    await viewName(page, 'Grupper');
    await page.locator('.group-card').first().locator('li').first().click();
    await page.locator('.group-card').nth(1).locator('.receive-picked-btn').click();

    await viewName(page, 'Matrix');
    await expect(hint(page)).toBeVisible();
    // Teksten skal advare om BEGGE dele — at antallet af matrixgrupper kan
    // ændre sig er præcis det, en lærer bliver overrasket over.
    await expect(hint(page)).toContainText(/antallet af matrixgrupper/);
});

test('en LÅST stamgruppe er ikke en ændring — og må ikke advare', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Matrix laas');
    await homeAndMatrix(page);

    // At låse en stamgruppe ændrer ikke hvem der står i den, så matrixen er
    // lige så gyldig bagefter. Et hint her ville være et falsk alarm — og et
    // hint man lærer at klikke væk, er værre end intet hint.
    await viewName(page, 'Grupper');
    await page.locator('.group-card').first().locator('.lock-btn').click();

    await viewName(page, 'Matrix');
    await expect(hint(page)).toHaveCount(0);
});

test('knappen danner matrixen igen, og hintet forsvinder', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Matrix dan igen');
    await homeAndMatrix(page);

    await viewName(page, 'Grupper');
    await page.locator('.group-card').first().locator('li').first().click();
    await page.locator('.group-card').nth(1).locator('.receive-picked-btn').click();

    await viewName(page, 'Matrix');
    await expect(hint(page)).toBeVisible();

    await page.locator('.gh-hint-action', { hasText: 'Dan matrixen igen' }).click();

    // Den nye matrix er dannet ud fra de stamgrupper der står nu — så er der
    // ikke længere noget at advare om.
    await expect(hint(page)).toHaveCount(0, { timeout: 90000 });
});

// ── 129. gennemsyn: falske alarmer ─────────────────────────────────────────
// Hintet sammenlignede stamgruppernes medlemslister i rækkefølge. Så gav en
// elev, der blev meldt fraværende (taget ud af BÅDE stam- og matrixgruppen),
// og en elev, der blot fik en anden plads i sit eget kort, en rød advarsel og
// en knap, der danner matrixen forfra og kaster lærerens rettelser i den væk.
// Matrixen passer stadig: ingen af de elever, der står i den, har skiftet
// stamgruppe.

test('en elev meldt fraværende fra et matrixkort udløser ikke hintet', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Matrix fravaer');
    await homeAndMatrix(page);

    const member = page.locator('.group-card').first().locator('li').first();
    await member.focus();
    await page.keyboard.press('Enter');
    await member.getByRole('button', { name: 'Meld fraværende' }).click();
    await expect(page.locator('.pick-status')).not.toContainText('er markeret');

    await expect(hint(page)).toHaveCount(0);
    // Også efter et skift frem og tilbage (hintet regnes ved hver visning).
    await viewName(page, 'Grupper');
    await viewName(page, 'Matrix');
    await expect(hint(page)).toHaveCount(0);
});

test('en elev meldt fraværende fra et stamkort udløser ikke hintet i matrixen', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Stam fravaer');
    await homeAndMatrix(page);

    await viewName(page, 'Grupper');
    const member = page.locator('.group-card').first().locator('li').first();
    await member.focus();
    await page.keyboard.press('Enter');
    await member.getByRole('button', { name: 'Meld fraværende' }).click();
    await expect(page.locator('.pick-status')).not.toContainText('er markeret');

    await viewName(page, 'Matrix');
    await expect(page.locator('.group-card').first()).toBeVisible();
    await expect(hint(page)).toHaveCount(0);
});

test('en ny rækkefølge i et stamkort udløser ikke hintet', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Stam orden');
    await homeAndMatrix(page);

    // Samme ændring som at trække en elev op eller ned i sit eget kort
    // (moveMember med samme kilde og mål): samme elever, ny rækkefølge.
    await page.evaluate(() => {
        const g = (window as any).appDebug.state.storedStandardGroups[0];
        g.members.reverse();
    });
    await viewName(page, 'Grupper');
    await viewName(page, 'Matrix');
    await expect(page.locator('.group-card').first()).toBeVisible();
    await expect(hint(page)).toHaveCount(0);
});

test('en elev meldt fraværende fra matrixen og sat ind igen som efternøler udløser ikke hintet', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Matrix retur');
    await homeAndMatrix(page);

    const member = page.locator('.group-card').first().locator('li').first();
    const name = (await member.locator('.member-name-text').innerText()).trim();
    await member.focus();
    await page.keyboard.press('Enter');
    await member.getByRole('button', { name: 'Meld fraværende' }).click();
    await expect(page.locator('.pick-status')).not.toContainText('er markeret');

    // Tilbage igen, stadig i matrix-runden: eleven får en matrixgruppe, men
    // står ikke længere i nogen stamgruppe (papirkurven tog den ud af begge).
    await page.getByRole('button', { name: 'Tilføj efternøler' }).click();
    await page.locator('.student-item').filter({ hasText: name })
        .locator('input[type="checkbox"]').check();
    await page.locator('.btn-confirm').click();
    await expect(page.locator('.group-card').filter({ hasText: name })).toHaveCount(1);

    await expect(hint(page)).toHaveCount(0);
});

// 130. gennemsyn: matrixens input har stamgruppernes elever i kortets
// rækkefølge, og aftrykket af input (inputFingerprint) så rækkefølgen. Så
// forsvandt matrixens mærker fra sidste dannelse — og prøvekørslen tog over —
// når en elev blev trukket op eller ned i sit eget stamkort.
test('en ny rækkefølge i et stamkort fjerner ikke matrixens mærker', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Matrix mærker');
    await generateGroups(page);
    await viewName(page, 'Matrix');
    await addRecipeRule(page, { type: 'Fordel', column: 'Køn' });
    await generateGroups(page);
    let dialog = await openRecipe(page);
    await expect(dialog.locator('.rule-mark').first()).toBeVisible({ timeout: 90000 });
    await expect(dialog.locator('.rule-mark--trial')).toHaveCount(0);
    await closeRecipe(page);

    await viewName(page, 'Grupper');
    await page.evaluate(() => {
        (window as any).appDebug.state.storedStandardGroups[0].members.reverse();
    });
    await viewName(page, 'Matrix');
    await page.waitForTimeout(1500);   // prøvekørslen ville gå i gang her
    dialog = await openRecipe(page);
    await expect(dialog.locator('.rule-mark').first()).toBeVisible();
    await expect(dialog.locator('.rule-mark--trial')).toHaveCount(0);
});

// 132. gennemsyn: dannes stamgrupperne igen, står den gamle matrix stadig i
// matrix-runden (et skift dertil danner den ikke forfra). Opskriftens vindue
// åbnede, men lukkede læreren det, stod den gamle matrix der uden et ord — og
// "Vis for klassen" viste den på smartboardet, selvom udskriften og Del-menuen
// udelader den.
test('en forældet matrix siges højt og kommer ikke på "Vis for klassen"', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Matrix forældet');
    await homeAndMatrix(page);
    const stale = page.locator('.gh-hint', { hasText: 'dannet ud fra de forrige stamgrupper' });
    const showClass = page.locator('.recipe-bar').getByRole('button', { name: 'Vis for klassen' });
    await closeRecipe(page);
    await expect(stale).toHaveCount(0);
    await expect(showClass).toBeVisible();

    await viewName(page, 'Grupper');
    await generateGroups(page);
    await viewName(page, 'Matrix');
    await closeRecipe(page);
    await expect(stale).toBeVisible();
    await expect(showClass).toHaveCount(0);
    // Ikke to beskeder om samme sag.
    await expect(hint(page)).toHaveCount(0);

    // Flaget gemmes med grupperne, så beskeden er der også efter en genindlæsning.
    await page.reload();
    await expect(page.locator('.recipe-bar')).toBeVisible();
    // Appen åbner måske selv i matrix-runden igen; ellers går vi derover.
    if (await page.getByRole('button', { name: /Matrix-runde/ }).count()) await viewName(page, 'Matrix');
    await closeRecipe(page);
    await expect(stale).toBeVisible();

    await stale.locator('.gh-hint-action', { hasText: 'Dan matrixen igen' }).click();
    await expect.poll(
        () => page.evaluate(() => (window as any).appDebug.state.matrixGroupsStale),
        { timeout: 90000 }
    ).toBe(false);
    await expect(stale).toHaveCount(0);
    await expect(showClass).toBeVisible();
});

// 134. gennemsyn: en forældet matrix kom ikke med i udskriften, Excel,
// Del-menuen, "Vis for klassen" eller Historik — men "Kopiér" og "Gem som
// kolonne" tog den med uden et ord. Med "Inkludér kilde i parentes" fik hver
// elev oven i købet sin NUVÆRENDE stamgruppe i parentes, selvom matrixen er
// dannet ud fra de forrige: listen på Lectio sagde noget forkert.
test('Kopiér og Gem som kolonne tager ikke en forældet matrix med', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Matrix forældet ud');
    await homeAndMatrix(page);
    await closeRecipe(page);
    // Udklipsholderen fanges i siden, så testen ikke afhænger af browserens tilladelser.
    await page.evaluate(() => {
        (window as any).__copied = null;
        navigator.clipboard.writeText = async (t: string) => { (window as any).__copied = t; };
    });
    const note = page.locator('.notification-container').getByText('hører til de forrige stamgrupper');
    const columns = () => page.evaluate(() => [...(window as any).appDebug.state.currentClass.columns]);
    const before = await columns();

    // Frisk matrix: begge dele virker, også kilden i parentes.
    await page.locator('.floating-action-bar').getByRole('button', { name: 'Kopiér' }).click();
    await page.getByRole('checkbox', { name: /Inkludér kilde/ }).check();
    await page.getByRole('button', { name: 'Kopiér nu' }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__copied)).toContain('(Grp ');
    await openSaveColumn(page);
    await page.locator('.modal-overlay').getByRole('button', { name: 'Gem kolonne' }).click();
    await expect.poll(columns).toContain('Matrix Runde');

    // Stamgrupperne dannes igen: matrixen er nu forældet.
    await viewName(page, 'Grupper');
    await generateGroups(page);
    await viewName(page, 'Matrix');
    await closeRecipe(page);
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.matrixGroupsStale)).toBe(true);
    await page.evaluate(() => { (window as any).__copied = null; });
    const withColumn = await columns();

    await page.locator('.floating-action-bar').getByRole('button', { name: 'Kopiér' }).click();
    await expect(note.first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kopiér nu' })).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__copied)).toBeNull();

    await page.locator('.save-anchor .action-pill').click();
    await page.getByRole('menuitem', { name: /Gem som kolonne/ }).click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0);
    expect(await columns()).toEqual(withColumn);
    expect(withColumn.length).toBe(before.length + 1);
});

// 135. gennemsyn: beskeden lovede, at "rettelser i hånden forsvinder", når
// matrixen dannes igen — men en LÅST matrixgruppe bliver stående, som den er,
// med elever valgt ud fra de forrige stamgrupper. Nu siger beskeden det.
test('en låst matrixgruppe i en forældet matrix siges højt og bliver stående', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Matrix forældet låst');
    await homeAndMatrix(page);
    await closeRecipe(page);
    const first = () => page.evaluate(() => {
        const g = (window as any).appDebug.state.storedMatrixGroups.find((x: any) => x.name === 'Group 1');
        return { members: [...g.members].map(String), locked: !!g.locked };
    });
    await page.getByRole('button', { name: 'Lås gruppe — Gruppe 1' }).click();
    const locked = await first();
    expect(locked.locked).toBe(true);

    await viewName(page, 'Grupper');
    await generateGroups(page);
    await viewName(page, 'Matrix');
    await closeRecipe(page);
    const stale = page.locator('.gh-hint', { hasText: 'dannet ud fra de forrige stamgrupper' });
    await expect(stale).toContainText('Den låste matrixgruppe bliver stående');

    await stale.locator('.gh-hint-action', { hasText: 'Dan matrixen igen' }).click();
    await expect.poll(
        () => page.evaluate(() => (window as any).appDebug.state.matrixGroupsStale),
        { timeout: 90000 }
    ).toBe(false);
    expect(await first()).toEqual(locked);
});
