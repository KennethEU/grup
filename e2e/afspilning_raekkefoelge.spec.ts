import { test, expect, Page } from '@playwright/test';
import { createClassAndGoToGroups, generateGroups, addTopics } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// En ny rækkefølge INDE i et kort slår ikke "Se kørslen" fra (136. gennemsyn).
//
// Før 14/11 2026 var afspilningens aftryk medlemslisterne i rækkefølge. Trak
// læreren en elev op i sit eget kort, sagde menuen "Grupperne er ændret,
// siden optagelsen blev lavet", og afspilningen kunne ikke startes — selvom
// ingen elev havde skiftet gruppe. Nu kan den, og dens sidste billede står i
// kortenes rækkefølge, så intet springer, når den stopper.
// En elev, der har skiftet GRUPPE, slår den stadig fra.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Navnene på kortene, som de står på skærmen. */
function shownNames(page: Page) {
    return page.locator('.group-card').evaluateAll(cards => cards.map(c =>
        [...c.querySelectorAll('.group-members-list > li')]
            .map(li => (li as HTMLElement).innerText.split('\n')[0])));
}

test('Se kørslen virker efter en ny rækkefølge i et kort og ender som kortene', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Afspilning raekkefoelge');
    await generateGroups(page);

    // Samme ændring som at trække en elev op eller ned i sit eget kort.
    await page.evaluate(() => {
        (window as any).appDebug.state.storedStandardGroups[0].members.reverse();
    });
    await page.waitForTimeout(300);
    const real = await shownNames(page);

    await page.locator('.replay-anchor .action-pill').click();
    await expect(page.locator('.replay-menu')).not.toContainText('Grupperne er ændret');
    await page.locator('.replay-menu .start').click();
    await expect(page.locator('.replay-menu .play-toggle')).toBeVisible();

    // Spol til enden: det sidste billede er kortenes rækkefølge.
    const total = await page.evaluate(() => (window as any).appDebug.state.replay.total);
    await page.locator('.replay-menu input[type="range"]').evaluate((el: HTMLInputElement, v) => {
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }, total);
    await expect.poll(() => page.evaluate(() =>
        (window as any).appDebug.state.replay?.frameIndex)).toBe(total);
    await expect.poll(() => shownNames(page)).toEqual(real);
});

test('En elev flyttet til en anden gruppe slår stadig Se kørslen fra', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Afspilning flyttet');
    await generateGroups(page);
    await page.evaluate(() => {
        const g = (window as any).appDebug.state.storedStandardGroups;
        g[1].members.push(g[0].members.shift());
    });
    await page.locator('.replay-anchor .action-pill').click();
    await expect(page.locator('.replay-menu')).toContainText('Grupperne er ændret');
});

// 137. gennemsyn: et nyt emne på et kort er heller ikke en flytning. Aftrykket
// talte emnet med, så "Se kørslen" blev slået fra med "Grupperne er ændret",
// når læreren valgte et andet emne i kortets emnevælger. Afspilningen tegner
// kortene med det emne, de har nu, så intet passer mindre.
test('Se kørslen virker efter et nyt emne på et kort', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Afspilning emne');
    await addTopics(page, ['Klima', 'EU', 'Velfærd']);
    await generateGroups(page);

    const select = page.locator('.group-card select.topic-select').first();
    const before = await select.inputValue();
    const other = ['Klima', 'EU', 'Velfærd'].find(t => t !== before)!;
    await select.selectOption(other);
    await expect.poll(() => page.evaluate(() =>
        (window as any).appDebug.state.storedStandardGroups[0].topic)).toBe(other);

    await page.locator('.replay-anchor .action-pill').click();
    await expect(page.locator('.replay-menu')).toBeVisible();
    await expect(page.locator('.replay-menu')).not.toContainText('Grupperne er ændret');
    await page.locator('.replay-menu .start').click();
    await expect(page.locator('.replay-menu .play-toggle')).toBeVisible();
    // Kortet viser det nye emne under afspilningen.
    await expect(select).toHaveValue(other);
});
