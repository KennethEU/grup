import { test, expect, Page } from '@playwright/test';
import { createClass, gotoAppReady, goToGroups, generateGroups, goToMatrix, goToStandard } from './helpers';

/**
 * To faner: en gammel fane, der kun SER på grupperne, skriver intet.
 *
 * `e2e/to_faner.spec.ts` dækker elevlisten, opskrifterne og indlæsningen.
 * Her står de to veje, 76. gennemsyn (10/11 2026) målte bagefter:
 *
 *  1. Matrix-visningen. autoSave() har sin egen gren for Matrix (den
 *     skriver `matrixSettings`/`matrixRules`), og flushPendingWrites() gemmer
 *     en sidste gang, når fanen lukkes — også mens den står i Matrix.
 *     Visningen gemmes ingen steder (en genindlæsning giver altid
 *     'standard'), så den gamle fane kommer kun i Matrix ved et klik.
 *  2. Grupperne (`grupdk_groups_<fil>`). De skrives under ét og har ingen
 *     _hasOwnChange-prøve som klassen, så et passivt gem dér ville lægge den
 *     gamle fanes fordeling oven på den nye fanes kørsel.
 *
 * Begge var i orden, da de blev målt. Testene skal holde det sådan.
 */

const classContent = (page: Page) => page.evaluate(() =>
    JSON.stringify(JSON.parse(localStorage.getItem('grupdk_classes') || '[]')[0]?.content ?? null));

const standardGroups = (page: Page) => page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('grupdk_groups_'));
    const saved = key ? JSON.parse(localStorage.getItem(key) || 'null') : null;
    return JSON.stringify((saved?.standard || []).map((g: any) => g.members));
});

/** Fane A retter Anna til Annaka i elevlisten. */
async function renameInA(tabA: Page) {
    await tabA.bringToFront();
    await tabA.locator('.nav-tab').filter({ hasText: /Elevliste|Elever/ }).first().click();
    const cell = tabA.locator('#table-container tbody tr').first().locator('td.cell-data').first();
    await cell.click();
    await tabA.keyboard.press('End');
    await tabA.keyboard.type('ka');
    await tabA.keyboard.press('Tab');
    await expect.poll(() => classContent(tabA), { timeout: 10000 }).toContain('Annaka');
}

/** Klassen med grupper i fane A, og en fane B åbnet bagefter på samme klasse. */
async function twoTabs(context) {
    const tabA = await context.newPage();
    await createClass(tabA, '2a To Faner');
    await goToGroups(tabA);
    await generateGroups(tabA);
    return tabA;
}

async function openTabB(context) {
    const tabB = await context.newPage();
    await gotoAppReady(tabB);
    await expect(tabB.locator('.class-trigger')).toContainText('2a To Faner', { timeout: 30000 });
    return tabB;
}

test('lukkes den gamle fane, mens den står i Matrix, skriver den ikke en rettelse væk', async ({ context }) => {
    test.slow();
    const tabA = await twoTabs(context);
    // En klasse fra en ældre udgave uden matrix-felter: indlæsningen og
    // skiftet til Matrix sætter dem begge i hukommelsen.
    await tabA.evaluate(() => {
        const list = JSON.parse(localStorage.getItem('grupdk_classes') || '[]');
        delete list[0].content.matrixSettings;
        delete list[0].content.matrixRules;
        localStorage.setItem('grupdk_classes', JSON.stringify(list));
    });
    const tabB = await openTabB(context);
    await goToGroups(tabB);
    await goToMatrix(tabB);
    await tabB.waitForTimeout(1500);

    await renameInA(tabA);
    await tabB.close({ runBeforeUnload: true });
    await tabA.waitForTimeout(1500);

    expect(await classContent(tabA)).toContain('Annaka');
});

test('et skift fra Matrix til Stamgrupper i den gamle fane skriver ikke en rettelse væk', async ({ context }) => {
    test.slow();
    const tabA = await twoTabs(context);
    const tabB = await openTabB(context);
    await goToGroups(tabB);
    await goToMatrix(tabB);
    await tabB.waitForTimeout(1500);

    await renameInA(tabA);
    await tabB.bringToFront();
    // Uden en matrix åbner opskriftens vindue sig selv og gør siden bagved inert.
    if (await tabB.getByRole('dialog').count()) await tabB.keyboard.press('Escape');
    await goToStandard(tabB);
    // Længere end opskriftens (300 ms) og gemmets (1 sek.) ventetid
    await tabB.waitForTimeout(2500);

    expect(await classContent(tabA)).toContain('Annaka');
});

test('den gamle fane skriver ikke sine grupper over den nye fanes kørsel', async ({ context }) => {
    test.slow();
    const tabA = await twoTabs(context);
    const tabB = await openTabB(context);
    await goToGroups(tabB);
    const old = await standardGroups(tabB);

    // Fane A danner, indtil fordelingen faktisk er en anden — og venter så,
    // til lageret står stille: kørslen kan lande, efter at hjælperen er færdig.
    await tabA.bringToFront();
    let fresh = old;
    for (let i = 0; i < 6 && fresh === old; i++) {
        await generateGroups(tabA);
        fresh = await standardGroups(tabA);
    }
    for (let i = 0; i < 20; i++) {
        await tabA.waitForTimeout(1000);
        const now = await standardGroups(tabA);
        if (now === fresh) break;
        fresh = now;
    }
    expect(fresh).not.toBe(old);

    // Fane B: et klik i et emnefelt og ud igen, og så lukkes den.
    await tabB.bringToFront();
    const topic = tabB.locator('.group-card input, .group-card select').first();
    if (await topic.count()) { await topic.focus(); await topic.blur(); }
    await tabB.waitForTimeout(1500);
    await tabB.close({ runBeforeUnload: true });
    await tabA.waitForTimeout(1000);

    expect(await standardGroups(tabA)).toBe(fresh);
});
