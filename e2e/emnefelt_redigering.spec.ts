import { test, expect, Page } from '@playwright/test';
import { createClassAndGoToGroups, generateGroups, goToGroups, goToMatrix } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Emnefeltet på et gruppekort skrives ikke om, mens læreren taster i det.
//
// Emnet gemmes udskudt (250 ms efter sidste tastetryk), og gruppens emne
// gemmes trimmet. Før 138. gennemsyn skrev kortet det gemte emne tilbage i
// feltet midt i en sætning:
//   - "Den " blev til "Den", og det næste ord hang fast: "Denkolde".
//   - Et matrixkort, hvis emne blev slettet for at skrive et nyt, fik
//     "MATRIX" i feltet — og så forsvandt feltet, fordi et matrixkort uden
//     emne ikke har et. Det nye emne kunne ikke skrives, og det gamle var væk.
//
// Pausen er det, der gør testen skarp: vi venter, til det udskudte gem er
// sket (lageret har ændret sig), før vi taster videre.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Emnekortet for den åbne klasse, som det står i lageret lige nu. */
async function storedTopics(page: Page): Promise<Record<string, string>> {
    return page.evaluate(() => {
        const file = (window as any).appDebug.state.currentClass.filename;
        const raw = localStorage.getItem(`grupdk_topics_${file}`);
        return raw ? JSON.parse(raw) : {};
    });
}

/** Efter en genindlæsning: Grupper-fanen og matrix-runden. */
async function openMatrixAgain(page: Page) {
    await goToGroups(page);
    const inMatrix = await page.evaluate(() => (window as any).appDebug.state.activeView === 'matrix');
    if (!inMatrix) await goToMatrix(page);
    await expect(page.locator('.group-card .group-topic-input[placeholder="MATRIX"]')).toHaveCount(1);
}

test('mellemrummet i slutningen bliver stående, mens læreren skriver', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Emnefelt mellemrum');
    await generateGroups(page);

    const card = page.locator('.group-card').first();
    const field = card.locator('.group-topic-input');
    const name = await page.evaluate(() => (window as any).appDebug.state.storedStandardGroups[0].name);

    await field.click();
    await field.pressSequentially('Den k');
    await expect.poll(async () => (await storedTopics(page))[`S_${name}`]).toBe('Den k');

    // Slet "k" — feltet står med "Den ", og gemmet gemmer "Den".
    await field.press('Backspace');
    await expect.poll(async () => (await storedTopics(page))[`S_${name}`]).toBe('Den');
    await expect(field).toHaveValue('Den ');

    await field.pressSequentially('kolde');
    await field.blur();

    await expect(field).toHaveValue('Den kolde');
    expect((await storedTopics(page))[`S_${name}`]).toBe('Den kolde');
});

test('et matrixkorts emne kan slettes og skrives forfra', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Emnefelt matrix');
    await generateGroups(page);
    await goToMatrix(page);
    await generateGroups(page);

    // Et matrixkort får kun et emnefelt, når det HAR et emne (fx fra en hentet
    // session). Læg et emne på den første matrixgruppe i lageret, og indlæs.
    const name = await page.evaluate(() => (window as any).appDebug.state.storedMatrixGroups[0].name);
    await page.evaluate((n) => {
        const file = (window as any).appDebug.state.currentClass.filename;
        const key = `grupdk_topics_${file}`;
        const map = JSON.parse(localStorage.getItem(key) || '{}');
        map[`M_${n}`] = 'Klima';
        localStorage.setItem(key, JSON.stringify(map));
    }, name);
    await page.reload();
    await page.waitForFunction(() => (window as any).appDebug?.pyBridge?.isReady === true);
    await openMatrixAgain(page);

    const card = page.locator('.group-card').first();
    const field = card.locator('.group-topic-input');
    await expect(field).toHaveValue('Klima');

    // Slet emnet med Backspace, og vent, til sletningen er gemt.
    // focus(), ikke click(): i Firefox og WebKit åbner et klik emneforslagene
    // (datalist), og så går End og Backspace til listen i stedet for feltet.
    await field.focus();
    await field.press('End');
    for (let i = 0; i < 'Klima'.length; i++) await field.press('Backspace');
    await expect(field).toHaveValue('');
    await expect.poll(async () => (await storedTopics(page))[`M_${name}`]).toBeUndefined();

    // Feltet står der stadig — tomt, ikke med "MATRIX" i — og har fokus.
    await expect(field).toBeVisible();
    await expect(field).toHaveValue('');
    await expect(field).toBeFocused();

    await field.pressSequentially('Energi');
    await field.blur();

    await expect(field).toHaveValue('Energi');
    expect((await storedTopics(page))[`M_${name}`]).toBe('Energi');
});

test('et tømt matrixkort mister sit felt, når læreren går videre', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Emnefelt matrix tom');
    await generateGroups(page);
    await goToMatrix(page);
    await generateGroups(page);

    const name = await page.evaluate(() => (window as any).appDebug.state.storedMatrixGroups[0].name);
    await page.evaluate((n) => {
        const file = (window as any).appDebug.state.currentClass.filename;
        const key = `grupdk_topics_${file}`;
        const map = JSON.parse(localStorage.getItem(key) || '{}');
        map[`M_${n}`] = 'Klima';
        localStorage.setItem(key, JSON.stringify(map));
    }, name);
    await page.reload();
    await page.waitForFunction(() => (window as any).appDebug?.pyBridge?.isReady === true);
    await openMatrixAgain(page);

    const card = page.locator('.group-card').first();
    const field = card.locator('.group-topic-input');
    await expect(field).toHaveValue('Klima');

    // Et matrixkort uden emne har bevidst intet felt (skabelonen i GroupCard.vue).
    await field.click();
    await field.press('ControlOrMeta+a');
    await field.press('Backspace');
    // Gå videre (fokus væk fra feltet, uanset om feltet stadig er der).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(card.locator('.group-topic-input')).toHaveCount(0);
    expect((await storedTopics(page))[`M_${name}`]).toBeUndefined();
});
