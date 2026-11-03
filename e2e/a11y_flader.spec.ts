import { test, expect } from '@playwright/test';
import { createClass, createClassAndGoToGroups, generateGroups, goToGroups, goToMatrix, openSaveSession, openRecipe } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Betjening uden mus, anden runde.
//
// Tilgængelighedsreviewet 16. august dækkede gruppekortene, modalvinduernes
// fokusfælde og de to skuffer. Alt hvad der er bygget SIDEN — klassemenuen,
// kørselshistorikken, rangeringen, gendan-vinduet — nåede den aldrig, og
// målingen viste at flere af dem faldt tilbage til de samme fejl.
//
// Værnene her holder de fund lukkede.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Klassevælgeren kan åbnes og betjenes med tastaturet', async ({ page }) => {
    await createClass(page, 'Tastatur Klassemenu');

    const pillButton = page.locator('.class-trigger');
    // Den skal være en RIGTIG knap — som <div @click> var den ikke i tab-rækken.
    await expect(pillButton).toHaveAttribute('aria-expanded', 'false');
    await expect(pillButton).toHaveAttribute('aria-haspopup', 'true');

    await pillButton.focus();
    await expect(pillButton).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(pillButton).toHaveAttribute('aria-expanded', 'true');

    // Klassen skal kunne VÆLGES med tastaturet — ikke kun omdøbes og slettes.
    const nameButton = page.locator('.class-item .name').first();
    await expect(nameButton).toHaveRole('button');
    await nameButton.focus();
    await expect(nameButton).toBeFocused();

    // Escape lukker og lægger fokus tilbage på pillen.
    await page.keyboard.press('Escape');
    await expect(pillButton).toHaveAttribute('aria-expanded', 'false');
    await expect(pillButton).toBeFocused();
});

test('Modalvinduerne har et navn, og luk-knappen hedder "Luk"', async ({ page }) => {
    await createClass(page, 'Dialognavne');

    await page.locator('#rank-btn').click();
    const dialog = page.locator('.modal-overlay');
    await expect(dialog).toBeVisible();
    // Et role="dialog" uden navn annonceres bare som "dialog".
    await expect(dialog).toHaveAttribute('aria-labelledby', 'dlg-ranger');
    await expect(page.locator('#dlg-ranger')).toHaveText('Ranger værdier');
    await expect(dialog.locator('.close-btn')).toHaveAttribute('aria-label', 'Luk');
});

test('Radioknapper hører til samme gruppe', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Radiogrupper');
    await generateGroups(page);
    // "Matrixgrupper" kan kun vælges, når der ER en matrix (se næste test),
    // og piletasterne springer en lukket knap over. Så matrixen dannes først:
    // matrix-runden danner den, og aftrykket er signalet om at den står der.
    await goToMatrix(page);
    await generateGroups(page);
    await expect.poll(
        () => page.evaluate(() => !!(window as any).appDebug.state.matrixSourceFingerprint),
        { timeout: 90000 }
    ).toBe(true);

    // "Gem session" har de to valgmuligheder (stam/matrix).
    await openSaveSession(page);
    const radios = page.locator('.modal-overlay input[type=radio]');
    const tabbableCount = await radios.count();
    expect(tabbableCount).toBeGreaterThan(1);
    // Uden name er hver knap sin egen gruppe: to tab-stop og ingen piletaster.
    for (let i = 0; i < tabbableCount; i++) {
        await expect(radios.nth(i)).toHaveAttribute('name', 'sessionstype');
    }

    // Og med name virker piletasterne: fra "Stamgrupper" ned til "Matrix".
    await radios.first().focus();
    await page.keyboard.press('ArrowDown');
    await expect(radios.nth(1)).toBeChecked();
});

// Uden matrix kastede gemningen en fejl, når "Matrixgrupper" var valgt, og
// vinduet blev bare stående. Valget er nu lukket — og siger hvorfor, også til
// en skærmlæser (aria-describedby).
test('"Matrixgrupper" kan ikke vælges, når der ingen matrix er', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Uden matrix');
    await generateGroups(page);

    await openSaveSession(page);
    const matrixRadio = page.locator('.modal-overlay input[type=radio][value=matrix]');
    await expect(matrixRadio).toBeDisabled();
    await expect(matrixRadio).toHaveAttribute('aria-describedby', 'gs-matrix-note');
    await expect(page.locator('#gs-matrix-note')).toHaveText('Der er ingen matrixgrupper endnu.');
});

test('Elevtabellens afkrydsninger siger hvem de gælder', async ({ page }) => {
    await createClass(page, 'Afkrydsningsnavne');
    const firstRow = page.locator('tbody tr').first();
    const studentName = (await firstRow.locator('td.cell-data').first().innerText()).trim();
    await expect(firstRow.locator('input[type=checkbox]').nth(0))
        .toHaveAttribute('aria-label', `${studentName} med i aftale`);
    await expect(firstRow.locator('input[type=checkbox]').nth(1))
        .toHaveAttribute('aria-label', `${studentName} er til stede`);
});

test('En regelrække i Kategorisér kan fjernes med tastaturet', async ({ page }) => {
    await createClass(page, 'Kategoriregler');
    await page.locator('#cat-btn').click();
    await expect(page.locator('.modal-overlay')).toBeVisible();

    const deleteButton = page.locator('.mapping-row .btn-icon.delete').first();
    // tabindex="-1" gjorde den umulig at nå: en regel kunne tilføjes med
    // tastaturet, men aldrig fjernes igen.
    await deleteButton.focus();
    await expect(deleteButton).toBeFocused();
});

// Målt på "Lås alle" i bundlinjen. Indtil 26/10 2026 var det temaknappen, men
// mørk tilstand er fjernet; låseknappen er den anden ikon-knap, der skifter navn.
test('Skifte-knappers navn følger med, når tilstanden skifter', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Skifteknapper');
    await generateGroups(page);
    const lockAll = page.locator('.lock-all-btn');

    await lockAll.hover();               // her flytter tooltip.js title -> aria-label
    await expect(lockAll).toHaveAttribute('aria-label', 'Lås alle');

    await lockAll.click();
    await page.mouse.move(5, 5);
    await lockAll.hover();
    // Før: aria-label frøs fast på den gamle tekst, mens tippet skiftede —
    // skærmlæsere og stemmestyring læser aria-label, ikke tippet.
    await expect(lockAll).toHaveAttribute('aria-label', 'Lås alle op');
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tredje runde, 3. september: det MARKEREDE lød som alt det andet.
//
// Fanerne, båndets valggrupper og de to import-piller var kun markeret med
// en farve og en glidende streg. En skærmlæser sagde "Elevliste, knap" og
// "Grupper, knap" — ordret det samme, uanset hvor man stod. Værnene her
// holder markeringen hørbar.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Den valgte fane siger, at den er valgt', async ({ page }) => {
    await createClass(page, 'Fanemarkering');

    const studentList = page.locator('.nav-tab').filter({ hasText: 'Elevliste' });
    const groupCards = page.locator('.nav-tab').filter({ hasText: 'Grupper' });

    await expect(studentList).toHaveAttribute('aria-current', 'page');
    await expect(groupCards).not.toHaveAttribute('aria-current', 'page');

    await goToGroups(page);
    await expect(groupCards).toHaveAttribute('aria-current', 'page');
    await expect(studentList).not.toHaveAttribute('aria-current', 'page');
});

test('Opskriftens valg af størrelse siger hvad der er valgt — og hvad valget handler om', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Baandets valg');
    const dialog = await openRecipe(page);
    await dialog.locator('.rtok__btn[aria-label^="Gruppernes størrelse:"]').click();

    // Gruppen har et navn, så "Elever pr. gruppe, trykket" ikke står uden ophæng.
    const layoutMode = dialog.locator('[role=group][aria-label="Dan grupper efter"]');
    await expect(layoutMode).toBeVisible();

    const sizeBtn = layoutMode.getByRole('button', { name: 'Elever pr. gruppe' });
    const countBtn = layoutMode.getByRole('button', { name: 'Antal grupper' });

    await expect(sizeBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(countBtn).toHaveAttribute('aria-pressed', 'false');

    await countBtn.click();
    await expect(countBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(sizeBtn).toHaveAttribute('aria-pressed', 'false');
});

test('Importer/Eksporter lyder ikke ens', async ({ page }) => {
    await createClass(page, 'Importpiller');
    await page.locator('.nav-tab').filter({ hasText: 'Import & backup' }).click();

    const importButton = page.locator('.pill-btn').filter({ hasText: 'Importér' });
    const exportButton = page.locator('.pill-btn').filter({ hasText: 'Eksportér' });

    await expect(importButton).toHaveAttribute('aria-pressed', 'true');
    await expect(exportButton).toHaveAttribute('aria-pressed', 'false');

    await exportButton.click();
    await expect(exportButton).toHaveAttribute('aria-pressed', 'true');
    await expect(importButton).toHaveAttribute('aria-pressed', 'false');
});

test('Kørslen melder sig — og melder resultatet', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Koerslen melder sig');

    // Overlayet er en rigtig dialog med et navn, ikke bare en sløret flade.
    // Rejst direkte: en rigtig kørsel på 12 elever er for hurtig til at nå
    // at måle i.
    await page.evaluate(() => { (window as any).appDebug.state.isGenerating = true; });
    const overlay = page.locator('.processing-overlay');
    await expect(overlay).toHaveAttribute('aria-modal', 'true');
    await expect(overlay).toHaveAttribute('aria-labelledby', 'generation-title');
    await expect(page.locator('#generation-title')).toHaveText('Danner grupper …');
    // Udgangen skal være ét tastetryk væk — ikke bag hele siden.
    await expect(overlay.getByRole('button', { name: 'Stop' })).toBeFocused();
    await page.evaluate(() => { (window as any).appDebug.state.isGenerating = false; });
    await expect(overlay).toBeHidden();

    // Og en færdig kørsel siger hvor mange grupper der kom ud. Tallet
    // sammenlignes med kortene på skærmen — ikke med sig selv.
    await generateGroups(page);
    const cardCount = await page.locator('.group-card').count();
    const status = page.locator('p[role=status][aria-live=polite]');
    await expect(status).toHaveText(`${cardCount} grupper dannet.`);

    // En STOPPET kørsel danner ingenting. Grupperne fra før står der stadig,
    // og før talte meldingen bare dem: "6 grupper dannet." lige efter
    // toasten "Dine nuværende grupper er urørte."
    await page.evaluate(() => { (window as any).appDebug.state.isGenerating = true; });
    await overlay.getByRole('button', { name: 'Stop' }).click();
    await expect(overlay).toBeHidden();
    await expect(status).toHaveText('');
    await expect(page.locator('.group-card')).toHaveCount(cardCount);
});

test('Måltalsfeltet hedder det, det betyder', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Maaltalsfeltet');
    const dialog = await openRecipe(page);
    await dialog.locator('.rtok__btn[aria-label^="Gruppernes størrelse:"]').click();
    const pop = dialog.locator('.rtok__pop');

    // Feltet har ingen synlig etiket. Hed det "Måltal", var det et tal uden
    // enhed for enhver, der ikke kan se knapperne ved siden af.
    const inputField = pop.locator('input[type=number]');
    await expect(inputField).toHaveAttribute('aria-label', 'Elever pr. gruppe');

    // Og navnet følger med, når betydningen skifter.
    await pop.getByRole('button', { name: 'Antal grupper' }).click();
    await expect(inputField).toHaveAttribute('aria-label', 'Antal grupper');
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fjerde runde, 4. september: afspilningen — bygget DAGEN EFTER tredje runde.
//
// Samme mønster som de tre gange før: den nyeste flade faldt i de huller, de
// ældre lige var kommet op af. Afspilningsmenuen hænger på den samme
// bundbjælke som kørselshistorikken og ligner den på en prik — men fik ingen
// af historikkens fire fokusværn med.
//
// Og dobbelttjekket af historikken selv viste, at ét af dens værn var for
// hårdt: den rev fokus tilbage, når tastaturet gik VIDERE.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Afspilningsmenuen tager imod fokus — også når afspilleren dukker op', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Afspilning fokus');
    await generateGroups(page);

    await page.locator('.replay-anchor .action-pill').click();
    const menu = page.locator('.replay-menu');
    await expect(menu).toBeVisible();
    // Uden det åbnede menuen sig usynligt for en skærmlæser: markøren blev
    // stående på knappen i bjælken.
    await expect(menu.locator('.start')).toBeFocused();

    // "Se kørslen" forsvinder under fingeren, når afspilleren tager over.
    // Målt før: document.activeElement blev <body>.
    await page.keyboard.press('Enter');
    await expect(menu.locator('.play-toggle')).toBeFocused();
});

test('Tastaturet kan forlade en kørende afspilning — og så stopper den', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Afspilning forlades');
    await generateGroups(page);

    await page.locator('.replay-anchor .action-pill').click();
    await page.locator('.replay-menu .start').click();

    // Målt før rettelsen: menuen blev stående, afspilningen kørte videre, og
    // skærmen viste NUL gruppekort — mens "Kopiér" lagde alle tre grupper med
    // tolv elever i udklipsholderen. Læreren kopierede en liste, hun ikke
    // kunne se.
    await page.locator('.action-pill', { hasText: 'Kopiér' }).focus();
    await expect(page.locator('.replay-menu')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => !!(window as any).appDebug?.state?.replay)).toBe(false);
    // Kortene er tilbage på de rigtige grupper, før nogen kan trykke.
    await expect(page.locator('.group-card').first()).toBeVisible();
});

test('Menuknapperne i bjælken kan tabbes forbi', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Tab forbi menuknap');
    await generateGroups(page);
    await generateGroups(page);   // to kørsler, så historik-knappen er aktiv

    await page.locator('.run-history-anchor .action-pill').click();
    await expect(page.locator('.run-menu')).toBeVisible();

    // Menuen lukker, når tastaturet går videre — men fokus skal BLIVE, hvor
    // læreren satte det. Målt før: fokus blev revet tilbage til
    // historik-knappen, så Enter åbnede menuen igen i stedet for at kopiere.
    const copyButton = page.locator('.action-pill', { hasText: 'Kopiér' });
    await copyButton.focus();
    await expect(page.locator('.run-menu')).toHaveCount(0);
    await expect(copyButton).toBeFocused();
});

test('Skifte-knappers navn følger med — også uden en mus i nærheden', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Skifteknapper uden mus');
    await generateGroups(page);
    const lockAll = page.locator('.lock-all-btn');

    // Fokus alene flytter title -> data-tooltip + aria-label.
    await lockAll.focus();
    await expect(lockAll).toHaveAttribute('aria-label', 'Lås alle');

    // Tryk uden at flytte musen: rettelsen 27/8 hentede den nye tekst ind ved
    // hver musebevægelse, og tastaturvejen havde ingen sådan puls — navnet
    // frøs fast på den gamle tekst resten af besøget.
    await page.keyboard.press('Enter');
    await expect(lockAll).toHaveAttribute('aria-label', 'Lås alle op');
    // Og teksten bag det synlige tip skal følge med — ellers ville tippet
    // sige det gamle, næste gang knappen får fokus.
    await expect(lockAll).toHaveAttribute('data-tooltip', 'Lås alle op');
});

test('Værktøjstippet dukker kun op, når fokus kom fra tastaturet', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Tip kun ved tastatur');
    await generateGroups(page);

    // Museklik der starter afspilningen: programmet flytter selv fokus til
    // Pause. Målt før: den sorte "Afspil"-etiket parkerede sig oven på
    // menuens eget ms-felt og blev stående, også når musen gik væk.
    await page.locator('.replay-anchor .action-pill').click();
    await page.locator('.replay-menu .start').click();
    await expect(page.locator('.replay-menu .play-toggle')).toBeFocused();
    await expect(page.locator('#global-tooltip')).not.toHaveClass(/visible/);

    // Men et rigtigt Tab skal stadig vise tippet — det er hele grunden til,
    // at tippet overhovedet reagerer på fokus.
    await page.keyboard.press('Escape');
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    let foundLabels = false;
    for (let i = 0; i < 40 && !foundLabels; i++) {
        await page.keyboard.press('Tab');
        foundLabels = await page.evaluate(() => {
            const a = document.activeElement as HTMLElement;
            const tip = document.getElementById('global-tooltip');
            return !!a?.getAttribute('data-tooltip')
                && !!tip?.classList.contains('visible')
                && tip?.textContent === a.getAttribute('data-tooltip');
        });
    }
    expect(foundLabels).toBe(true);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gennemsynet 9. september: navnene holdt — det var HANDLINGERNE der faldt.
//
// Runderne 16/8, 27/8, 3/9 og 4/9 satte baren: hver eneste betjeningsflade
// skal have et navn. Det holder — en gennemgang af hele appen i browseren
// fandt ingen navnløse knapper, felter eller afkrydsninger. Til gengæld faldt
// de nye flader (flyt-flowet, aftale-menuen, afspilningsmenuen, "Flyt
// kolonner") på det, der sker EFTER et tryk — og på ét sted blev navnet
// overtaget af noget andet.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Et værktøjstip overtager ikke navnet på noget, der har skrift på', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Tipnavne');

    // tooltip.js flytter `title` over i `data-tooltip` og spejlede teksten i
    // `aria-label`. Et aria-label VINDER over elementets egen tekst, så
    // knappen skiftede navn i det øjeblik musen strejfede den.
    await generateGroups(page);
    const matrix = page.locator('.recipe-bar .recipe__soft').filter({ hasText: 'Matrix-runde' });
    await matrix.hover();
    await expect(matrix).toHaveAttribute('data-tooltip', 'Bland grupperne til en matrix-runde');
    expect(await matrix.getAttribute('aria-label')).toBeNull();
    await expect(page.getByRole('button', { name: 'Matrix-runde', exact: true })).toHaveCount(1);

    // Ikon-knapperne skal stadig arve navnet — det var hele pointen 27/8.
    const news = page.locator('.news-btn');
    await news.hover();
    await expect(news).toHaveAttribute('aria-label', /Nyheder/);

    // Og elevrækkerne: alle 12 hed det samme, "Klik for at flytte eleven til
    // en anden gruppe" — elevens navn var væk fra tilgængelighedstræet.
    const member = page.locator('.group-card li').first();
    const memberName = (await member.locator('.member-name-text').innerText()).trim();
    await member.hover();
    await expect(member).toHaveAttribute('data-tooltip', /Klik for at flytte/);
    expect(await member.getAttribute('aria-label')).toBeNull();
    await expect(page.getByRole('button', { name: new RegExp(memberName) })).toHaveCount(1);
});

test('"Lav aftale" giver markøren videre, når menupunktet forsvinder', async ({ page }) => {
    await createClass(page, 'Aftalemenu fokus');

    await page.getByRole('checkbox', { name: 'Anna med i aftale', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Bob med i aftale', exact: true }).check();
    await page.locator('#create-agreement-btn').click();
    await page.locator('.agreement-menu').getByRole('menuitem', { name: /Skal sammen/ }).click();

    const dialog = page.getByRole('dialog', { name: 'Aftaler', exact: true });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // "Lav aftale" står i et v-if på markeringen, og handlingen rydder
    // markeringen — så knappen findes ikke længere, når vinduet vil give
    // fokus tilbage. Uden en ny modtager landede markøren på <body>, og næste
    // Tab begyndte forfra øverst på siden.
    await expect(page.locator('#together-list-btn')).toBeFocused();
});

test('Afspilningsmenuen har en rolle, så dens navn kan læses op', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Afspilningsmenu rolle');
    await generateGroups(page);

    await page.locator('.replay-anchor .action-pill').click();
    const menu = page.locator('.replay-menu');
    // Et <div> uden rolle er `generic`, og ARIA forbyder et navn på den —
    // aria-label blev droppet igen. Menuen kunne selv tage imod fokus (når
    // "Se kørslen" er slået fra), og gjorde det så helt tavst.
    await expect(menu).toHaveAttribute('role', 'group');
    await expect(menu).toHaveAttribute('aria-label', 'Se kørslen');
});

test('Bundbjælken har et navn, og papirkurven er ikke et tomt læsepunkt', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Bjælke navn');
    await generateGroups(page);

    // Uden en rolle og et navn er bjælken et anonymt <div>: en skærmlæser
    // siger "Del, knap" uden at sige, hvad knapperne hører til.
    const bar = page.locator('.floating-action-bar');
    await expect(bar).toHaveAttribute('role', 'group');
    await expect(bar).toHaveAttribute('aria-label', 'Handlinger på grupperne');
    // Papirkurven er kun et slip-mål for musen (tastaturvejen er "Meld
    // fraværende" i elevens række) — at læse den op lover en handling, der ikke
    // findes.
    await expect(page.locator('.trash-zone-floating')).toHaveAttribute('aria-hidden', 'true');
});
