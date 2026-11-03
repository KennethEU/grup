// Det der er tilbage af beta-tiden (beta.js): siden gøres klar, og de gamle
// valg (udgave og tema) ryddes ud af lageret.
import { describe, it, expect } from 'vitest';
import { prepareBetaPage, UI_NAMES } from './beta.js';

describe('prepareBetaPage', () => {
    it('sætter Rolig-temaet og klassen beta på <html>', () => {
        prepareBetaPage();
        expect(document.documentElement.classList.contains('beta')).toBe(true);
        expect(document.documentElement.getAttribute('data-theme')).toBe('rolig');
    });

    it('rydder den gamle skærms valg ud af lageret', () => {
        localStorage.setItem('grupper-udgave', 'gammel');
        localStorage.setItem('groupeng-theme', 'dark');
        localStorage.setItem('grupdk_classes', '[]');
        prepareBetaPage();
        expect(localStorage.getItem('grupper-udgave')).toBeNull();
        expect(localStorage.getItem('groupeng-theme')).toBeNull();
        // Kun de to gamle nøgler — klasserne røres ikke
        expect(localStorage.getItem('grupdk_classes')).toBe('[]');
    });
});

describe('UI_NAMES', () => {
    it('nævner knapperne, som de står på skærmen', () => {
        expect(UI_NAMES.generate).toBe('Dan grupper');
        expect(UI_NAMES.generateMatrix).toBe('Dan matrixgrupper');
    });
});
