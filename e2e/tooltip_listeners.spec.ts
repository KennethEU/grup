import { test, expect } from '@playwright/test';
import { createClassAndGoToGroups, generateGroups } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Værktøjstippets muselyttere (tooltip.js). Hvert tip sætter to lyttere på
// elementet under musen: én der følger musen, og én der rydder op, når musen
// går. Blev tippet skjult på anden vis — knappen dækket af kørsels-vinduet,
// eller elementet tegnet om — blev oprydnings-lytteren siddende, og næste
// mouseover lagde et nyt par oveni. Målt 24/9: Generér trykket 200 gange med
// musen i ro gav ca. 400 ekstra lyttere på knappen, og hver holdt det gamle
// kørsels-vindue fast i hukommelsen.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Knappen med tippet her er "Matrix-runde" i opskriftens bjælke: "Dan grupper"
// har ingen title (teksten siger det hele), og kørsels-vinduet dækker hele
// siden, så det skjuler tippet på samme måde. Kørslen startes med genvejen.
const matrixButton = (page) => page.locator('.recipe-bar .recipe__soft').filter({ hasText: 'Matrix-runde' });

test('Dan grupper med musen i ro hober ikke tip-lyttere op', async ({ page, browserName }) => {
    // Lytterne tælles med Chromes egen DevTools-protokol.
    test.skip(browserName !== 'chromium', 'CDP findes kun i Chromium');
    await createClassAndGoToGroups(page);
    await generateGroups(page);

    const button = matrixButton(page);
    await button.hover();
    for (let i = 0; i < 6; i++) {
        // Mærk den nuværende optagelse: en ny kørsel lægger en ny, så et
        // umærket objekt bagefter beviser, at genvejen faktisk dannede grupper
        // (ellers ville lyttertallet være lavt af den gale grund).
        await page.evaluate(() => { (window as any).appDebug.state.lastRecording.standard.__seen = true; });
        await page.keyboard.press('ControlOrMeta+Enter');
        await expect.poll(() => page.evaluate(() =>
            !(window as any).appDebug.state.isGenerating
            && !(window as any).appDebug.state.lastRecording?.standard?.__seen), { timeout: 30000 }).toBe(true);
        await page.waitForTimeout(100);
    }

    const cdp = await page.context().newCDPSession(page);
    const { result } = await cdp.send('Runtime.evaluate', {
        expression: '[...document.querySelectorAll(".recipe-bar .recipe__soft")].find(b => b.textContent.includes("Matrix-runde"))',
    });
    const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId! });
    const mouseListeners = listeners.filter(l => l.type === 'mouseleave' || l.type === 'mousemove');
    // Højst ét par: det tip, der måske står fremme lige nu.
    expect(mouseListeners.length).toBeLessThanOrEqual(2);
});

test('musen på en anden knap overtager ikke et tastatur-tip', async ({ page }) => {
    await createClassAndGoToGroups(page);
    await generateGroups(page);

    // Musen hviler på Matrix-runde, så dens tip står fremme.
    const hovered = matrixButton(page);
    await hovered.hover();
    const tip = page.locator('#global-tooltip');
    await expect(tip).toHaveClass(/visible/);
    const hoveredTip = await hovered.getAttribute('data-tooltip');

    // Tastaturet flytter fokus hen til et ANDET element med et tip.
    let focusedTip: string | null = null;
    for (let i = 0; i < 40 && !focusedTip; i++) {
        await page.keyboard.press('Tab');
        focusedTip = await page.evaluate(() => {
            const el = document.activeElement as HTMLElement | null;
            if (!el || el.textContent?.includes('Matrix-runde')) return null;
            return el.getAttribute('data-tooltip') || el.getAttribute('title');
        });
    }
    expect(focusedTip).toBeTruthy();
    await expect(tip).toHaveText(focusedTip!);

    // En lille musebevægelse INDEN FOR knappen må ikke skrive dens tekst
    // ind i tippet, der hører til det fokuserede element.
    const box = (await hovered.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2 + 1);
    await page.mouse.move(box.x + box.width / 2 + 5, box.y + box.height / 2 + 2);
    await expect(tip).toHaveText(focusedTip!);
    expect(focusedTip).not.toBe(hoveredTip);
});
