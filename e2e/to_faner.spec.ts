import { test, expect, Page } from '@playwright/test';
import { createClass, gotoAppReady, goToGroups, generateGroups } from './helpers';

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
