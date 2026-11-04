import { test, expect, Page } from '@playwright/test';
import { createClass, goToGroups, generateGroups, openRecipe, skipGuides } from './helpers';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Gruppemotoren (motor/engine/, se nextEngine.js) — siden 3/11 2026 den
// eneste. Kan den ikke danne grupperne, står grupperne urørte, og læreren
// får en rolig besked; der er intet at falde tilbage til.

/** Den gamle Python-motors tilbagefaldsbesked — må aldrig komme mere. */
const OLD_FALLBACK = 'Grupperne dannes med den nuværende motor i stedet';

async function waitReady(page: Page) {
    await page.waitForFunction(() => (window as any).appDebug?.pyBridge?.isReady === true, null, { timeout: 120000 });
}

/** Klassen er oprettet (createClass); gå til Grupper. */
async function chooseNextEngine(page: Page) {
    await goToGroups(page);
}

/** Klik "Dan grupper" uden at vente på kortene. */
async function clickGo(page: Page) {
    const dialog = page.locator('dialog.recipe-dialog[open]');
    const button = (await dialog.count()) ? dialog.locator('.recipe__go') : page.locator('.recipe-bar .recipe__go');
    await button.click();
}

/** Sæt klassens regler direkte (hurtigere end opskriftens menuer). */
async function setRules(page: Page, rules: { type: string; column: string }[]) {
    await page.evaluate((r) => { (window as any).appDebug.state.currentClass.rules = r; }, rules);
}

test('motoren danner grupperne', async ({ page }) => {
    test.setTimeout(150000);
    await createClass(page);
    await chooseNextEngine(page);
    await setRules(page, [{ type: 'distribute', column: 'Køn' }]);
    await generateGroups(page);
    await expect(page.locator('.group-card')).toHaveCount(3);
    await expect(page.locator('.toast').filter({ hasText: OLD_FALLBACK })).toHaveCount(0);
    // Ingen kolbe, intet beta-panel: der er kun én motor.
    await expect(page.locator('.engine-toggle, .engine-switch, .engine-mark')).toHaveCount(0);
    const stats = await page.evaluate(() => (window as any).appDebug.nextStats);
    expect(stats.status).toBe('ok');
    // Fordel på Køn: 6 K og 6 M i 3 grupper — 2 af hver i hver gruppe.
    const counts = await page.evaluate(() => {
        const s = (window as any).appDebug.state;
        const byId = new Map(s.currentClass.data.map((r: any) => [r._rowId, r]));
        return s.storedStandardGroups.map((g: any) => g.members.filter((m: any) => (byId.get(typeof m === 'string' ? m : m.id) as any)?.Køn === 'K').length);
    });
    expect(counts).toEqual([2, 2, 2]);

    // Afspilningen siger, hvilket forsøg grupperne kom fra (kontrakt v3-kladden).
    expect(Number.isInteger(stats.winner)).toBe(true);
    await page.getByTitle('Optag og afspil kørslen').click();
    const attempts = page.locator('.replay-menu .attempts');
    await expect(attempts).toHaveText(new RegExp(`^Forsøg ${stats.winner} af ${stats.attempts} – det bedste\\.`));
});

test('matrixgrupper', async ({ page }) => {
    test.setTimeout(150000);
    await createClass(page);
    await chooseNextEngine(page);
    await generateGroups(page);
    await page.getByRole('button', { name: /Matrix-runde/ }).click();
    await page.locator('dialog.recipe-dialog[open]').getByRole('button', { name: /^Dan matrixgrupper/ }).click();
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.storedMatrixGroups?.length || 0), { timeout: 30000 }).toBeGreaterThan(0);
    await expect(page.locator('.toast').filter({ hasText: OLD_FALLBACK })).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).appDebug.nextStats.status)).toBe('ok');
    // Fuld efter stamgrupperne: hver matrixgruppe har mindst én fra hver stamgruppe.
    const ok = await page.evaluate(() => {
        const s = (window as any).appDebug.state;
        const id = (m: any) => (typeof m === 'string' ? m : m.id);
        const home = new Map();
        s.storedStandardGroups.forEach((g: any, i: number) => g.members.forEach((m: any) => home.set(id(m), i)));
        return s.storedMatrixGroups.every((g: any) => new Set(g.members.map((m: any) => home.get(id(m)))).size === s.storedStandardGroups.length);
    });
    expect(ok).toBe(true);
});

test('matrix med to emner: samme sag står kun én gang, og den er ikke rød', async ({ page }) => {
    test.setTimeout(180000);
    // Kenneths matrix-runde 2 (3/11): der blandes på to emner, matrixgrupperne
    // på fire, så "højst én fra hvert emne" kan ikke holde. Før stod samme sag tre
    // gange i opskriften: to varsler og resultatet.
    const header = 'Navn\tKøn\n';
    const lines = Array.from({ length: 26 }, (_, i) => `Elev ${i + 1}\t${i % 2 ? 'K' : 'M'}`);
    await createClass(page, 'Matrix emner', header + lines.join('\n'));
    await chooseNextEngine(page);
    await page.evaluate(() => {
        const cls = (window as any).appDebug.state.currentClass;
        cls.topics = ['Ukraine', 'Island'];
        cls.matrixSettings = { matrixStrategy: 'size', groupTarget: 4, groupMod: '+', matrixRepresentationType: 'topic' };
    });
    await generateGroups(page);
    expect(await page.evaluate(() => (window as any).appDebug.nextStats.status)).toBe('ok');

    await page.getByRole('button', { name: /Matrix-runde/ }).click();
    const dialog = page.locator('dialog.recipe-dialog[open]');
    await expect(dialog).toBeVisible();
    const sources = dialog.locator('.gh-hint, .recipe__lastlist li').filter({ hasText: 'Højst én fra hvert emne' });
    // Før kørslen: motorens check() — ÉN besked om emnerne, blå (ikke rød).
    await expect(sources).toHaveCount(1);
    await expect(sources).toContainText('6 matrixgrupper');
    const beforeText = (await sources.innerText()).trim();
    await expect(dialog.locator('.gh-hint--conflict').filter({ hasText: 'Højst én fra hvert emne' })).toHaveCount(0);

    await dialog.getByRole('button', { name: /^Dan matrixgrupper/ }).click();
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.storedMatrixGroups?.length || 0), { timeout: 30000 }).toBeGreaterThan(0);
    await expect(page.locator('.toast').filter({ hasText: OLD_FALLBACK })).toHaveCount(0);

    // Efter kørslen: kun resultatet, én gang, og ikke rødt.
    const after = await openRecipe(page);
    const again = after.locator('.gh-hint, .recipe__lastlist li').filter({ hasText: 'Højst én fra hvert emne' });
    await expect(again).toHaveCount(1);
    expect((await again.innerText()).trim()).toBe(beforeText);
    await expect(after.locator('.recipe__lastlist li.is-error').filter({ hasText: 'Højst én fra hvert emne' })).toHaveCount(0);
    await expect(after.locator('.gh-hint--conflict').filter({ hasText: 'Højst én fra hvert emne' })).toHaveCount(0);
    // Kilderne er spredt så jævnt, som det kan lade sig gøre: ingen "par"-besked.
    await expect(after.locator('.gh-hint, .recipe__lastlist li').filter({ hasText: /par fra samme|ikke spredt så jævnt/ })).toHaveCount(0);
});

// Opdel (kontrakt v3, spørgsmål 50): Adskil kan ikke gå op i nogen af de to
// puljer. Før kørslen én rød advarsel pr. pulje; efter kørslen er de afløst
// af ét blåt resultat pr. pulje, og hvert nævner sin pulje.
test('Opdel: advarslen pr. pulje afløses af resultatet pr. pulje', async ({ page }) => {
    test.setTimeout(150000);
    const header = 'Navn\tHold\tNiveau\n';
    const lines = Array.from({ length: 16 }, (_, i) => `Elev ${i + 1}\t${i < 8 ? '2.a' : '2.b'}\t${i % 8 < 5 ? 'Høj' : 'Lav'}`);
    await createClass(page, 'Opdel puljer', header + lines.join('\n'));
    await chooseNextEngine(page);
    await page.evaluate(() => {
        (window as any).appDebug.state.currentClass.rules = [
            { type: 'aggregate', column: 'Hold' }, { type: 'separate', column: 'Niveau', value: 'Høj' }];
    });
    const dialog = await openRecipe(page);
    const adskil = (scope: any) => scope.locator('.gh-hint, .recipe__lastlist li').filter({ hasText: 'Adskil' });
    await expect(dialog.locator('.gh-hint--conflict').filter({ hasText: 'Adskil' })).toHaveCount(2);
    await clickGo(page);
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.isGenerating), { timeout: 30000 }).toBe(false);
    expect(await page.evaluate(() => (window as any).appDebug.nextStats.status)).toBe('ok');
    const after = await openRecipe(page);
    await expect(after.locator('.gh-hint--conflict').filter({ hasText: 'Adskil' })).toHaveCount(0);
    await expect(after.locator('.recipe__lastlist li.is-error')).toHaveCount(0);
    const results = adskil(after);
    await expect(results).toHaveCount(2);
    await expect(results.filter({ hasText: '2.a' })).toHaveCount(1);
    await expect(results.filter({ hasText: '2.b' })).toHaveCount(1);
});

// Kenneths matrix-runde 2 (3/11): "Kilderne "Group 2", "Group 3", "Group 5"
// har kun 5 elever …". Stamgrupperne hedder internt "Group N", men læreren ser
// "Gruppe N" alle andre steder. Begge motorer: ingen besked må sige "Group".
{
    test('matrix efter stamgrupper: beskederne siger "Gruppe N", aldrig "Group N"', async ({ page }) => {
        test.setTimeout(180000);
        const header = 'Navn\tKøn\n';
        const lines = Array.from({ length: 26 }, (_, i) => `Elev ${i + 1}\t${i % 2 ? 'K' : 'M'}`);
        await createClass(page, 'Matrix stamgrupper', header + lines.join('\n'));
        await chooseNextEngine(page);
        await page.evaluate(() => {
            const cls = (window as any).appDebug.state.currentClass;
            cls.matrixSettings = { matrixStrategy: 'full_strict', matrixRepresentationType: 'group' };
        });
        await generateGroups(page);
        // 26 i grupper på 4: nogle grupper har 3, og de sætter loftet for "Fuld".
        await page.getByRole('button', { name: /Matrix-runde/ }).click();
        const dialog = page.locator('dialog.recipe-dialog[open]');
        await expect(dialog).toBeVisible();
        await dialog.getByRole('button', { name: /^Dan matrixgrupper/ }).click();
        await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.storedMatrixGroups?.length || 0), { timeout: 60000 }).toBeGreaterThan(0);
        const after = await openRecipe(page);
        const said = [
            ...(await after.locator('.gh-hint, .recipe__lastlist li').allInnerTexts()),
            ...(await page.locator('.toast').allInnerTexts()),
        ].join('\n');
        test.info().annotations.push({ type: 'beskeder', description: said });
        expect(said).toMatch(/Gruppe \d/);
        expect(said).not.toMatch(/Group \d/);
        expect(await page.evaluate(() => (window as any).appDebug.nextStats.status)).toBe('ok');
    });
}

test('fremgangen vises, og Stop beholder den bedste deling', async ({ page }) => {
    test.setTimeout(180000);
    // Et stort hold med regler, der trækker hver sin vej: motoren når ikke
    // det bedst mulige og arbejder længe nok til at vise fremgang.
    const header = 'Navn\tKøn\tHold\tNiveau\tSprog\n';
    const lines = Array.from({ length: 160 }, (_, i) =>
        `Elev ${i + 1}\t${i % 3 ? 'K' : 'M'}\th${i % 7}\t${['Lav', 'Middel', 'Høj'][i % 5 % 3]}\t${['Tysk', 'Fransk', 'Spansk'][i % 4 % 3]}`);
    await createClass(page, 'Stort hold', header + lines.join('\n'));
    await chooseNextEngine(page);
    await setRules(page, [
        { type: 'distribute', column: 'Køn' }, { type: 'distribute', column: 'Hold' },
        { type: 'distribute', column: 'Niveau' }, { type: 'distribute', column: 'Sprog' },
        { type: 'cluster', column: 'Hold' },
    ]);
    await clickGo(page);
    const overlay = page.locator('.processing-overlay');
    await expect(overlay.locator('.processing-progress')).toBeVisible({ timeout: 20000 });
    await expect(overlay.locator('.processing-progress')).toContainText('regler opfyldt');
    const stopAt = Date.now();
    await overlay.getByRole('button', { name: 'Stop og behold de bedste' }).click();
    await expect(overlay).toBeHidden({ timeout: 10000 });
    const stopMs = Date.now() - stopAt;
    await expect(page.locator('.toast').filter({ hasText: 'de bedste, motoren nåede at finde' })).toBeVisible();
    await expect(page.locator('.group-card').first()).toBeVisible();
    await expect(page.locator('.toast').filter({ hasText: OLD_FALLBACK })).toHaveCount(0);
    const stats = await page.evaluate(() => (window as any).appDebug.nextStats);
    expect(stats.status).toBe('stopped');
    test.info().annotations.push({ type: 'stop-ms', description: String(stopMs) }, { type: 'cores', description: String(stats.cores) });
    console.log(`[motor_beta] Stop → svar ${stopMs} ms, kerner ${stats.cores}`);
});

test('en umulig Skal sammen giver advarslen, og knappen danner uden aftalen', async ({ page }) => {
    test.setTimeout(150000);
    await createClass(page);
    await chooseNextEngine(page);
    // Seks elever skal sammen, men grupperne er på fire.
    await page.evaluate(() => {
        const cls = (window as any).appDebug.state.currentClass;
        cls.togetherGroups = [{ ids: cls.data.slice(0, 6).map((r: any) => r._rowId) }];
    });
    await clickGo(page);
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.isGenerating), { timeout: 30000 }).toBe(false);
    await expect(page.locator('.group-card')).toHaveCount(0);
    // Motorens advarsel (i opskriften eller over grupperne, alt efter hvad der står åbent).
    const hint = page.locator('.gh-hint:visible').filter({ hasText: 'Skal sammen' }).first();
    await expect(hint).toBeVisible();
    await expect(page.locator('.toast').filter({ hasText: OLD_FALLBACK })).toHaveCount(0);
    await hint.getByRole('button', { name: 'Dan grupper uden aftalen' }).click();
    await expect(page.locator('.group-card').first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.toast').filter({ hasText: 'tilsidesat i denne kørsel' })).toBeVisible();
    expect(await page.evaluate(() => (window as any).appDebug.nextStats.status)).toBe('ok');
});

test('en motor, der kaster en fejl: en rolig besked, og grupperne står urørte', async ({ page }) => {
    test.setTimeout(150000);
    // Byt motorens fil ud med en, der fejler inde i run().
    await page.route(/\/motor\/engine\/engine\.js/, route => route.fulfill({
        contentType: 'text/javascript',
        body: "export const ENGINE_INFO = { contractVersion: 3 }; export function check() { return { contractVersion: 3, status: 'ok', messages: [] }; } export async function run() { throw new Error('test: motoren fejler'); }",
    }));
    await createClass(page);
    await chooseNextEngine(page);
    await goToGroups(page);
    await clickGo(page);
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.isGenerating), { timeout: 30000 }).toBe(false);
    await expect(page.locator('.toast').filter({ hasText: 'Grupperne kunne ikke dannes' })).toContainText('Den stødte på en fejl');
    await expect(page.locator('.group-card')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).appDebug.state.isGenerating)).toBe(false);
});

test('et svar i forkert form vælter ikke siden', async ({ page }) => {
    test.setTimeout(150000);
    // reason.text er et tal, ikke en tekst — en motor kan svare skævt.
    await page.route(/\/motor\/engine\/engine\.js/, route => route.fulfill({
        contentType: 'text/javascript',
        body: "export const ENGINE_INFO = { contractVersion: 3 }; export function check() { return { contractVersion: 3, status: 'ok', messages: [] }; } export async function run() { return { contractVersion: 3, status: 'unsupported', reason: { text: 42 } }; }",
    }));
    await createClass(page);
    await chooseNextEngine(page);
    await goToGroups(page);
    await clickGo(page);
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.isGenerating), { timeout: 30000 }).toBe(false);
    await expect(page.locator('.toast').filter({ hasText: 'Grupperne blev ikke dannet' })).toBeVisible();
    expect(await page.evaluate(() => (window as any).appDebug.state.isGenerating)).toBe(false);
});

test('en tråd, der ikke kan starte: en besked, og grupperne står urørte', async ({ page }) => {
    test.setTimeout(150000);
    await page.route(/\/engine-worker\.js/, route => route.fulfill({
        contentType: 'text/javascript',
        body: "throw new Error('test: tråden fejler');",
    }));
    await createClass(page);
    await chooseNextEngine(page);
    await goToGroups(page);
    await clickGo(page);
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.isGenerating), { timeout: 30000 }).toBe(false);
    await expect(page.locator('.toast').filter({ hasText: 'Grupperne kunne ikke dannes' })).toBeVisible();
    expect(await page.evaluate(() => (window as any).appDebug.state.isGenerating)).toBe(false);
});

// En ny udgave lagt op, mens fanen stod åben: deployet (rsync --delete)
// fjerner den gamle engine-worker-fil, så motoren kan ikke startes. Så skal
// læreren have "genindlæs", ikke "prøv igen" ved hvert tryk (newBuild.js).
test('motoren kan ikke startes efter en ny udgave: beskeden siger genindlæs', async ({ page }) => {
    test.setTimeout(150000);
    await createClass(page);
    await chooseNextEngine(page);
    // Serveren har nu en index.html med en anden hovedfil (Vite giver hver
    // udgave sit eget navn), og den gamle motor-fil er væk.
    await page.route('**/index.html', async route => {
        const res = await route.fetch();
        const body = (await res.text()).replace(/(<script type="module"[^>]*src=")[^"]+"/, '$1./assets/index-NEWBUILD.js"');
        await route.fulfill({ response: res, body });
    });
    await page.route(/engine-worker/, route => route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' }));
    await clickGo(page);
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.isGenerating), { timeout: 30000 }).toBe(false);
    await expect(page.locator('.notification-container').getByText('grup.dk er blevet opdateret, mens siden stod åben')).toBeVisible();
    await expect(page.locator('.toast').filter({ hasText: 'Prøv igen' })).toHaveCount(0);
});

test('Stop med en motor, der ikke svarer: grupperne bliver stående', async ({ page }) => {
    test.setTimeout(150000);
    // En motor, der aldrig svarer (men lever: tidsgrænsen er 20 sekunder).
    await page.route(/\/motor\/engine\/engine\.js/, route => route.fulfill({
        contentType: 'text/javascript',
        body: 'export const ENGINE_INFO = { contractVersion: 3 }; export function check() { return { contractVersion: 3, status: "ok", messages: [] }; } export function run() { return new Promise(() => {}); }',
    }));
    await createClass(page);
    await chooseNextEngine(page);
    await goToGroups(page);

    const dialog = page.locator('dialog.recipe-dialog[open]');
    const button = (await dialog.count()) ? dialog.locator('.recipe__go') : page.locator('.recipe-bar .recipe__go');
    await button.click();
    const overlay = page.locator('.processing-overlay');
    await expect(overlay).toBeVisible();
    await overlay.getByRole('button', { name: 'Stop og behold de bedste' }).click();
    // Appen venter ca. 2,5 sek. på den foreløbig bedste, så afbryder den.
    await expect(overlay).toBeHidden({ timeout: 10000 });
    await expect(page.locator('.toast').filter({ hasText: 'stoppet' })).toBeVisible();

    // Ingen grupper, og intet tilbagefald bagefter.
    await page.waitForTimeout(1500);
    await expect(page.locator('.group-card')).toHaveCount(0);
    await expect(page.locator('.toast').filter({ hasText: OLD_FALLBACK })).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).appDebug.state.isGenerating)).toBe(false);
});


// ─── Reglernes rækkefølge med den nye motor (Kenneth 3/11) ───────────────────
// Den nye motor: trin efter type, men INDEN FOR et trin er rækkefølgen en
// prioritering. Numre, pile og et trækhåndtag i trin med mindst to regler.
// Den nuværende motor: siden er som før.
const MIXED_RULES = [
    { type: 'distribute', column: 'Køn' },
    { type: 'separate', column: 'Karakter', value: '12' },
    { type: 'balance', column: 'Karakter' },
];
const lineTexts = (dialog: any) => dialog.locator('.recipe__line--rule .recipe__text').allInnerTexts();
const ruleColumns = (page: Page) => page.evaluate(() => (window as any).appDebug.state.currentClass.rules.map((r: any) => `${r.type}:${r.column}`));

async function recipeWithRules(page: Page) {
    await createClass(page);
    await chooseNextEngine(page);
    await page.evaluate((r) => { (window as any).appDebug.state.currentClass.rules = r; }, MIXED_RULES);
    const dialog = await openRecipe(page);
    await expect(dialog.locator('.recipe__line--rule')).toHaveCount(3);
    return dialog;
}

test('reglerne: trin, numre og pile inden for et trin — to tryk i træk', async ({ page }) => {
    test.setTimeout(150000);
    const dialog = await recipeWithRules(page);
    await expect(dialog.locator('.recipe__tier')).toHaveText(['Vejer tungt', 'Mål']);
    await expect(dialog.locator('.recipe__line--rule .recipe__no')).toHaveText(['1', '2', '3']);
    const lines = dialog.locator('.recipe__line--rule');
    // Adskil står alene i sit trin: ingen pile, intet håndtag. Målene har begge dele.
    await expect(lines.nth(0).getByRole('button', { name: 'Flyt ned' })).toHaveCount(0);
    await expect(lines.nth(0).locator('.recipe__grip')).toHaveCount(0);
    await expect(lines.nth(1).getByRole('button', { name: 'Flyt ned' })).toHaveCount(1);
    await expect(lines.nth(1).locator('.recipe__grip')).toHaveCount(1);
    await expect(dialog.locator('.recipe__ordernote')).toContainText('øverste');
    await expect(dialog.locator('.recipe__ordernote')).not.toContainText('Motoren ordner reglerne efter type');

    // Pil ned på Fordel (linje 2): bytter med Balancér, ikke med Adskil.
    await lines.nth(1).hover();
    await lines.nth(1).getByRole('button', { name: 'Flyt ned' }).focus();
    await page.keyboard.press('Enter');
    expect(await ruleColumns(page)).toEqual(['balance:Karakter', 'separate:Karakter', 'distribute:Køn']);
    // Fokus fulgte reglen: den står nu nederst i trinnet, så "Flyt op" har fokus.
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Flyt op (vigtigere)');
    // Andet tryk flytter den samme regel tilbage, og øverst i trinnet har "Flyt ned" fokus.
    await page.keyboard.press('Enter');
    expect(await ruleColumns(page)).toEqual(['distribute:Køn', 'separate:Karakter', 'balance:Karakter']);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Flyt ned');

    // Hvorfor?: beskriver den nye motor.
    await dialog.getByRole('button', { name: /Hvorfor/ }).click();
    await expect(page.locator('.recipe-why').first()).toContainText('vinder den øverste altid');

    // Det, motoren får: inden for hvert trin i den viste rækkefølge.
    await page.keyboard.press('Escape');
    await lines.nth(2).hover();
    await lines.nth(2).getByRole('button', { name: 'Flyt op (vigtigere)' }).click();
    const shown = (await lineTexts(dialog)).map(t => t.replace(/\s+/g, ' '));
    expect(shown[1]).toMatch(/Balancér/);
    expect(shown[2]).toMatch(/Fordel/);
    await clickGo(page);
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.isGenerating), { timeout: 30000 }).toBe(false);
    // Motoren får præcis den viste rækkefølge — også på tværs af trin.
    const sent = await page.evaluate(() => (window as any).appDebug.nextInput.rules.map((r: any) => r.type));
    expect(sent).toEqual(['separate', 'balance', 'distribute']);
});

test('reglerne: træk en regel med musen inden for sit trin', async ({ page }) => {
    test.setTimeout(150000);
    const dialog = await recipeWithRules(page);
    const lines = dialog.locator('.recipe__line--rule');
    // Balancér (linje 3) op over Fordel (linje 2).
    await lines.nth(2).hover();
    const grip = lines.nth(2).locator('.recipe__grip');
    const g = (await grip.boundingBox())!;
    const t = (await lines.nth(1).boundingBox())!;
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + g.width / 2, g.y - 4, { steps: 3 });
    await page.mouse.move(t.x + t.width / 2, t.y + t.height * 0.25, { steps: 6 });
    // dragover kommer først ved næste bevægelse (Playwright) — et par ekstra skridt.
    await page.mouse.move(t.x + t.width / 2 + 2, t.y + t.height * 0.2, { steps: 2 });
    await page.mouse.move(t.x + t.width / 2 + 4, t.y + t.height * 0.2, { steps: 2 });
    await page.mouse.up();
    await expect.poll(() => ruleColumns(page)).toEqual(['balance:Karakter', 'separate:Karakter', 'distribute:Køn']);
    await expect(dialog.locator('.recipe__line--rule .recipe__text').nth(1)).toContainText('Balancér');
    // Træk på tværs af trin (Balancér op over Adskil): intet sker.
    await lines.nth(1).hover();
    const grip2 = lines.nth(1).locator('.recipe__grip');
    const g2 = (await grip2.boundingBox())!;
    const top = (await lines.nth(0).boundingBox())!;
    await page.mouse.move(g2.x + g2.width / 2, g2.y + g2.height / 2);
    await page.mouse.down();
    await page.mouse.move(top.x + top.width / 2, top.y + top.height * 0.2, { steps: 6 });
    await page.mouse.move(top.x + top.width / 2 + 3, top.y + top.height * 0.2, { steps: 2 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await ruleColumns(page)).toEqual(['balance:Karakter', 'separate:Karakter', 'distribute:Køn']);
    await dialog.screenshot({ path: test.info().outputPath('ny-motor-regler.png') });
});

// ─── Hvad blev opfyldt? (Kenneth 3/11) ───────────────────────────────────────
// Efter en kørsel med den nye motor har hver regel et lille mærke i margenen,
// og aftalerne "N af M holdt". Mærkerne hører kun til sidste kørsel: ændres
// rækkefølgen bagefter, forsvinder de. Kenneths egen svære testklasse.
/** Gendan Kenneths svære testklasse (backup-format, opdigtede navne). */
async function restoreHardClass(page: Page) {
    const backup = readFileSync(join(import.meta.dirname, '..', 'testdata', 'svaer_testklasse.json'));
    await skipGuides(page);
    await page.goto('/');
    await waitReady(page);
    await page.locator('.nav-tab').filter({ hasText: 'Import & backup' }).click();
    await page.getByRole('button', { name: 'Importér', exact: true }).click();
    await page.getByRole('button', { name: 'Upload fil eller gendan backup' }).click();
    await page.setInputFiles('input[type=file]', { name: 'svaer.json', mimeType: 'application/json', buffer: backup });
    await page.getByRole('button', { name: /Importér Filer/i }).click();
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.currentClass?.data?.length || 0), { timeout: 15000 }).toBe(30);
}

/** Skal sammen = netop disse elever (efter navn); evt. uden rolle for nogle. */
async function plantTogether(page: Page, names: string[], noRole: string[] = []) {
    await page.evaluate(({ names, noRole }) => {
        const cls = (window as any).appDebug.state.currentClass;
        const idOf = (n: string) => cls.data.find((r: any) => r.Navn === n)._rowId;
        cls.togetherGroups = [{ ids: names.map(idOf) }];
        cls.data.forEach((r: any) => { if (noRole.includes(r.Navn)) r.Rolle = ''; });
    }, { names, noRole });
}

// Spørgsmål 51 (Kenneths beslutning): Skal sammen og en almindelig Adskil
// stopper kun, når aftalen gør det værre. Klassen har 9 ordstyrere i 7 grupper,
// så to par kan alligevel ikke undgås — to ordstyrere, der skal være sammen,
// koster intet ekstra: ingen stop, en blå note før, og resultatet nævner parret.
test('Skal sammen med to ordstyrere: ingen stop, en blå note, og resultatet nævner parret', async ({ page }) => {
    test.setTimeout(180000);
    await restoreHardClass(page);
    await goToGroups(page);
    await plantTogether(page, ['Asta Brink', 'Bertram Hvid']);
    let dialog = await openRecipe(page);
    const note = dialog.locator('.gh-hint').filter({ hasText: 'Asta Brink, Bertram Hvid skal være sammen' });
    await expect(note).toHaveCount(1);
    await expect(note).toHaveClass(/gh-hint--info/);
    // Rødt er kun Adskil-reglens egen advarsel (9 ordstyrere, 7 grupper) — ikke parret.
    await expect(dialog.locator('.gh-hint--conflict').filter({ hasText: 'Asta Brink' })).toHaveCount(0);
    await dialog.screenshot({ path: test.info().outputPath('par-foer.png') });

    await clickGo(page);
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.isGenerating), { timeout: 30000 }).toBe(false);
    expect(await page.evaluate(() => (window as any).appDebug.nextStats.status)).toBe('ok');
    dialog = await openRecipe(page);
    const result = dialog.locator('.recipe__lastlist li').filter({ hasText: 'er et af parrene, fordi de skal være sammen' });
    await expect(result).toHaveCount(1);
    await expect(result).toContainText('Asta Brink');
    // Noten er afløst af resultatet: samme sag én gang.
    await expect(dialog.locator('.gh-hint').filter({ hasText: 'skal være sammen og har begge en værdi' })).toHaveCount(0);
    await expect(dialog.locator('.recipe__line--rule').filter({ hasText: 'Ordstyrer' }).locator('.rule-mark'))
        .toHaveAttribute('aria-label', 'Ikke helt — det bedst mulige');
    await dialog.screenshot({ path: test.info().outputPath('par-efter.png') });
});

// Samme par, men nu kun 7 ordstyrere i 7 grupper: uden aftalen kan alle stå
// hver for sig, så aftalen koster et par — dannelsen stopper, rødt.
test('Skal sammen med to ordstyrere, når 7 kan stå i hver sin af 7 grupper: stop', async ({ page }) => {
    test.setTimeout(180000);
    await restoreHardClass(page);
    await goToGroups(page);
    await plantTogether(page, ['Asta Brink', 'Bertram Hvid'], ['Agnes Lykke', 'Bjørn Nissen']);
    const dialog = await openRecipe(page);
    await expect(dialog.locator('.gh-hint--conflict').filter({ hasText: 'Asta Brink, Bertram Hvid' })).toHaveCount(1);
    await clickGo(page);
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.isGenerating), { timeout: 30000 }).toBe(false);
    expect(await page.evaluate(() => (window as any).appDebug.nextStats?.status ?? null)).not.toBe('ok');
    await expect(page.locator('.group-card')).toHaveCount(0);
    await expect(page.locator('.gh-hint--conflict').filter({ hasText: 'flere par i samme gruppe' }).first()).toBeVisible();
});

test('hvad blev opfyldt: et mærke pr. regel og aftalerne — væk, når opskriften ændres', async ({ page }) => {
    test.setTimeout(180000);
    await restoreHardClass(page);

    await goToGroups(page);
    // Før kørslen: ingen mærker.
    let dialog = await openRecipe(page);
    await expect(dialog.locator('.rule-mark')).toHaveCount(0);
    await clickGo(page);
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.isGenerating), { timeout: 30000 }).toBe(false);
    expect(await page.evaluate(() => (window as any).appDebug.nextStats.status)).toBe('ok');

    dialog = await openRecipe(page);
    const lines = dialog.locator('.recipe__line--rule');
    await expect(lines).toHaveCount(5);
    // Hver regel har sit mærke med en tekst til skærmlæseren.
    for (let i = 0; i < 5; i++) {
        await expect(lines.nth(i).locator('.rule-mark')).toHaveAttribute('aria-label', /^(Opfyldt|Ikke helt — det bedst mulige|Ikke opfyldt)/);
    }
    // Fordel på Køn kan ikke gå helt lige op (15 P, 14 D, 1 Andet i 7 grupper):
    // det bedst mulige, og "Sidste dannelse" siger hvorfor.
    await expect(lines.filter({ hasText: 'Køn' }).locator('.rule-mark')).toHaveAttribute('aria-label', 'Ikke helt — det bedst mulige');
    await expect(dialog.locator('.recipe__lastlist li').filter({ hasText: 'Fordel på "Køn"' })).toHaveCount(1);
    await expect(dialog.locator('.rule-mark[aria-label="Opfyldt"]').first()).toBeVisible();
    await expect(dialog.locator('.recipe__agreed')).toHaveText('alle holdt');
    await dialog.screenshot({ path: test.info().outputPath('hvad-blev-opfyldt.png') });

    // Rækkefølgen ændret efter kørslen: mærkerne hører ikke længere til det, der står.
    const goals = lines.filter({ has: page.locator('.recipe__grip') });
    await goals.first().hover();
    await goals.first().getByRole('button', { name: 'Flyt ned' }).click();
    await expect(dialog.locator('.rule-mark')).toHaveCount(0);
    await expect(dialog.locator('.recipe__agreed')).toHaveCount(0);
});

// Kenneth 3/11: "når man trækker en regel i opskriften, så kan modal'en
// 'springe'". Vinduet var midtstillet, og hvert ryk under trækket skrev den
// nye rækkefølge i klassen — så forsvandt "Sidste dannelse", højden skiftede,
// og vinduet hoppede. Nu står vinduet fast øverst, og rækkefølgen skrives
// først ved slip. Højt vindue, så indholdet ikke rammer loftet (88dvh).
test('opskriften står stille, mens en regel trækkes — og når pilene flytter den', async ({ page }) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 1280, height: 1400 });
    await restoreHardClass(page);
    await goToGroups(page);
    await generateGroups(page);
    const dialog = await openRecipe(page);
    const top = () => dialog.locator('.recipe-dialog__panel').evaluate(el => Math.round(el.getBoundingClientRect().top));
    const height = () => dialog.locator('.recipe-dialog__panel').evaluate(el => Math.round(el.getBoundingClientRect().height));
    await expect(dialog.locator('.recipe__lastlist li').first()).toBeVisible();
    const top0 = await top();
    const height0 = await height();
    const goals = dialog.locator('.recipe__line--rule').filter({ has: page.locator('.recipe__grip') });
    const last = goals.last();
    await last.hover();
    const g = (await last.locator('.recipe__grip').boundingBox())!;
    const target = (await goals.nth(2).boundingBox())!;
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
        await page.mouse.move(g.x, g.y + (target.y + 5 - g.y) * i / 8, { steps: 2 });
        expect(await top()).toBe(top0);
        expect(await height()).toBe(height0);
    }
    // Rækkerne flytter sig under musen, men klassens liste først ved slip.
    await expect(dialog.locator('.recipe__lastlist li').first()).toBeVisible();
    await page.mouse.up();
    // Pilen ændrer rækkefølgen med det samme: "Sidste dannelse" hører til den
    // gamle opsætning og forsvinder, vinduet bliver lavere — men toppen står.
    const first = goals.first();
    await first.hover();
    await first.getByRole('button', { name: 'Flyt ned' }).click();
    await expect(dialog.locator('.recipe__lastlist')).toHaveCount(0);
    expect(await top()).toBe(top0);
});
