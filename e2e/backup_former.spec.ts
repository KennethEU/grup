import { test, expect } from '@playwright/test';
import { createClass, createClassAndGoToGroups, goToGroups, generateGroups, addRecipeRule, closeRecipe, openRecipe, goToMatrix } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EN BACKUP MED FORKERTE FORMER INDENI (121. gennemsyn, tematik 112).
//
// Gendannelsen tjekkede kun den yderste form. En regel, der var `null`,
// gav en grøn kvittering og en Grupper-fane, hvor "Dan grupper" ikke kunne
// trykkes; en gruppe, der var `null`, gav en klasse, der slet ikke kunne
// åbnes. Nu gendannes eleverne, det forkerte lades ude, og kvitteringen
// siger det — og en klasse, der ALLEREDE ligger sådan i lageret, åbner igen.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('"Overskriv mine" med en ødelagt backup: eleverne kommer ind, klassen virker, kvitteringen siger hvad der mangler', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    // Klassen HAR grupper, før backuppen skrives oven i — ellers ville
    // kvitteringens "klassens grupper her er fjernet" ikke være sand.
    await createClassAndGoToGroups(page, '2a');
    await generateGroups(page);
    const file = await page.evaluate(() => (window as any).appDebug.state.currentClass.filename);

    const backup = JSON.stringify([{
        filename: file,
        name: '2a',
        data: [{ Navn: 'Cecilie', _rowId: 'r1' }, { Navn: 'Dorte', _rowId: 'r2' },
            { Navn: 'Erik', _rowId: 'r3' }, { Navn: 'Finn', _rowId: 'r4' }],
        columns: ['Navn'],
        id_column: 'Navn',
        rules: [null],
        separations: [null],
        groups: { standard: [null], matrix: null },
        groupTopics: {},
    }]);

    await page.locator('.nav-tab').filter({ hasText: 'Import & backup' }).click();
    await page.getByRole('button', { name: 'Importér', exact: true }).click();
    await page.getByRole('button', { name: 'Upload fil eller gendan backup' }).click();
    await page.setInputFiles('input[type=file]', {
        name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup),
    });
    await page.getByRole('button', { name: /Importér Filer/i }).click();
    await page.getByRole('button', { name: 'Overskriv mine' }).click();

    // Ikke en grøn kvittering: den nævner reglen, aftalen og grupperne.
    const receipt = page.locator('.toast').filter({ hasText: 'gendannet' });
    await expect(receipt).toContainText('kunne nogle regler, nogle "Undgå hinanden"-aftaler og grupper ikke gendannes');
    await expect(receipt).toContainText('klassens grupper her er fjernet');

    await expect.poll(async () => await page.evaluate(() =>
        (window as any).appDebug.state.currentClass?.data?.[0]?.Navn), { timeout: 15000 }).toBe('Cecilie');
    await goToGroups(page);
    await generateGroups(page);
    expect(errors).toEqual([]);
});

test('en klasse, der allerede ligger med forkerte former i lageret, kan åbnes og danne grupper', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    const cleaned: string[] = [];
    page.on('console', m => {
        if (m.type() === 'error' && /Uncaught|TypeError/.test(m.text())) errors.push(m.text());
        if (m.type() === 'error' && /\[Klasse\].*uden den forventede form/.test(m.text())) cleaned.push(m.text());
    });
    await createClass(page, '3b');
    const file = await page.evaluate(() => (window as any).appDebug.state.currentClass.filename);

    // Som en gendannelse fra før rettelsen efterlod den: forkerte regler og
    // aftaler i selve klassen, og en gruppe, der er null.
    // Skrives FØR appen starter ved genindlæsningen (122. gennemsyn). Rettet
    // med updateClass, mens fanen var åben, skrev fanens eget gem ved
    // genindlæsningen de rigtige regler tilbage — så nåede de forkerte
    // aldrig frem til selectClass, og kun gruppe-delen blev prøvet.
    await page.addInitScript((filename) => {
        if (sessionStorage.getItem('formerSat')) return;
        sessionStorage.setItem('formerSat', '1');
        const classes = JSON.parse(localStorage.getItem('grupdk_classes') || '[]');
        for (const entry of classes) {
            const cls = entry && (entry.content || entry);
            if ((entry.filename || cls.filename) === filename) {
                cls.rules = [null, { type: 42 }];
                cls.separations = [null, { ids: 'r1' }];
                cls.matrixRules = [null];
            }
        }
        localStorage.setItem('grupdk_classes', JSON.stringify(classes));
        localStorage.setItem(`grupdk_groups_${filename}`, JSON.stringify({ standard: [null], matrix: null }));
    }, file);
    await page.reload();
    await page.waitForFunction(() => (window as any).appDebug?.pyBridge?.isReady === true);

    // Ingen "Fejl ved indlæsning af klasse" — klassen står der med sine elever.
    await expect(page.locator('th').filter({ hasText: 'Navn' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Fejl ved indlæsning af klasse/)).toHaveCount(0);
    await goToGroups(page);
    await generateGroups(page);

    // Det forkerte er taget ud og gemt sådan (næste åbning skal ikke igen).
    await expect.poll(async () => await page.evaluate((filename) => {
        const cls = (window as any).appDebug.pyBridge.getClass(filename).content;
        return { rules: cls.rules, separations: cls.separations, matrixRules: cls.matrixRules };
    }, file)).toEqual({ rules: [], separations: [], matrixRules: [] });
    // Filteret i selectClass har faktisk set de forkerte former (ellers
    // beviste testen intet om det).
    expect(cleaned.join(' ')).toMatch(/rules/);
    expect(cleaned.join(' ')).toMatch(/separations/);
    expect(errors).toEqual([]);
});

// Modstykket: filteret i selectClass kører på HVER klasse, der åbnes, og et
// gem bagefter skriver resultatet. Rigtige regler og aftaler, lavet med
// appens egne knapper, skal derfor stå præcis som før efter en genindlæsning.
test('rigtige regler, en matrix-regel og en "Undgå hinanden"-aftale står uændret efter genåbning', async ({ page }) => {
    await createClassAndGoToGroups(page, '4c');
    await addRecipeRule(page, { column: 'Køn' });
    await addRecipeRule(page, { type: 'Adskil', column: 'Karakter', value: '12' });
    await addRecipeRule(page, { type: 'Balancér', column: 'Karakter' });
    await generateGroups(page);
    await closeRecipe(page);
    await goToMatrix(page);
    await addRecipeRule(page, { column: 'Køn' });
    await closeRecipe(page);

    // "Undgå hinanden" mellem Anna og Bob, med elevlistens egne knapper.
    await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();
    for (const n of ['Anna', 'Bob']) {
        await page.locator('tr').filter({ hasText: n }).locator('.cell-checkbox input').first().check();
    }
    await page.locator('#create-agreement-btn').click();
    await page.locator('.agreement-menu').getByRole('menuitem', { name: /Undgå hinanden/ }).click();
    await page.locator('.avoid-modal-close').click();
    await page.waitForTimeout(1500);   // gemmes forsinket

    const read = () => page.evaluate(() => {
        const { pyBridge, state } = (window as any).appDebug;
        const cls = pyBridge.getClass(state.currentClass.filename).content;
        return { rules: cls.rules, matrixRules: cls.matrixRules, separations: cls.separations };
    });
    const before = await read();
    expect(before.rules).toHaveLength(3);
    expect(before.matrixRules).toHaveLength(1);
    expect(before.separations).toHaveLength(1);

    await page.reload();
    await page.waitForFunction(() => (window as any).appDebug?.pyBridge?.isReady === true);
    await expect(page.locator('th').filter({ hasText: 'Navn' })).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);   // åbningens gem (setTimeout 0) er sket
    expect(await read()).toEqual(before);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 122. gennemsyn (tematik 113): gruppestørrelsen og gruppenavnene i en klasse,
// der allerede ligger med forkerte former, og en gemt session uden en eneste
// læselig gruppe.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('en gruppestørrelse, der ikke er et tal, og to grupper med samme navn: klassen åbner med 4 og unikke navne', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await createClass(page, '5d');
    const file = await page.evaluate(() => (window as any).appDebug.state.currentClass.filename);
    const ids = await page.evaluate(() =>
        (window as any).appDebug.state.currentClass.data.map((r: any) => r._rowId));
    // Skrives FØR appen starter ved genindlæsningen. Skrevet mens fanen er
    // åben, gemmer fanen sin egen udgave oven i det, når den lukkes — så var
    // "abc" væk, før klassen blev åbnet igen, og testen bestod på den gamle kode.
    await page.addInitScript(({ filename, ids }) => {
        if (sessionStorage.getItem('formerSat')) return;
        sessionStorage.setItem('formerSat', '1');
        const classes = JSON.parse(localStorage.getItem('grupdk_classes') || '[]');
        for (const entry of classes) {
            const cls = entry && (entry.content || entry);
            if ((entry.filename || cls.filename) === filename) {
                cls.settings = { groupMode: 'size', groupTarget: 'abc', groupMod: '+' };
            }
        }
        localStorage.setItem('grupdk_classes', JSON.stringify(classes));
        localStorage.setItem(`grupdk_groups_${filename}`, JSON.stringify({
            standard: [
                { name: 'Group 1', members: ids.slice(0, 6) },
                { name: 'Group 1', members: ids.slice(6) },
            ],
            matrix: null,
        }));
    }, { filename: file, ids });
    await page.reload();
    await page.waitForFunction(() => (window as any).appDebug?.pyBridge?.isReady === true);
    await expect(page.locator('th').filter({ hasText: 'Navn' })).toBeVisible({ timeout: 15000 });

    // Begge grupper står der, hver for sig.
    await goToGroups(page);
    await closeRecipe(page);
    await expect(page.locator('.group-card')).toHaveCount(2);
    expect(await page.evaluate(() => (window as any).appDebug.state.storedStandardGroups.map((g: any) => g.name)))
        .toEqual(['Group 1', 'Group 2']);

    // Opskriften viser 4, og grupperne bliver ikke på én elev.
    expect(await page.evaluate(() => String((window as any).appDebug.state.currentClass.settings.groupTarget))).toBe('4');
    const dialog = await openRecipe(page);
    await expect(dialog).toContainText('Dan grupper på 4 elever');
    await generateGroups(page);
    // 12 elever på 4 = 3 grupper (før: "på 1 elev" og 12 grupper). Der
    // ventes på det nye svar — de to gamle kort står der, til det kommer.
    await expect.poll(async () => await page.evaluate(() =>
        (window as any).appDebug.state.storedStandardGroups.map((g: any) => g.members.length)), { timeout: 60000 })
        .toEqual([4, 4, 4]);
    // Rettelsen er gemt (næste åbning skal ikke igen).
    expect(await page.evaluate((filename) =>
        (window as any).appDebug.pyBridge.getClass(filename).content.settings.groupTarget, file)).not.toBe('abc');
    expect(errors).toEqual([]);
});

test('"Gendan" på en session uden en eneste læselig gruppe lader grupperne stå og bliver på Historik', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await createClassAndGoToGroups(page, '6e');
    await generateGroups(page);
    const before = await page.evaluate(() =>
        JSON.stringify((window as any).appDebug.state.storedStandardGroups.map((g: any) => g.members)));
    const file = await page.evaluate(() => (window as any).appDebug.state.currentClass.filename);

    // En session, som en håndrettet backup kunne have lagt ind: kun null.
    await page.evaluate((filename) => {
        localStorage.setItem('grupdk_session_ødelagt', JSON.stringify({
            id: 'ødelagt', name: 'Ødelagt', date: new Date().toISOString(), type: 'STANDARD_ONLY',
            groups: [null, null], matrixGroups: [], activeRules: [null],
        }));
        localStorage.setItem(`grupdk_history_${filename}`, JSON.stringify([{
            id: 'ødelagt', name: 'Ødelagt', date: new Date().toISOString(), type: 'STANDARD_ONLY',
            stats: { groupCount: 2, matrixCount: 0 },
        }]));
    }, file);

    await closeRecipe(page);
    await page.locator('.nav-tab').filter({ hasText: 'Historik' }).click();
    await page.getByRole('button', { name: 'Gendan Ødelagt' }).click();
    await page.getByRole('button', { name: 'Gendan', exact: true }).click();

    await expect(page.locator('.toast').filter({ hasText: 'ingen grupper i den, som kan læses' })).toBeVisible();
    await expect(page.locator('.nav-tab').filter({ hasText: 'Historik' })).toHaveClass(/\bactive\b/);
    expect(await page.evaluate(() =>
        JSON.stringify((window as any).appDebug.state.storedStandardGroups.map((g: any) => g.members)))).toBe(before);
    expect(errors).toEqual([]);
});

// En session med et navn, der ikke er tekst (fra en håndrettet backup), stod
// som "[object Object]" i Historik-listen, i knappernes navne og i
// forhåndsvisningens overskrift (122. gennemsyn, småting (a); rettet i 123.).
test('Historik viser en session med et navn, der ikke er tekst, som "Uden navn" — og et tal som tal', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await createClassAndGoToGroups(page, '7f');
    await generateGroups(page);
    const file = await page.evaluate(() => (window as any).appDebug.state.currentClass.filename);
    const members = await page.evaluate(() =>
        (window as any).appDebug.state.storedStandardGroups.map((g: any) => g.members));

    await page.evaluate(({ filename, members }) => {
        const date = new Date().toISOString();
        const sessions = [
            { id: 's-obj', name: { tekst: 'x' }, stats: { groupCount: { n: 2 } } },
            { id: 's-tal', name: 5, stats: { groupCount: '3' } },
        ];
        for (const s of sessions) {
            localStorage.setItem(`grupdk_session_${s.id}`, JSON.stringify({
                id: s.id, name: s.name, date, type: 'STANDARD_ONLY',
                groups: members.map((m: any, i: number) => ({ name: `Group ${i + 1}`, members: m })),
                matrixGroups: [], activeRules: [],
            }));
        }
        localStorage.setItem(`grupdk_history_${filename}`, JSON.stringify(
            sessions.map(s => ({ id: s.id, name: s.name, date, type: 'STANDARD_ONLY', stats: s.stats }))));
    }, { filename: file, members });

    await closeRecipe(page);
    await page.locator('.nav-tab').filter({ hasText: 'Historik' }).click();
    const list = page.locator('#history-list-view');
    await expect(list.locator('.cell-name')).toHaveText(['Uden navn', '5']);
    await expect(list.locator('.cell-count')).toHaveText(['0', '3']);
    await expect(list).not.toContainText('[object Object]');
    await expect(page.getByRole('button', { name: 'Omdøb Uden navn' })).toBeVisible();

    // Omdøb-feltet starter tomt (ikke med "[object Object]").
    await page.getByRole('button', { name: 'Omdøb Uden navn' }).click();
    await expect(page.getByPlaceholder('Nyt navn')).toHaveValue('');
    await page.keyboard.press('Escape');

    // Forhåndsvisningens overskrift.
    await page.getByRole('button', { name: 'Forhåndsvis Uden navn' }).click();
    const preview = page.getByRole('dialog', { name: /Forhåndsvisning/ });
    await expect(preview.locator('.preview-name')).toHaveText('Session');
    await expect(preview).toContainText('Gruppe 1');
    await expect(preview).not.toContainText('[object Object]');
    expect(errors).toEqual([]);
});
