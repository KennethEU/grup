// @vitest-environment node
// Det BYGGEDE program: findes motorens tråde, som det henter?
//
// Motoren starter selv sine forsøgs-tråde inde i sin egen tråd
// (motor/engine/solve.js → worker.js). Fra 50a7ac52 til 3/11 2026 stod
// navnet på den indlejrede trådfil i engine-worker-XXXX.js, men Vite skrev
// ikke filen ud (siden importerede selv engine.js til check()). Motoren faldt
// så stille tilbage til ÉN kerne — ingen fejl, bare langsommere. check() kører
// nu i engine-worker.js; denne test fanger det, hvis filen mangler igen.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../../../../public/grupper/assets/', import.meta.url);
const files = new Set(readdirSync(dir));
const engineWorkers = [...files].filter(name => /^engine-worker-.*\.js$/.test(name));

describe('motorens tråde i det byggede program', () => {
    it('der er præcis én engine-worker', () => {
        expect(engineWorkers).toHaveLength(1);
    });

    it('hver trådfil, engine-worker henter, findes', () => {
        const code = readFileSync(new URL(engineWorkers[0], dir), 'utf8');
        const wanted = [...new Set(code.match(/\bworker-[A-Za-z0-9_-]+\.js\b/g) || [])];
        expect(wanted.length).toBeGreaterThan(0);
        for (const name of wanted) expect(files.has(name), name).toBe(true);
    });

    it('siden selv indlæser ikke motoren (så ville trådfilen mangle igen)', () => {
        const main = [...files].filter(name => /^index-.*\.js$/.test(name));
        for (const name of main) {
            expect(readFileSync(new URL(name, dir), 'utf8')).not.toMatch(/engine-(?!worker-)[A-Za-z0-9_-]{6,}\.js/);
        }
    });
});
