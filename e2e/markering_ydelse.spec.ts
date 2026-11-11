import { test, expect, Page, Locator } from '@playwright/test';
import { createClass, goToGroups, setGroupSize, generateGroups, closeRecipe } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// En markering og et bytte tegner kun de elevlister om, de har med at gøre.
//
// Før læste hvert kort `pickedMemberId` og `justSwappedIds` direkte for hver
// elev i listen. Så tegnede ALLE kort deres elevliste om, når læreren klikkede
// på en elev, slap hende igen, eller to elever byttede — og hver gentegning
// får Vues TransitionGroup til at lægge en kopi af en elevrække ind og måle
// den. Med 300 elever (75 kort) og 4× neddrosling kostede et klik 190 ms og
// slippet det samme (målt 11/11, 87. gennemsyn). Nu ændrer kun kortet med
// eleven sig. "Flyt hertil" på de andre kort står UDEN for listen.
//
// Testen tæller ændringer i DOM'en (MutationObserver) i hvert korts
// elevliste, så den afhænger ikke af, hvor hurtig maskinen er.
// Samme metode som e2e/afspilning_ydelse.spec.ts.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function csv(n: number) {
    const rows = ['Navn\tKøn\tKarakter'];
    for (let i = 0; i < n; i++) rows.push(`Elev ${i + 1}\t${i % 2 ? 'M' : 'K'}\t${[4, 7, 10, 12][i % 4]}`);
    return rows.join('\n');
}

const CARD = '.group-card:not(.group-list-leave-active)';

async function watchLists(page: Page) {
    await page.evaluate((sel) => {
        const touched = new Set<string>();
        (window as any).__touched = touched;
        (window as any).__observers = [...document.querySelectorAll(sel)].map(card => {
            const name = (card as HTMLElement).dataset.groupId || '';
            const o = new MutationObserver(() => touched.add(name));
            o.observe(card.querySelector('.group-members-list')!,
                { childList: true, attributes: true, subtree: true, characterData: true });
            return o;
        });
    }, CARD);
}

async function touchedLists(page: Page): Promise<string[]> {
    await page.waitForTimeout(500);
    return page.evaluate(() => {
        (window as any).__observers.forEach((o: MutationObserver) => o.disconnect());
        return [...(window as any).__touched].sort();
    });
}

async function setup(page: Page, name: string) {
    await createClass(page, name, csv(48));
    await goToGroups(page);
    await setGroupSize(page, 4);
    await generateGroups(page);
    await closeRecipe(page);
    await expect(page.locator(CARD)).toHaveCount(12);
    await page.waitForTimeout(600);   // kortenes overgang
}

const groupId = (card: Locator) => card.evaluate(el => (el as HTMLElement).dataset.groupId || '');

test('at markere og slippe en elev tegner kun hendes kort om', async ({ page }) => {
    await setup(page, 'Markering ydelse');
    const card = page.locator(CARD).nth(2);
    const id = await groupId(card);

    await watchLists(page);
    await card.locator('.group-members-list > li').first().click();
    await expect(card.locator('li.picked')).toHaveCount(1);
    // Funktionen er uændret: alle de andre kort tilbyder "Flyt hertil".
    await expect(page.locator('.receive-picked-btn')).toHaveCount(11);
    expect(await touchedLists(page), 'lister tegnet om ved markeringen').toEqual([id]);

    await watchLists(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('li.picked')).toHaveCount(0);
    await expect(page.locator('.receive-picked-btn')).toHaveCount(0);
    expect(await touchedLists(page), 'lister tegnet om ved slippet').toEqual([id]);
});

test('"Flyt hertil" tegner kun de to kort om', async ({ page }) => {
    await setup(page, 'Markering flyt ydelse');
    const from = page.locator(CARD).nth(1);
    const to = page.locator(CARD).nth(5);
    const ids = [await groupId(from), await groupId(to)].sort();

    await from.locator('.group-members-list > li').first().click();
    await expect(page.locator('.receive-picked-btn')).toHaveCount(11);
    await page.waitForTimeout(300);

    await watchLists(page);
    await to.locator('.receive-picked-btn').click();
    await expect(page.locator('.receive-picked-btn')).toHaveCount(0);
    expect(await touchedLists(page)).toEqual(ids);
});

test('et bytte tegner kun de to kort om — også når markeringen slukker igen', async ({ page, browserName }) => {
    // Samme grund som i swap.spec.ts: Playwrights WebKit slipper ikke et
    // trin-for-trin-træk.
    test.skip(browserName === 'webkit', 'Playwrights WebKit slipper ikke et trin-for-trin-træk');
    await setup(page, 'Bytte ydelse');
    const source = page.locator(CARD).nth(0);
    const target = page.locator(CARD).nth(1);
    const ids = [await groupId(source), await groupId(target)].sort();

    // Træk den første elev hen over den anden gruppe og hvil på et navn (se swap.spec.ts).
    const from = (await source.locator('.group-members-list > li').first().boundingBox())!;
    const row = (await target.locator('.group-members-list > li').nth(1).boundingBox())!;
    await page.mouse.move(from.x + 10, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y + from.height / 2 + 4, { steps: 4 });
    await page.mouse.move(row.x + 20, row.y + row.height / 2, { steps: 12 });
    // Chromium sender `dragover` først ved næste bevægelse — små ryk på stedet.
    for (let t = 0; t < 180; t += 60) {
        await page.mouse.move(row.x + 20 + (t % 120 ? 1 : 0), row.y + row.height / 2);
        await page.waitForTimeout(60);
    }
    await page.waitForTimeout(400);
    const nameRow = (await target.locator('li.placeholder-item + li').boundingBox())!;
    const y = nameRow.y + nameRow.height / 4;
    for (let t = 0; t < 900; t += 60) {
        await page.mouse.move(nameRow.x + 20 + (t % 120 ? 1 : 0), y);
        await page.waitForTimeout(60);
    }
    await expect(target.locator('li.swap-target')).toHaveCount(1);
    await page.mouse.up();
    await expect(page.locator('li.just-swapped')).toHaveCount(2);
    await page.waitForTimeout(300);

    // Markeringen slukker af sig selv efter 1,5 s.
    await watchLists(page);
    await expect(page.locator('li.just-swapped')).toHaveCount(0, { timeout: 4000 });
    expect(await touchedLists(page)).toEqual(ids);
});
