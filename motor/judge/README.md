# Dommeren

Dommeren giver karakter til en **færdig gruppedeling**, uanset hvilken motor
der har lavet den. Den er skrevet alene ud fra `spec/specifikation.md`
(afsnit 16, "Hvad dommeren skal måle") og `spec/kontrakt.md` (version 2).

Den læser kun **hvem er i hvilken gruppe** (svarets `status` og `groups`). Den
stoler aldrig på svarets egne `rules`, `messages` eller `playback`. Derfor kan
den bedømme den nuværende motors grupper præcis som den nye motors.

Ren JavaScript (ES-moduler), Node 22 eller nyere, ingen afhængigheder.

## Sådan bruges den

```bash
node judge/cli.mjs input.json svar.json
```

Giver en rapport. Bryder svaret de faste krav, står der en stor advarsel øverst,
og kommandoen slutter med kode 2.

```bash
node judge/cli.mjs input.json svar.json --json
```

Giver hele karakteren som JSON.

```bash
node judge/cli.mjs batch testdata/saet-1 testdata/saet-1-nuvaerende --json
```

Bedømmer alle svar i en mappe, én JSON-linje pr. svar. Et svar hører til et
input, når filnavnet starter med inputtets navn: `001-x.json` hører til
`001-x.json` eller `001-x.seed3.json`.

```bash
node judge/cli.mjs compare testdata/saet-1 <ny-motors-svar> testdata/saet-1-nuvaerende
```

Sammenligner to motorer, som spec. 15.2 siger. For hvert input holdes A's
**dårligste** frø op mod B's **bedste** (strengt for A):

- De **tunge regler** (trin 1–4) sammenlignes for sig.
- **Målene og Saml** (trin 5–6) sammenlignes for sig.
- Antallet af tunge brud i alt vises også.
- Fejl i de faste krav vises for begge sider. Hos B (den nuværende motor) kan
  en sådan fejl også skyldes en forskel i fortolkningen, så den skal
  undersøges, ikke regnes som en sejr. Et kendt eksempel er flere Opdel, hvor
  adapteren kun deler efter den første.
- Et "umulig" uden grund tæller som dårligere.
- Med `--known resultater/kendte-forskelle.json` er inputtene, hvor B's svar
  ikke er en målestok, sorteret fra. Det gælder en bevidst forbedring, en fejl
  i den nuværende motor eller et nyt krav. Her tjekkes kun, at A overholder de
  faste krav.
- Kommandoen slutter med kode 2, hvis A bryder de faste krav.

## Hvad karakteren indeholder

- **`failures`**: brud på de faste krav (spec. 15.1). Listen skal være tom.
  - Hver elev er i præcis én gruppe; ingen ukendte elever; ingen tomme grupper.
  - Elever fra låste grupper står ikke i de nye grupper.
  - Størrelserne følger regnereglen (spec. 4), også med Opdel, låste grupper og
    emner.
  - Grupperne er rene på alle Opdel-kolonner.
  - Skal sammen-blokkene er hele.
  - Matrix "Fuld": hver gruppe har mindst én fra hver kilde, hver kilde er
    spredt jævnt, og grupperne er højst én elev forskellige i størrelse.
  - Emnerne følger reglen i spec. 14.
  - Dannelsen stoppede, hvis en Skal sammen-blok var umulig (og omvendt: et
    "umulig" uden grund er en fejl).
- **`rules`**: hver regel for sig.
  - `value`: tallet.
  - `best`: det bedst mulige, hvor det kendes.
  - `distance`: afstanden mellem de to.
  - `met`: opfyldt, `true`, `false` eller `null` for "ikke målt".
  - `groupsMet`: opfyldt pr. gruppe.
  - For Saml også `parts` (varians og værditælling) og `today`, dagens andel af
    grupper med "én værdi pr. gruppe" (svar5 35).
  - For Fordel også `today` (dagens test som andel) og `fair` (det nye
    "retfærdige antal"; svar6 39).
  - `randomBaseline`: hvad en tilfældig deling giver på reglen.
- **`avoid`**: Undgå hinanden, alle aftaler som ét tal (par).
- **`matrixSources`**: "højst én fra hver kilde" (par), kun i matrix.
- **`precedence.vector`**: rangordens-rækken, der læses fra venstre:
  1. antal fejl i de faste krav,
  2. hver Adskil altid,
  3. Undgå hinanden,
  4. (i matrix) én fra hver kilde,
  5. hver Adskil og Klyng i opskriftens rækkefølge,
  6. målene, trinvist vægtet,
  7. Saml, trinvist vægtet.

  Målene gøres om til samme skala ved at dele med en tilfældig delings tal
  (200 tilfældige delinger med et fast frø). To rækker sammenlignes med
  `compareVectors`.
- **`tiebreak`**: ved Opdel med "antal grupper" eller emne-runding, om
  grupperne er fordelt mellem puljerne efter reglen ved lighed (svar6 37).
- **`stop`**: om dannelsen burde stoppe, og hvorfor (kontraktens
  `together-…`-koder og `matrix-empty-source`).

## Filerne

| Fil | Hvad den gør |
|---|---|
| `values.mjs` | Læser celler: tekst (store/små bogstaver, mellemrum) og tal (komma og punktum) |
| `task.mjs` | Laver kontraktens input om til en opgave: regler, puljer, låste, matrix-kilder |
| `sizes.mjs` | Regnereglen for gruppestørrelser (spec. 4 og 9.2) |
| `rules.mjs` | Målingerne for hver regel (spec. 16) |
| `checks.mjs` | De faste kontroller (spec. 15.1) |
| `feasibility.mjs` | Kan Skal sammen-blokkene lade sig gøre? (spec. 5.1) |
| `topics.mjs` | Den forventede emnefordeling (spec. 14) |
| `rank.mjs` | Rangordenen, skalaen og sammenligningen (spec. 7) |
| `judge.mjs` | Samler det hele: `judge(input, svar)` |
| `validate.mjs` | Tjekker, at et input følger kontrakten |
| `report.mjs`, `cli.mjs` | Rapporten og kommandoen |
| `test/` | Testene (`node --test 'judge/test/*.test.mjs'`) |
| `tools/mutate.mjs`, `tools/mutations.mjs` | Mutationstesten |
| `tools/grade-set.mjs` | Bedømmer et helt sæt og gemmer resultatet som JSON (en baseline, fx `resultater/saet-1-nuvaerende.json`) |

## Sådan er det vist, at dommeren virker

**Testene** (`node --test 'judge/test/*.test.mjs'`, 84 tests):

- Hver regel er målt på små klasser med tal regnet i hånden.
- Hver fast kontrol skal fange sin fejl.
- Stop-grundene og emnefordelingen er afprøvet, og det samme er rangordenen
  med de trinvise vægte.
- Kommandoen er afprøvet.
- De plantede klasser (200 frø plus de 48 i sæt 1) giver **0 på alle regler**
  for den plantede deling.
- En ødelagt plantet deling bliver opdaget.
- Intet svar kommer under "bedst mulige", så det er virkelig en nedre grænse.
- Alle 300 input i sæt 1 kan bedømmes.
- Sæt 1 kan genskabes præcis.

**Mutationstesten** (`node judge/tools/mutate.mjs`) kopierer projektet til en
midlertidig mappe og ødelægger én ting ad gangen i kopien, aldrig i selve
projektet. Bagefter kører den testene. En mutant er "dræbt", når testene
opdager fejlen. Resultat 3/11 2026:

| # | Fil | Hvad blev ødelagt | Resultat |
|---|---|---|---|
| 1 | `values.mjs` | Mellemrum i enderne tæller med | dræbt ✓ |
| 2 | `values.mjs` | Store/små bogstaver tæller med | dræbt ✓ |
| 3 | `values.mjs` | Komma er ikke et decimaltegn | dræbt ✓ |
| 4 | `values.mjs` | En tom celle er en værdi for sig | dræbt ✓ |
| 5 | `task.mjs` | En værdi uden for rangeringen tæller som 0 | dræbt ✓ |
| 6 | `task.mjs` | Kun den første Opdel deler (som i dag) | dræbt ✓ |
| 7 | `task.mjs` | Matrix: stamgrupper uden emne lægges sammen til ét emne | dræbt ✓ |
| 8 | `rules.mjs` | Brud tælles som "for mange" i stedet for par | dræbt ✓ |
| 9 | `rules.mjs` | Bedst mulige = m − k (idérundens fejl) | dræbt ✓ |
| 10 | `rules.mjs` | Adskil: kun den første valgte værdi tæller | dræbt ✓ |
| 11 | `rules.mjs` | Adskil: blokkenes tvungne par glemmes i bedst mulige | dræbt ✓ |
| 12 | `rules.mjs` | Undgå: én pr. gruppe i stedet for par | dræbt ✓ |
| 13 | `rules.mjs` | Matrix-kilder: "for mange" i stedet for par | dræbt ✓ |
| 14 | `rules.mjs` | Klyng: tæller par i stedet for enlige | dræbt ✓ |
| 15 | `rules.mjs` | Fordel: kun ⌊f⌋ er retfærdigt (ikke ⌈f⌉) | dræbt ✓ |
| 16 | `rules.mjs` | Fordel: tomme celler tæller ikke i puljens størrelse | dræbt ✓ |
| 17 | `rules.mjs` | Fordel i dag: antal værdier tæller også tomme celler (svar6 39) | dræbt ✓ |
| 18 | `rules.mjs` | Fordel: det nye "retfærdige antal" meldes altid opfyldt | dræbt ✓ |
| 19 | `rules.mjs` | Fordel "opfyldt": "alle værdier med" glemmes | dræbt ✓ |
| 20 | `rules.mjs` | Balancér: fortegn i stedet for afstand | dræbt ✓ |
| 21 | `rules.mjs` | Balancér: 10 % i stedet for 5 % af spændet | dræbt ✓ |
| 22 | `rules.mjs` | Balancér: én gruppe med tal er nok til at måle | dræbt ✓ |
| 23 | `rules.mjs` | Varians delt med antal − 1 | dræbt ✓ |
| 24 | `rules.mjs` | Ensartede-grænsen uden "dog mindst 1" | dræbt ✓ |
| 25 | `rules.mjs` | Saml: mindst mulige = én gruppe pr. værdi | dræbt ✓ |
| 26 | `rules.mjs` | Saml i dag: to værdier i en gruppe er ok | dræbt ✓ |
| 27 | `rules.mjs` | Saml med tal: værditællingen glemmes i "opfyldt" | dræbt ✓ |
| 28 | `sizes.mjs` | "+1" lægger aldrig en gruppe til | dræbt ✓ |
| 29 | `sizes.mjs` | "-1" runder ned i stedet for op | dræbt ✓ |
| 30 | `sizes.mjs` | Antal grupper: de låste tæller ikke med | dræbt ✓ |
| 31 | `sizes.mjs` | "-1": ingen undtagelse ved færre grupper end emner (svar7 41) | dræbt ✓ |
| 32 | `sizes.mjs` | Undtagelsen gælder også, når der er flere grupper end emner | dræbt ✓ |
| 33 | `sizes.mjs` | Emne-rundingen glemmer de låste | dræbt ✓ |
| 34 | `sizes.mjs` | Næste gruppe til puljen med de MINDSTE grupper | dræbt ✓ |
| 35 | `sizes.mjs` | Ved lighed vinder den første pulje, ikke den største (svar6 37) | dræbt ✓ |
| 36 | `judge.mjs` | Reglen ved lighed mellem puljer meldes altid fulgt | dræbt ✓ |
| 37 | `checks.mjs` | Manglende elever opdages ikke | dræbt ✓ |
| 38 | `checks.mjs` | Elever i to grupper opdages ikke | dræbt ✓ |
| 39 | `checks.mjs` | Låste elever i de nye grupper opdages ikke | dræbt ✓ |
| 40 | `checks.mjs` | Størrelserne tjekkes ikke | dræbt ✓ |
| 41 | `checks.mjs` | Opdel: to puljer i en gruppe er ok | dræbt ✓ |
| 42 | `checks.mjs` | Skal sammen: blokke på 2 tjekkes ikke | dræbt ✓ |
| 43 | `checks.mjs` | Matrix: en manglende kilde opdages ikke | dræbt ✓ |
| 44 | `checks.mjs` | Matrix: jævnhed pr. kilde tjekkes ikke (svar5 34) | dræbt ✓ |
| 45 | `checks.mjs` | Emnerne tjekkes ikke | dræbt ✓ |
| 46 | `checks.mjs` | Nye emner til låste grupper tjekkes ikke | dræbt ✓ |
| 47 | `checks.mjs` | "Skulle have stoppet" opdages ikke | dræbt ✓ |
| 48 | `feasibility.mjs` | Blok på tværs af en lås opdages ikke | dræbt ✓ |
| 49 | `feasibility.mjs` | Blok mod Undgå opdages ikke | dræbt ✓ |
| 50 | `feasibility.mjs` | Blok mod Adskil opdages ikke | dræbt ✓ |
| 51 | `feasibility.mjs` | For stor blok: én plads for meget er ok | dræbt ✓ |
| 52 | `feasibility.mjs` | Pakningen: en blok passer, hvis der er én plads for lidt | dræbt ✓ |
| 53 | `topics.mjs` | Mindste gruppe først | dræbt ✓ |
| 54 | `topics.mjs` | Ved lighed: det sidste emne | dræbt ✓ |
| 55 | `topics.mjs` | Låste grupper tæller ikke med i emnerne | dræbt ✓ |
| 56 | `topics.mjs` | En låst gruppe uden emne får intet emne (svar6 36) | dræbt ✓ |
| 57 | `topics.mjs` | De nye grupper springer ikke de låstes numre over | dræbt ✓ |
| 58 | `rank.mjs` | Faste krav står ikke først (tæller 0) | dræbt ✓ |
| 59 | `rank.mjs` | Klyng er ikke med blandt de tunge | dræbt ✓ |
| 60 | `rank.mjs` | Ingen trinvise vægte (alle vejer 1) | dræbt ✓ |
| 61 | `rank.mjs` | Målene gøres ikke om til samme skala | dræbt ✓ |
| 62 | `rank.mjs` | Sammenligningen vender forkert | dræbt ✓ |
| 63 | `judge.mjs` | Dommeren stoler på svarets egne "rules" | dræbt ✓ |
| 64 | `judge.mjs` | "Umulig" godtages altid | dræbt ✓ |

**64 af 64 mutanter dræbt.**

Første kørsel (56 mutanter) dræbte 48. De 7, der overlevede, viste huller i
testene, og der er nu tilføjet en test for hver af dem. Én mutant kunne først
ikke bruges, fordi teksten stod to steder. Med svar6 kom 6 mutanter til. Fire
af dem prøver de nye regler: den låste gruppe uden emne, reglen ved lighed
mellem puljer, dagens Fordel-test og det retfærdige antal. Med svar7 kom 2
mere til, for undtagelsen ved "-1" og færre grupper end emner.

## Hvor svar6 har afgjort noget

- **Låst gruppe uden emne** (svar6 36): når klassen har emner, skal den have
  et emne i `lockedTopics`. Det er en fast kontrol.
- **Grupper mellem Opdel-puljer** (svar6 37). Det gælder ved "antal grupper"
  og efter emne-runding. Er flere fordelinger lige gode, godtages alle i de
  faste kontroller. `tiebreak.followed` siger, om motoren fulgte reglen ved
  lighed: den største pulje vinder, og derefter den pulje, der optræder
  først. Følger den ikke reglen, står det i rapporten.
- **Fordel** (svar6 39) vises på to måder:
  - `met` og `today` er dagens test (andelen af opfyldte grupper).
  - `fair.met` er det nye "retfærdige antal" (afvigelse 0). Her tæller
    puljens størrelse *N* også elever med tom celle.
- **Saml** (svar6 38): grupper med tal måles på variansen, grupper uden tal på
  værditællingen. Det mindst mulige i værditællingen er Σ ⌈antal / største
  gruppe⌉.
