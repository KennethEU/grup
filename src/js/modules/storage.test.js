import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock py_bridge.js before importing storage.
// Nøglerne der skrives, samles op i `writtenKeys`: flere af testene handler om
// HVOR MANGE skrivninger en handling koster, ikke kun hvad der står bagefter.
const writtenKeys = [];
vi.mock('./py_bridge.js', () => ({
    safeStorageSet: (key, value) => {
        writtenKeys.push(key);
        localStorage.setItem(key, value);
        return true;
    },
}));

import { state } from './state.js';
import * as storage from './storage.js';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Storage Module Tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('storage', () => {
    beforeEach(() => {
        localStorage.clear();
        state.currentClass = {
            filename: 'test-class',
            name: 'Test Class',
            data: [{ Navn: 'Anna' }, { Navn: 'Bob' }],
            columns: ['Navn'],
        };
        state.storedStandardGroups = null;
        state.storedMatrixGroups = null;
    });

    // --- Topics ---

    describe('emner', () => {
        it('saveTopic og getTopic giver det samme tilbage', () => {
            storage.saveTopic('Group 1', 'Tema A', 'S_');
            expect(storage.getTopic('Group 1', 'S_')).toBe('Tema A');
        });

        it('getTopic svarer null for et emne, der mangler', () => {
            expect(storage.getTopic('missing', 'S_')).toBeNull();
        });

        it('saveTopic med tom tekst sletter emnet', () => {
            storage.saveTopic('Group 1', 'Tema', 'S_');
            storage.saveTopic('Group 1', '', 'S_');
            expect(storage.getTopic('Group 1', 'S_')).toBeNull();
        });

        it('emnerne hører til den aktuelle klasse', () => {
            storage.saveTopic('G1', 'Tema', 'S_');
            // Læs én gang, så kortet ligger i læsecachen. Et klasseskift
            // tømmer IKKE cachen — det er nøgletjekket i getTopicMap(), der
            // holder klasserne adskilt (fundet ved en mutationstest 2026-09-24:
            // uden den her linje blev tjekket aldrig prøvet).
            expect(storage.getTopic('G1', 'S_')).toBe('Tema');

            state.currentClass.filename = 'other-class';
            expect(storage.getTopic('G1', 'S_')).toBeNull();
        });
    });

    // --- replaceTopicsForPrefix: ÉN skrivning i stedet for N ---
    //
    // Kortet er ÉN nøgle i lageret. Skrives det én gang pr. gruppe, kan den
    // fjerde skrivning blive afvist alene og efterlade kortet halvt fra i dag
    // og halvt fra i forgårs. De fire tests her låser det fast: ét kald, én
    // skrivning, udrensningen med, og det andet prefix urørt.
    describe('replaceTopicsForPrefix', () => {
        it('skriver ALLE gruppers emner i én setItem', () => {
            writtenKeys.length = 0;
            storage.replaceTopicsForPrefix('S_', [
                { name: 'Group 1', topic: 'Alpha' },
                { name: 'Group 2', topic: 'Beta' },
                { name: 'Group 3', topic: 'Gamma' },
            ]);
            expect(writtenKeys).toEqual(['grupdk_topics_test-class']);
            expect(storage.getTopic('Group 2', 'S_')).toBe('Beta');
        });

        it('rydder emner ud for grupper der ikke er med længere', () => {
            storage.saveTopic('Group 9', 'Forældet', 'S_');
            storage.replaceTopicsForPrefix('S_', [{ name: 'Group 1', topic: 'Alpha' }]);
            expect(storage.getTopic('Group 9', 'S_')).toBeNull();
            expect(storage.getTopic('Group 1', 'S_')).toBe('Alpha');
        });

        it('rører ikke det andet prefix', () => {
            storage.saveTopic('MGroup 1', 'Matrix-emne', 'M_');
            storage.replaceTopicsForPrefix('S_', [{ name: 'Group 1', topic: 'Alpha' }]);
            expect(storage.getTopic('MGroup 1', 'M_')).toBe('Matrix-emne');
        });

        it('tomme og manglende emner skrives ikke som nøgler', () => {
            storage.replaceTopicsForPrefix('S_', [
                { name: 'Group 1', topic: '   ' },
                { name: 'Group 2', topic: null },
                { name: 'Group 3' },
            ]);
            expect(storage.getTopic('Group 1', 'S_')).toBeNull();
            expect(storage.getTopic('Group 2', 'S_')).toBeNull();
            expect(storage.getTopic('Group 3', 'S_')).toBeNull();
        });
    });

    // --- Groups ---

    describe('grupper', () => {
        it('saveGroupsToStorage og loadGroupsFromStorage giver det samme tilbage', () => {
            state.storedStandardGroups = [
                { name: 'Group 1', members: ['Anna', 'Bob'] },
            ];
            state.storedMatrixGroups = [
                { name: 'MGroup 1', members: ['Anna'] },
            ];

            storage.saveGroupsToStorage();
            const loaded = storage.loadGroupsFromStorage();

            expect(loaded.standard).toHaveLength(1);
            expect(loaded.standard[0].name).toBe('Group 1');
            expect(loaded.matrix).toHaveLength(1);
        });

        // Flaget "matrixen skal dannes forfra" levede kun i hukommelsen. Efter
        // en genindlæsning stod det på false, og den gamle matrix blev vist,
        // udskrevet og gemt som om den hørte til de nye stamgrupper.
        it('husker at matrixen er forældet til næste genindlæsning', () => {
            state.storedStandardGroups = [{ name: 'Group 1', members: ['Anna'] }];
            state.storedMatrixGroups = [{ name: 'MGroup 1', members: ['Anna'] }];
            state.matrixGroupsStale = true;

            storage.saveGroupsToStorage();
            state.matrixGroupsStale = false;

            expect(storage.loadGroupsFromStorage().matrixStale).toBe(true);
        });

        it('loadGroupsFromStorage svarer null, når intet er gemt', () => {
            expect(storage.loadGroupsFromStorage()).toBeNull();
        });

        it('saveGroupsToStorage gør intet uden currentClass', () => {
            state.currentClass = null;
            storage.saveGroupsToStorage(); // should not throw
        });
    });

    // --- Last Class Index ---

    describe('lastClassIndex', () => {
        it('gemmer og henter indekset', () => {
            storage.saveLastClassIndex(3);
            expect(storage.getLastClassIndex()).toBe(3);
        });

        it('er 0, når intet er sat', () => {
            expect(storage.getLastClassIndex()).toBe(0);
        });
    });

    // --- History ---

    describe('historik', () => {
        it('saveHistory og getHistory giver det samme tilbage', () => {
            const meta = [
                { id: 'abc', date: new Date().toISOString(), name: 'Session 1', type: 'STANDARD_ONLY' },
            ];
            storage.saveHistory(meta);
            const loaded = storage.getHistory();
            expect(loaded).toHaveLength(1);
            expect(loaded[0].name).toBe('Session 1');
        });

        it('getHistory svarer en tom liste, når intet er gemt', () => {
            expect(storage.getHistory()).toEqual([]);
        });

        it('getHistory svarer en tom liste uden currentClass', () => {
            state.currentClass = null;
            expect(storage.getHistory()).toEqual([]);
        });

        // Gyldig JSON i forkert form skal behandles som ulæselig JSON: en tom
        // liste. Før fik Historik-fanen en fejl ved `[...liste]`.
        it('getHistory svarer en liste, også når lageret har gyldig JSON i forkert form', () => {
            const key = `grupdk_history_${state.currentClass.filename}`;
            for (const raw of ['{"id":"x"}', 'null', '"tekst"', '42']) {
                localStorage.setItem(key, raw);
                expect(storage.getHistory()).toEqual([]);
            }
            localStorage.setItem(key, JSON.stringify([null, { id: 'ok' }, 'r1']));
            expect(storage.getHistory()).toEqual([{ id: 'ok' }]);
        });

        it('rydder selv poster ældre end 90 dage', () => {
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 91);

            const entries = [
                { id: 'old', date: oldDate.toISOString(), name: 'Old' },
                { id: 'new', date: new Date().toISOString(), name: 'New' },
            ];
            storage.saveHistory(entries);

            const result = storage.getHistory();
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('new');
        });

        it('holdes på højst 50 sessioner', () => {
            const entries = [];
            for (let i = 0; i < 55; i++) {
                const d = new Date();
                d.setMinutes(d.getMinutes() - i); // vary dates
                entries.push({
                    id: `session-${i}`,
                    date: d.toISOString(),
                    name: `Session ${i}`,
                });
            }
            storage.saveHistory(entries);

            const result = storage.getHistory();
            expect(result.length).toBeLessThanOrEqual(50);
        });
    });

    // --- Session Payloads ---

    describe('gemte sessioners data', () => {
        it('en gemt session kan hentes uændret', () => {
            const payload = {
                id: 'test-123',
                name: 'Test Session',
                groups: [{ name: 'G1', members: [] }],
            };
            storage.saveSessionPayload(payload);

            const loaded = storage.loadSessionPayload('test-123');
            expect(loaded.name).toBe('Test Session');
        });

        it('loadSessionPayload svarer null for en session, der mangler', () => {
            expect(storage.loadSessionPayload('nonexistent')).toBeNull();
        });

        it('deleteSessionPayload sletter dataene', () => {
            storage.saveSessionPayload({ id: 'del-test', name: 'X' });
            storage.deleteSessionPayload('del-test');
            expect(storage.loadSessionPayload('del-test')).toBeNull();
        });
    });

    // --- Cleanup ---
    // saveHistory auto-prunes — verify directly rather than through a wrapper.

    describe('saveHistory rydder selv op', () => {
        it('dropper poster ældre end MAX_HISTORY_AGE_DAYS', () => {
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 100);

            const entries = [
                { id: 'old1', date: oldDate.toISOString(), name: 'Old1' },
                { id: 'old2', date: oldDate.toISOString(), name: 'Old2' },
                { id: 'new1', date: new Date().toISOString(), name: 'New1' },
            ];

            storage.saveHistory(entries);
            const remaining = storage.getHistory();
            expect(remaining.length).toBe(1);
            expect(remaining[0].id).toBe('new1');
        });
    });
    describe('pruneHistoryMeta loftet på antal', () => {
        it('beholder en session uden læsbar dato, når loftet er ramt (den tæller som nyeste)', () => {
            // 50 sessioner med dato + én med ulæselig dato = 51 > loftet på 50.
            // Med en NaN-sammenligning i sorteringen var rækkefølgen tilfældig,
            // og en frisk session kunne blive smidt ud.
            const entries = [];
            for (let i = 0; i < 50; i++) {
                entries.push({ id: `d${i}`, date: new Date(Date.now() - i * 60000).toISOString() });
            }
            entries.push({ id: 'ukendt', date: 'ikke en dato' });

            const { kept, dropped } = storage.pruneHistoryMeta(entries);
            expect(kept.length).toBe(50);
            expect(kept.some(e => e.id === 'ukendt')).toBe(true);
            // Den ældste med dato er den, der ryger.
            expect(dropped.map(e => e.id)).toEqual(['d49']);
        });
    });
});
