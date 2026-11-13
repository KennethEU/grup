// addClassTopic: "findes emnet allerede?" må ikke kaste på en liste med andet
// end tekst (gennemsyn 99, 13/11 2026).
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./classActions.js', () => ({ autoSave: vi.fn() }));
vi.mock('./storage.js', () => ({ clearTopics: vi.fn() }));

import { reactiveState } from './reactiveState.js';
import { addClassTopic } from './topicActions.js';

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
});
