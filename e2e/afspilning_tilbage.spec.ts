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
