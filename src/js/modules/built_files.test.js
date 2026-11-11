// @vitest-environment node
// Det BYGGEDE program: findes hver fil, det peger på?
//
// public/grupper committes med hånden efter `npm run build`. Kommer
// index.html med fra ét build og assets/ fra et andet (en halv commit, en
// fil der ikke kom med op), får læreren en hvid side — eller en side, der
// først svigter, når en del (Excel, Hjælp, motoren) skal hentes.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

const root = new URL('../../../../public/grupper/', import.meta.url);
const dir = new URL('assets/', root);
const files = new Set(readdirSync(dir));
const scripts = [...files].filter(name => name.endsWith('.js'));
// Vites filnavne: navn-HASH.js/.css, hvor hashen er 8 tegn
const HASHED = /[\w.-]+-[\w-]{8}\.(?:js|css)\b/g;

describe('filerne i det byggede program', () => {
    it('hver fil, index.html henter, findes', () => {
        const html = readFileSync(new URL('index.html', root), 'utf8');
        const wanted = [...html.matchAll(/assets\/([^"'?#]+)/g)].map(m => m[1]);
        expect(wanted.some(name => /^index-.*\.js$/.test(name))).toBe(true);
        for (const name of wanted) expect(files.has(name), name).toBe(true);
    });

    // Deploy sker også med FTP, og et filter på `__*` æder en fil med "__"
    // i navnet (CLAUDE.md). Vites hash kunne før selv give "__"; nu er den
    // base36 (vite.config.js), men et "__" kan også komme fra et modulnavn.
    it('intet filnavn i det byggede program har "__"', () => {
        const all = [];
        const walk = (url, prefix) => {
            for (const entry of readdirSync(url, { withFileTypes: true })) {
                const path = prefix + entry.name;
                all.push(path);
                if (entry.isDirectory()) walk(new URL(entry.name + '/', url), path + '/');
            }
        };
        walk(root, '');
        expect(all.length).toBeGreaterThan(10);
        expect(all.filter(path => path.split('/').pop().includes('__'))).toEqual([]);
    });

    it('hashen i filnavnene er base36 (ingen "_" at danne "__" med)', () => {
        const hashed = [...files].filter(name => /\.(js|css)$/.test(name));
        expect(hashed.length).toBeGreaterThan(10);
        for (const name of hashed) {
            expect(name, name).toMatch(/-[a-z0-9]{8}\.(js|css)$/);
        }
    });

    it.each(scripts)('hver del, %s henter, findes', (script) => {
        const code = readFileSync(new URL(script, dir), 'utf8');
        for (const name of new Set(code.match(HASHED) || [])) {
            // Kun navne, der ligner Vites egne (fx ikke "xlsx-0.20.3.js" i en kommentar)
            if (!/^[A-Za-z][\w.-]*-[\w-]{8}\.(js|css)$/.test(name)) continue;
            expect(files.has(name), `${script} → ${name}`).toBe(true);
        }
    });
});
