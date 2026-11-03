// Rangering af en tekstkolonne — "Lav < Middel < Høj".
//
// Fundet der ligger bag: "Ensartede" og "Balancér" kan kun arbejde med tal, så
// på en tekstkolonne gjorde de bogstaveligt talt ingenting (rettet 2026-08-24
// med en advarsel). Rangeringen er udvejen: læreren fortæller programmet
// rækkefølgen, og de tre tal-regler får en tal-kolonne at arbejde med.
//
// Det bærende valg testene holder fast i: rang-kolonnen lægges VED SIDEN AF
// tekstkolonnen, ikke i stedet for. Ellers ville Pythons lærervendte advarsler
// begynde at sige "2" i stedet for "Middel".
import { describe, it, expect } from 'vitest';
import { applyColumnOrders, RANK_PREFIX, RULE_TYPES } from './utils.js';

const LEVEL_COLUMN = ['Lav', 'Middel', 'Høj'];

function students(...cellValues) {
    return cellValues.map((v, i) => ({ _rowId: `r${i + 1}`, Navn: `Elev${i + 1}`, Niveau: v }));
}

const orders = { Niveau: LEVEL_COLUMN };
const rankCol = `${RANK_PREFIX}Niveau__`;

describe('applyColumnOrders — hvornår den gør noget', () => {
    it('gør intet uden en rangering', () => {
        const data = students('Lav', 'Høj');
        const rules = [{ name: RULE_TYPES.MINIMIZEDIFF, attribute: 'Niveau' }];
        const result = applyColumnOrders(data, rules, {});
        expect(result.data).toBe(data);
        expect(result.rules).toBe(rules);
        expect(result.labelMap).toEqual({});
    });

    it('gør intet når ingen tal-regel bruger den rangerede kolonne', () => {
        const data = students('Lav', 'Høj');
        // Fordel er kategorisk og skal blive på tekstkolonnen.
        const rules = [{ name: RULE_TYPES.DISTRIBUTE, attribute: 'Niveau' }];
        const result = applyColumnOrders(data, rules, orders);
        expect(result.data).toBe(data);
        expect(result.rules).toBe(rules);
    });

    it('tåler skrald i rangeringen uden at vælte', () => {
        const data = students('Lav');
        const rules = [{ name: RULE_TYPES.BALANCE, attribute: 'Niveau' }];
        for (const junk of [null, undefined, [], 'Lav,Høj', { Niveau: 'ikke en liste' }, { Niveau: [] }]) {
            expect(() => applyColumnOrders(data, rules, junk)).not.toThrow();
            expect(applyColumnOrders(data, rules, junk).data).toBe(data);
        }
    });
});

describe('applyColumnOrders — selve oversættelsen', () => {
    it('lægger en rang-kolonne ved siden af og lader tekstkolonnen stå', () => {
        const data = students('Lav', 'Middel', 'Høj');
        const rules = [{ name: RULE_TYPES.MINIMIZEDIFF, attribute: 'Niveau' }];
        const result = applyColumnOrders(data, rules, orders);

        expect(result.data.map(r => r[rankCol])).toEqual(['1', '2', '3']);
        // Tekstkolonnen er urørt — det er dén, advarslerne taler om.
        expect(result.data.map(r => r.Niveau)).toEqual(['Lav', 'Middel', 'Høj']);
        expect(result.labelMap).toEqual({ [rankCol]: 'Niveau' });
    });

    it('peger tal-reglen over på rang-kolonnen', () => {
        const rules = [{ name: RULE_TYPES.MINIMIZEDIFF, attribute: 'Niveau' }];
        const result = applyColumnOrders(students('Lav'), rules, orders);
        expect(result.rules[0].attribute).toBe(rankCol);
        expect(result.rules[0].name).toBe(RULE_TYPES.MINIMIZEDIFF);
    });

    it('lader de kategoriske regler blive på tekstkolonnen', () => {
        const rules = [
            { name: RULE_TYPES.MINIMIZEDIFF, attribute: 'Niveau' },
            { name: RULE_TYPES.DISTRIBUTE, attribute: 'Niveau' },
            { name: RULE_TYPES.CLUSTER, attribute: 'Niveau' },
            { name: RULE_TYPES.AGGREGATE, attribute: 'Niveau' },
            { name: RULE_TYPES.SEPARATE, attribute: 'Niveau', values: ['Høj'] },
        ];
        const result = applyColumnOrders(students('Lav', 'Høj'), rules, orders);
        expect(result.rules[0].attribute).toBe(rankCol);
        for (const r of result.rules.slice(1)) expect(r.attribute).toBe('Niveau');
        // Adskil-værdien peger stadig på lærerens ord, ikke på et tal.
        expect(result.rules[4].values).toEqual(['Høj']);
    });

    it('tager alle tre tal-regler med — også Saml', () => {
        for (const type of [RULE_TYPES.BALANCE, RULE_TYPES.MINIMIZEDIFF, RULE_TYPES.GROUP_SORT]) {
            const result = applyColumnOrders(students('Lav'), [{ name: type, attribute: 'Niveau' }], orders);
            expect(result.rules[0].attribute).toBe(rankCol);
        }
    });

    it('forstår også regler i UI-form (type/column)', () => {
        const rules = [{ type: RULE_TYPES.BALANCE, column: 'Niveau' }];
        const result = applyColumnOrders(students('Lav'), rules, orders);
        expect(result.rules[0].column).toBe(rankCol);
    });
});

describe('applyColumnOrders — værdier der ikke passer', () => {
    it('en TOM celle bliver tom, ikke 0 — og tæller ikke som urangeret', () => {
        const data = students('Lav', '', '   ', 'Høj');
        const rules = [{ name: RULE_TYPES.MINIMIZEDIFF, attribute: 'Niveau' }];
        const result = applyColumnOrders(data, rules, orders);
        expect(result.data.map(r => r[rankCol])).toEqual(['1', '', '', '3']);
        expect(result.unranked).toEqual([]);
    });

    it('en værdi uden for rangeringen bliver tom — ikke 0, der ville lyve om et niveau', () => {
        const data = students('Lav', 'Meget høj', 'Høj');
        const rules = [{ name: RULE_TYPES.MINIMIZEDIFF, attribute: 'Niveau' }];
        const result = applyColumnOrders(data, rules, orders);
        expect(result.data.map(r => r[rankCol])).toEqual(['1', '', '3']);
        expect(result.unranked).toEqual([{ column: 'Niveau', count: 1, values: ['Meget høj'] }]);
    });

    it('navngiver de urangerede værdier — højst tre, så beskeden ikke løber løbsk', () => {
        const data = students('Lav', 'A', 'B', 'C', 'D', 'E');
        const result = applyColumnOrders(data, [{ name: RULE_TYPES.MINIMIZEDIFF, attribute: 'Niveau' }], orders);
        expect(result.unranked[0].count).toBe(5);
        expect(result.unranked[0].values).toEqual(['A', 'B', 'C']);
    });

    it('en rangeret værdi ingen elev har, er harmløs', () => {
        const result = applyColumnOrders(
            students('Lav', 'Høj'),
            [{ name: RULE_TYPES.MINIMIZEDIFF, attribute: 'Niveau' }],
            { Niveau: ['Lav', 'Middel', 'Høj', 'Ekstra'] });
        expect(result.data.map(r => r[rankCol])).toEqual(['1', '3']);
        expect(result.unranked).toEqual([]);
    });

    it('matcher uafhængigt af store/små bogstaver og mellemrum', () => {
        const data = students(' lav ', 'MIDDEL', 'Høj');
        const result = applyColumnOrders(data, [{ name: RULE_TYPES.BALANCE, attribute: 'Niveau' }], orders);
        expect(result.data.map(r => r[rankCol])).toEqual(['1', '2', '3']);
    });

    it('en dublet i rangeringen: første forekomst vinder', () => {
        const result = applyColumnOrders(
            students('Lav', 'Middel', 'Høj'),
            [{ name: RULE_TYPES.BALANCE, attribute: 'Niveau' }],
            { Niveau: ['Lav', 'Middel', 'lav', 'Høj'] });
        expect(result.data.map(r => r[rankCol])).toEqual(['1', '2', '3']);
    });
});

describe('applyColumnOrders — den må ikke ødelægge noget', () => {
    it('muterer hverken rækker eller regler', () => {
        const data = students('Lav', 'Høj');
        const rules = [{ name: RULE_TYPES.MINIMIZEDIFF, attribute: 'Niveau' }];
        const dataBefore = JSON.stringify(data);
        const rulesBefore = JSON.stringify(rules);
        applyColumnOrders(data, rules, orders);
        expect(JSON.stringify(data)).toBe(dataBefore);
        expect(JSON.stringify(rules)).toBe(rulesBefore);
    });

    it('skriver ikke oven i en kolonne læreren allerede har', () => {
        const data = students('Lav', 'Høj').map(r => ({ ...r, [rankCol]: 'lærerens eget' }));
        const result = applyColumnOrders(data, [{ name: RULE_TYPES.BALANCE, attribute: 'Niveau' }], orders);
        expect(result.data[0][rankCol]).toBe('lærerens eget');
        const updated = Object.keys(result.labelMap)[0];
        expect(updated).not.toBe(rankCol);
        expect(result.data[0][updated]).toBe('1');
    });

    // Rækker kan have huller (columnsOfRows). Stod lærerens kolonne kun i
    // anden række, så navne-tjekket den ikke — det læste kun den første.
    it('skriver heller ikke oven i den, når den først står i en senere række', () => {
        const data = students('Lav', 'Høj');
        data[1] = { ...data[1], [rankCol]: 'lærerens eget' };
        const result = applyColumnOrders(data, [{ name: RULE_TYPES.BALANCE, attribute: 'Niveau' }], orders);
        expect(result.data[1][rankCol]).toBe('lærerens eget');
        expect(Object.keys(result.labelMap)[0]).not.toBe(rankCol);
    });

    it('rang-kolonnen overlever til motoren — den er ikke et internt felt', async () => {
        const { isInternalField } = await import('./utils.js');
        expect(isInternalField(rankCol)).toBe(false);
    });

    it('to rangerede kolonner på én gang', () => {
        const data = [
            { _rowId: 'r1', Niveau: 'Lav', Indsats: 'Meget' },
            { _rowId: 'r2', Niveau: 'Høj', Indsats: 'Lidt' },
        ];
        const rules = [
            { name: RULE_TYPES.MINIMIZEDIFF, attribute: 'Niveau' },
            { name: RULE_TYPES.GROUP_SORT, attribute: 'Indsats' },
        ];
        const result = applyColumnOrders(data, rules, {
            Niveau: LEVEL_COLUMN,
            Indsats: ['Lidt', 'Noget', 'Meget'],
        });
        expect(Object.keys(result.labelMap).sort()).toEqual(
            [`${RANK_PREFIX}Indsats__`, `${RANK_PREFIX}Niveau__`].sort());
        expect(result.data[0][`${RANK_PREFIX}Indsats__`]).toBe('3');
        expect(result.data[1][`${RANK_PREFIX}Niveau__`]).toBe('3');
    });
});

// ── Fundet ved dobbelttjekket af rangeringen, 2026-08-25 ──────────────────────
//
// Rangeringen blev bygget og målt på motorerne, men aldrig set efter i
// SAMSPIL med resten. To ting knækkede dér.

describe('applyColumnOrders — en rangering ingen elev rammer', () => {
    it('laver ingen rang-kolonne, når ingen af elevernes værdier står i rangeringen', () => {
        // Klasselisten er skiftet ud med en, der bruger andre ord. Skrev vi
        // rang-kolonnen alligevel, ville den være tom hele vejen ned — og
        // motoren ville sige "ingen elever har en værdi i 'Niveau'", hvilket
        // er direkte forkert: de har alle sammen en.
        const data = students('A', 'B', 'C');
        const rules = [{ name: RULE_TYPES.MINIMIZEDIFF, attribute: 'Niveau' }];
        const result = applyColumnOrders(data, rules, orders);
        expect(result.data).toBe(data);            // rækkerne er urørte
        expect(result.rules).toBe(rules);          // reglen bliver på tekstkolonnen
        expect(result.labelMap).toEqual({});
    });

    it('siger stadig højt HVEM der står uden for rangeringen', () => {
        const result = applyColumnOrders(
            students('A', 'B'),
            [{ name: RULE_TYPES.MINIMIZEDIFF, attribute: 'Niveau' }],
            orders);
        expect(result.unranked).toEqual([{ column: 'Niveau', count: 2, values: ['A', 'B'] }]);
    });

    it('én enkelt elev der rammer er nok — så virker rangeringen for de øvrige', () => {
        const result = applyColumnOrders(
            students('Lav', 'A', 'B'),
            [{ name: RULE_TYPES.MINIMIZEDIFF, attribute: 'Niveau' }],
            orders);
        expect(result.data.map(r => r[rankCol])).toEqual(['1', '', '']);
        expect(result.unranked[0].count).toBe(2);
    });

    it('rammer den ene kolonne men ikke den anden, droppes kun den tomme', () => {
        const data = [
            { _rowId: 'r1', Niveau: 'Lav', Indsats: 'Ukendt' },
            { _rowId: 'r2', Niveau: 'Høj', Indsats: 'Ukendt' },
        ];
        const rules = [
            { name: RULE_TYPES.MINIMIZEDIFF, attribute: 'Niveau' },
            { name: RULE_TYPES.GROUP_SORT, attribute: 'Indsats' },
        ];
        const result = applyColumnOrders(data, rules, {
            Niveau: LEVEL_COLUMN,
            Indsats: ['Lidt', 'Noget', 'Meget'],
        });
        expect(Object.keys(result.labelMap)).toEqual([`${RANK_PREFIX}Niveau__`]);
        expect(result.rules[1].attribute).toBe('Indsats');
        expect(result.data[0][`${RANK_PREFIX}Indsats__`]).toBeUndefined();
    });
});

describe('applyColumnOrders — motoren skal kunne se lærerens egen kolonne', () => {
    it('skriver sourceAttribute på de regler den flytter', () => {
        // Uden feltet stod "Saml" på __Rang:Niveau__ og "Fordel" på 'Niveau',
        // og motorens konflikt-tjek kunne ikke se, at de slås om den samme
        // kolonne. Advarslen forsvandt altså, netop når læreren rangerede.
        const rules = [
            { name: RULE_TYPES.GROUP_SORT, attribute: 'Niveau' },
            { name: RULE_TYPES.DISTRIBUTE, attribute: 'Niveau' },
        ];
        const result = applyColumnOrders(students('Lav', 'Høj'), rules, orders);
        expect(result.rules[0].attribute).toBe(rankCol);
        expect(result.rules[0].sourceAttribute).toBe('Niveau');
        // Den kategoriske regel er ikke flyttet og har ikke feltet.
        expect(result.rules[1].sourceAttribute).toBeUndefined();
    });

    it('regler der ikke flyttes, er de samme objekter som før', () => {
        const rules = [{ name: RULE_TYPES.CLUSTER, attribute: 'Niveau' }];
        const result = applyColumnOrders(students('Lav'), [
            { name: RULE_TYPES.BALANCE, attribute: 'Niveau' }, ...rules], orders);
        expect(result.rules[1]).toBe(rules[0]);
    });
});
