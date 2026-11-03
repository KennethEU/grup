// Det der er tilbage af beta-tiden. Den nye udgave af Grupper (opskriften)
// blev standard 27/10 2026, og den gamle skærm kunne vælges til og med 2/11.
// Den er slettet nu; navnet "beta" står kun tilbage i filnavne og CSS-klassen
// html.beta, som opskriftens stilark hænger på (sat allerede i index.html).

/**
 * Lærerens valg mellem den nye og den gamle skærm lå i denne nøgle. Den
 * bruges ikke mere og fjernes ved opstart (ligesom det gamle temavalg), så
 * lageret ikke bærer rester.
 */
const OLD_VERSION_KEY = 'grupper-udgave';
/** Det gamle temavalg (lyst/mørkt). Der er kun ét tema nu. */
const OLD_THEME_KEY = 'groupeng-theme';

/**
 * Gør siden klar: Rolig-temaet og klassen `beta` på <html>, som opskriftens
 * stilark hænger på. Kaldes én gang fra main.js.
 */
export function prepareBetaPage() {
    const root = document.documentElement;
    root.classList.add('beta');
    root.setAttribute('data-theme', 'rolig');
    document.title = 'grup.dk';
    try {
        localStorage.removeItem(OLD_VERSION_KEY);
        localStorage.removeItem(OLD_THEME_KEY);
    } catch { /* uden lager er der intet at rydde */ }
}

/**
 * Navnene på knapperne, som de står på skærmen. Beskeder og hjælpetekster
 * skal nævne den knap, læreren faktisk ser. Brug disse i stedet for at skrive
 * navnet direkte i teksten, så et nyt navn kun skal rettes her.
 */
export const UI_NAMES = Object.freeze({
    generate: 'Dan grupper',
    generateMatrix: 'Dan matrixgrupper',
    matrix: 'Matrix-runde',
    runHistory: 'Tidligere kørsler',
});
