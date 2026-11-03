import { test, expect, Page, Locator } from '@playwright/test';
import { createClassAndGoToGroups, generateGroups } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Byt to elever ved at trække.
//
// Et træk FLYTTER som udgangspunkt (pladsholderen). Hviler den trukne elev
// over en elev i en anden gruppe et øjeblik, bliver det et BYT: eleven får
// to pile, og hendes navn står stiplet på den trukne elevs plads. Trækker
// man væk fra navnet igen, er det en flytning igen.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Rækker, der er ved at glide ud (Vue's leave-overgang), tæller ikke med.
// WebKit springes over: Playwrights WebKit sender kun `dragstart` og et
// enkelt `dragover`, når musen trækkes trin for trin — aldrig `drop`. Målt
// 24/9 mod koden FØR byttet fandtes: en helt almindelig flytning fejlede på
// samme måde. `locator.dragTo()` virker dér, men kan ikke hvile musen.
test.beforeEach(({ browserName }) => {
    test.skip(browserName === 'webkit', 'Playwrights WebKit slipper ikke et trin-for-trin-træk');
});

const names = (card: Locator) =>
    card.locator('.group-members-list > li:not(.list-leave-active) .member-name-text').allInnerTexts();

/** Grib den første elev i `source` og træk hende hen til midten af `row`. */
async function dragOnto(page: Page, source: Locator, row: Locator) {
    const from = (await source.locator('.group-members-list > li').first().boundingBox())!;
    const to = (await row.boundingBox())!;
    await page.mouse.move(from.x + 10, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y + from.height / 2 + 4, { steps: 4 });
    await page.mouse.move(to.x + 20, to.y + to.height / 2, { steps: 12 });
    // Chromium sender `dragover` først ved næste bevægelse (se rest()).
    await rest(page, to.x + 20, to.y + to.height / 2, 180);
    return to;
}

/**
 * Hvil musen. En rigtig browser sender `dragover` løbende, også når musen står
 * stille; Playwright sender den kun ved en bevægelse. Derfor små ryk på stedet.
 */
async function rest(page: Page, x: number, y: number, ms: number) {
    for (let t = 0; t < ms; t += 60) {
        await page.mouse.move(x + (t % 120 ? 1 : 0), y);
        await page.waitForTimeout(60);
    }
}

/**
 * Hvil musen på `row`, en fjerdedel nede. Først ventes der på, at rækkerne
 * har glidet på plads efter pladsholderen.
 *
 * Pladsholderen følger musen: rammer musen den halvdel af et navn, der vender
 * VÆK fra pladsholderen, springer pladsholderen over på den anden side, og
 * musen står i mellemrummet. Derfor sigtes der på rækken lige UNDER
 * pladsholderen, i dens øverste halvdel — dér bliver navnet under musen.
 */
async function restOn(page: Page, row: Locator, ms: number) {
    await page.waitForTimeout(400);
    const box = (await row.boundingBox())!;
    const y = box.y + box.height / 4;
    await page.mouse.move(box.x + 20, y, { steps: 3 });
    await rest(page, box.x + 20, y, ms);
    return { x: box.x + 20, y };
}

/** Navnet lige under pladsholderen. */
const rowAfterPlaceholder = (card: Locator) =>
    card.locator('li.placeholder-item + li');

test('En elev, der hviler over en elev i en anden gruppe, bytter med hende', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Byt E2E');
    await generateGroups(page);

    const source = page.locator('.group-card').nth(0);
    const target = page.locator('.group-card').nth(1);
    const before0 = await names(source);
    const before1 = await names(target);
    const dragged = before0[0];

    const row = target.locator('.group-members-list > li').nth(1);
    await dragOnto(page, source, row);
    // Hvil musen på et RIGTIGT navn — ikke på pladsholderen.
    const nameRow = rowAfterPlaceholder(target);
    const other = (await nameRow.locator('.member-name-text').innerText()).trim();
    const at = await restOn(page, nameRow, 900);

    const swapRow = target.locator('li.swap-target');
    await expect(swapRow).toHaveCount(1);
    await expect(swapRow).toContainText(other);
    // Ingen pladsholder, mens byttet vises.
    await expect(target.locator('li.placeholder-item')).toHaveCount(0);
    // Hendes navn står stiplet på den trukne elevs plads.
    await expect(source.locator('li.swap-incoming')).toHaveText(new RegExp(other));

    // Byttet bliver stående, mens musen hviler videre på samme sted.
    // Pladsholderen forsvandt med byttet, så rækkerne rykkede op under
    // musen; uden "båndet" i updateSwap() slukkede byttet, pladsholderen kom
    // igen, og efter et øjeblik tændte byttet på ny — det blinkede.
    for (let t = 0; t < 1200; t += 200) {
        await rest(page, at.x, at.y, 200);
        // Øjeblikkelige tal, ikke toHaveCount: den venter og prøver igen og
        // ville derfor ikke se et blink.
        expect(await swapRow.count()).toBe(1);
        expect(await target.locator('li.placeholder-item').count()).toBe(0);
    }

    await page.mouse.up();

    // Byttet: hver tager den andens plads, resten står som før.
    await expect.poll(() => names(source)).toEqual(before0.map(n => (n === dragged ? other : n)));
    await expect.poll(() => names(target)).toEqual(before1.map(n => (n === other ? dragged : n)));
    // Begge ender af byttet markeres et øjeblik.
    await expect(page.locator('li.just-swapped')).toHaveCount(2);
    await expect(page.locator('li.just-swapped')).toHaveCount(0, { timeout: 4000 });
});

test('Trækker man væk fra navnet, er det en flytning igen', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Byt fortryd E2E');
    await generateGroups(page);

    const source = page.locator('.group-card').nth(0);
    const target = page.locator('.group-card').nth(1);
    const before0 = await names(source);
    const before1 = await names(target);

    const row = target.locator('.group-members-list > li').nth(1);
    await dragOnto(page, source, row);
    await restOn(page, rowAfterPlaceholder(target), 900);
    await expect(target.locator('li.swap-target')).toHaveCount(1);

    // Væk fra navnet: ned til den tomme plads i bunden af kortet.
    const list = (await target.locator('.group-members-list').boundingBox())!;
    await page.mouse.move(list.x + 20, list.y + list.height - 3, { steps: 6 });
    await rest(page, list.x + 24, list.y + list.height - 2, 200);
    await expect(target.locator('li.swap-target')).toHaveCount(0);
    await expect(source.locator('li.swap-incoming')).toHaveCount(0);
    await expect(target.locator('li.placeholder-item')).toHaveCount(1);

    await page.mouse.up();

    // En almindelig flytning: eleven er i målgruppen, ingen kom den anden vej.
    await expect.poll(() => names(source)).toEqual(before0.slice(1));
    await expect.poll(async () => (await names(target)).length).toBe(before1.length + 1);
    expect(await names(target)).toContain(before0[0]);
});

test('Et hurtigt slip på et navn flytter — det bytter ikke', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Byt hurtig E2E');
    await generateGroups(page);

    const source = page.locator('.group-card').nth(0);
    const target = page.locator('.group-card').nth(1);
    const before0 = await names(source);
    const before1 = await names(target);

    const row = target.locator('.group-members-list > li').nth(1);
    const to = await dragOnto(page, source, row);
    await page.mouse.move(to.x + 24, to.y + to.height / 2 + 2, { steps: 2 });
    await page.mouse.up();

    await expect.poll(() => names(source)).toEqual(before0.slice(1));
    await expect.poll(async () => (await names(target)).length).toBe(before1.length + 1);
});

test('Musen, der hviler i det grå mellemrum, flytter — den bytter ikke', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Byt mellemrum E2E');
    await generateGroups(page);

    const source = page.locator('.group-card').nth(0);
    const target = page.locator('.group-card').nth(1);
    const before0 = await names(source);
    const before1 = await names(target);

    await dragOnto(page, source, target.locator('.group-members-list > li').nth(1));
    // Midt i pladsholderen, og længe — langt over ventetiden for et byt.
    // Den første udgave regnede eleven lige under mellemrummet med, og så
    // blev en pause dér til et byt.
    await restOn(page, target.locator('li.placeholder-item'), 1500);
    await expect(target.locator('li.swap-target')).toHaveCount(0);
    await expect(target.locator('li.placeholder-item')).toHaveCount(1);

    await page.mouse.up();
    await expect.poll(() => names(source)).toEqual(before0.slice(1));
    await expect.poll(async () => (await names(target)).length).toBe(before1.length + 1);
});

test('Rækken, eleven er på vej ind i, viser HENDES fravær — ikke den trukne elevs', async ({ page }) => {
    // Under et byt står den anden elevs navn stiplet på den trukne elevs
    // plads. Første udgave skiftede KUN navnet: ikonerne og tags var stadig
    // den trukne elevs. Trak læreren en fraværende elev, stod der et navn på
    // en elev, der er til stede, med fraværs-ikonet ved siden af.
    await createClassAndGoToGroups(page, 'Byt fravaer E2E');
    await generateGroups(page);

    const source = page.locator('.group-card').nth(0);
    const target = page.locator('.group-card').nth(1);
    const dragged = (await names(source))[0];

    // Meld den første elev fraværende i elevlisten. Hun bliver stående i
    // gruppen (kun papirkurven tager hende ud), med fraværs-ikonet.
    await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();
    const studentRow = page.locator('tbody tr').filter({ hasText: dragged }).first();
    await studentRow.locator('input[type=checkbox]').nth(1).uncheck();
    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();
    await expect(source.locator('.group-members-list > li').first()).toHaveClass(/absent/);

    await dragOnto(page, source, target.locator('.group-members-list > li').nth(1));
    const nameRow = rowAfterPlaceholder(target);
    const other = (await nameRow.locator('.member-name-text').innerText()).trim();
    await restOn(page, nameRow, 900);

    const incoming = source.locator('li.swap-incoming');
    await expect(incoming).toHaveText(new RegExp(other));
    // Den, der kommer hertil, er til stede.
    await expect(incoming).not.toHaveClass(/(^|\s)absent(\s|$)/);
    await expect(incoming.locator('.absent-icon')).toHaveCount(0);

    await page.mouse.up();
});
