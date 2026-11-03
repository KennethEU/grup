// rename-identifier.mjs — omdøb navne i kode uden at røre kommentarer eller UI-tekst.
//
// HVORFOR IKKE SØG-OG-ERSTAT: kodebasen har engelsk kode og dansk tekst i
// samme fil. `navn` står både som variabel, i en kommentar og i en knaptekst.
// En søg-og-erstat rammer alle tre. Værktøjet her går gennem syntakstræet og
// rører kun de steder, hvor navnet ER kode.
//
// Brug:
//   node tools/rename-identifier.mjs <fil> gammel=ny [gammel=ny …]
//   node tools/rename-identifier.mjs <fil> --props gammel=ny   (egenskabsnavne)
//
// Uden --props omdøbes BINDINGER (variabler, parametre, funktioner) og deres
// brug. Med --props omdøbes EGENSKABSNAVNE (obj.x og { x: … }) — kun
// forsvarligt når objektet ikke også ligger i localStorage; ellers skal der
// en migrering til, så gamle gemte data stadig kan læses.
//
// FIRE FÆLDER, de tre første fundet den hårde vej 2026-09-01, den fjerde
// 2026-09-07 da .ts-filerne kom med:
//   1. `import { foo }` har SAMME område for det importerede og det lokale
//      navn. To redigeringer oven i hinanden åd kommaet efter navnet.
//      Derfor udluges dubletter på område.
//   2. Objekt-genveje: `{ navn }` bliver til `{ navn: name }`, så en nøgle
//      der måske er data, står urørt.
//   3. Skabelonen i en .vue-fil røres IKKE. Kør `npm run check` bagefter —
//      den fanger navne, skabelonen stadig peger på.
//
// .js, .vue og .ts kan alle køres igennem. Vælg et nyt navn der IKKE i
// forvejen står i filen — værktøjet afbryder hellere end at smelte to ting
// sammen, og i en spec står `name` allerede som Playwright-option.
import fs from 'node:fs';
import { parse as parseSFC, babelParse } from '@vue/compiler-sfc';

let [file, ...pairs] = process.argv.slice(2);
if (!file || pairs.length === 0) {
    console.error('Brug: node tools/rename-identifier.mjs <fil> [--props] gammel=ny …');
    process.exit(2);
}
const propsMode = pairs[0] === '--props';
if (propsMode) pairs = pairs.slice(1);
const map = new Map(pairs.map(p => p.split('=')));

const src = fs.readFileSync(file, 'utf8');
const blocks = file.endsWith('.vue')
    ? (() => {
        const { descriptor } = parseSFC(src, { filename: file });
        return [descriptor.script, descriptor.scriptSetup].filter(Boolean)
            .map(b => ({ content: b.content, offset: b.loc.start.offset }));
    })()
    : [{ content: src, offset: 0 }];

const edits = [];
for (const { content, offset } of blocks) {
    // Et nyt navn der allerede er i brug i filen, ville smelte to forskellige
    // ting sammen. Stop hellere og lad mennesket vælge et andet navn.
    if (!propsMode) {
        const codeOnly = content.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
        for (const [, to] of map) {
            if (new RegExp(`\\b${to}\\b`).test(codeOnly)) {
                console.error(`AFBRUDT: "${to}" findes allerede i ${file}`);
                process.exit(1);
            }
        }
    }

    // TypeScript og JSX kan ikke slås til samtidig i en .ts-fil: dér er
    // `<T>x` en type-påstand, ikke et element. e2e-specsene er .ts og bruger
    // `(window as any)` — uden pluginet stopper parseren på den linje, og
    // ALLE testfiler var derfor uden for værktøjets rækkevidde.
    const plugins = /\.tsx?$/.test(file) ? ['typescript'] : ['jsx'];
    const ast = babelParse(content, { sourceType: 'module', plugins });
    (function walk(n, parent, key) {
        if (!n || typeof n.type !== 'string') return;
        if (n.type === 'Identifier' && map.has(n.name)) {
            const isProp = /MemberExpression$/.test(parent?.type || '') && key === 'property' && !parent.computed;
            const isKey = /^(Object|Class)(Property|Method)$/.test(parent?.type || '') && key === 'key' && !parent.computed;
            const wanted = propsMode ? (isProp || isKey) : (!isProp && !isKey);
            if (wanted) {
                const shorthand = !propsMode && parent?.type === 'ObjectProperty' && parent.shorthand;
                // FÆLDE 4: i TypeScript rækker et Identifier-node HEN OVER sin
                // typeannotering — `tekst: string` er ét node fra `t` til `g`.
                // Skrev vi hele det område om, forsvandt `: string` sammen med
                // navnet, og typen var lydløst væk. Skriv kun navnets egne
                // tegn; annoteringen (og et `?`) bliver stående.
                const nameEnd = n.start + n.name.length;
                edits.push({
                    start: offset + n.start,
                    end: offset + nameEnd,
                    text: shorthand ? `${n.name}: ${map.get(n.name)}` : map.get(n.name),
                });
            }
            return;
        }
        for (const k of Object.keys(n)) {
            if (k === 'loc' || k.includes('omment')) continue;
            const v = n[k];
            if (Array.isArray(v)) v.forEach(c => walk(c, n, k));
            else if (v && typeof v.type === 'string') walk(v, n, k);
        }
    })(ast.program, null, null);
}

// Fælde 1: samme område må kun redigeres én gang.
const seen = new Set();
const unique = edits.filter(e => {
    const k = `${e.start}:${e.end}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
});

unique.sort((a, b) => b.start - a.start);
let out = src;
for (const e of unique) out = out.slice(0, e.start) + e.text + out.slice(e.end);
fs.writeFileSync(file, out);
console.log(`${file}: ${unique.length} forekomster omdøbt`);
