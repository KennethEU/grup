import { test, expect, Page } from '@playwright/test';
import { createClassAndGoToGroups, generateGroups } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Browserens Tilbage midt i en afspilning må ikke efterlade et billede.
//
// Tilbage-knappen, et swipe på pegefeltet og Alt+← / ⌘[ sender intet tryk og
// intet fokus ind i siden, så afspilleren lukker sig ikke selv. Grupper-fanen
// forsvinder, og med den afspilleren — men afspilningen kørte videre i
// hukommelsen. Målt 3/11: Tilbage og Frem igen, og Grupper viste afspilningens
// billede (ét kort med tre elever), kortene var låst, og der var ingen
// afspiller at stoppe den med. Nu stopper afspilningen, når panelet forsvinder.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const replayState = (page: Page) => page.evaluate(() => !!(window as any).appDebug.state.replay);

test('Tilbage midt i en afspilning stopper den', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Afspilning tilbage');
    await generateGroups(page);
    const cards = await page.locator('.group-card').count();

    // Afspilningen kører (Afspil), så uret bliver ved med at skrive billeder.
    await page.locator('.replay-anchor .action-pill').click();
    await page.locator('.replay-menu .start').click();
    await page.locator('.replay-menu .play-toggle').click();
    await expect.poll(() => page.evaluate(() =>
        (window as any).appDebug.state.replay?.playing)).toBe(true);

    // Tilbage: afspilningen stopper, idet fanen forsvinder — ikke først når
    // man kommer tilbage.
    await page.goBack();
    await expect.poll(() => page.evaluate(() =>
        (window as any).appDebug.state.classViewTab)).toBe('students');
    await expect.poll(() => replayState(page)).toBe(false);

    // Frem igen: de rigtige grupper, og kortene kan rettes i.
    await page.goForward();
    await expect(page.locator('.group-card')).toHaveCount(cards);
    await expect(page.locator('.group-grid[inert]')).toHaveCount(0);
    expect(await replayState(page)).toBe(false);
});

// Skiftet mellem stamgrupper og matrix monterer panelet om (BetaGroupsTab
// skifter opskriften med `<component :is>`). I appen lukker klikket eller
// fokuset på "Matrix-runde" afspilleren først, så her TVINGES skiftet direkte
// i state — testen viser kun, at genmonteringen stopper afspilningen.
test('Skift til matrix (tvunget i state) stopper afspilningen', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Afspilning matrix');
    await generateGroups(page);
    await page.locator('.replay-anchor .action-pill').click();
    await page.locator('.replay-menu .start').click();
    await expect(page.locator('.replay-menu .play-toggle')).toBeVisible();

    await page.evaluate(() => {
        const s = (window as any).appDebug.state;
        s.storedMatrixGroups = s.storedStandardGroups;
        s.activeView = 'matrix';
    });
    await expect.poll(() => replayState(page)).toBe(false);
});

// 4/11: menuens focusin-lytter blev før sat på i en setTimeout(…, 0), og
// browseren kan lade sådan en timer vente, mens tastetryk kommer hurtigt.
// Så nåede Tab ud af menuen at ske, før nogen lyttede, og menuen blev
// stående (set i Del-menuen, som havde samme mønster). Timerne holdes her
// kunstigt tilbage, så det sker hver gang.
test('Afspilningsmenuen lukker, når fokus tabber ud, selvom timerne venter', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Tab fokuserer ikke knapper i Safari');

    await createClassAndGoToGroups(page, 'Afspilning ventende timere');
    await generateGroups(page);

    await page.evaluate(() => {
        const original = window.setTimeout;
        (window as any).setTimeout = (fn: TimerHandler, ms?: number, ...args: unknown[]) =>
            original(fn, ms ? ms : 1000, ...args);
    });

    const button = page.locator('.replay-anchor .action-pill');
    await button.focus();
    await page.keyboard.press('Enter');
    const menu = page.locator('.replay-menu');
    await expect(menu).toBeVisible();
    await expect.poll(async () => await page.evaluate(() =>
        document.querySelector('.replay-menu')?.contains(document.activeElement) ?? false)).toBe(true);
    for (let i = 0; i < 12; i++) {
        await page.keyboard.press('Tab');
        const inside = await page.evaluate(() =>
            document.querySelector('.replay-menu')?.contains(document.activeElement) ?? false);
        if (!inside) break;
    }
    await expect(menu).toHaveCount(0, { timeout: 500 });
});
