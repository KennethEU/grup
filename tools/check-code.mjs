// check-code.mjs — ni statiske tjek af Grupper-kildekoden.
//
// HVORFOR DEN FINDES: unit-testene dækker js/modules/, men INGEN af de 40
// Vue-komponenter. En halv omdøbning i en komponent — navnet rettet i
// <script setup>, glemt i skabelonen — giver hverken en testfejl eller en
// fejl i buildet. Den giver en tom skærm hos en lærer.
//
// Det skete: `useDrawerClamp` fik sin parameter omdøbt fra `gap` til `margin`
// i signaturen, men ikke i kroppen. `ReferenceError: gap is not defined` blev
// slugt af den async funktion, og skufferne holdt op med at blive skubbet ind
// på skærmen. Fejlen levede fra 27. august til 1. september 2026 uden at nogen
// så den — heller ikke i det byggede output, der lå på webhotellet.
//
// De ni tjek:
//   1. syntaks       — parser hver fil (og hver <script>-blok i .vue)
//   2. ukendte navne — identifikatorer der ikke er erklæret nogen steder i filen
//   3. skabeloner    — udtryk i <template> som <script setup> ikke kender
//   4. imports       — navngivne imports uden en tilsvarende eksport
//   5. CSS-tokens    — var(--x) uden fallback, hvor --x aldrig er defineret
//   6. skrift-tokens — var(--x, …) på en font-linje, hvor fallbacken altid vinder
//   7. farve-syntaks — oklch(from …), som ældre Safari/Firefox smider væk
//   8. falske tokens — var(--x, …), hvor --x aldrig er defineret (fallbacken vinder altid)
//   9. døde tokens   — --x defineres, men læses ingen steder
//
// Tjek 5 kom til efter samme slags fund som ovenfor, bare i stilarket:
// `var(--text-sub)` (findes ikke — det hedder --text-subtle) og
// `var(--shadow-primary)` (det hedder --primary-glow). Et ukendt token gør
// HELE erklæringen ugyldig, tavst: brand-underteksten arvede sin farve og
// stod lige så mørk som "dida.dk" ved siden af, og "Gem"-pillens box-shadow
// blev til `none`. Ingen fejl i konsollen, intet i buildet.
//
// Kør: npm run check
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseSFC, compileScript, babelParse } from '@vue/compiler-sfc';

const ROOT = path.resolve(import.meta.dirname, '..', 'src');

// Ting der findes i browseren eller i vitest, og som derfor ikke er "ukendte".
const GLOBALS = new Set([
    'window', 'document', 'console', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage',
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame',
    'queueMicrotask', 'structuredClone', 'fetch', 'DOMParser', 'Blob', 'File', 'FileReader', 'FormData', 'URL', 'URLSearchParams',
    'Worker', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'AbortController', 'Event', 'CustomEvent',
    'PointerEvent', 'MouseEvent', 'KeyboardEvent', 'StorageEvent', 'Request', 'Response',
    'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Date', 'RegExp', 'Error', 'TypeError', 'RangeError',
    'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Symbol', 'Proxy', 'Reflect', 'BigInt', 'Intl', 'globalThis',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
    'undefined', 'NaN', 'Infinity', 'alert', 'confirm', 'prompt', 'crypto', 'performance', 'process', 'import', 'arguments',
    'Uint8Array', 'Int32Array', 'Float64Array', 'ArrayBuffer', 'TextEncoder', 'TextDecoder', 'atob', 'btoa', 'HTMLElement', 'Node', 'Element',
    'getComputedStyle', 'matchMedia', 'self', 'postMessage', 'importScripts', 'indexedDB',
    'describe', 'it', 'test', 'expect', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll', 'vi', 'global',
    'defineProps', 'defineEmits', 'defineExpose', 'defineModel', 'defineOptions', 'withDefaults', 'useSlots', 'useAttrs',
    '__APP_VERSION__', 'require', 'module', 'exports',
]);

// $attrs osv. er Vues egne — de findes på _ctx og er ikke fejl.
const VUE_CTX = new Set(['$attrs', '$slots', '$props', '$emit', '$el', '$refs', '$nextTick', '$forceUpdate', '$options', '$parent', '$root', '$data', '$watch']);

function files(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return e.name === 'vendor' ? [] : files(full);
        return /\.(js|vue)$/.test(e.name) ? [full] : [];
    });
}

/** <script>-blokkene i en fil, med linjeforskydning så fejl peger rigtigt. */
function scriptBlocks(file, src) {
    if (!file.endsWith('.vue')) return [{ content: src, offset: 0 }];
    const { descriptor } = parseSFC(src, { filename: file });
    return [descriptor.script, descriptor.scriptSetup].filter(Boolean)
        .map(b => ({ content: b.content, offset: b.loc.start.line - 1 }));
}

const problems = [];
const rel = f => path.relative(path.resolve(ROOT, '..'), f);

// ── 1+2: syntaks og ukendte navne ────────────────────────────────────────
function walk(node, parent, key, visit) {
    if (!node || typeof node.type !== 'string') return;
    if (visit(node, parent, key) === false) return;
    for (const k of Object.keys(node)) {
        if (k === 'loc' || k.includes('omment')) continue;
        const v = node[k];
        if (Array.isArray(v)) v.forEach(c => walk(c, node, k, visit));
        else if (v && typeof v.type === 'string') walk(v, node, k, visit);
    }
}

function declaredAndUsed(ast) {
    const declared = new Set();
    const used = new Map();

    const pattern = (n) => {
        if (!n) return;
        if (n.type === 'Identifier') declared.add(n.name);
        else if (n.type === 'ObjectPattern') n.properties.forEach(p => pattern(p.type === 'RestElement' ? p.argument : p.value));
        else if (n.type === 'ArrayPattern') n.elements.forEach(pattern);
        else if (n.type === 'AssignmentPattern') pattern(n.left);
        else if (n.type === 'RestElement') pattern(n.argument);
    };

    walk(ast, null, null, (n, parent, key) => {
        switch (n.type) {
            case 'VariableDeclarator': pattern(n.id); break;
            case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression':
            case 'ObjectMethod': case 'ClassMethod':
                if (n.id) declared.add(n.id.name);
                n.params.forEach(pattern);
                break;
            case 'ClassDeclaration': case 'ClassExpression':
                if (n.id) declared.add(n.id.name); break;
            case 'CatchClause': pattern(n.param); break;
            case 'ImportDefaultSpecifier': case 'ImportNamespaceSpecifier':
                declared.add(n.local.name); return false;
            case 'ImportSpecifier': declared.add(n.local.name); return false;
            case 'Identifier': {
                if (parent) {
                    const isProp = /MemberExpression$/.test(parent.type) && key === 'property' && !parent.computed;
                    const isKey = /^(Object|Class)(Property|Method)$/.test(parent.type) && key === 'key' && !parent.computed;
                    if (isProp || isKey) return false;
                    if (/^(Labeled|Break|Continue)/.test(parent.type)) return false;
                    if (parent.type === 'ExportSpecifier') return false;
                    // `import.meta` — `meta` er ikke et navn i vores kode.
                    if (parent.type === 'MetaProperty') return false;
                }
                if (!used.has(n.name)) used.set(n.name, n.loc?.start.line);
                return false;
            }
        }
    });
    return { declared, used };
}

const allFiles = files(ROOT);
const parsed = new Map();

for (const file of allFiles) {
    const src = fs.readFileSync(file, 'utf8');
    for (const { content, offset } of scriptBlocks(file, src)) {
        let ast;
        try {
            ast = babelParse(content, { sourceType: 'module', plugins: ['jsx'] });
        } catch (e) {
            problems.push(`${rel(file)}: syntaksfejl — ${e.message}`);
            continue;
        }
        parsed.set(file, ast.program);
        const { declared, used } = declaredAndUsed(ast.program);
        for (const [name, line] of used) {
            if (declared.has(name) || GLOBALS.has(name)) continue;
            problems.push(`${rel(file)}:${(line || 0) + offset}: "${name}" er ikke erklæret nogen steder i filen`);
        }
    }
}

// ── 3: skabelon-udtryk uden modstykke i <script setup> ───────────────────
for (const file of allFiles.filter(f => f.endsWith('.vue'))) {
    const src = fs.readFileSync(file, 'utf8');
    const { descriptor } = parseSFC(src, { filename: file });
    if (!descriptor.scriptSetup || !descriptor.template) continue;
    let out;
    try { out = compileScript(descriptor, { id: file, inlineTemplate: true }); }
    catch (e) { problems.push(`${rel(file)}: skabelonen kunne ikke oversættes — ${e.message}`); continue; }
    // Vue oversætter alt den ikke fandt i setup til `_ctx.X`. I en
    // <script setup>-komponent uden Options-API findes de navne ikke.
    const unknown = new Set();
    for (const m of out.content.matchAll(/_ctx\.([A-Za-z_$][\w$]*)/g)) {
        if (!VUE_CTX.has(m[1])) unknown.add(m[1]);
    }
    for (const name of unknown) problems.push(`${rel(file)}: skabelonen bruger "${name}", som <script setup> ikke kender`);
}

// ── 4: navngivne imports uden eksport i målfilen ─────────────────────────
function exportsOf(file) {
    const program = parsed.get(file);
    if (!program) return null;
    const names = new Set();
    for (const n of program.body) {
        if (n.type === 'ExportNamedDeclaration') {
            if (n.declaration) {
                if (n.declaration.type === 'VariableDeclaration') {
                    n.declaration.declarations.forEach(d => { if (d.id.type === 'Identifier') names.add(d.id.name); });
                } else if (n.declaration.id) names.add(n.declaration.id.name);
            }
            n.specifiers.forEach(s => names.add(s.exported.name || s.exported.value));
        } else if (n.type === 'ExportDefaultDeclaration') names.add('default');
    }
    return names;
}

for (const file of allFiles) {
    const program = parsed.get(file);
    if (!program) continue;
    for (const n of program.body) {
        if (n.type !== 'ImportDeclaration' || !n.source.value.startsWith('.')) continue;
        // Vites "?raw" (filen som tekst) er en instruks til bundleren, ikke en
        // del af filnavnet — se lectio.test.js.
        const target = path.resolve(path.dirname(file), n.source.value.replace(/\?.*$/, ''));
        if (!fs.existsSync(target)) {
            problems.push(`${rel(file)}: importerer fra "${n.source.value}", som ikke findes`);
            continue;
        }
        const exported = exportsOf(target);
        if (!exported) continue;
        for (const s of n.specifiers) {
            if (s.type !== 'ImportSpecifier') continue;
            const name = s.imported.name || s.imported.value;
            if (!exported.has(name)) problems.push(`${rel(file)}: "${name}" findes ikke i ${n.source.value}`);
        }
    }
}

// ── 5: var(--token) uden fallback, hvor tokenet aldrig er defineret ──────
//
// Rå tekst, ikke AST: tokens optræder i .css, i <style>-blokke, i inline
// style-attributter OG i JS-strenge (`el.style.color = 'var(--red)'`).
//
// Kun brug UDEN fallback tælles. `var(--sans, system-ui)` er en bevidst
// valgfri finesse — falder tokenet væk, er der stadig en værdi. Uden komma
// er der ingen plan B.
{
    const cssFiles = (function scan(dir) {
        return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) return e.name === 'vendor' ? [] : scan(full);
            return /\.(js|vue|css)$/.test(e.name) && !/\.test\.js$/.test(e.name) ? [full] : [];
        });
    })(ROOT);

    const defined = new Set();
    const sources = new Map();
    for (const file of cssFiles) {
        const src = fs.readFileSync(file, 'utf8');
        sources.set(file, src);
        for (const m of src.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) defined.add(m[1]);
    }
    for (const [file, src] of sources) {
        src.split('\n').forEach((line, i) => {
            for (const m of line.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*\)/g)) {
                if (defined.has(m[1])) continue;
                problems.push(`${rel(file)}:${i + 1}: var(${m[1]}) — tokenet er ikke defineret nogen steder, og der er ingen fallback`);
            }
            // ── 6: skrift-linjer, hvor fallbacken ALTID vinder ──────────
            //
            // Tjek 5 lader `var(--x, fallback)` passere, fordi der er en
            // plan B. På en skrift-linje er plan B bare ikke appens skrift:
            // `font: 500 12px var(--sans, system-ui)` stod i det røde banner
            // og i "N beskeder vises ikke igen", og --sans findes ikke i
            // Grupper — så de stod altid i systemskriften, ikke i Plus Jakarta
            // Sans. Og `var(--font-sans, inherit)` i en `font:`-genvej er
            // værre: `inherit` er ugyldigt dér, så hele linjen blev smidt
            // væk, og både vægt og størrelse forsvandt (fundet 23/9).
            if (!/^\s*font(-family)?\s*:/.test(line)) return;
            for (const m of line.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*,\s*([^)]*)\)/g)) {
                if (/^\s*font\s*:/.test(line) && /^\s*inherit\s*$/.test(m[2])) {
                    problems.push(`${rel(file)}:${i + 1}: var(${m[1]}, inherit) i en font-genvej er ugyldig — hele linjen smides væk`);
                } else if (!defined.has(m[1]) && !/mono/.test(m[2])) {
                    // Monospace-fallbacken er bevidst: Grupper har ingen
                    // egen mono-skrift, så ui-monospace ER den ønskede.
                    problems.push(`${rel(file)}:${i + 1}: var(${m[1]}, …) på en skrift-linje — tokenet findes ikke, så appens skrift bruges aldrig`);
                }
            }
        });
        // ── 7: relativ farvesyntaks — `oklch(from var(--x) l c h / 14%)` ──
        //
        // Kom først i Safari 18 og Firefox 128. I en ældre browser er hele
        // erklæringen ugyldig og falder væk — tavst. Grupper havde den to
        // steder (advarslerne i Del-menuen og i kørselsmenuen), som så stod
        // uden farve. `color-mix(in srgb, var(--x) 14%, transparent)` giver
        // de samme pixels og virker fra Safari 16.2 (målt 24/9).
        src.split('\n').forEach((line, i) => {
            if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // kommentarer må nævne den
            if (/\b(oklch|oklab|lch|lab|rgb|hsl|hwb|color)\(\s*from\s+(var\(|#|currentcolor|[a-z]+\()/i.test(line)) {
                problems.push(`${rel(file)}:${i + 1}: relativ farvesyntaks (… from …) — brug color-mix, den virker i ældre Safari/Firefox`);
            }
        });
    }

    // ── 8+9: tokens, der kun ser ud til at virke — og tokens, ingen bruger ──
    //
    // 8: `var(--x, fallback)`, hvor --x aldrig er defineret. Tjek 5 lader
    // den passere, fordi der ER en værdi — men det er altid fallbacken, og
    // linjen lyver om, hvor farven kommer fra. Grupper havde seks: Rolig-navne
    // fra dida.dk (--r-m, --r-l, --rule-ctl, --shadow-m, --accent), som
    // Grupper ikke har, og --color-error-light, hvis fallback var en
    // klarere rød end appens --color-error. Skriv værdien direkte, eller brug
    // Grupper-tokenet (--radius-md, --color-error-hover …).
    //
    // 9: tokens, der defineres, men aldrig læses. Efter det mørke tema blev
    // slettet (2/11) stod 15 af dem tilbage i rolig-tema.css og style.css og
    // lignede en del af systemet. Slet dem.
    //
    // Kommentarer tæller ikke med: HintsStack.vue fortæller om en gammel
    // `var(--sans, system-ui)`, og den skal ikke tælle som brug.
    const stripped = new Map();
    for (const [file, src] of sources) {
        stripped.set(file, src
            .replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' '))
            .replace(/^\s*\/\/.*$/gm, ''));
    }
    const definedLive = new Set();
    const used = new Set();
    for (const src of stripped.values()) {
        for (const m of src.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) definedLive.add(m[1]);
        // Sat fra skabelonen eller JS: `:style="{ '--fit': … }"`, setProperty('--list-dur', …)
        // … og læst fra JS (getPropertyValue('--x')) — så tæller de også som brugt
        for (const m of src.matchAll(/['"`](--[a-zA-Z0-9-]+)['"`]/g)) { definedLive.add(m[1]); used.add(m[1]); }
        for (const m of src.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) used.add(m[1]);
    }
    for (const [file, src] of stripped) {
        src.split('\n').forEach((line, i) => {
            if (/^\s*font(-family)?\s*:/.test(line)) return; // tjek 6 tager skrift-linjerne
            for (const m of line.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*,/g)) {
                if (definedLive.has(m[1])) continue;
                problems.push(`${rel(file)}:${i + 1}: var(${m[1]}, …) — tokenet findes ikke i Grupper, så fallbacken bruges altid; skriv værdien direkte`);
            }
            for (const m of line.matchAll(/^\s*(--[a-zA-Z0-9-]+)\s*:/g)) {
                if (used.has(m[1])) continue;
                problems.push(`${rel(file)}:${i + 1}: ${m[1]} defineres, men bruges ingen steder`);
            }
        });
    }
}

if (problems.length === 0) {
    console.log(`check-code: ${allFiles.length} filer — intet at bemærke`);
} else {
    problems.forEach(p => console.log(p));
    console.log(`\ncheck-code: ${problems.length} problem(er)`);
    process.exit(1);
}
