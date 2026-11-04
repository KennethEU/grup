import { test, expect } from '@playwright/test';
import { createClass, gotoAppReady } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rækkefølgen på kolonner og klasser.
//
// Kolonnedelen hænger på ÉN ting: den rækkefølge der overlever en
// genindlæsning, er nøglerne i elevrækkerne — ikke `cls.columns`. Derfor
// genindlæser testene under her og kigger EFTER reloadet. Uden det ville en
// "forenkling" til bare at sortere arrayet bestå alle tests og alligevel være
// i stykker for læreren.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Kolonneoverskrifterne som de STÅR i tabellen, fra venstre.
 *
 * Versalerne er i selve DOM'en (`{{ col.toUpperCase() }}` i StudentTable),
 * ikke i CSS — så de kan ikke vaskes af. Vi sammenligner i versaler og
 * skærer sorteringspilen af, hvis der er sorteret på kolonnen.
 */
async function columnHeaders(page) {
    // Kun overskriftens egen tekst (ikke tekst i elementer inden i den), så
    // et mærke i overskriften aldrig bliver læst som en del af navnet.
    return (await page.locator('th.col-header').evaluateAll(ths => ths.map(th =>
        [...th.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join(''))))
        .map(t => t.trim().replace(/[^A-ZÆØÅ0-9 ]+$/i, '').trim());
}

async function openMoveMenu(page) {
    await page.locator('#col-layout-btn').click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
}

test('en kolonne kan flyttes — og rækkefølgen overlever en genindlæsning', async ({ page }) => {
    await createClass(page, 'Flyt Kolonner E2E');
    expect(await columnHeaders(page)).toEqual(['NAVN', 'KØN', 'KARAKTER']);

    await openMoveMenu(page);
    // Flyt "Karakter" fra plads 3 til plads 2. Plads 1 er VIS-kolonnen
    // (Navn): den står låst øverst, så Karakter kan ikke komme op over den.
    await page.getByRole('button', { name: 'Flyt Karakter op' }).click();
    await expect(page.getByRole('button', { name: 'Flyt Karakter op' })).toBeDisabled();
    await page.getByRole('button', { name: 'Gem rækkefølge' }).click();

    await expect(page.locator('.modal-overlay')).toHaveCount(0);
    expect(await columnHeaders(page)).toEqual(['NAVN', 'KARAKTER', 'KØN']);

    // Dét her er hele prøven. `cls.columns` alene ville se rigtig ud indtil nu.
    await page.reload();
    await gotoAppReady(page);
    await expect(page.locator('th').filter({ hasText: 'Navn' })).toBeVisible({ timeout: 30000 });
    expect(await columnHeaders(page)).toEqual(['NAVN', 'KARAKTER', 'KØN']);

    // Og værdierne fulgte med — nøgler blev flyttet, ikke data.
    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow.locator('td.cell-data').nth(0)).toHaveText('Anna');
    await expect(firstRow.locator('td.cell-data').nth(1)).toHaveText('10');
});

// Et højreklik folder kolonnen sammen. Valget lå i `hiddenColumns` på klassen
// og blev gemt med det samme — men feltet fulgte ikke med gennem gem-kæden, og
// `updateClass()` erstatter `content` HELT. Kolonnen var derfor foldet ud igen
// efter et reload. Reloadet ER prøven; før den var alt grønt på skærmen.
test('en foldet kolonne er stadig foldet efter en genindlæsning', async ({ page }) => {
    await createClass(page, 'Skjul Kolonne E2E');

    const genderHeader = page.locator('th.col-header').filter({ hasText: 'KØN' });
    await expect(genderHeader).not.toHaveClass(/col-hidden/);
    await genderHeader.click({ button: 'right' });
    await expect(genderHeader).toHaveClass(/col-hidden/);

    await page.reload();
    await gotoAppReady(page);
    await expect(page.locator('th').filter({ hasText: 'Navn' })).toBeVisible({ timeout: 30000 });

    expect(await columnHeaders(page)).toEqual(['NAVN', 'KØN', 'KARAKTER']);
    await expect(page.locator('th.col-header').filter({ hasText: 'KØN' }))
        .toHaveClass(/col-hidden/);
});

test('Ctrl+Z tager flytningen tilbage — også efter en genindlæsning', async ({ page }) => {
    await createClass(page, 'Fortryd Flyt E2E');

    await openMoveMenu(page);
    await page.getByRole('button', { name: 'Flyt Karakter op' }).click();
    await page.getByRole('button', { name: 'Gem rækkefølge' }).click();
    expect(await columnHeaders(page)).toEqual(['NAVN', 'KARAKTER', 'KØN']);

    // Genvejen ligger på document og springer felter over, så vi trykker
    // et neutralt sted.
    await page.locator('.settings-panel').click();
    await page.keyboard.press('ControlOrMeta+z');

    expect(await columnHeaders(page)).toEqual(['NAVN', 'KØN', 'KARAKTER']);

    // Fortrydelsen skal også være GEMT — ellers viser tabellen ét og lageret
    // et andet, og forskellen dukker først op ved næste besøg.
    await page.reload();
    await gotoAppReady(page);
    await expect(page.locator('th').filter({ hasText: 'Navn' })).toBeVisible({ timeout: 30000 });
    expect(await columnHeaders(page)).toEqual(['NAVN', 'KØN', 'KARAKTER']);
});

test('vinduet kan betjenes uden mus, og "Gem" er slået fra indtil noget er flyttet', async ({ page }) => {
    await createClass(page, 'Flyt Uden Mus E2E');
    await openMoveMenu(page);

    const saveButton = page.getByRole('button', { name: 'Gem rækkefølge' });
    await expect(saveButton).toBeDisabled();

    // Pil ned på selve grebet — træk-og-slip findes ikke på touch.
    // exact: "Flyt Køn" er også begyndelsen på "Flyt Køn op"/"… ned".
    // (Navn har intet greb: VIS-kolonnen står låst øverst.)
    await expect(page.getByRole('button', { name: 'Flyt Navn', exact: true })).toHaveCount(0);
    const dragHandle = page.getByRole('button', { name: 'Flyt Køn', exact: true });
    await dragHandle.focus();
    await page.keyboard.press('ArrowDown');

    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    expect(await columnHeaders(page)).toEqual(['NAVN', 'KARAKTER', 'KØN']);
});

test('klasserne står alfabetisk i menuen — ikke i den orden de blev oprettet', async ({ page }) => {
    await createClass(page, '10.a Samf');
    // De næste to laves med "+" i klassemenuen — den korte vej til en tom
    // klasse. Rækkefølgen de oprettes i, er med vilje ikke alfabetisk.
    for (const newClassName of ['2.a Samf', '1.a Samf']) {
        await page.locator('.class-trigger').click();
        await page.getByRole('button', { name: 'Opret ny klasse' }).click();
        const inputField = page.getByPlaceholder('Navn på klasse');
        await expect(inputField).toBeVisible();
        await inputField.fill(newClassName);
        await page.getByRole('button', { name: 'Opret', exact: true }).click();
        await expect(page.locator('.class-trigger')).toContainText(newClassName, { timeout: 30000 });
    }

    await page.locator('.class-trigger').click();
    const classNames = (await page.locator('.class-item .name').allInnerTexts()).map(t => t.trim());
    // numeric: true — ellers ville 10.a stå før 2.a.
    expect(classNames).toEqual(['1.a Samf', '2.a Samf', '10.a Samf']);
});

test('rækkefølgen følger med ud i Excel-filen', async ({ page }) => {
    await createClass(page, 'Flyt Til Excel E2E');

    await openMoveMenu(page);
    await page.getByRole('button', { name: 'Flyt Karakter op' }).click();
    await page.getByRole('button', { name: 'Gem rækkefølge' }).click();
    expect(await columnHeaders(page)).toEqual(['NAVN', 'KARAKTER', 'KØN']);

    // Fang zip-blobben i stedet for at downloade den — samme greb som i
    // output_surfaces.spec.ts.
    await page.evaluate(() => {
        (window as any).__blobs = [];
        const realCreateObjectURL = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (b: any) => { (window as any).__blobs.push(b); return realCreateObjectURL(b); };
    });

    await page.locator('.nav-tab').filter({ hasText: 'Import & backup' }).click();
    await page.getByRole('button', { name: 'Eksportér', exact: true }).click();
    await page.getByRole('button', { name: /Vælg alle/i }).click();
    await page.getByRole('button', { name: /Download Excel-filer/i }).click();

    const headerTexts = await page.evaluate(async () => {
        // src/vendor/, ikke node_modules: xlsx blev vendored ind ved
        // sikkerhedsreviewet (0.20.3 — npm's sidste udgave, 0.18.5, har to
        // kendte huller i fil-parsningen), og pakken er ikke længere en
        // dependency. Testene læste den gamle kopi, så længe den lå
        // tilbage i node_modules — og faldt først på en frisk klon.
        const XLSX: any = await import('/src/vendor/xlsx.mjs');
        const JSZipMod: any = await import('/node_modules/jszip/dist/jszip.min.js');
        const JSZip = (window as any).JSZip || JSZipMod.default;
        const settle = async () => {
            for (let i = 0; i < 60; i++) {
                if ((window as any).__blobs.length) return;
                await new Promise(r => setTimeout(r, 250));
            }
        };
        await settle();
        const blobs = (window as any).__blobs;
        const zip = await JSZip.loadAsync(blobs[blobs.length - 1]);
        const fileName = Object.keys(zip.files)[0];
        const buf = await zip.files[fileName].async('arraybuffer');
        const wb = XLSX.read(buf, { type: 'array' });
        // header: 1 giver den RÅ første række — altså overskrifterne i den
        // rækkefølge de faktisk står i arket.
        return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })[0];
    });

    // Arket bygges af Object.keys(row) pr. række, så nøglerækkefølgen ER
    // kolonnerækkefølgen i Excel. "Til stede" lægges til bagest.
    expect(headerTexts.slice(0, 3)).toEqual(['Navn', 'Karakter', 'Køn']);
});

// VIS-kolonnen står altid først i elevlisten (og bliver stående, når listen
// ruller — se elevliste_bredde.spec.ts). Vælger læreren en anden under Vis,
// står DEN først med det samme, og i Flyt står den låst øverst. Gemmer man,
// kommer den også først i klassens egen rækkefølge, så Excel passer.
test('VIS-kolonnen står låst øverst i Flyt og først i elevlisten', async ({ page }) => {
    await createClass(page, 'Vis Låst E2E');
    await page.locator('#id-column-select').selectOption('Karakter');
    expect(await columnHeaders(page)).toEqual(['KARAKTER', 'NAVN', 'KØN']);

    await openMoveMenu(page);
    const dialog = page.locator('.modal-overlay');
    await expect(dialog.locator('.pinned-row')).toContainText('Karakter');
    await expect(dialog.getByRole('img', { name: 'Låst øverst' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Flyt Karakter', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Flyt Navn op' })).toBeDisabled();
    // Klassens rækkefølge er stadig Navn, Køn, Karakter — der er noget at gemme
    const saveButton = page.getByRole('button', { name: 'Gem rækkefølge' });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await page.reload();
    await gotoAppReady(page);
    await expect(page.locator('th').filter({ hasText: 'Navn' })).toBeVisible({ timeout: 30000 });
    // Efter genindlæsning står Karakter først, også i klassens egen rækkefølge
    await page.locator('#id-column-select').selectOption('Navn');
    expect(await columnHeaders(page)).toEqual(['NAVN', 'KARAKTER', 'KØN']);
});

test('Ctrl+Z fortryder ikke noget bag et åbent vindue', async ({ page }) => {
    await createClass(page, 'Undo Bag Vindue E2E');

    // En rigtig celleredigering, så fortryd-stakken har noget i sig.
    const firstCell = page.locator('tbody tr').nth(1).locator('td.cell-data').first();
    await firstCell.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('TESTNAVN');
    await page.locator('.settings-panel').click();
    await expect(firstCell).toHaveText('TESTNAVN');

    // Åbn et vindue og tryk fortryd INDE i det. Målt før fixet: den forrige,
    // helt urelaterede ændring blev rullet tilbage bag et vindue der dækkede
    // den, og læreren så det først ved at lukke. Vinduerne har deres egen
    // fortryd-vej: "Annuller".
    await page.locator('#col-layout-btn').click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForTimeout(300);

    await expect(page.locator('.modal-overlay')).toBeVisible();
    await page.getByRole('button', { name: 'Annuller' }).click();
    await expect(firstCell).toHaveText('TESTNAVN');

    // Og uden for vinduet virker genvejen som altid.
    await page.locator('.settings-panel').click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(firstCell).not.toHaveText('TESTNAVN');
});

test('en kolonne kan flyttes MERE end én gang med tastaturet', async ({ page }) => {
    // Fire kolonner: Navn står låst øverst (VIS-kolonnen), så der skal være
    // tre flytbare, for at Karakter kan flyttes to pladser.
    await createClass(page, 'Haandtag fokus E2E',
        'Navn\tKøn\tHold\tKarakter\nAnna\tK\t1\t10\nBob\tM\t2\t7\nClara\tK\t1\t12\nDavid\tM\t2\t4\n');
    await openMoveMenu(page);

    // Rækken bliver FLYTTET i DOM'en, og et element der sættes ind på ny,
    // taber fokus — også når det ikke deaktiveres. Målt før: ét tryk på pil op
    // flyttede kolonnen, og markøren stod på <body> bagefter. Andet tryk
    // gjorde altså ingenting, og listen kunne i praksis kun betjenes ÉN gang
    // uden mus. To tryk her er derfor ikke pynt — det er hele prøven.
    const handle = page.getByRole('button', { name: 'Flyt Karakter', exact: true });
    await handle.focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');

    // Øverst under den låste Navn-række
    await expect(page.locator('.order-row:not(.pinned-row)').first()).toContainText('Karakter');
    await expect(handle).toBeFocused();

    // Og pilene skal STADIG flytte fokus, når det er DEM der bliver slået fra.
    const downArrow = page.getByRole('button', { name: 'Flyt Karakter ned' });
    await downArrow.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(page.locator('.order-row').last()).toContainText('Karakter');
    await expect(page.getByRole('button', { name: 'Flyt Karakter op' })).toBeFocused();
});
