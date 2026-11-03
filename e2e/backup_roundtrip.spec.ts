import { test, expect } from '@playwright/test';
import { createClass, goToGroups, generateGroups } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BACKUP-FILEN ER DEN ENESTE KOPI.
//
// Grupper har ingen server: alt ligger i browserens localStorage. Rydder
// læreren browserdata — eller skifter computer — er backup-filen det eneste
// der findes. Knappen lovede "alt data, regler og historik", men filen
// indeholdt kun klasse-objektet: grupperne, emnerne pr. gruppe og de gemte
// sessioner ligger i deres EGNE nøgler og fulgte ikke med. Værre endnu
// ryddede en gendannelse netop de nøgler, så den kunne gøre klassen fattigere
// end før.
//
// Testen går hele vejen rundt gennem den rigtige brugerflade: dan grupper,
// gem en session, eksportér, ryd alt, importér filen igen.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('Backup, ryd alt, gendan — grupperne, emnerne og sessionen er der stadig', async ({ page }) => {
    await createClass(page, 'Backup Test');
    await goToGroups(page);
    await generateGroups(page);

    // Sæt et emne på den første gruppe, så vi kan se om emnekortet overlever.
    await page.evaluate(async () => {
        const st: any = await import('/src/js/modules/storage.js');
        const state: any = (window as any).appDebug.state;
        const groupName = state.storedStandardGroups[0].name;
        st.saveTopic(groupName, 'Liberalisme', 'S_');
        state.storedStandardGroups[0].topic = 'Liberalisme';
        st.saveGroupsToStorage();
    });

    // Gem en session, så historikken har noget at miste.
    await page.evaluate(async () => {
        const h: any = await import('/src/js/modules/history.js');
        h.saveCurrentSession('Modul 4', false);
    });

    const before = await page.evaluate(() => {
        const filename = (window as any).appDebug.state.currentClass.filename;
        return {
            filename,
            groups: localStorage.getItem(`grupdk_groups_${filename}`),
            topics: localStorage.getItem(`grupdk_topics_${filename}`),
            sessionCount: JSON.parse(localStorage.getItem(`grupdk_history_${filename}`) || '[]').length,
        };
    });
    expect(before.sessionCount).toBe(1);

    // ── Eksportér. Blobben fanges i stedet for at blive downloadet. ──
    await page.evaluate(() => {
        (window as any).__blobs = [];
        const originalCreateObjectURL = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (b: any) => { (window as any).__blobs.push(b); return originalCreateObjectURL(b); };
        // Undgå at browseren faktisk starter en download.
        HTMLAnchorElement.prototype.click = function () {};
    });

    await page.locator('.nav-tab').filter({ hasText: 'Import & backup' }).click();
    await page.getByRole('button', { name: 'Eksportér', exact: true }).click();
    await page.getByRole('button', { name: /Vælg alle/i }).click();
    await page.getByRole('button', { name: /Download backup/i }).click();

    await expect.poll(
        async () => await page.evaluate(() => (window as any).__blobs.length),
        { timeout: 15000 },
    ).toBeGreaterThan(0);
    const backup = await page.evaluate(
        async () => await (window as any).__blobs.at(-1).text());

    // Filen skal INDEHOLDE det den lover — ikke bare elevrækkerne.
    const payload = JSON.parse(backup)[0];
    expect(payload.groups.standard.length).toBeGreaterThan(0);
    expect(Object.values(payload.groupTopics)).toContain('Liberalisme');
    expect(payload.history).toHaveLength(1);
    expect(Object.keys(payload.sessions)).toHaveLength(1);

    // ── Ryd alt hvad klassen har af grupper, emner og historik. ──
    await page.evaluate((filename) => {
        Object.keys(localStorage)
            .filter(k => k.startsWith('grupdk_groups_') || k.startsWith('grupdk_topics_')
                || k.startsWith('grupdk_history_') || k.startsWith('grupdk_session_'))
            .forEach(k => localStorage.removeItem(k));
    }, before.filename);

    // ── Importér filen igen. ──
    await page.getByRole('button', { name: 'Importér', exact: true }).click();
    await page.getByRole('button', { name: 'Upload fil eller gendan backup' }).click();
    await page.setInputFiles('input[type=file]', {
        name: 'grupdk_backup.json',
        mimeType: 'application/json',
        buffer: Buffer.from(backup, 'utf-8'),
    });
    await page.getByRole('button', { name: /Importér Filer/i }).click();

    // Klassen findes allerede — vælg "Overskriv mine".
    await page.getByRole('button', { name: /Overskriv mine/i }).click();

    // ── Alt skal være tilbage. ──
    await expect.poll(async () => await page.evaluate((filename) =>
        localStorage.getItem(`grupdk_groups_${filename}`), before.filename), { timeout: 15000 }
    ).not.toBeNull();

    const after = await page.evaluate((filename) => {
        const hist = JSON.parse(localStorage.getItem(`grupdk_history_${filename}`) || '[]');
        return {
            groups: localStorage.getItem(`grupdk_groups_${filename}`),
            topics: localStorage.getItem(`grupdk_topics_${filename}`),
            sessionNames: hist.map((h: any) => h.name),
            // Payloaden skal kunne findes under det id listen peger på —
            // ellers er sessionen en blindgyde ("Kunne ikke hente session data!").
            hasPayloads: hist.every((h: any) => !!localStorage.getItem(`grupdk_session_${h.id}`)),
        };
    }, before.filename);

    expect(JSON.parse(after.groups!).standard).toEqual(JSON.parse(before.groups!).standard);
    expect(JSON.parse(after.topics!)).toEqual(JSON.parse(before.topics!));
    expect(after.sessionNames).toEqual(['Modul 4']);
    expect(after.hasPayloads).toBe(true);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// …OG KLASSEN SKAL HEDDE DET SAMME BAGEFTER.
//
// Testen ovenfor gendanner OVEN I klassen, som stadig står i listen — og der
// bliver navnet i menuen ikke rørt. Den situation backuppen er lavet til er
// den modsatte: en browser hvor klassen er VÆK, og hvor gendannelsen derfor
// opretter den forfra. Dér fandt updateClass() indtil 6/9 selv på et navn ud
// fra filnavnet, så "3.b Samfundsfag A" kom tilbage som "3_b_samfundsfag_a".
// Navnet ligger uden for klassens `content` og fulgte ikke med nogen af de
// felter, et gem skriver.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('En slettet klasse kommer tilbage under sit eget navn, ikke sit filnavn', async ({ page }) => {
    const CLASS_NAME = '3.b Samfundsfag A';
    await createClass(page, CLASS_NAME);

    await page.evaluate(() => {
        (window as any).__blobs = [];
        const original = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (b: any) => { (window as any).__blobs.push(b); return original(b); };
        HTMLAnchorElement.prototype.click = function () {};
    });

    await page.locator('.nav-tab').filter({ hasText: 'Import & backup' }).click();
    await page.getByRole('button', { name: 'Eksportér', exact: true }).click();
    await page.getByRole('button', { name: /Vælg alle/i }).click();
    await page.getByRole('button', { name: /Download backup/i }).click();

    await expect.poll(
        async () => await page.evaluate(() => (window as any).__blobs.length),
        { timeout: 15000 },
    ).toBeGreaterThan(0);
    const backup = await page.evaluate(
        async () => await (window as any).__blobs.at(-1).text());
    expect(JSON.parse(backup)[0].name).toBe(CLASS_NAME);

    // Klassen forsvinder helt — som i en ny browser, hvor filen er alt der er.
    await page.evaluate(() => {
        localStorage.clear();
        // Udgave-valget hører ikke til klassen: den gamle skærm skal stå fast.
        localStorage.setItem('grupper-udgave', 'gammel');
    });
    await page.reload();

    await page.locator('.nav-tab').filter({ hasText: 'Import & backup' }).click();
    await page.getByRole('button', { name: 'Importér', exact: true }).click();
    await page.getByRole('button', { name: 'Upload fil eller gendan backup' }).click();
    await page.setInputFiles('input[type=file]', {
        name: 'grupdk_backup.json',
        mimeType: 'application/json',
        buffer: Buffer.from(backup, 'utf-8'),
    });
    await page.getByRole('button', { name: /Importér Filer/i }).click();

    await expect.poll(async () => await page.evaluate(() =>
        JSON.parse(localStorage.getItem('grupdk_classes') || '[]').map((c: any) => c.name)),
        { timeout: 15000 },
    ).toEqual([CLASS_NAME]);

    // …og navnet skal også stå i klassevælgeren, ikke kun i lageret.
    await expect(page.locator('.class-trigger')).toContainText(CLASS_NAME);
});
