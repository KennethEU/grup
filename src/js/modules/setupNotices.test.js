import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    setupNotices, announce, announceOnce, beginRun, commitRun, clearSetupNotices, forgetRunResults,
} from './setupNotices.js';

beforeEach(() => {
    clearSetupNotices();
    window.notifyInfo = vi.fn();
    window.notifyError = vi.fn();
});

describe('setupNotices — bemærkningerne står i opskriften, ikke som beskeder', () => {
    it('ingen besked; teksten gemmes pr. visning og vises igen ved hver dannelse', () => {
        beginRun('standard');
        announce('Fordel går ikke op.', 'info');
        announce('Rød', 'error');
        commitRun();
        expect(window.notifyInfo).not.toHaveBeenCalled();
        expect(window.notifyError).not.toHaveBeenCalled();
        expect(setupNotices.last.standard).toEqual([
            { text: 'Fordel går ikke op.', type: 'info' },
            { text: 'Rød', type: 'error' },
        ]);
        expect(setupNotices.last.matrix).toEqual([]);
        // Samme tekst igen: stadig med (der er ingen "vist før")
        beginRun('standard'); announce('Fordel går ikke op.'); commitRun();
        expect(setupNotices.last.standard).toEqual([{ text: 'Fordel går ikke op.', type: 'info' }]);
    });

    it('samme tekst to gange i én kørsel står der kun én gang', () => {
        beginRun('standard'); announce('A'); announce('A'); commitRun();
        expect(setupNotices.last.standard).toEqual([{ text: 'A', type: 'info' }]);
    });

    it('en stoppet kørsel rører ikke de sidste noter', () => {
        beginRun('standard'); announce('A'); commitRun();
        beginRun('standard'); announce('B');   // ingen commitRun — kørslen blev stoppet
        expect(setupNotices.last.standard.map(n => n.text)).toEqual(['A']);
    });

    it('en matrixkørsel rører ikke stamgruppernes bemærkninger', () => {
        beginRun('standard'); announce('Stam'); commitRun();
        beginRun('matrix'); announce('Matrix'); commitRun();
        expect(setupNotices.last.standard.map(n => n.text)).toEqual(['Stam']);
        expect(setupNotices.last.matrix.map(n => n.text)).toEqual(['Matrix']);
        clearSetupNotices();
        expect(setupNotices.last.matrix).toEqual([]);
    });
});

describe('setupNotices — announceOnce er stadig en besked (et varsel om ventetid)', () => {
    it('vises første gang, ikke anden gang', () => {
        beginRun(); announceOnce('Der kan gå et halvt minut.'); commitRun();
        beginRun(); announceOnce('Der kan gå et halvt minut.'); commitRun();
        expect(window.notifyInfo).toHaveBeenCalledTimes(1);
        expect(setupNotices.last.standard).toEqual([]);
    });

    it('klasseskift: den nye klasse får varslet første gang', () => {
        announceOnce('Samme tekst');
        clearSetupNotices();
        announceOnce('Samme tekst');
        expect(window.notifyInfo).toHaveBeenCalledTimes(2);
    });
});

describe('setupNotices — aftrykket af opsætningen følger de sidste noter', () => {
    it('commitRun gemmer aftrykket, og klasseskift rydder det', () => {
        beginRun('standard'); announce('Note'); commitRun('sig-1');
        expect(setupNotices.lastSignature.standard).toBe('sig-1');
        clearSetupNotices();
        expect(setupNotices.lastSignature.standard).toBeNull();
    });
});

describe('forgetRunResults — noterne om resultatet går, når fordelingen skiftes ud', () => {
    it('fjerner kun resultat-noterne; opsætningens noter og aftrykket bliver', () => {
        beginRun('standard');
        announce('Fordel på "Køn" kan ikke gå helt lige op.', 'info');
        announce('Adskil på "Køn": 2 par ender i samme gruppe (Gruppe 3).', 'info', ['k1'], true);
        commitRun('aftryk');
        forgetRunResults(['standard']);
        expect(setupNotices.last.standard).toEqual([{ text: 'Fordel på "Køn" kan ikke gå helt lige op.', type: 'info' }]);
        // Aftrykket bliver: prøvekørslen i baggrunden skal opføre sig som før.
        expect(setupNotices.lastSignature.standard).toBe('aftryk');
    });

    it('rører kun de visninger, den får', () => {
        beginRun('standard'); announce('Stam', 'info', null, true); commitRun('s');
        beginRun('matrix'); announce('Matrix', 'info', null, true); commitRun('m');
        forgetRunResults(['standard']);
        expect(setupNotices.last.standard).toEqual([]);
        expect(setupNotices.last.matrix.map(n => n.text)).toEqual(['Matrix']);
        forgetRunResults();
        expect(setupNotices.last.matrix).toEqual([]);
    });

    it('samme tekst to gange: er den ene et resultat, er noten et resultat', () => {
        beginRun('standard'); announce('A'); announce('A', 'info', null, true); commitRun();
        forgetRunResults(['standard']);
        expect(setupNotices.last.standard).toEqual([]);
    });
});
