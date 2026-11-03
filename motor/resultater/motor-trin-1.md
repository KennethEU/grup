# Den nye motor, trin 1: fra klasseliste til opgave

*3/11 2026.*

## Hvad er bygget

Mappen `engine/` (ren JavaScript, ingen afhængigheder):

| Fil | Hvad den gør |
|---|---|
| `values.js` | Tekst gøres ens (store/små bogstaver, mellemrum), tal læses (komma og punktum) |
| `task.js` | Klassen bliver til en opgave: elever får numre, reglerne får behandlede værdier, rangering, puljer fra alle Opdel (kombinationen), matrix-kilder |
| `sizes.js` | Antal grupper og størrelser pr. pulje: "+1"/"-1", antal grupper, låste, emne-runding (svar7 40 og 41) |
| `feasibility.js` | Skal sammen-tjekket (spec. 5.1) med sikker pakning og loft, og tom matrix-kilde |
| `topics.js` | Emnerne til grupperne bagefter (spec. 14) |
| `engine.js` | `ENGINE_INFO` og `run(input, hooks)`; i trin 1 kun en enkel uddeling, der holder de faste krav |

Fravær og låste elever tager appen ud (kontrakt 6), så motoren ser dem ikke.

## Målt på sæt 1 (ét frø; reglerne er ikke med endnu)

- **0 svar bryder de faste krav** (størrelser, puljer, blokke, låste, emner,
  matrix "Fuld", stop).
- **De samme 32 stop.** En test (`tests/task-layout.test.mjs`) tjekker for
  alle 300 input, at motorens stop-grunde har præcis de samme koder som
  dommerens, og at puljer og størrelser er præcis dommerens, også reglen ved
  lighed mellem puljer.
- Reglerne (Adskil, Fordel …) er ikke med endnu, så en sammenligning med den
  nuværende motor giver først mening fra trin 3.
