import { test, expect } from '@playwright/test';
import { createClassAndGoToGroups, generateGroups } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Et træk skal SLUTTE — også når det ikke lander på et gruppekort.
//
// Trækket sætter tre ting: `isDragging` (papirkurven lyser rødt og stiplet),
// klassen `is-global-dragging` på <body> og den trukne elev i
// `draggingMemberId`. Rækkens `@dragend` stod som
// `!isPreview(member) && onDragEnd` — et udtryk, som Vue pakker ind som en
// sætning: funktionen blev NÆVNT, aldrig kaldt. Kun slippet på et gruppekort
// ryddede op. Slip på papirkurven, Esc undervejs eller et slip ved siden af,
// og papirkurven stod og lyste resten af timen.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Et afbrudt træk rydder op efter sig', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Traek slut E2E');
    await generateGroups(page);

    const trash = page.locator('.trash-zone-floating');
    await expect(trash).not.toHaveClass(/dragging/);

    // Start og afslut trækket med browserens egne hændelser direkte på rækken.
    // Playwrights musetræk sender ikke `dragend`, når slippet ikke rammer en
    // slip-zone — og det er netop den situation, testen handler om.
    const li = page.locator('.group-card').first().locator('.group-members-list > li').first();
    await li.dispatchEvent('dragstart', { dataTransfer: await page.evaluateHandle(() => new DataTransfer()) });
    await expect(trash).toHaveClass(/dragging/);
    await expect(page.locator('body')).toHaveClass(/is-global-dragging/);

    await li.dispatchEvent('dragend');
    await expect(trash).not.toHaveClass(/dragging/);
    await expect(page.locator('body')).not.toHaveClass(/is-global-dragging/);
});

test('Et slip på papirkurven rydder op efter sig', async ({ page, browserName }) => {
    // UAFKLARET (2/11 2026): i opskriften står papirkurven først fremme, når
    // trækket er i gang. I Playwrights WebKit fjerner et slip på den så ikke
    // eleven (3 af 3 forsøg), mens træk mellem kort virker. Om det er
    // Playwrights træk-emulering eller rigtig Safari, er ikke prøvet — se TODO.md.
    test.fixme(browserName === 'webkit', 'slip på papirkurven, der dukker op under trækket — prøv i rigtig Safari');
    await createClassAndGoToGroups(page, 'Traek papirkurv E2E');
    await generateGroups(page);

    const card = page.locator('.group-card').first();
    const before = await card.locator('.group-members-list > li').count();
    const trash = page.locator('.trash-zone-floating');

    // Papirkurven står kun fremme, mens der trækkes — så trækket startes med
    // musen, og først derefter findes målet. (dragTo venter på et synligt mål.)
    const box = (await card.locator('.group-members-list > li').first().boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2 + 10, { steps: 3 });
    await expect(trash).toBeVisible();
    const t = (await trash.boundingBox())!;
    await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 5 });
    // dragover kommer først ved næste bevægelse — et ekstra lille skridt
    await page.mouse.move(t.x + t.width / 2 + 1, t.y + t.height / 2, { steps: 2 });
    await page.mouse.up();

    // Eleven er ude af gruppen …
    await expect(card.locator('.group-members-list > li')).toHaveCount(before - 1);
    // … og trækket er slut. Rækken, trækket startede fra, forsvinder i selve
    // slippet — så papirkurven kan ikke regne med, at `dragend` når frem.
    await expect(trash).not.toHaveClass(/dragging/);
    await expect(page.locator('body')).not.toHaveClass(/is-global-dragging/);
});

// Kortet, eleven lander i, skal lyse op. Klassen `drag-over` sad kun på
// listen inde i kortet, og reglerne for `.group-card.drag-over` (i
// GroupCard.vue og style.css) ramte derfor aldrig noget: kun pladsholderen
// viste, hvor eleven ville lande.
test('Kortet, eleven trækkes hen over, lyser op — og slukker ved slip', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Traek glod E2E');
    await generateGroups(page);

    const source = page.locator('.group-card').nth(0);
    const target = page.locator('.group-card').nth(1);
    const li = source.locator('.group-members-list > li').first();
    const from = await li.boundingBox();
    const to = await target.locator('.group-members-list').boundingBox();

    await page.mouse.move(from!.x + 10, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(from!.x + 20, from!.y + from!.height / 2 + 4, { steps: 4 });
    await page.mouse.move(to!.x + 20, to!.y + to!.height / 2, { steps: 12 });
    // Et par skridt mere INDE i kortet: Playwright sender `dragenter` på det
    // sidste skridt og først `dragover` ved det næste. En rigtig browser
    // sender `dragover` løbende, også når musen står stille.
    await page.mouse.move(to!.x + 30, to!.y + to!.height / 2 + 4, { steps: 3 });

    await expect(target).toHaveClass(/drag-over/);
    await expect(source).not.toHaveClass(/drag-over/);

    await page.mouse.up();
    await expect(target).not.toHaveClass(/drag-over/);
});

// Værktøjstippet over rækken, man griber i, skal væk, når trækket begynder.
// Under et træk sender browseren ingen musehændelser — heller ikke
// `mouseleave` — så tippet stod før midt på kortet trækket igennem, oven på
// de andre elevers navne.
test('Værktøjstippet forsvinder, når et træk begynder', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Traek tip E2E');
    await generateGroups(page);

    const li = page.locator('.group-card').first().locator('.group-members-list > li').first();
    await li.hover();
    const tip = page.locator('#global-tooltip');
    await expect(tip).toHaveClass(/visible/);

    await li.dispatchEvent('dragstart', { dataTransfer: await page.evaluateHandle(() => new DataTransfer()) });
    await expect(tip).not.toHaveClass(/visible/);
    await li.dispatchEvent('dragend');
});

// … og det skal BLIVE væk, så længe trækket varer. Firefox sender et
// `mouseover` lige efter dragstart, og Safari sender dem undervejs; før
// rettelsen 3/11 viste tooltip.js så tippet igen, og det hang under den
// række, læreren trak i. Hændelserne sendes direkte, for Playwrights
// træk-emulering gør det ikke ens fra gang til gang.
test('Værktøjstippet kommer ikke igen under trækket — kun efter', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Traek tip igen E2E');
    await generateGroups(page);

    const rows = page.locator('.group-card').first().locator('.group-members-list > li');
    const tip = page.locator('#global-tooltip');
    await rows.first().hover();
    await expect(tip).toHaveClass(/visible/);

    await rows.first().dispatchEvent('dragstart', { dataTransfer: await page.evaluateHandle(() => new DataTransfer()) });
    await expect(tip).not.toHaveClass(/visible/);

    // Browserens musehændelser midt i trækket — på rækken selv og naboen.
    for (const row of [rows.first(), rows.nth(1)]) {
        await row.dispatchEvent('mouseover');
        await row.dispatchEvent('mousemove');
    }
    await expect(tip).not.toHaveClass(/visible/);

    // Trækket er slut: tippene virker som før.
    await rows.first().dispatchEvent('dragend');
    await rows.nth(2).hover();
    await expect(tip).toHaveClass(/visible/);

    // Et træk, som siden selv afviser (preventDefault, fx på en låst gruppe),
    // får hverken dragend eller drop — tippene skal virke igen alligevel.
    await page.evaluate(() => {
        document.body.addEventListener('dragstart', (e) => e.preventDefault(), { once: true });
    });
    await rows.nth(2).dispatchEvent('dragstart', { dataTransfer: await page.evaluateHandle(() => new DataTransfer()) });
    await rows.nth(1).hover();
    await expect(tip).toHaveClass(/visible/);
});

// Et AFBRUDT træk (slip ved siden af kortene, eller Esc) skal også give
// tippene tilbage. Trækket begynder over elevens eget kort, og pladsholderen
// tager rækkens plads — så rækken er fjernet fra siden, når trækket slutter,
// og browserens `dragend` når ikke op til document. Før rettelsen 3/11 var
// alle tips væk, til læreren klikkede et sted. Her bruges et rigtigt musetræk,
// for det er netop det, at rækken forsvinder undervejs, der er fejlen.
test('Værktøjstippene virker igen efter et afbrudt træk', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Traek tip afbrudt E2E');
    await generateGroups(page);

    const card = page.locator('.group-card').first();
    const box = (await card.locator('.group-members-list > li').first().boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 30, box.y + box.height / 2 + 5, { steps: 4 });
    // Pladsholderen står i kortet, og rækken er på vej ud (250 ms)
    await expect(card.locator('.placeholder-item')).toHaveCount(1);
    await page.waitForTimeout(400);
    await page.mouse.move(box.x + 32, box.y + box.height / 2 + 8, { steps: 2 });

    // Slip øverst i hjørnet, uden for alle slip-zoner
    await page.mouse.move(5, 5, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('body')).not.toHaveClass(/is-global-dragging/);

    const other = page.locator('.group-card').nth(1).locator('.group-members-list > li').first();
    await other.hover();
    await expect(page.locator('#global-tooltip')).toHaveClass(/visible/);
});
