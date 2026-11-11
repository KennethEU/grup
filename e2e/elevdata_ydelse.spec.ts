import { test, expect, Page, Locator } from '@playwright/test';
import { createClass, goToGroups, setGroupSize, generateGroups, closeRecipe, goToMatrix } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// En flytning og "Meld fraværende" tegner kun de elevlister om, de rører —
// også når klassen har en undgåelse, og også i Matrix.
//
// To delte opslagskort bygges forfra ved hver ændring af grupperne:
//   - `avoidConflictIds` (hvem sidder sammen med en, de skulle undgå), så
//     snart klassen har én undgåelse
//   - `homeGroupOriginById` (stamgruppen bag hvert matrix-mærke), når en
//     stamgruppe ændrer sig — og "Meld fraværende" i Matrix tager også
//     eleven ud af hendes stamgruppe
// Læste kortene dem direkte for hver elev, tegnede ALLE kort deres elevliste
// om (målt 11/11, 88. gennemsyn: 12 af 12 ved en flytning med en undgåelse,
// 4 af 4 matrixkort ved "Meld fraværende"). Nu læser hvert kort kun sine egne
// elevers svar (`avoidHere` og `originsHere` i GroupCard.vue).
//
// Samme metode som e2e/markering_ydelse.spec.ts: MutationObserver i hvert
// korts elevliste, så testen ikke afhænger af maskinens fart.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

const groupId = (card: Locator) => card.evaluate(el => (el as HTMLElement).dataset.groupId || '');

/** 48 elever i 12 stamgrupper; med `avoid` skal Elev 47 og Elev 48 undgå hinanden. */
async function setup(page: Page, name: string, { avoid = false } = {}) {
    await createClass(page, name, csv(48));
    if (avoid) {
        await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();
        for (const n of ['Elev 47', 'Elev 48']) {
            await page.locator('tr').filter({ has: page.getByText(n, { exact: true }) }).first()
                .locator('.cell-checkbox input').first().check();
        }
        await page.locator('#create-agreement-btn').click();
        await page.locator('.agreement-menu').getByRole('menuitem', { name: /Undgå hinanden/ }).click();
        await page.locator('.avoid-modal-close').click();
    }
    await goToGroups(page);
    await setGroupSize(page, 4);
    await generateGroups(page);
    await closeRecipe(page);
    await expect(page.locator(CARD)).toHaveCount(12);
    await page.waitForTimeout(600);   // kortenes overgang
}

test('med en undgåelse tegner "Flyt hertil" kun de to kort om', async ({ page }) => {
    await setup(page, 'Undgå flyt ydelse', { avoid: true });
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

test('med en undgåelse tegner "Meld fraværende" kun elevens kort om', async ({ page }) => {
    await setup(page, 'Undgå fravær ydelse', { avoid: true });
    const card = page.locator(CARD).nth(2);
    const id = await groupId(card);

    await card.locator('.group-members-list > li').first().click();
    await page.waitForTimeout(300);
    await watchLists(page);
    await card.getByText('Meld fraværende').click();
    await expect(page.locator('li.picked')).toHaveCount(0);
    expect(await touchedLists(page)).toEqual([id]);
});

test('"Meld fraværende" i Matrix tegner kun elevens kort om, og mærkerne står', async ({ page }) => {
    await setup(page, 'Matrix fravær ydelse');
    await goToMatrix(page);
    await generateGroups(page);
    await closeRecipe(page);
    await page.waitForTimeout(800);
    const cards = await page.locator(CARD).count();
    expect(cards).toBeGreaterThan(1);
    const badges = page.locator(`${CARD} .badge-origin`);
    // Hver matrix-elev har sin stamgruppe som mærke.
    await expect(badges).toHaveCount(48);
    const before = await badges.allInnerTexts();

    const card = page.locator(CARD).nth(1);
    const id = await groupId(card);
    const first = card.locator('.group-members-list > li').first();
    const pickedBadge = await first.locator('.badge-origin').innerText();
    await first.click();
    await page.waitForTimeout(300);
    await watchLists(page);
    await card.getByText('Meld fraværende').click();
    await expect(page.locator('li.picked')).toHaveCount(0);
    expect(await touchedLists(page)).toEqual([id]);

    // Eleven er ude af sin stamgruppe og har ikke længere et mærke; alle
    // de andre har præcis det, de havde.
    const expected = [...before];
    expected.splice(expected.indexOf(pickedBadge), 1);
    expect((await badges.allInnerTexts()).sort()).toEqual(expected.sort());
});

test('et byt i Matrix viser den anden elevs stamgruppe-mærke på den trukne elevs plads', async ({ page, browserName }) => {
    // Samme grund som i swap.spec.ts: Playwrights WebKit slipper ikke et
    // trin-for-trin-træk.
    test.skip(browserName === 'webkit', 'Playwrights WebKit slipper ikke et trin-for-trin-træk');
    await setup(page, 'Matrix byt mærke');
    await goToMatrix(page);
    await generateGroups(page);
    await closeRecipe(page);
    await page.waitForTimeout(800);

    const source = page.locator(CARD).nth(0);
    const target = page.locator(CARD).nth(1);
    // Den anden elev i bytte er rækken lige under pladsholderen — se nedenfor.
    // Hendes mærke slås op, når hun er fundet.

    // Træk den første elev hen over den anden gruppe og hvil på et navn
    // (samme bevægelser som i markering_ydelse.spec.ts).
    const from = (await source.locator('.group-members-list > li').first().boundingBox())!;
    const row = (await target.locator('.group-members-list > li').nth(1).boundingBox())!;
    await page.mouse.move(from.x + 10, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y + from.height / 2 + 4, { steps: 4 });
    await page.mouse.move(row.x + 20, row.y + row.height / 2, { steps: 12 });
    for (let t = 0; t < 180; t += 60) {
        await page.mouse.move(row.x + 20 + (t % 120 ? 1 : 0), row.y + row.height / 2);
        await page.waitForTimeout(60);
    }
    await page.waitForTimeout(400);
    const nameRow = target.locator('li.placeholder-item + li');
    const otherBadge = await nameRow.locator('.badge-origin').innerText();
    const box = (await nameRow.boundingBox())!;
    const y = box.y + box.height / 4;
    for (let t = 0; t < 900; t += 60) {
        await page.mouse.move(box.x + 20 + (t % 120 ? 1 : 0), y);
        await page.waitForTimeout(60);
    }
    await expect(target.locator('li.swap-target')).toHaveCount(1);

    // På den trukne elevs plads står den anden elev — med HENDES mærke.
    const incoming = source.locator('li.swap-incoming');
    await expect(incoming).toHaveCount(1);
    await expect(incoming.locator('.badge-origin')).toHaveText(otherBadge);
    await page.mouse.up();
});
