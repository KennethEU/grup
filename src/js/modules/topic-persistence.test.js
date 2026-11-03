// Emnekortet er lærerens eneste gemte kopi. Prøverne efterligner både
// afviste skrivninger og en anden fane, hvis besked endnu ikke er behandlet.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { state } from './state.js';
import * as storage from './storage.js';

const topicKey = 'grupdk_topics_topic-review.csv';
const groupKey = 'grupdk_groups_topic-review.csv';
const original = { 'S_Group 1': 'Liberalisme', 'S_Group 2': 'Socialisme', 'M_Group 1': 'Matrixemne' };

function rejectTopicWrites() {
    const setItem = localStorage.setItem.bind(localStorage);
    return vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
        if (key === topicKey) throw Object.assign(new Error('Full'), { name: 'QuotaExceededError' });
        setItem(key, value);
    });
}

beforeEach(() => {
    localStorage.clear();
    state.currentClass = { filename: 'topic-review.csv', name: 'Emnereview' };
    state.storedStandardGroups = [
        { name: 'Group 1', members: ['r1'], topic: original['S_Group 1'] },
        { name: 'Group 2', members: ['r2'], topic: original['S_Group 2'] },
    ];
    state.storedMatrixGroups = null;
    localStorage.setItem(topicKey, JSON.stringify(original));
    window.dispatchEvent(new StorageEvent('storage', { key: topicKey }));
    window.notifyError = vi.fn();
    storage.saveGroupsToStorage();
    storage.readTopicMap();
});
afterEach(() => vi.restoreAllMocks());

const mutations = [
    ['save', () => storage.saveTopic('Group 1', 'Konservatisme', 'S_')],
    ['delete', () => storage.saveTopic('Group 1', null, 'S_')],
    ['clear', () => storage.clearTopics('S_')],
    ['replace prefix', () => storage.replaceTopicsForPrefix('S_', [{ name: 'Group 1', topic: 'Konservatisme' }])],
];

describe('fejl ved skrivning af emner', () => {
    it.each(mutations)('%s lader gemte emner, cache og grupper være urørte', (_name, mutate) => {
        expect(storage.readTopicMap()).toEqual(original);
        const groupsBefore = JSON.stringify(state.storedStandardGroups);
        const storedGroupsBefore = localStorage.getItem(groupKey);
        const spy = rejectTopicWrites();
        expect(mutate()).toBe(false);
        expect(window.notifyError).toHaveBeenCalled();
        spy.mockRestore();
        expect(localStorage.getItem(topicKey)).toBe(JSON.stringify(original));
        expect(storage.readTopicMap()).toEqual(original);
        expect(JSON.stringify(state.storedStandardGroups)).toBe(groupsBefore);
        expect(localStorage.getItem(groupKey)).toBe(storedGroupsBefore);
    });

    it('smugler ikke en mislykket emneændring med i næste vellykkede skrivning', () => {
        const spy = rejectTopicWrites();
        expect(storage.saveTopic('Group 1', 'Ikke gemt', 'S_')).toBe(false);
        spy.mockRestore();
        expect(storage.saveTopic('Group 2', 'Nyt emne', 'S_')).toBe(true);
        expect(JSON.parse(localStorage.getItem(topicKey))['S_Group 1']).toBe('Liberalisme');
    });
});

describe('emneændringer, før storage-hændelsen når frem', () => {
    it.each(mutations)('%s bevarer den anden visning ud fra det senest gemte emnekort', (_name, mutate) => {
        expect(storage.readTopicMap()).toEqual(original);
        // Ingen hændelse: skrivningen er sket, men fanen har endnu ikke
        // behandlet browserens asynkrone besked om den.
        localStorage.setItem(topicKey, JSON.stringify({ ...original, 'M_Group 2': 'Fra anden fane' }));
        expect(mutate()).toBe(true);
        expect(JSON.parse(localStorage.getItem(topicKey))['M_Group 2']).toBe('Fra anden fane');
    });
});

describe('emnedata, der ikke kan læses', () => {
    it.each(['{broken', 'null', '[]', '"tekst"', '42', '', '{"S_Group 1":42}', '{"S_Group 1":{}}'])('bevarer ugyldige gemte data: %j', raw => {
        localStorage.setItem(topicKey, raw);
        window.dispatchEvent(new StorageEvent('storage', { key: topicKey }));
        expect(storage.getTopic('Group 1', 'S_')).toBeNull();
        for (const [, mutate] of mutations) expect(mutate()).toBe(false);
        expect(localStorage.getItem(topicKey)).toBe(raw);
        expect(window.notifyError).toHaveBeenCalled();
    });

    it('kan prøve igen efter en læsefejl uden at gemme et tomt emnekort', () => {
        const getItem = localStorage.getItem.bind(localStorage);
        const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(key => {
            if (key === topicKey) throw Object.assign(new Error('Blocked'), { name: 'SecurityError' });
            return getItem(key);
        });
        expect(storage.saveTopic('Group 1', 'Nyt emne', 'S_')).toBe(false);
        spy.mockRestore();
        expect(storage.getTopic('Group 2', 'S_')).toBe('Socialisme');
        expect(storage.saveTopic('Group 1', 'Nyt emne', 'S_')).toBe(true);
        expect(JSON.parse(localStorage.getItem(topicKey))['S_Group 2']).toBe('Socialisme');
    });

    it('tillader det første emne i en ny klasse', () => {
        localStorage.removeItem(topicKey);
        expect(storage.saveTopic('Group 1', 'Første emne', 'S_')).toBe(true);
        expect(JSON.parse(localStorage.getItem(topicKey))).toEqual({ 'S_Group 1': 'Første emne' });
    });
});
