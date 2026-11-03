import { describe, it, expect } from 'vitest';
import { plural } from './plural.js';

describe('plural', () => {
    it('bruger ental ved præcis én', () => {
        expect(plural(1, 'klasse', 'klasser')).toBe('1 klasse');
    });
    it('bruger flertal ved nul og ved flere', () => {
        expect(plural(0, 'fil', 'filer')).toBe('0 filer');
        expect(plural(2, 'fil', 'filer')).toBe('2 filer');
        expect(plural(11, 'session', 'sessioner')).toBe('11 sessioner');
    });
    it('kan bøje et ord med tillægsord og hjælpeverbum', () => {
        expect(plural(1, 'gammel session', 'gamle sessioner')).toBe('1 gammel session');
    });
});
