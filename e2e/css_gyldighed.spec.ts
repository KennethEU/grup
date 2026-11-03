import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

/**
 * Hver CSS-erklæring i kilden prøves af i den browser testen kører i.
 *
 * HVORFOR DEN FINDES: en erklæring browseren ikke forstår, falder lydløst
 * bort. Ingen fejl i konsollen, intet i buildet, ingen rød test — kun et
 * layout der ikke ser ud som meningen var, og som ingen kobler til den
 * ændring der lavede det.
 *
 * Det skete 27/8: en omdøbning af JS-variablen `margin` til `gap` i
 * RunHistoryMenu.vue ramte også komponentens <style>-blok, og seks
 * `margin`-erklæringer blev til `gap: 6px 6px 2px`, `gap-inline: 3px` og
 * fire mere. `gap` tager højst to værdier og virker kun i en flex/grid-
 * beholder — de seks elementer er <p> og <span> — så alle seks var ugyldige.
 * Kørselsmenuens afstande stod med browserens egne afsnitsmargener fra den
 * dag til 9/9, hvor denne fil kom til.
 *
 * Og fordi den kører i ALLE TRE browsere, fanger den også den anden slags:
 * en regel der kun virker i én motor. `user-select: none` uden sin
 * `-webkit-`-makker var slået fra i WebKit, og `.hide-arrows`-fundet 8/9 var
 * samme familie.
 *
 * HVAD DEN IKKE PRØVER:
 *   - vendor-prefiksede egenskaber (`-webkit-`, `-moz-`): de er MED VILJE kun
 *     forstået af én motor. Og står en prefikset udgave på linjen LIGE FØR
 *     den ustandardiserede (`-webkit-user-select` og så `user-select`), er
 *     parret bevidst: så springes den ustandardiserede også over i den
 *     motor, der endnu ikke kender den. Derfor: prefiks FØRST, standard
 *     bagefter — den rækkefølge er også den rigtige i CSS.
 *   - erklæringer med `var()` eller `env()`: værdien kendes først i sammenhæng,
 *     og et ukendt token fanges allerede af `npm run check` (tjek 5).
 *   - `!important`: CSS.supports() tager ikke imod det, så det klippes af.
 *   - erklæringer der løber over flere linjer (værdien slutter ikke med `;`
 *     på samme linje). Et hul, ikke en falsk melding: de bliver sprunget
 *     over, ikke godkendt. Skriv en ny regel på én linje, hvis den skal
 *     dækkes.
 */

const SRC = resolve(import.meta.dirname, '..', 'src');

// Bevidst pynt, som en motor endnu ikke kender: den falder bort uden at
// ødelægge noget, fordi browserens standard er et fint resultat. Står her
// med navn, så listen ikke vokser stille. `text-wrap: pretty` (pænere
// linjeskift i brødtekst) kender Firefox ikke endnu (fundet 2/11 2026) —
// teksten ombrydes så helt almindeligt.
const PROGRESSIVE = new Set(['text-wrap: pretty']);

function styleFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const full = join(dir, e.name);
        if (e.isDirectory()) return ['vendor', '__tests__'].includes(e.name) ? [] : styleFiles(full);
        return ['.vue', '.css'].includes(extname(e.name)) && !e.name.includes('.test.') ? [full] : [];
    });
}

/** Alle erklæringer i kilden, med fil og linjenummer i selve filen. */
function declarations() {
    const out: { file: string; line: number; prop: string; value: string }[] = [];
    for (const file of styleFiles(SRC)) {
        const src = readFileSync(file, 'utf8');
        // Linjenumre skal pege i FILEN, ikke i et udtræk — derfor gås hele
        // filen igennem, og for .vue holdes styr på om vi er inde i <style>.
        const isCss = file.endsWith('.css');
        let inStyle = isCss;
        let inComment = false;
        let prevProp: string | null = null;
        src.split('\n').forEach((raw, i) => {
            if (!isCss) {
                if (/<style[^>]*>/.test(raw)) { inStyle = true; return; }
                if (/<\/style>/.test(raw)) { inStyle = false; return; }
            }
            if (!inStyle) return;
            let line = raw;
            if (inComment) {
                const end = line.indexOf('*/');
                if (end === -1) return;
                line = line.slice(end + 2);
                inComment = false;
            }
            line = line.replace(/\/\*.*?\*\//g, '');
            if (line.includes('/*')) { line = line.slice(0, line.indexOf('/*')); inComment = true; }

            const m = line.match(/^\s*([a-zA-Z-][a-zA-Z0-9-]*)\s*:\s*([^;{}]+);/);
            if (!m) { prevProp = null; return; }
            const prop = m[1];
            const prefixed = prevProp;
            prevProp = prop;
            if (prop.startsWith('--') || prop.startsWith('-webkit-') || prop.startsWith('-moz-')) return;
            // Har egenskaben lige fået sin prefiksede makker ovenfor, er den
            // med vilje skrevet to gange — se forklaringen øverst.
            if (prefixed === `-webkit-${prop}` || prefixed === `-moz-${prop}`) return;
            const value = m[2].replace(/\s*!important\s*$/, '').trim();
            if (!value || /var\(|env\(/.test(value)) return;
            if (PROGRESSIVE.has(`${prop}: ${value}`)) return;
            out.push({ file: file.slice(SRC.length - 3), line: i + 1, prop, value });
        });
    }
    return out;
}

test('hver CSS-erklæring i kilden forstås af browseren', async ({ page }) => {
    const decls = declarations();
    // Et værn der ikke læser noget, består altid. Tallet er groft sat: det
    // skal fange en ødelagt udtrækning, ikke svinge med hver ny regel.
    expect(decls.length).toBeGreaterThan(2000);

    await page.setContent('<p>css</p>');
    const bad = await page.evaluate(
        (ds: any[]) => ds.filter(d => !CSS.supports(d.prop, d.value)),
        decls,
    );
    expect(
        bad.map(d => `${d.file}:${d.line}  ${d.prop}: ${d.value}`).join('\n'),
        'erklæringer browseren ikke forstår — de falder lydløst bort',
    ).toBe('');
});
