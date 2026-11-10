import { test, expect } from '@playwright/test';
import { createClass, goToGroups, generateGroups, openRecipe, closeRecipe, openSaveSession, openSaveColumn } from './helpers';

// Toasts ligger i højre side — præcis hvor topbarens ikoner sidder — og en
// fejlbesked bliver stående til den klikkes væk. Lå den oven på baren, var
// Nyheder, guide, GDPR, hjælp og tema-knappen utilgængelige, indtil man fandt
// det lille kryds. Placeringen måles derfor, ikke bare skrives ned.
for (const [viewportLabel, viewportWidth, viewportHeight] of [['desktop', 1280, 720], ['mobil', 375, 812]] as const) {
    test(`Toast lægger sig under topbaren, ikke oven på den — ${viewportLabel}`, async ({ page }) => {
        await page.setViewportSize({ width: viewportWidth, height: viewportHeight });
        await page.goto('/');

        // En lang, blivende besked — den slags der dækkede mest.
        await page.evaluate(() => (window as any).notifyError(
            'Testbesked der er lang nok til at fylde flere linjer, ' +
            'så toasten får sin fulde højde og et reelt overlap ville vise sig.'
        ));

        const toast = page.locator('.toast').first();
        await expect(toast).toBeVisible();

        const t = (await toast.boundingBox())!;
        const bar = (await page.locator('.topbar').boundingBox())!;
        expect(t.y).toBeGreaterThanOrEqual(bar.y + bar.height);

        // Ingen af topbarens knapper må ligge under toasten.
        const topbarButtons = page.locator('.topbar-icon');
        for (let i = 0; i < await topbarButtons.count(); i++) {
            const k = (await topbarButtons.nth(i).boundingBox())!;
            const overlap = k.x < t.x + t.width && k.x + k.width > t.x
                && k.y < t.y + t.height && k.y + k.height > t.y;
            expect(overlap, `topbar-knap ${i} er dækket af toasten`).toBe(false);
        }
    });
}

// I klassevisningen ligger båndet lige under topbaren — Emner, Regler og
// Generér i Grupper-fanen, Elev/Kolonne/Flyt/Slet i elevlisten. Stakken lå
// oven på dem: en besked efter en gruppedannelse dækkede Generér, og læreren
// kunne ikke danne grupper igen, før den var væk (målt 23/9 på 1280×720).
for (const [viewportLabel, viewportWidth, viewportHeight] of [['desktop', 1280, 720], ['mobil', 375, 812]] as const) {
    test(`Toast lægger sig under båndet i begge faner — ${viewportLabel}`, async ({ page }) => {
        await page.setViewportSize({ width: viewportWidth, height: viewportHeight });
        await createClass(page, 'Toast under baandet');

        for (const tab of ['Elevliste', 'Grupper']) {
            await page.locator('.nav-tab').filter({ hasText: tab }).click();
            const band = page.locator(tab === 'Grupper' ? '.groups-header-sticky' : '.students-header-sticky');
            await expect(band).toBeVisible();
            await page.evaluate(() => (window as any).notifyError(
                'Fordel på \'Køn\' kan ikke gå helt op: 14 elever har værdien \'Pige\', og der er kun plads til 12.'));

            await expect(page.locator('.toast').last()).toBeVisible();
            // HELE stakken — også "Klasse oprettet!" og beskeden fra forrige
            // fane — skal ligge under båndet. Den øverste er den, der dækkede.
            const b = (await band.boundingBox())!;
            const tops = await page.locator('.toast').evaluateAll(els =>
                els.map(e => e.getBoundingClientRect().top));
            for (const top of tops) {
                expect(top, `toasten dækker båndet i ${tab}`).toBeGreaterThanOrEqual(b.y + b.height);
            }
        }
    });
}

// "Klasse oprettet!" kommer, MENS appen skifter til klassevisningen — før
// båndet findes. Stakken blev målt i det øjeblik og stod derfor oven på det
// bånd, der dukkede op lige efter: Generér var dækket i 5,6 sekunder (målt
// 23/9 i testen af en klasse på 120 elever).
test('En besked fra FØR båndet fandtes, flytter ned under det', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await createClass(page, 'Toast foer baandet');
    await expect(page.locator('.toast').first()).toBeVisible();
    const band = (await page.locator('.students-header-sticky').boundingBox())!;
    await expect.poll(async () => Math.min(...await page.locator('.toast').evaluateAll(
        els => els.map(e => e.getBoundingClientRect().top))), { timeout: 2000 })
        .toBeGreaterThanOrEqual(band.y + band.height);
});

// Beta-stakken står nederst og vokser opad. Dens loft var en fast
// `100dvh - topbjælken - 96px`, der ikke kendte bjælken over grupperne: fem
// blivende fejlbeskeder nåede op over den og dækkede "Dan grupper igen",
// "Vis for klassen" og "Matrix-runde" (målt 10/11 ved 1280×600, 800×600 og
// 800×480 — samme fejl som 23/9, bare nedefra). Nu er bjælkens bund loftet.
for (const [width, height] of [[1280, 600], [800, 480]] as const) {
    test(`Mange fejlbeskeder når ikke op over bjælken over grupperne — ${width}×${height}`, async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 720 });
        await createClass(page, 'Mange beskeder');
        await goToGroups(page);
        await generateGroups(page);
        await page.setViewportSize({ width, height });
        const text = 'Fordel på Køn kan ikke gå helt op: 14 elever har værdien Pige, og der er kun plads til 12. ';
        // Højst 5 beskeder står ad gangen (MAX_VISIBLE i notificationState.js);
        // de ældste ryger. Vent på den sidste.
        await page.evaluate((t) => {
            for (let i = 0; i < 5; i++) (window as any).notifyError(`${i + 1}. ${t.repeat(3)}`);
        }, text);
        await expect(page.locator('.toast').filter({ hasText: '5. Fordel' })).toBeVisible();

        // Stakken skal rulle (ellers beviser testen intet), og HELE kassen —
        // ikke kun beskederne — skal stå under bjælken: kassen tager selv imod
        // klik, mens den kan rulle (klassen can-scroll i NotificationManager.vue).
        await expect.poll(() => page.evaluate(() => {
            const box = document.querySelector('.notification-container')!;
            const bar = document.querySelector('.groups-header-sticky')!.getBoundingClientRect();
            return {
                scrolls: box.scrollHeight > box.clientHeight,
                belowBar: box.getBoundingClientRect().top >= bar.bottom,
            };
        })).toEqual({ scrolls: true, belowBar: true });

        // Og knappen kan trykkes: det, der står i dens midte, er knappen selv
        const go = page.locator('.recipe-bar .recipe__go');
        const hit = await go.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return !!top && el.contains(top);
        });
        expect(hit).toBe(true);
    });
}

// En åben menu skal ligge OVER beskederne. Stakken står nederst til højre og
// vokser opad — dér, hvor Gem-menuen åbner over bundlinjen, og hvor "Lav
// aftale" falder ned i elevlisten. Med fem blivende fejlbeskeder ramte et
// klik på "Gem i Historik" beskeden i stedet (målt 10/11 ved 1280×720,
// 1280×600 og 800×480; "Undgå hinanden" ved 800×480).
async function centreHitsItself(locator) {
    return locator.evaluateAll((els) => els.map((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!top && el.contains(top);
    }));
}
const fiveErrors = (page) => page.evaluate(() => {
    for (let i = 0; i < 5; i++) (window as any).notifyError(
        `${i + 1}. Fordel på Køn kan ikke gå helt op: 14 elever har værdien Pige, og der er kun plads til 12.`);
});

test('En åben menu ligger over mange fejlbeskeder — Gem og Lav aftale, 800×480', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await createClass(page, 'Menu over beskeder');
    await page.setViewportSize({ width: 800, height: 480 });

    // "Lav aftale" i elevlisten
    await fiveErrors(page);
    await expect(page.locator('.toast').filter({ hasText: '5. Fordel' })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Anna med i aftale', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Bob med i aftale', exact: true }).check();
    await page.locator('#create-agreement-btn').click();
    const agreementItems = page.locator('.agreement-menu [role="menuitem"]');
    await expect(agreementItems).toHaveCount(2);
    expect(await centreHitsItself(agreementItems)).toEqual([true, true]);
    await page.keyboard.press('Escape');
    await expect(page.locator('.agreement-menu')).toHaveCount(0);

    // Gem-menuen over bundlinjen
    await page.setViewportSize({ width: 1280, height: 720 });
    await goToGroups(page);
    await generateGroups(page);
    await page.setViewportSize({ width: 800, height: 480 });
    await fiveErrors(page);
    await expect(page.locator('.toast').filter({ hasText: '5. Fordel' })).toBeVisible();
    await page.locator('.save-anchor .action-pill').click();
    const saveItems = page.locator('.save-menu [role="menuitem"]');
    await expect(saveItems).toHaveCount(2);
    expect(await centreHitsItself(saveItems)).toEqual([true, true]);

    // Menuen lukket: beskederne er øverst igen (deres kryds kan rammes)
    await page.keyboard.press('Escape');
    await expect(page.locator('.save-menu')).toHaveCount(0);
    const firstClose = page.locator('.toast-close').first();
    expect(await centreHitsItself(firstClose)).toEqual([true]);
});

// Opskriftens vindue er et <dialog> i browserens øverste lag, og alt uden for
// det er inert. En besked givet, mens det stod åbent (fx "Browserens
// lagerplads er fuld!" ved gem af en regelændring), lå dæmpet bag vinduets
// baggrund og kunne hverken lukkes eller høres af en skærmlæser (målt 10/11:
// 0 alerts i Chromiums tilgængelighedstræ). Nu flytter stakken ind i vinduet.
test('En besked i opskriftens vindue står over vinduet og kan lukkes — og flytter ud igen', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 480 });
    await createClass(page, 'Besked i vinduet');
    await goToGroups(page);
    await generateGroups(page);
    // En blivende fejl FØR vinduet åbner, og én mens det står åbent
    await page.evaluate(() => (window as any).notifyError('Før vinduet'));
    const dialog = await openRecipe(page);
    await page.evaluate(() => (window as any).notifyError('Browserens lagerplads er fuld!'));
    await expect(dialog.locator('.toast')).toHaveCount(2);

    // poll: beskederne glider ind (0,28 sek.), og imens rammer midten ved siden af
    const closes = page.locator('.toast-close');
    await expect.poll(() => centreHitsItself(closes)).toEqual([true, true]);
    // Vinduets egne knapper er stadig fri
    expect(await centreHitsItself(dialog.locator('.recipe-dialog__foot button'))).not.toContain(false);

    // Krydset virker inde i vinduet — og vinduet bliver stående
    await page.locator('.toast').filter({ hasText: 'Før vinduet' }).locator('.toast-close').click();
    await expect(page.locator('.toast')).toHaveCount(1);
    await expect(dialog).toBeVisible();

    // Lukkes vinduet, står beskeden på siden igen og kan stadig lukkes
    await closeRecipe(page);
    await expect.poll(() => page.evaluate(() =>
        document.querySelector('.notification-container')!.parentElement === document.body)).toBe(true);
    await expect.poll(() => centreHitsItself(page.locator('.toast-close'))).toEqual([true]);
});

// Mens et almindeligt vindue står åbent, står stakken nederst til højre — og
// lå dér over vinduets knapper. Målt 10/11 med fem blivende fejlbeskeder:
// Aftalers "Fjern aftale"-kryds dækket ved 1280×600, 1024×700 og 375×700,
// "Gem session"-knappen ved 1024×700 (og feltet og Annuller på en telefon).
// Nu står stakken til højre for panelet eller under det, når der er plads.
// Beskederne skal stadig kunne lukkes — det er den egentlige risiko ved at
// flytte dem: en fejl, der ikke kan klikkes væk, er værre end en dækket knap.
async function controlsFree(page) {
    return page.evaluate(() => {
        const overlays = [...document.querySelectorAll('[aria-modal="true"]')];
        const panel = overlays[overlays.length - 1].firstElementChild!;
        return [...panel.querySelectorAll('button, input')].filter((el) => {
            const r = el.getBoundingClientRect();
            if (!r.width) return false;
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return !(top && el.contains(top));
        }).map((el) => el.getAttribute('aria-label') || el.textContent!.trim() || el.tagName);
    });
}
// Hver besked kan nås (rulles frem i stakken) og lukkes, og kassen står på skærmen
async function closesReachable(page) {
    return page.evaluate(() => {
        const box = document.querySelector('.notification-container')!.getBoundingClientRect();
        const inside = box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth;
        const hits = [...document.querySelectorAll('.toast-close')].map((el) => {
            el.scrollIntoView({ block: 'nearest' });
            const r = el.getBoundingClientRect();
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return !!top && el.contains(top);
        });
        // Mindst de fem fejl (plus evt. "Klasse oprettet!"), og alle rammes
        return { inside, enough: hits.length >= 5, allHit: hits.every(Boolean) };
    });
}
const allHit = { inside: true, enough: true, allHit: true };

async function openAgreements(page) {
    for (const [a, b] of [['Anna', 'Bob'], ['Clara', 'David'], ['Emma', 'Frank'], ['Gitte', 'Hans']]) {
        await page.getByRole('checkbox', { name: `${a} med i aftale`, exact: true }).check();
        await page.getByRole('checkbox', { name: `${b} med i aftale`, exact: true }).check();
        await page.locator('#create-agreement-btn').click();
        await page.locator('.agreement-menu').getByRole('menuitem', { name: /Skal sammen/ }).click();
        await page.keyboard.press('Escape');
    }
    await page.locator('#together-list-btn').click();
    await expect(page.getByRole('dialog', { name: 'Aftaler', exact: true }).getByLabel('Fjern aftale')).toHaveCount(4);
}

// Ved 375×700 er striben under Aftaler 67 px: nok til en besked på to linjer
// (Chromium, 60 px), ikke på tre (WebKit, 78 px — anden skrifttype). Så står
// stakken som før, og det er rigtigt. Dér kræves kun, at beskederne kan lukkes.
const room = (page) => page.evaluate(() =>
    (document.querySelector('.notification-container') as HTMLElement).dataset.modalRoom || null);
for (const [width, height, agreementsMayLackRoom] of [[1280, 600, false], [1024, 700, false], [375, 700, true]] as const) {
    test(`Mange fejlbeskeder står ved siden af eller under vinduet — Aftaler og Gem session, ${width}×${height}`, async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 720 });
        await createClass(page, 'Beskeder ved vinduet');
        await openAgreements(page);
        await page.setViewportSize({ width, height });
        await fiveErrors(page);
        await expect(page.locator('.toast').filter({ hasText: '5. Fordel' })).toBeVisible();
        // poll: beskederne glider ind (0,28 sek.)
        if (!agreementsMayLackRoom || await room(page)) {
            await expect.poll(() => controlsFree(page)).toEqual([]);
        }
        await expect.poll(() => closesReachable(page)).toEqual(allHit);
        await page.keyboard.press('Escape');

        await page.setViewportSize({ width: 1280, height: 720 });
        await goToGroups(page);
        await generateGroups(page);
        await openSaveSession(page);
        await page.setViewportSize({ width, height });
        await expect.poll(() => controlsFree(page)).toEqual([]);
        expect(await closesReachable(page)).toEqual(allHit);
    });
}

// Ved 800×480 er der hverken plads ved siden af eller under Aftaler: så står
// stakken som før (oven på panelet), og hver besked kan stadig lukkes. "Gem
// som kolonne" er lavere og får sine beskeder under sig.
test('Mange fejlbeskeder ved 800×480 — kan altid lukkes, og Gem som kolonne er fri', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await createClass(page, 'Beskeder ved vinduet lille');
    await openAgreements(page);
    await page.setViewportSize({ width: 800, height: 480 });
    await fiveErrors(page);
    await expect(page.locator('.toast').filter({ hasText: '5. Fordel' })).toBeVisible();
    await expect.poll(() => closesReachable(page)).toEqual(allHit);
    await page.keyboard.press('Escape');

    await page.setViewportSize({ width: 1280, height: 720 });
    await goToGroups(page);
    await generateGroups(page);
    await openSaveColumn(page);
    await page.setViewportSize({ width: 800, height: 480 });
    await expect.poll(() => controlsFree(page)).toEqual([]);
    expect(await closesReachable(page)).toEqual(allHit);
});

// Stakken måles hvert 300. ms ud fra sin ALMINDELIGE plads (attributten tages
// af og sættes på igen). Den måling må ikke rulle stakken tilbage: læreren,
// der har rullet ned til den nederste besked for at lukke den, skal finde den
// samme sted et øjeblik efter.
async function scrolledStays(page) {
    const before = await page.evaluate(() => {
        const box = document.querySelector('.notification-container') as HTMLElement;
        box.scrollTop = box.scrollHeight;
        return box.scrollTop;
    });
    expect(before).toBeGreaterThan(0);
    await page.waitForTimeout(700);
    return page.evaluate((b) => {
        const box = document.querySelector('.notification-container') as HTMLElement;
        const closes = [...document.querySelectorAll('.toast-close')];
        const last = closes[closes.length - 1].getBoundingClientRect();
        const top = document.elementFromPoint(last.left + last.width / 2, last.top + last.height / 2);
        return { same: box.scrollTop === b, lastHit: !!top && closes[closes.length - 1].contains(top) };
    }, before);
}
test('Stakken ved et vindue bliver, hvor læreren har rullet den hen', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await createClass(page, 'Rulning ved vinduet');
    await openAgreements(page);
    await page.setViewportSize({ width: 1280, height: 600 });
    await fiveErrors(page);
    await expect.poll(() => room(page)).toBe('beside');
    await page.waitForTimeout(400);
    expect(await scrolledStays(page)).toEqual({ same: true, lastHit: true });
    await page.keyboard.press('Escape');

    await page.setViewportSize({ width: 1280, height: 720 });
    await goToGroups(page);
    await generateGroups(page);
    await openSaveSession(page);
    await page.setViewportSize({ width: 1024, height: 700 });
    await expect.poll(() => room(page)).toBe('under');
    await page.waitForTimeout(400);
    expect(await scrolledStays(page)).toEqual({ same: true, lastHit: true });
});
