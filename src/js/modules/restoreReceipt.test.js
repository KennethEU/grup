// Kvitteringens "Bemærk:"-del skal sige, hvor mange sessioner der kom med —
// ikke "historik kunne ikke gendannes", når 3 af 12 faktisk kom ind.
import { describe, expect, it } from 'vitest';
import { describePartialRestore } from './restoreReceipt.js';

const nameOf = (f) => ({ '3a.csv': '3.a', '2b.csv': '2.b' })[f] || f;

describe('describePartialRestore', () => {
    it('nævner tallet, når nogle sessioner kom med', () => {
        expect(describePartialRestore([
            { filename: '3a.csv', parts: ['historik'], sessionsRestored: 3, sessionsMissing: 9 },
        ], nameOf)).toEqual(['for 3.a kom kun 3 af de 12 gemte sessioner med']);
    });

    it('siger "ingen af", når ingen kom med', () => {
        expect(describePartialRestore([
            { filename: '3a.csv', parts: ['historik'], sessionsRestored: 0, sessionsMissing: 12 },
        ], nameOf)).toEqual(['for 3.a kom ingen af de 12 gemte sessioner med']);
    });

    it('ental, når der kun var én session', () => {
        expect(describePartialRestore([
            { filename: '3a.csv', parts: ['historik'], sessionsRestored: 0, sessionsMissing: 1 },
        ], nameOf)).toEqual(['for 3.a kom den gemte session ikke med']);
    });

    it('andre dele nævnes stadig, og historik kun én gang', () => {
        expect(describePartialRestore([
            { filename: '3a.csv', parts: ['emner', 'historik'], sessionsRestored: 3, sessionsMissing: 9 },
        ], nameOf)).toEqual([
            'for 3.a kom kun 3 af de 12 gemte sessioner med',
            'for 3.a kunne emner ikke gendannes',
        ]);
    });

    it('uden tal (fx en ulæselig liste i filen) bruges det gamle ord', () => {
        expect(describePartialRestore([
            { filename: '3a.csv', parts: ['historik'], sessionsRestored: 0, sessionsMissing: 0 },
            { filename: '2b.csv', parts: ['grupper, emner eller historik'] },
        ], nameOf)).toEqual([
            'for 3.a kunne historik ikke gendannes',
            'for 2.b kunne grupper, emner eller historik ikke gendannes',
        ]);
    });

    it('flere dele bindes sammen med "og", og ryddede grupper nævnes (121. gennemsyn)', () => {
        expect(describePartialRestore([
            { filename: '3a.csv', parts: ['nogle regler', 'grupper'], replacedGroups: true },
        ], nameOf)).toEqual([
            'for 3.a kunne nogle regler og grupper ikke gendannes, og klassens grupper her er fjernet sammen med den gamle udgave',
        ]);
    });

    it('tåler en tom eller manglende liste', () => {
        expect(describePartialRestore(undefined)).toEqual([]);
        expect(describePartialRestore([])).toEqual([]);
    });
});
