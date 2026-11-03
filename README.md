# grup.dk

**[Dansk](#dansk) · [English](#english)**

---

## Dansk

grup.dk danner elevgrupper ud fra lærerens regler. Det er et gratis værktøj
til undervisningen og kører på [grup.dk](https://grup.dk).

### Hvad kan det?

- **Regler:** fordel (fx køn), balancér (fx fagligt niveau), ensartede,
  klyng, adskil, saml og opdel. Reglerne står i trin efter, hvor tungt de
  vejer, og inden for et trin vejer den øverste mest.
- **Aftaler om bestemte elever:** "Skal sammen" og "Undgå hinanden".
- **Emner, stamgrupper og matrixgrupper**, låste grupper, fravær og
  efternølere.
- **Efter hver dannelse** viser opskriften, hvad der blev opfyldt, og en
  afspilning viser, hvordan grupperne blev til.
- **Ud til klassen:** vis på storskærmen, udskriv, kopiér eller hent som
  Excel.

### Privatliv

Alt kører i lærerens browser. Elevlisten sendes ikke til nogen server:
grupperne dannes af grup.dk's egen motor i JavaScript (i Web Workers), og
klasserne gemmes i browserens eget lager. Siden henter intet fra andre
adresser end grup.dk.

### Licens og oprindelse

grup.dk er fri software under **Den Europæiske Unions Offentlige Licens
(EUPL v. 1.2)** — se [LICENSE](LICENSE) (den officielle danske tekst; alle
EU-sprog er lige gyldige). © 2026 Kenneth Bozkurt Madsen.

Tidligere udgaver (indtil november 2026) byggede på
[GroupEng](https://github.com/tdimiduk/groupeng) af Thomas G. Dimiduk — med
tak. Den kode er fjernet; gruppemotoren (`motor/engine/`) er skrevet fra
bunden i et "rent rum" ud fra en beskrivelse af, hvad programmet skal kunne
(se `motor/spec/`).

Tredjepartsbiblioteker beholder deres egne licenser, fx SheetJS
(`src/vendor/xlsx.mjs`, Apache-2.0) og bibliotekerne i `package.json`.

### Opbygning

| Mappe | Indhold |
|-------|---------|
| `src/` | Brugerfladen (Vue 3) og JavaScript-modulerne |
| `motor/` | Gruppemotoren (`engine/`), dens tests, dommer og specifikation |
| `e2e/` | Playwright-tests af hele appen |
| `testdata/` | Testklasser. Alle navne er opdigtede |
| `tools/` | Hjælpescripts (kodetjek, målinger, udgivelse) |

### Kør lokalt

```bash
npm install
npm run dev         # udviklingsserver
npm run check       # kodetjek
npm run test:unit   # enhedstests (vitest)
npm run test:motor  # motorens tests og dommeren
npm test            # e2e-tests (Playwright)
npm run build
```

grup.dk er en del af projektet dida.dk, og nogle dele forudsætter mappen
omkring den: bygget lægges i `../public/grupper/`, og et par tests læser
dida.dk's serverkode. Den udførlige dokumentation ligger i dida.dk (ikke i
dette repository).

Dette repository opdateres fra dida.dk, så koden her er den, der kører på
grup.dk.

---

## English

grup.dk forms student groups from the teacher's rules. It is a free tool for
teaching and runs at [grup.dk](https://grup.dk). The user interface is in
Danish.

### Features

- **Rules:** distribute (e.g. gender), balance (e.g. academic level), similar,
  cluster, separate, sort and split. Rules are ranked in tiers by how much
  they weigh, and within a tier the top rule weighs the most.
- **Agreements about specific students:** "must be together" and "keep apart".
- **Topics, home groups and jigsaw (matrix) groups**, locked groups, absence
  and latecomers.
- **After each run** the recipe shows which rules were met, and a replay shows
  how the groups were formed.
- **Out to the class:** show on the big screen, print, copy, or download as
  Excel.

### Privacy

Everything runs in the teacher's browser. The class list is never sent to a
server: groups are formed by grup.dk's own JavaScript engine (in Web Workers),
and classes are stored in the browser's own storage. The page loads nothing
from any host other than grup.dk.

### License and origin

grup.dk is free software under the **European Union Public Licence
(EUPL v. 1.2)** — see [LICENSE](LICENSE) (the official Danish text; all EU
language versions are equally valid). © 2026 Kenneth Bozkurt Madsen.

Earlier versions (until November 2026) were based on
[GroupEng](https://github.com/tdimiduk/groupeng) by Thomas G. Dimiduk — with
thanks. That code has been removed; the group engine (`motor/engine/`) was
written from scratch in a "clean room", from a description of what the
program must do (see `motor/spec/`).

Third-party libraries keep their own licenses, e.g. SheetJS
(`src/vendor/xlsx.mjs`, Apache-2.0) and the libraries in `package.json`.

### Layout

| Folder | Contents |
|--------|----------|
| `src/` | The user interface (Vue 3) and JavaScript modules |
| `motor/` | The group engine (`engine/`), its tests, judge and specification |
| `e2e/` | Playwright end-to-end tests |
| `testdata/` | Test classes. All names are made up |
| `tools/` | Helper scripts (code checks, measurements, publishing) |

### Run locally

```bash
npm install
npm run dev         # development server
npm run check       # code checks
npm run test:unit   # unit tests (vitest)
npm run test:motor  # engine tests and the judge
npm test            # end-to-end tests (Playwright)
npm run build
```

grup.dk is part of the dida.dk project, and some parts assume the folder
around it: the build is written to `../public/grupper/`, and a few tests read
dida.dk's server code. The detailed documentation lives in dida.dk (not in
this repository).

This repository is updated from dida.dk, so the code here is the code that
runs on grup.dk.
