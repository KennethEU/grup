import { describe, it, expect, beforeEach } from 'vitest';
import { state } from './state.js';
import { studentById, homeGroupOriginById } from './lookups.js';
import { saveTopic } from './storage.js';
import { ROW_ID } from './utils.js';

// Opslagskortene er `computed`. Det interessante ved dem er ikke at de er
// hurtige — det er at de holder sig OPDATEREDE. En stale værdi her ville stå
// som et forkert navn eller et forkert oprindelses-badge på gruppekortet, og
// det ser ud som en fejl i grupperingen, ikke som en fejl i en cache.

describe('studentById', () => {
    beforeEach(() => {
        state.currentClass = {
            filename: 'test.json',
            data: [
                { [ROW_ID]: 'r1', Navn: 'Anna' },
                { [ROW_ID]: 'r2', Navn: 'Bo' },
            ],
        };
    });

    it('slår elevrækken op på dens _rowId', () => {
        expect(studentById.value.get('r1').Navn).toBe('Anna');
        expect(studentById.value.get('r99')).toBeUndefined();
    });

    it('opdager en tilføjet elev', () => {
        state.currentClass.data.push({ [ROW_ID]: 'r3', Navn: 'Clara' });
        expect(studentById.value.get('r3').Navn).toBe('Clara');
    });

    it('opdager en slettet elev', () => {
        state.currentClass.data.splice(0, 1);
        expect(studentById.value.get('r1')).toBeUndefined();
    });

    it('er tomt uden en klasse', () => {
        state.currentClass = null;
        expect(studentById.value.size).toBe(0);
    });
});

describe('homeGroupOriginById', () => {
    beforeEach(() => {
        localStorage.clear();
        state.currentClass = { filename: 'test.json', data: [] };
        state.storedStandardGroups = [
            { name: 'Gruppe 1', topic: null, members: ['r1', 'r2'] },
            { name: 'Gruppe 2', topic: null, members: [{ id: 'r3', name: 'Clara' }] },
        ];
    });

    it('bruger gruppens navn, når den ikke har noget emne', () => {
        expect(homeGroupOriginById.value.get('r1')).toBe('Gruppe 1');
        expect(homeGroupOriginById.value.get('r3')).toBe('Gruppe 2');
    });

    it('bruger emnet, når gruppen har et', () => {
        state.storedStandardGroups[0].topic = 'Klima';
        expect(homeGroupOriginById.value.get('r1')).toBe('Klima');
    });

    it('opdager et emne der skiftes bagefter', () => {
        // Emnet skrives BÅDE til emne-kortet i lageret og til gruppeobjektet.
        // Læste kortet kun lagerets svar, ville badget blive stående med det
        // gamle emne — Vue husker kun de felter, der faktisk blev læst.
        expect(homeGroupOriginById.value.get('r1')).toBe('Gruppe 1');
        saveTopic('Gruppe 1', 'Ulighed', 'S_');
        state.storedStandardGroups[0].topic = 'Ulighed';
        expect(homeGroupOriginById.value.get('r1')).toBe('Ulighed');
    });

    it('opdager en elev der flyttes til en anden stamgruppe', () => {
        state.storedStandardGroups[0].members = ['r2'];
        state.storedStandardGroups[1].members.push('r1');
        expect(homeGroupOriginById.value.get('r1')).toBe('Gruppe 2');
    });

    it('er tomt uden stamgrupper', () => {
        state.storedStandardGroups = null;
        expect(homeGroupOriginById.value.size).toBe(0);
    });
});
