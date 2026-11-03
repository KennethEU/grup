# Skal sammen og Adskil: stop kun, når aftalen gør det værre

*3/11 2026. Kenneths beslutning (spørgsmål 51 i `spec/spoergsmaal.md`).*

Kenneths klasse: 30 elever, 7 grupper, 9 med "Ordstyrer" under Adskil, så
mindst 2 par kan ikke undgås. To af ordstyrerne skulle være sammen, og
dannelsen stoppede, selvom parret bare kunne være et af de 2.

## Hvad motoren gør nu

For en almindelig Adskil regner motoren pr. pulje (`separateBlocksHurt` i
`engine/feasibility.js`):

- **uden blokke** det bedst mulige antal par, præcist,
- **med blokke** en nedre grænse (hver blok i sin egen gruppe, resten
  spredt jævnt).

Kun hvis grænsen med blokke er større, stopper dannelsen. Kenneths klasse:
2 par både med og uden blok, så den kører, og beskeden siger *"Adskil på
"Rolle": 2 par ender i samme gruppe (…). Det kunne ikke undgås med denne
klasse. {elever} er et af parrene, fordi de skal være sammen."*. 7
ordstyrere i 7 grupper: 0 par uden blok, 1 med, så den stopper. Adskil altid
og Undgå hinanden i en blok stopper som før.

`check` giver i stedet for det røde stop en blå note (`together-separate-pair`)
med blokkens elever. Svaret sender resultatet, der nævner parret, i stedet
for noten.

Dommeren har fået samme regel (`blocksCostPairs` i `judge/feasibility.mjs`,
skrevet for sig), og motoren og dommeren er enige om at stoppe eller ej i
alle 600 input.

## Målt (ét frø, sæt 1 og 2, 10 s)

| | Tunge regler mod den nuværende | Mål og Saml | Faste krav | Stop |
|---|---|---|---|---|
| Sæt 1 | 11 / 284 / **0** | 77 / 217 / 1 | 0 fejl | 29 (før 32), samme grund som dommeren |
| Sæt 2 | 13 / 286 / 1 (107) | 86 / 209 / 5 | 0 fejl | 47 (før 48), samme grund som dommeren |

(bedre / lige / dårligere; ét frø, så tallene kan ikke sammenlignes direkte
med de fem frøs "dårligste frø".) De 4 input, der nu kører (sæt 1: 142, 215,
257; sæt 2: 116), tæller som "bedre" mod den nuværende motor, som stoppede.
Alle andre svar har præcis samme grupper som 4d730b9 med frø 1.

- 7 input stopper stadig af denne grund (sæt 1: 133, 149, 184; sæt 2: 081,
  120, 134, 212). I 133, 120 og 212 er der ikke flere med værdien end
  grupper, så blokken giver et par, der ellers kunne undgås.
- Dommeren: 0 uenigheder om `met`, 0 forkerte "uundgåelig", 0 manglende eller
  overflødige beskeder. `tools/check-keys.mjs`: a–d alle 0.
- 51 tests, alle grønne. Nye i `tests/together-separate.test.mjs`: Kenneths
  klasse (ingen stop, 2 par, beskeden nævner parret, blokken står i en af de
  2 grupper), 7 i 7 grupper (stopper), Adskil altid (stopper stadig) og
  Opdel (blokken tæller kun i sin egen pulje).
