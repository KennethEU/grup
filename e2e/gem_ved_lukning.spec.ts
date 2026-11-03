import { test, expect } from '@playwright/test';
import { createClass, goToGroups, openRecipe, generateGroups } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fanen lukkes — hvad når at blive skrevet ned?
//
// Grupper har ingen server. Det læreren taster, findes ét sted: browserens
// localStorage. Alt der kun ligger i hukommelsen, når fanen lukkes, er væk
// uden en kopi at hente det fra.
//
// To ting lå kun i hukommelsen (gennemsyn 1/9):
//
//   · CELLEN MAN STÅR I. Elevtabellens celler er contenteditable, og værdien
//     skrives først ind i klassen ved `blur`. Lukker læreren fanen med
//     markøren i cellen, fyrer der aldrig et blur — og det sidst tastede navn
//     har aldrig eksisteret uden for skærmen.
//   · REGLER OG INDSTILLINGER PÅ GRUPPER-FANEN. De skrives ned med et
//     sekunds forsinkelse (og indstillingerne yderligere 0,3 s før dét), så
//     30 klik ikke bliver 30 skrivninger. Elevlisten havde en flush ved
//     lukning; Grupper-fanen havde ingen.
//
// Alle tre tests fejlede før rettelsen.
//
// TESTEN LUKKER FANEN — DEN GENINDLÆSER IKKE. Det er både det, læreren
// faktisk gør, og det eneste der kan måles i alle tre browsere: Playwrights
// Firefox affyrer INGEN unload-hændelser ved `page.reload()` (målt: hverken
// `beforeunload`, `pagehide` eller `unload`, heller ikke for en lytter testen
// selv har sat på). En reload-baseret test ville se ud som en fejl i
// produktet, hvor den i virkeligheden er en begrænsning i værktøjet.
// `page.close({ runBeforeUnload: true })` fyrer dem alle tre steder.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Celle (række, kolonne) i elevlisten — nul-indekseret, uden afkrydsningerne. */
function cell(page, row: number, col: number) {
    return page.locator('tbody tr').nth(row).locator('td.cell-data').nth(col);
}

/**
 * Luk fanen som læreren gør (Cmd+W) og åbn en ny i samme browser.
 * `runBeforeUnload` er det der gør lukningen ægte — uden den river
 * Playwright siden ned uden at spørge.
 */
async function closeTabAndOpenNew(context, page) {
    await page.close({ runBeforeUnload: true });
    await new Promise(r => setTimeout(r, 1000));
    const nextPage = await context.newPage();
    await nextPage.goto('/');
    return nextPage;
}

/** Klassens indhold, som det ligger i browseren. */
function savedClass(page) {
    return page.evaluate(() => {
        const classList = JSON.parse(localStorage.getItem('grupdk_classes') || '[]');
        return classList[0]?.content || null;
    });
}

test('en celle man stadig står i, overlever at fanen lukkes', async ({ context }) => {
    const page = await context.newPage();
    await createClass(page, 'Flush Celle E2E');

    const c = cell(page, 0, 0);
    await c.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('SIDSTE INDTASTNING');
    await expect(c).toHaveText('SIDSTE INDTASTNING');

    // INGEN blur, intet klik udenfor — præcis som at trykke Cmd+W midt i en
    // indtastning. Før rettelsen stod der 'Anna' i det gemte.
    const nextPage = await closeTabAndOpenNew(context, page);
    const fileContent = await savedClass(nextPage);
    expect(fileContent.data[0].Navn).toBe('SIDSTE INDTASTNING');
});

test('en regel tilføjet lige før lukningen er der stadig bagefter', async ({ context }) => {
    const page = await context.newPage();
    await createClass(page, 'Flush Regel E2E');
    await goToGroups(page);

    const dialog = await openRecipe(page);
    await dialog.getByRole('button', { name: '+ Tilføj regel' }).click();
    await expect(dialog.locator('.recipe__line--rule')).toHaveCount(1);

    // Luk MED DET SAMME — inden for det sekund, skrivningen venter.
    const nextPage = await closeTabAndOpenNew(context, page);
    const fileContent = await savedClass(nextPage);
    expect(fileContent.rules).toHaveLength(1);
});

test('en ændret gruppestørrelse er der stadig efter en øjeblikkelig lukning', async ({ context }) => {
    const page = await context.newPage();
    await createClass(page, 'Flush Indstilling E2E');
    await goToGroups(page);

    const dialog = await openRecipe(page);
    await dialog.locator('.rtok__btn[aria-label^="Gruppernes størrelse:"]').click();
    await dialog.locator('.rtok__pop input[type="number"]').fill('3');

    // Indstillingerne har TO lag forsinkelse: 0,3 s før de når klassen i
    // hukommelsen, og 1 s før klassen skrives ned.
    const nextPage = await closeTabAndOpenNew(context, page);
    const fileContent = await savedClass(nextPage);
    expect(String(fileContent.settings.groupTarget)).toBe('3');
});

test('et emne tastet lige før lukningen er der stadig bagefter', async ({ context }) => {
    const page = await context.newPage();
    await createClass(page, 'Flush Emne E2E');
    await goToGroups(page);

    // Grupper skal stå på skærmen, før der er et emnefelt at skrive i.
    await generateGroups(page);

    // Emnefeltet skrev til lageret ved HVERT tastetryk (målt: 17 tastetryk =
    // 34 skrivninger, halvdelen af hele gruppe-blobben). Nu venter skrivningen
    // 250 ms — og så skal lukningen kunne nå den, ellers har rettelsen bare
    // flyttet tabet et andet sted hen.
    const inputField = page.locator('.group-topic-input').first();
    await inputField.click();
    await inputField.pressSequentially('Klimaforandringer', { delay: 20 });

    const nextPage = await closeTabAndOpenNew(context, page);
    const savedTopics = await nextPage.evaluate(() => {
        const storageKey = Object.keys(localStorage).find(k => k.startsWith('grupdk_topics_'));
        return storageKey ? JSON.parse(localStorage.getItem(storageKey) as string) : {};
    });
    expect(Object.values(savedTopics)).toContain('Klimaforandringer');
});
