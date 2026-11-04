import { test, expect, Page } from '@playwright/test';
import { createClass, goToGroups, generateGroups, stepGroupSize, closeRecipe } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// KØRSELSHISTORIK — de seneste gruppedannelser i fanen.
//
// Historik-fanen kræver at læreren huskede at trykke "Gem" FØR hun
// genererede igen. Kørselshistorikken lægger et snapshot til side af sig
// selv, og menuen over historik-knappen lader hende pege sig tilbage:
// hover viser kørslen i DE RIGTIGE gruppekort, og først et klik henter den.
//
// Testen går hele vejen gennem den rigtige motor — ikke håndlavede snapshots.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Navnene i første gruppekort, som de står på skærmen lige nu. */
async function group1(page: Page): Promise<string[]> {
    return await page.locator('.group-card').first()
        .locator('.member-name-text').allTextContents();
}

/**
 * Klik på en kørsel og fuldfør hentningen.
 *
 * Spørgsmålet om indstillingerne stilles KUN, hvis reglerne eller
 * indstillingerne faktisk er ændret siden kørslen — ellers hentes den med det
 * samme. Hjælperen tåler begge veje, så testene ikke går i stykker af den
 * grund alene.
 */
async function loadRun(page: Page, n: number) {
    await page.locator('.run-menu .chip').nth(n).click();
    const confirmBox = page.locator('.confirm-box');
    if (await confirmBox.isVisible().catch(() => false)) {
        await page.locator('.btn-primary-confirm').click();
    }
    await expect(page.locator('.run-menu')).toBeHidden();
}

/** Åbn menuen over historik-knappen. */
async function openRunMenu(page: Page) {
    await page.locator('.run-history-anchor .action-pill').click();
    await expect(page.locator('.run-menu')).toBeVisible({ timeout: 5000 });
}

/**
 * Dan to FORSKELLIGE kørsler. Motoren er deterministisk nok til at samme
 * indstillinger kan give samme fordeling — og en fordeling der er identisk
 * med den forrige lægges bevidst ikke i stakken (der er intet at gå tilbage
 * til). Derfor ændres gruppestørrelsen mellem de to kørsler, præcis som en
 * lærer der prøver sig frem.
 */
async function twoRuns(page: Page) {
    await generateGroups(page);
    const firstRun = await group1(page);

    await stepGroupSize(page, 1);
    await generateGroups(page);
    await expect.poll(async () => (await group1(page)).join(','), { timeout: 90000 })
        .not.toBe(firstRun.join(','));

    return firstRun;
}

test('En markering vises ikke i en forhåndsvisning — og kommer tilbage bagefter', async ({ page }) => {
    // FUNDET 9/9: markeringen overlevede en forhåndsvisning, men kun HALVT.
    // Fremhævningen forsvandt (isPicked kræver både elev-id OG gruppenavn, og
    // eleven ligger et andet sted i den viste kørsel), mens "Flyt hertil" BLEV
    // STÅENDE (canReceivePicked ser kun på gruppenavnet). Læreren så altså
    // knapper der lovede at flytte en elev, uden at nogen var markeret — og
    // det ene kort UDEN knap var blot det, der tilfældigvis hed det samme som
    // kildegruppen.
    //
    // Markeringen må omvendt ikke RYDDES: at pege på et menupunkt skal ikke
    // koste læreren sit valg. Den skal komme tilbage, når musen forlader.
    await createClass(page, 'Markering Forhaandsvisning');
    await goToGroups(page);
    await twoRuns(page);

    const picked = page.locator('.group-card .group-members-list li').first();
    await picked.click();
    await expect(picked).toHaveClass(/picked/);
    const buttonsBefore = await page.locator('.receive-picked-btn').count();
    expect(buttonsBefore).toBeGreaterThan(0);

    await openRunMenu(page);
    await page.locator('.run-menu .chip').nth(1).hover();

    // Under forhåndsvisningen: hverken fremhævning eller knapper.
    await expect(page.locator('.receive-picked-btn')).toHaveCount(0);
    await expect(page.locator('.group-card .pick-actions')).toHaveCount(0);

    // Musen ud af menuen — markeringen er der stadig.
    await page.locator('.run-menu .chip').first().hover();
    await page.locator('#groups-display').hover({ position: { x: 5, y: 5 } });
    await expect(page.locator('.receive-picked-btn').first()).toBeVisible();
    await expect(page.locator('.group-card .group-members-list li.picked')).toHaveCount(1);
});

test('Henter man en tidligere kørsel, ryder markeringen med', async ({ page }) => {
    // Samme fund, den alvorlige halvdel: her er gitteret IKKE spærret, så de
    // fem knapper var klikbare. Et klik gjorde ingenting — moveMember() leder
    // efter elev-id'et i den gamle kildegruppe og finder det ikke — så
    // knappen blev stående og løj, indtil læreren trykkede Esc.
    // Rettelsen sidder i pushRun(), som kaldes af ALLE fire veje der
    // udskifter fordelingen.
    await createClass(page, 'Markering Hent Koersel');
    await goToGroups(page);
    await twoRuns(page);

    const picked = page.locator('.group-card .group-members-list li').first();
    await picked.click();
    await expect(page.locator('.receive-picked-btn').first()).toBeVisible();

    await openRunMenu(page);
    await loadRun(page, 1);

    await expect(page.locator('.receive-picked-btn')).toHaveCount(0);
    await expect(page.locator('.pick-status')).toHaveText('');
});

test('En ny gruppedannelse rydder markeringen', async ({ page }) => {
    // Den vej læreren oftest rammer: markér en elev, tryk Dan grupper. Fordelingen
    // skiftes ud under markeringen, og gitteret er IKKE spærret bagefter — så
    // de knapper der blev stående, kunne trykkes. De gjorde bare ingenting.
    await createClass(page, 'Markering Ny Koersel');
    await goToGroups(page);
    await generateGroups(page);

    const picked = page.locator('.group-card .group-members-list li').first();
    await picked.click();
    await expect(page.locator('.receive-picked-btn').first()).toBeVisible();

    await stepGroupSize(page, 1);
    await generateGroups(page);

    await expect(page.locator('.pick-status')).toHaveText('', { timeout: 90000 });
    await expect(page.locator('.receive-picked-btn')).toHaveCount(0);
    await expect(page.locator('.group-card .pick-actions')).toHaveCount(0);
});

test('Historik-knappen er slået fra, indtil der er en kørsel at gå tilbage til', async ({ page }) => {
    await createClass(page, 'Kørsler tom');
    await goToGroups(page);
    await generateGroups(page);

    // Efter den ALLERFØRSTE generering er der ikke noget at gå tilbage til.
    await expect(page.locator('.run-history-anchor .action-pill')).toBeDisabled();
});

test('Hover viser en tidligere kørsel i de rigtige gruppekort — uden at gemme noget', async ({ page }) => {
    await createClass(page, 'Kørsler hover');
    await goToGroups(page);
    const firstRun = await twoRuns(page);
    const currentNames = await group1(page);

    // Den GEMTE tilstand, før vi peger på noget. Den skal være uændret
    // bagefter — en forhåndsvisning må ikke skrive noget.
    const savedBefore = await page.evaluate(() =>
        JSON.stringify((window as any).appDebug.state.storedStandardGroups));

    await openRunMenu(page);

    // Peg på kørsel 1 — kortene skal skifte til DEN fordeling.
    await page.locator('.run-menu .chip').nth(1).hover();
    await expect.poll(async () => (await group1(page)).join(',')).toBe(firstRun.join(','));

    // … men intet er gemt.
    const savedAs = await page.evaluate(() =>
        JSON.stringify((window as any).appDebug.state.storedStandardGroups));
    expect(savedAs).toBe(savedBefore);

    // Peg på "Nu" — kortene skal tilbage til den gældende fordeling.
    await page.locator('.run-menu .chip-now').hover();
    await expect.poll(async () => (await group1(page)).join(',')).toBe(currentNames.join(','));
});

test('Klik henter kørslen frem — og spørger først om indstillingerne skal med', async ({ page }) => {
    await createClass(page, 'Kørsler klik');
    await goToGroups(page);
    const firstRun = await twoRuns(page);

    await openRunMenu(page);
    await page.locator('.run-menu .chip').nth(1).click();

    // toKoersler() ændrer gruppestørrelsen mellem de to kørsler, så
    // indstillingerne ER anderledes — og så skal der spørges først.
    await expect(page.locator('.confirm-box')).toBeVisible();
    await expect(page.getByText(/Skal de fra dengang også med/)).toBeVisible();

    await page.locator('.btn-primary-confirm').click();   // "Nej, kun grupperne"

    await expect(page.locator('.run-menu')).toBeHidden();
    // expect.poll, ikke et bart expect: gruppekortene skifter med en
    // TransitionGroup, så de udgående elever står stadig i DOM'en et øjeblik.
    await expect.poll(async () => (await group1(page)).join(',')).toBe(firstRun.join(','));
});

test('Den fordeling man forlader kan hentes tilbage igen', async ({ page }) => {
    await createClass(page, 'Kørsler frem');
    await goToGroups(page);
    await twoRuns(page);
    const abandoned = await group1(page);

    // Gå tilbage …
    await openRunMenu(page);
    await loadRun(page, 1);
    await expect.poll(async () => (await group1(page)).join(',')).not.toBe(abandoned.join(','));

    // … og frem igen: den forladte fordeling ligger øverst i menuen.
    await openRunMenu(page);
    await loadRun(page, 1);
    await expect.poll(async () => (await group1(page)).join(',')).toBe(abandoned.join(','));
});

test('Har man flyttet elever i hånden, bliver man advaret først', async ({ page }) => {
    await createClass(page, 'Kørsler manuel');
    await goToGroups(page);
    await twoRuns(page);

    // Flyt en elev med markér-og-flyt (samme vej som træk-og-slip).
    await page.locator('.group-card').first().locator('li').first().click();
    await page.locator('.group-card').nth(1).locator('.receive-picked-btn').click();

    await openRunMenu(page);
    await page.locator('.run-menu .chip').nth(1).click();

    // Teksten slås op INDE i advarslen. En løs getByText rammer også
    // Nyheder-dialogen, der omtaler den samme advarsel med samme ord.
    await expect(page.locator('.confirm-warning')).toBeVisible();
    await expect(page.locator('.confirm-warning')).toContainText(/rettet i grupperne i hånden/);
});

test('Et rettet emne advarer også — gendannelsen overskriver hele emne-kortet', async ({ page }) => {
    await createClass(page, 'Kørsler emne');
    await goToGroups(page);
    await twoRuns(page);

    // INGEN elev flyttes — kun et emne skrives på den første gruppe. Aftrykket
    // så tidligere kun navne, låse og medlemmer, så hasManualChanges() sagde
    // "ingen ændringer", spørgsmålet blev sprunget over, og emnet forsvandt
    // lydløst i gendannelsen.
    const topicField = page.locator('.group-card').first().locator('.group-topic-input');
    await topicField.fill('Liberalisme');
    await topicField.blur();

    await openRunMenu(page);
    await page.locator('.run-menu .chip').nth(1).click();

    await expect(page.locator('.confirm-warning')).toBeVisible();
    await expect(page.locator('.confirm-warning')).toContainText(/ændret emner/);
});

test('Er intet ændret siden kørslen, spørges der ikke — den hentes bare', async ({ page }) => {
    await createClass(page, 'Kørsler uden ændring');
    await goToGroups(page);
    await twoRuns(page);

    // Sæt gruppestørrelsen TILBAGE, så indstillingerne igen er dem kørslen
    // blev dannet med. Så er der intet at svare på.
    await stepGroupSize(page, -1);
    await closeRecipe(page);

    // Skrivningen af indstillingen er debounced (så et tastetryk i talfeltet
    // ikke gemmer ved hvert anslag). Vent på at den faktisk er landet — ikke
    // bare på at knappen er trykket.
    await expect.poll(async () => await page.evaluate(() =>
        String((window as any).appDebug.state.currentClass.settings.groupTarget)))
        .toBe('4');

    await openRunMenu(page);
    await page.locator('.run-menu .chip').nth(1).click();

    // Ingen bekræftelse — kørslen er hentet, og menuen er lukket.
    await expect(page.locator('.confirm-box')).toHaveCount(0);
    await expect(page.locator('.run-menu')).toBeHidden();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gennemsyn af udgangene 2/9: forhåndsvisningen skal SLIPPE igen.
//
// Musen havde altid en vej ud — @mouseleave rydder forhåndsvisningen, og et
// klik udenfor lukker menuen. Tastaturet havde ingen af delene: chippene
// sætter forhåndsvisningen på @focus, og intet ryddede den, når fokus tabbede
// videre. Målt før rettelsen: efter otte Tab stod fokus på .brand-link øverst
// på siden, menuen var stadig åben, og previewRunIndex var 0.
//
// Hvorfor det betyder noget for MERE end menuen: gruppekortene tegner
// forhåndsvisningen, men ALLE fire udgange — udskrift, kopiér, gem som kolonne
// og Excel-eksport — læser state.storedStandardGroups. Læreren kunne altså
// printe en anden gruppeliste end den, hun stod og kiggede på.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Tabber man ud af kørselsmenuen, slipper forhåndsvisningen', async ({ page, browserName }) => {
    // Safari flytter som udgangspunkt IKKE tastaturfokus til en <button> med
    // Tab — det kræver at brugeren selv slår "Fuld tastaturadgang" til i
    // systemindstillingerne. Chippene kan altså ikke få fokus dér, og så kan
    // fejlen heller ikke opstå. Testen ville måle på en forudsætning, der ikke
    // findes, frem for på rettelsen.
    test.skip(browserName === 'webkit', 'Tab fokuserer ikke knapper i Safari');

    await createClass(page, 'Kørsler tastatur');
    await goToGroups(page);
    await twoRuns(page);

    await openRunMenu(page);

    // Menuen sætter selv fokus på første chip, og Tab flytter gennem
    // kørslerne — undervejs sættes forhåndsvisningen af @focus.
    await page.keyboard.press('Tab');
    await expect.poll(async () => await page.evaluate(() =>
        (window as any).appDebug.state.previewRunIndex)).not.toBeNull();

    // Tab videre, indtil fokus er ude af menuen — ét tryk ad gangen, og stop
    // dér. Før stod her 8 tryk i træk: siden privacy-link.js også hentes under
    // udvikling (26/10), ligger "Privatlivspolitik" sidst på siden, og 8 tryk
    // løb forbi den og helt ud af dokumentet. Fokus på <body> tæller med vilje
    // ikke som "udenfor" (se onRootFocusOut), så menuen blev stående — en
    // lærer, der tabber ud, lander på linket, og så lukker den.
    for (let i = 0; i < 12; i++) {
        await page.keyboard.press('Tab');
        const inside = await page.evaluate(() => {
            const menu = document.querySelector('.run-menu');
            return menu ? menu.contains(document.activeElement) : false;
        });
        if (!inside) break;
    }

    await expect.poll(async () => await page.evaluate(() => {
        const menu = document.querySelector('.run-menu');
        return menu ? menu.contains(document.activeElement) : false;
    })).toBe(false);

    // Menuen er lukket, forhåndsvisningen sluppet — og kortene viser igen den
    // fordeling der faktisk gælder, altså den samme som udskriften ville vise.
    await expect(page.locator('.run-menu')).toHaveCount(0);
    expect(await page.evaluate(() =>
        (window as any).appDebug.state.previewRunIndex)).toBeNull();
    // Og kortene viser igen DET, udskriften ville vise. Facit hentes fra
    // state.storedStandardGroups — den kilde alle fire udgange læser — frem
    // for fra et skærmbillede taget tidligere: rækkefølgen inde i kortet er
    // ikke en del af aftalen, det er HVEM der står der.
    const expectedNames = await page.evaluate(() => {
        const st = (window as any).appDebug.state;
        const byId = new Map(st.currentClass.data.map((r: any) => [String(r._rowId), r]));
        return (st.storedStandardGroups[0].members || []).map((m: any) => {
            const id = typeof m === 'object' && m !== null ? String(m.id ?? m.name) : String(m);
            const row: any = byId.get(id);
            return row ? String(row[st.displayColumn] ?? '') : id;
        }).sort();
    });
    // Poll: gruppekortene tegnes om asynkront, når forhåndsvisningen slipper.
    await expect.poll(async () => [...await group1(page)].sort().join(','))
        .toBe(expectedNames.join(','));
});

// 4/11: menuens focusin-lytter blev før sat på i en setTimeout(…, 0), og
// browseren kan lade sådan en timer vente, mens tastetryk kommer hurtigt.
// Så nåede Tab ud af menuen at ske, før nogen lyttede, og menuen blev stående
// (set i Del-menuen, som havde samme mønster). Timerne holdes her kunstigt
// tilbage, så det sker hver gang.
test('Kørselsmenuen lukker, når fokus tabber ud, selvom timerne venter', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Tab fokuserer ikke knapper i Safari');

    await createClass(page, 'Kørsler ventende timere');
    await goToGroups(page);
    await twoRuns(page);

    await page.evaluate(() => {
        const original = window.setTimeout;
        (window as any).setTimeout = (fn: TimerHandler, ms?: number, ...args: unknown[]) =>
            original(fn, ms ? ms : 1000, ...args);
    });

    await openRunMenu(page);
    await expect.poll(async () => await page.evaluate(() =>
        document.querySelector('.run-menu')?.contains(document.activeElement) ?? false)).toBe(true);
    for (let i = 0; i < 12; i++) {
        await page.keyboard.press('Tab');
        const inside = await page.evaluate(() =>
            document.querySelector('.run-menu')?.contains(document.activeElement) ?? false);
        if (!inside) break;
    }
    await expect(page.locator('.run-menu')).toHaveCount(0, { timeout: 500 });
    expect(await page.evaluate(() =>
        (window as any).appDebug.state.previewRunIndex)).toBeNull();
});

test('Et klik på en kørsel må stadig nå at stille spørgsmålet', async ({ page }) => {
    // Værn mod rettelsen ovenfor: chip-rækken byttes ud med spørgsmålet, så
    // den knap der havde fokus forsvinder — og browseren sender et focusout
    // der ligner "fokus forlod menuen". Lukkede vi på det, kunne
    // bekræftelses-trinnet aldrig nå at blive vist.
    await createClass(page, 'Kørsler klik-værn');
    await goToGroups(page);
    // toKoersler() ændrer gruppestørrelsen mellem de to kørsler, så
    // indstillingerne ER anderledes end dengang — og så skal der spørges.
    await twoRuns(page);

    await openRunMenu(page);
    await page.locator('.run-menu .chip').nth(1).click();

    await expect(page.locator('.confirm-box')).toBeVisible();
    await expect(page.locator('.run-menu')).toBeVisible();
});

// 4/11: et klik på knappen, mens menuen står åben, skal LUKKE den. Før lukkede
// menuen sig selv, når knappen fik fokus (mousedown i Chromium og Firefox) eller
// blev trykket ned (pointerdown), og knappens eget klik åbnede den straks igen —
// menuen kunne ikke lukkes med den knap, der åbnede den. Del-menuen har aldrig
// haft fejlen (useBarMenuDismiss regner knappens indpakning som "inde").
test('Et klik på knappen lukker kørsels- og afspilningsmenuen igen', async ({ page }) => {
    await createClass(page, 'Kørsler knap lukker');
    await goToGroups(page);
    await twoRuns(page);

    const historyButton = page.locator('.run-history-anchor .action-pill');
    await historyButton.click();
    await expect(page.locator('.run-menu')).toBeVisible();
    await historyButton.click();
    await expect(page.locator('.run-menu')).toHaveCount(0);
    expect(await page.evaluate(() =>
        (window as any).appDebug.state.previewRunIndex)).toBeNull();

    const replayButton = page.locator('.replay-anchor .action-pill');
    await replayButton.click();
    await expect(page.locator('.replay-menu')).toBeVisible();
    await replayButton.click();
    await expect(page.locator('.replay-menu')).toHaveCount(0);
});

// 4/11: knappen, der åbnede menuen, tæller som "inde" — fokus dér lukker ikke
// menuen. Men forhåndsvisningen skal slippe: læreren er gået ud af kørslerne,
// og alle udgange læser stored*. Reglen lå før i menuens egen kopi af
// lukke-reglerne; nu i useBarMenuDismiss (onOpenerFocus), og testen holder den.
test('Fokus på historik-knappen slipper forhåndsvisningen, men menuen bliver', async ({ page }) => {
    await createClass(page, 'Kørsler knappen får fokus');
    await goToGroups(page);
    await twoRuns(page);

    await openRunMenu(page);
    await page.locator('.run-menu .chip').nth(1).focus();
    await expect.poll(async () => await page.evaluate(() =>
        (window as any).appDebug.state.previewRunIndex)).toBe(0);

    await page.locator('.run-history-anchor .action-pill').focus();
    await expect.poll(async () => await page.evaluate(() =>
        (window as any).appDebug.state.previewRunIndex)).toBeNull();
    await expect(page.locator('.run-menu')).toBeVisible();
});
