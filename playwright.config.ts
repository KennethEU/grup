import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

/**
 * Opsætningen af e2e-testene. Se https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',
  /* Testene i hver fil kører side om side */
  fullyParallel: true,
  /* På en CI-server fejler kørslen, hvis en test.only er glemt i koden */
  forbidOnly: !!process.env.CI,
  /*
   * Ét forsøg mere — også lokalt.
   *
   * Suiten kører i tre browsere parallelt. Under den belastning kan en
   * tilfældig webkit-test løbe tør for tid (målt, dengang Pyodide også skulle
   * bootes: 2 fejl ud af 684 testkørsler, og ALTID en anden test end sidst).
   *
   * At skrue workers ned løser det ikke — fire kørsler med --workers=4 gav
   * 4 fejl i stedet for 2 og tog 25 % længere. Det er maskinens samlede
   * belastning, ikke Playwrights worker-tal, der driver det.
   *
   * Med ét genforsøg bliver suiten grøn, og de ustabile kører videre som
   * "flaky" i rapporten — de bliver altså ikke skjult, de vælter bare ikke
   * en kørsel. Tiden er uændret, når alt består (kun de fejlende køres om).
   *
   * VÆR OPMÆRKSOM: en ægte, sjælden race i produktkoden ville også blive
   * pakket væk som "flaky". Dukker der flakes op i tests, der IKKE handler om
   * tegne-timeouts, så undersøg dem — lad være med at læne dig på tallet.
   */
  retries: process.env.CI ? 2 : 1,
  /* På en CI-server kører testene én ad gangen */
  workers: process.env.CI ? 1 : undefined,
  /* Rapporten. Brug --reporter=line i kørsler: html-rapporten åbner en browser ved fejl */
  reporter: 'html',
  /* Fælles indstillinger for alle tre browsere nedenfor */
  use: {
    /* Adressen, som `await page.goto('/')` går til.
     * Dev-serveren kører normalt på 3000 (vite.config.js). Kører den på en
     * anden port — fx når den er startet af et værktøj — så sæt E2E_BASE_URL. */
    baseURL: BASE_URL,

    /* Gem et spor (trace), når en fejlet test køres igen */
    trace: 'on-first-retry',
  },

  /* De tre browsere */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

});
