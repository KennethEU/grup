import { test, expect, Page } from '@playwright/test';
import { createClass, goToGroups, generateGroups, clickGenerate } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MOTORENS TRÅD DØR MIDT I EN KØRSEL (172. gennemsyn, tematik (204)).
//
// Motoren regner i sin egen tråd (engine-worker.js). Dør tråden undervejs
// (fx løber tør for hukommelse), kommer der et error-event og intet svar.
// Så skal alt stå, som det stod: overlayet væk, grupperne urørte, ingen
// ny kørsel i historikken, en rolig fejlbesked — og en Skal sammen-advarsel
// over grupperne med "Dan grupper uden aftalen" står der stadig. Før
// forsvandt den, til læreren trykkede Dan grupper igen.
//
// Tråden "dør" ved, at testen pakker window.Worker ind: når __killNextRun er
// sat, når næste 'run' aldrig frem til tråden; i stedet kommer en fremgang
// og så et error-event, som når en rigtig tråd går ned. Så afhænger testen
// ikke af, hvor hurtigt motoren er.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.setTimeout(120000);

const CSV = 'Navn\tKøn\nAnna\tK\nBob\tM\nClara\tK\nDavid\tM\nEmma\tK\nFrede\tM';

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        const Real = window.Worker;
        (window as any).Worker = class extends Real {
            postMessage(m: any, ...rest: any[]) {
                if (m && m.type === 'run' && (window as any).__killNextRun) {
                    (window as any).__killNextRun = false;
                    (window as any).__killed = ((window as any).__killed || 0) + 1;
                    setTimeout(() => {
                        this.onmessage?.(new MessageEvent('message', { data: { type: 'progress', id: m.id, progress: { attempt: 0, text: 'Første forsøg er i gang' } } }));
                    }, 50);
                    setTimeout(() => {
                        this.onerror?.(new ErrorEvent('error', { message: 'sonde: tråden døde' }));
                    }, 400);
                    return;
                }
                return (super.postMessage as any)(m, ...rest);
            }
        };
    });
});

const toastTexts = (page: Page) => page.locator('.toast').allInnerTexts();
async function clearToasts(page: Page) {
    await page.locator('.toast .toast-close').evaluateAll(els => els.forEach(e => (e as HTMLElement).click()));
}
const groupsNow = (page: Page) => page.evaluate(() => JSON.stringify(((window as any).appDebug.state.storedStandardGroups || []).map((g: any) => g.members)));

test('tråden dør midt i Dan grupper: grupperne, historikken og "Sidste dannelse" står, som de stod', async ({ page }) => {
    await createClass(page, 'Død tråd', CSV);
    await goToGroups(page);
    await generateGroups(page);
    const before = await groupsNow(page);
    const runsBefore = await page.evaluate(() => (window as any).appDebug.state._runHistory.length);
    await clearToasts(page);

    await page.evaluate(() => { (window as any).__killNextRun = true; });
    await clickGenerate(page);
    await expect.poll(() => page.evaluate(() => (window as any).__killed || 0)).toBe(1);
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.isGenerating), { timeout: 30000 }).toBe(false);
    await expect(page.locator('.processing-overlay')).toHaveCount(0);
    expect(await groupsNow(page)).toBe(before);
    expect(await page.evaluate(() => (window as any).appDebug.state._runHistory.length)).toBe(runsBefore);
    await expect.poll(() => toastTexts(page)).toContainEqual(expect.stringMatching(/Grupperne kunne ikke dannes: Den stødte på en fejl\. Dine nuværende grupper er urørte/));

    // Næste tryk virker (en ny tråd startes; den døde lukkes).
    await clearToasts(page);
    await clickGenerate(page);
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.nextStats?.status), { timeout: 60000 }).toBe('ok');
    expect(await page.evaluate(() => (window as any).appDebug.state._runHistory.length)).toBe(runsBefore + 1);
});

test('tråden dør under "Dan grupper uden aftalen": advarslen og knappen står der stadig bagefter', async ({ page }) => {
    await createClass(page, 'Død tråd aftale', CSV);
    await page.evaluate(() => {
        const cls = (window as any).appDebug.state.currentClass;
        const idOf = (n: string) => cls.data.find((s: any) => s.Navn === n)._rowId;
        cls.togetherGroups = [{ ids: [idOf('Anna'), idOf('Bob')], timestamp: 1 }];
        cls.data.forEach((s: any) => { s.Køn = ['Anna', 'Bob'].includes(s.Navn) ? 'Formand' : 'Menig'; });
        cls.rules = [{ type: 'separate', column: 'Køn', value: 'Formand' }];
    });
    await goToGroups(page);
    await clearToasts(page);
    await clickGenerate(page);
    const recipeOpen = page.locator('dialog.recipe-dialog[open]');
    if (await recipeOpen.count()) await page.keyboard.press('Escape');
    await expect(recipeOpen).toHaveCount(0);
    const stopHint = page.locator('.gh-hint:not(dialog.recipe-dialog .gh-hint)')
        .filter({ hasText: 'skal være sammen, men Adskil på' });
    await expect(stopHint).toHaveCount(1);
    await clearToasts(page);

    await page.evaluate(() => { (window as any).__killNextRun = true; });
    await stopHint.getByRole('button', { name: 'Dan grupper uden aftalen' }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => (window as any).__killed || 0)).toBe(1);
    await expect.poll(() => page.evaluate(() => (window as any).appDebug.state.isGenerating), { timeout: 30000 }).toBe(false);
    await expect.poll(() => toastTexts(page)).toContainEqual(expect.stringMatching(/Grupperne kunne ikke dannes/));
    await expect(page.locator('.group-card')).toHaveCount(0);
    // Advarslen er tilbage med sin knap — før: væk til næste Dan grupper.
    await expect(stopHint).toHaveCount(1);
    await expect(stopHint.getByRole('button', { name: 'Dan grupper uden aftalen' })).toBeEnabled();
    // Fokus står ikke på <body> (tastaturet kan fortsætte fra advarslen).
    const where = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return 'BODY';
        return el.closest('.gh-hint') ? 'advarsel' : 'andet:' + el.className + '|' + (el.textContent || '').trim().slice(0, 40);
    });
    console.log('fokus efter den døde tråd:', where);

    // Knappen virker igen: nu lander grupperne uden aftalen.
    await stopHint.getByRole('button', { name: 'Dan grupper uden aftalen' }).click();
    await expect(page.locator('.group-card')).not.toHaveCount(0, { timeout: 60000 });
    await expect(stopHint).toHaveCount(0);
});
