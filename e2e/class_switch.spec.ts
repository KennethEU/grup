import { test, expect, Page } from '@playwright/test';
import { createClassAndGoToGroups, generateGroups, goToGroups } from './helpers';

/**
 * Værn om det, et klasseskift skal rydde.
 *
 * `classMemory.test.js` værner om selve oprydningen. DENNE fil værner om
 * ledningen: at `selectClass()` faktisk kalder den, hele vejen gennem den
 * rigtige app med motoren, en rigtig kørsel og den rigtige klassemenu.
 *
 * Fejler den, er noget fra den forrige klasse igen med over — og det værste
 * af det (`matrixGroupsStale`) danner den nye klasses matrix om uden at
 * spørge.
 */

/** Vent til en kørsel er skrevet ind i tilstanden.
 *
 * `generateGroups()` venter på et gruppekort, men i en klasse der ALLEREDE har
 * grupper fra en tidligere kørsel, står kortene der i forvejen — så ventetiden
 * er forbi, før den nye kørsel er landet. `matrixGroupsStale` sættes til sidst
 * i genereringen og er derfor det ærlige "nu er den færdig".
 */
async function waitForRun(page: Page) {
    await expect.poll(() => state(page, 'matrixGroupsStale'),
        { timeout: 90000 }).toBe(true);
}

/** Læs et felt ud af app-tilstanden — samme vej som helpers bruger. */
function state(page: Page, path: string) {
    return page.evaluate(
        (p) => p.split('.').reduce((o: any, k: string) => (o == null ? o : o[k]),
            (window as any).appDebug.state),
        path,
    );
}

/** Opret endnu en klasse fra klassemenuen i topbaren. */
async function createSecondClass(page: Page, name: string) {
    await page.locator('.class-trigger').click();
    await page.locator('.glass-dropdown .add-btn').click();
    const input = page.locator('.modal-overlay input[type="text"]').first();
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill(name);
    await page.getByRole('button', { name: /^Opret$/ }).click();
    await expect(page.locator('.class-trigger')).toContainText(name, { timeout: 30000 });
}

/** Vælg en klasse ved navn i klassemenuen — den vej læreren bruger. */
async function switchToClass(page: Page, name: string) {
    await page.locator('.class-trigger').click();
    await page.locator('.class-list .class-item button.name')
        .filter({ hasText: name }).first().click();
    await expect(page.locator('.class-trigger')).toContainText(name, { timeout: 30000 });
}

test('klasseskift rydder stale-flag, optagelse og visning', async ({ page }) => {
    await createClassAndGoToGroups(page, '2a Skift');
    await generateGroups(page);

    // Efter en stam-generering: matrixen er forældet, og kørslen er optaget.
    // Det er DE to ting, der ikke måtte følge med over.
    await waitForRun(page);
    expect(await state(page, 'lastRecording.standard')).not.toBeNull();

    await createSecondClass(page, '3b Skift');

    expect(await state(page, 'matrixGroupsStale')).toBe(false);
    expect(await state(page, 'lastRecording.standard')).toBeNull();
    expect(await state(page, 'lastRecordingFingerprint.standard')).toBeNull();
    expect(await state(page, 'activeView')).toBe('standard');
    expect(await state(page, 'replay')).toBeNull();
});

test('skift tilbage og frem gennem klassemenuen rydder også', async ({ page }) => {
    await createClassAndGoToGroups(page, '2a Menu');
    await generateGroups(page);
    await createSecondClass(page, '3b Menu');

    // Tilbage til 2.a og en frisk kørsel — nu er tilstanden "beskidt" igen,
    // og skiftet sker ad lærerens egen vej gennem menuen.
    await switchToClass(page, '2a Menu');
    await goToGroups(page);
    await generateGroups(page);
    await waitForRun(page);

    await switchToClass(page, '3b Menu');
    expect(await state(page, 'matrixGroupsStale')).toBe(false);
    expect(await state(page, 'lastRecording.standard')).toBeNull();
});
