import { test, expect, Page } from '@playwright/test';
import { createClass } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SIDEN BAG ET VINDUE ER INERT — og bliver levende igen.
//
// Fokusfælden i useModalFocus holder kun Tab inde. En skærmlæsers
// læsemarkør (VoiceOver VO+pil, et swipe på en iPad) går uden om Tab og kunne
// vandre ned i knapperne bag vinduet; aria-modal følges ikke ens af
// browserne. Nu gør useModalFocus alt uden for det øverste vindue `inert`.
//
// ariaSnapshot beviser intet her (Playwright regner rollerne ud selv), så vi
// tjekker attributten direkte: knappen bagved ligger i noget inert, vinduet
// gør ikke, og når vinduet lukker, er der INGEN inert tilbage, og fokus er
// på knappen igen. En side, der bliver hængende inert, kan ikke bruges.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const inInert = (page: Page, selector: string) =>
    page.locator(selector).first().evaluate(el => !!el.closest('[inert]'));
const inertCount = (page: Page) => page.evaluate(() => document.querySelectorAll('[inert]').length);

test('Vinduerne i elevlisten gør siden bagved inert — og levende igen ved luk', async ({ page }) => {
    await createClass(page, 'Inert Elevliste');

    const windows = [
        // I ModalsRoot (inde i #app)
        { opener: '#cat-btn', heading: 'Kategorisér Data' },
        { opener: '#rank-btn', heading: 'Ranger værdier' },
        { opener: '#col-layout-btn', heading: 'Flyt kolonner' },
        // Teleporteret til <body> (PromptModal)
        { opener: '#add-col-btn', heading: 'Ny kolonne' },
    ];

    for (const w of windows) {
        expect(await inertCount(page)).toBe(0);
        const openButton = page.locator(w.opener);
        await openButton.focus();
        await page.keyboard.press('Enter');
        const heading = page.getByRole('heading', { name: w.heading });
        await expect(heading).toBeVisible();

        await expect.poll(() => inInert(page, w.opener)).toBe(true);
        expect(await heading.evaluate(el => !!el.closest('[inert]'))).toBe(false);
        // Beskederne øverst og værktøjstippet bliver levende
        expect(await inInert(page, '.notification-container')).toBe(false);
        expect(await inInert(page, '#global-tooltip')).toBe(false);

        await page.keyboard.press('Escape');
        await expect(heading).toBeHidden();
        expect(await inertCount(page)).toBe(0);
        await expect(openButton).toBeFocused();
    }
});

test('Lukket med musen på overlayet: siden er levende igen og kan klikkes', async ({ page }) => {
    await createClass(page, 'Inert Klik');
    await page.locator('#cat-btn').click();
    const heading = page.getByRole('heading', { name: 'Kategorisér Data' });
    await expect(heading).toBeVisible();
    await expect.poll(() => inInert(page, '#add-col-btn')).toBe(true);

    // Klik i hjørnet af det slørede overlay (uden for kortet)
    await page.mouse.click(5, 300);
    await expect(heading).toBeHidden();
    expect(await inertCount(page)).toBe(0);

    // Siden virker: en anden knap åbner sit vindue
    await page.locator('#add-col-btn').click();
    await expect(page.getByRole('heading', { name: 'Ny kolonne' })).toBeVisible();
});
