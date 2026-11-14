// addClassTopic: "findes emnet allerede?" må ikke kaste på en liste med andet
// end tekst (gennemsyn 99, 13/11 2026).
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./classActions.js', () => ({ autoSave: vi.fn() }));
vi.mock('./storage.js', () => ({ clearTopics: vi.fn(), saveTopic: vi.fn(() => true), saveGroupsToStorage: vi.fn(() => true) }));

import { toRaw } from 'vue';
import { reactiveState } from './reactiveState.js';
import { addClassTopic, tidyClassTopics } from './topicActions.js';
import { saveTopic, saveGroupsToStorage } from './storage.js';

describe('addClassTopic', () => {
    beforeEach(() => { reactiveState.currentClass = { data: [], topics: [] }; });

    it('tilføjer et emne og afviser det samme emne med andre store og små bogstaver', () => {
        expect(addClassTopic(' EU ')).toBe(true);
        expect(addClassTopic('eu')).toBe(false);
        expect(reactiveState.currentClass.topics).toEqual(['EU']);
    });

    it('kaster ikke, når der står et tal i listen (håndredigeret backup)', () => {
        reactiveState.currentClass.topics = [2024, null, 'FN'];
        expect(addClassTopic('Nato')).toBe(true);
        expect(addClassTopic('2024')).toBe(false);
        expect(reactiveState.currentClass.topics).toEqual([2024, null, 'FN', 'Nato']);
    });

    it('gemmer et indsat emne i NFC og afviser "Århus" med å som a + ring, når "Århus" findes', () => {
        expect(addClassTopic('A\u030arhus')).toBe(true);
        expect(reactiveState.currentClass.topics).toEqual(['\u00c5rhus']);
        reactiveState.currentClass.topics = ['\u00c5rhus'];
        expect(addClassTopic('a\u030arhus')).toBe(false);
    });
});

// Oprydningen ved åbning (114. gennemsyn, 13/11 2026): dubletter i
// emnelisten gav motoren ét emne for meget (den tæller listen, som den står).
describe('tidyClassTopics', () => {
    const A_RING = 'A\u030arhus';   // "Århus" med å som a + ring (fra en PDF på en Mac)
    const AA = '\u00c5rhus';         // "Århus" som et dansk tastatur skriver det
    beforeEach(() => {
        saveTopic.mockClear(); saveGroupsToStorage.mockClear();
        saveTopic.mockImplementation(() => true);
    });

    it('fjerner dubletter (NFC, store/små bogstaver), første stavemåde vinder, og gemmer i NFC', () => {
        reactiveState.currentClass = { data: [], topics: [A_RING, 'EU', AA, 'eu', ' ', 'FN'] };
        reactiveState.storedStandardGroups = null;
        expect(tidyClassTopics()).toBe(true);
        expect(reactiveState.currentClass.topics).toEqual([AA, 'EU', 'FN']);
        expect(saveTopic).not.toHaveBeenCalled();
    });

    it('giver stamgruppernes emner listens stavemåde — emnekortet først', () => {
        reactiveState.currentClass = { data: [], topics: [A_RING, AA, 'EU'] };
        reactiveState.storedStandardGroups = [
            { name: 'Group 1', topic: A_RING },
            { name: 'Group 2', topic: 'eu' },
            { name: 'Group 3', topic: 'EU' },
            { name: 'Group 4', topic: 'Andet' },   // ikke på listen: urørt
            { name: 'Group 5', topic: null },
        ];
        expect(tidyClassTopics()).toBe(true);
        expect(reactiveState.storedStandardGroups.map(g => g.topic)).toEqual([AA, 'EU', 'EU', 'Andet', null]);
        expect(saveTopic.mock.calls).toEqual([['Group 1', AA, 'S_'], ['Group 2', 'EU', 'S_']]);
        expect(saveGroupsToStorage).toHaveBeenCalledTimes(1);
    });

    it('lader gruppen OG listen stå, hvis emnekortet ikke kan skrives', () => {
        saveTopic.mockImplementation(() => false);
        reactiveState.currentClass = { data: [], topics: ['EU', 'eu'] };
        reactiveState.storedStandardGroups = [{ name: 'Group 1', topic: 'eu' }];
        expect(tidyClassTopics()).toBe(false);
        expect(reactiveState.storedStandardGroups[0].topic).toBe('eu');
        // Listen beholder 'eu', så gruppens emne stadig står i emnevælgeren.
        expect(reactiveState.currentClass.topics).toEqual(['EU', 'eu']);
        expect(saveGroupsToStorage).not.toHaveBeenCalled();
    });

    it('er idempotent: en klasse i orden røres ikke', () => {
        const topics = [AA, 'EU'];
        reactiveState.currentClass = { data: [], topics };
        reactiveState.storedStandardGroups = [{ name: 'Group 1', topic: AA }];
        expect(tidyClassTopics()).toBe(false);
        expect(toRaw(reactiveState.currentClass.topics)).toBe(topics);
        expect(saveTopic).not.toHaveBeenCalled();
        expect(saveGroupsToStorage).not.toHaveBeenCalled();
    });
});
