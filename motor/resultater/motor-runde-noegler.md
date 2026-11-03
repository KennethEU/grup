# Appens prøve af 2a58e1f: størrelser og "samme besked"

*3/11 2026. Fund fra appens tests af 2a58e1f i Grupper. Svarene står i
spørgsmål 47–50 i `spec/spoergsmaal.md`.*

## 1. Ugyldige størrelser

`check(input)` hang med `perGroup` og `target: -2` ("+1"): løkken, der lægger
grupper til, til ingen gruppe er mere end én over målet, kunne aldrig nå et
negativt mål. Nu:

- `target` og `count` skal være hele tal fra 1 til 999, og `count` større end
  antallet af låste grupper. Ellers svarer `run` og `check` `status:
  "unsupported"`, `reason.code: "invalid-input"`. `count: 0` og `-1` svarede
  før `ok`.
- Løkken har desuden et loft, så den aldrig kan køre for evigt.
- Ingen af de 600 input i sæt 1 og 2 bliver ugyldige.
- `tools/fuzz-sizes.mjs`: 13 028 kald (target −5…200 med "+1" og "-1", count
  −5…200; 1, 5, 30 og 300 elever; almindelig klasse, emner, Opdel, matrix og
  låste grupper). 0 hæng, 0 kast, 0 fejl. Længste `check` 0,001 s, længste
  `run` 0,8 s (med `maxSeconds: 1`).

## 2. contractVersion 3

`ENGINE_INFO`, alle svar og al fremgang har `contractVersion: 3`.

## 3. "Samme besked"

Nøglen er nu `code` + `rule` + `pool` + `values` + `students` (sorteret).
Adskil, Adskil altid, Klyng og Fordel giver efter kørslen én `rule-not-met`
pr. pulje (med Opdel), og Undgå hinanden én pr. aftale og pulje med aftalens
elever. Har en regel og pulje et resultat, sendes advarslen fra før kørslen
ikke også i svaret. Fordel har de samme `values` i check og svaret.

`tools/check-keys.mjs` på fem frø pr. input (2600 svar med grupper):

| | Før (2a58e1f) | Nu |
|---|---|---|
| a) to beskeder med samme nøgle i ét svar eller check, gammel nøgle (uden elever) | 56 | 56 |
| a) det samme med den nye nøgle (med elever) | 0 | 0 |
| b) Fordel: andre `values` i svaret end i check | 1355 af 1355 par | 0 af 1915 |
| c) advarsel og resultat for det samme i ét svar | 1090 | 0 |
| d) Undgå hinanden-resultat, der ikke er én aftale | 60 af 90 | 0 af 110 |
| Beskeder fra check, der kommer igen med samme nøgle | 2975 | 3705 |

(Tallene er summen af sæt 1 og 2.) a) er altså løst af nøglen selv: de 56 er
beskeder om forskellige elever (fx to Undgå hinanden-aftaler), som den nye
nøgle skiller ad. Motoren fjerner desuden en besked, hvis den har samme nøgle
som en tidligere i samme svar, men det skete ikke i sæt 1 og 2.

Med frø; uden frø giver de nye svar præcis de samme tal (a–d 0). Dommeren
(`gennemgang/doem.mjs`) finder, med og uden frø, 0 uenigheder om `met`, 0 forkerte
"uundgåelig", 0 manglende og 0 overflødige beskeder. `doem.mjs` er rettet,
så den forstår én besked pr. pulje og pr. aftale (dommeren måler kun hele
reglen: er alle puljernes beskeder "uundgåelige", skal hele reglen være ved
det bedst mulige).

## Stopreglen for Fordel

Med beskeder pr. pulje viste det sig, at stopreglen ("alle regler ved det
bedst mulige") så på Fordel for hele reglen: var dagens test umulig i én
pulje, stoppede motoren, selvom en anden pulje kunne gøres bedre. Det ramte
ét input, sæt 2 nr. 210 (alle fem frø stoppede efter første forsøg). Nu ser
reglen pr. pulje: 210 kører 20 forsøg (0,35 s), og 2 af de 5 frø ender med
færre grupper uden om dagens test (de 3 andre er lige gode).

## Målt på sæt 1 og 2

**Med frø.** Fem frø pr. input, 10 s budget, 4 ad gangen. Både 2a58e1f og
den nye motor er kørt nu, med samme frø.

- **Grupperne er de samme**, svar for svar, i alle 3000 svar undtagen de 5 for
  input 210 (se ovenfor). Kun beskederne er ændret.
- Mod den nuværende motor (dårligste frø), som før:

| | Tunge regler | Mål og Saml | Faste krav | Stop |
|---|---|---|---|---|
| Sæt 1 | 8 / 287 / **0** | 74 / 220 / 1 | 0 fejl | 160, samme grund |
| Sæt 2 | 12 / 287 / 1 (107) | 83 / 211 / 6 | 0 fejl | 240, samme grund |

(bedre / lige / dårligere.) 2a58e1f kørt i dag giver præcis de samme tal
(sæt 2's mål 83 / 211 / 6; i `motor-runde-kenneth.md` stod 84 / 210 / 6, som
var målt før det sidste commit). 107 er den nuværende motors fejl.

**Uden frø** (som appen; værktøjet giver begge udgaver samme hovedfrø), 10 s,
4 ad gangen, den gamle og den nye kørt efter hinanden:

| | Mod den nuværende: tunge | Mål og Saml | Faste krav | Frø for frø mod 2a58e1f: tunge | Mål |
|---|---|---|---|---|---|
| Sæt 1 | 8 / 287 / **0** | 73 / 221 / 1 | 0 fejl, 160 stop | 0 / 1338 / 2 | 0 / 1333 / 5 |
| Sæt 2 | 12 / 287 / 1 (107) | 84 / 210 / 6 | 0 fejl, 240 stop | 0 / 1260 / 0 | 0 / 1256 / 4 |

Mod den nuværende motor er tallene de samme som for 2a58e1f uden frø. De få
"dårligere" frø for frø er alle store eller tidsbundne hold, der rammer de
10 s (127, 206, 232, 295 i sæt 1; 266, 282 i sæt 2), hvor den ene kørsel nåede
færre forsøg. Det er støj fra tiden, ikke ændringen:

- Med frø gør de to udgaver præcis det samme arbejde (samme grupper i alle
  svar undtagen 210).
- Kørt alene tager 10 forsøg lige lang tid i begge udgaver (127: 4,3 s; 295:
  13,7–16,2 s, skiftevis hurtigst).
- 2a58e1f kørt to gange uden frø mod sig selv giver 1 tung og 8 mål
  "dårligere" på sæt 1, på de samme hold (127, 206).

## Tests

47 tests, alle grønne. Nye i `tests/keys.test.mjs`: target −2, −1, 0 (begge
"+1" og "-1"), 2,5, "4" og 1000, count 0 og −1, ukendt mode og count ikke
større end de låste (alle med 2 s tidsgrænse); Undgå hinanden med to aftaler
(én advarsel og ét resultat pr. aftale, samme elever); to Skal sammen-beskeder
med hver sin nøgle; Opdel med Fordel og Adskil pr. pulje (samme nøgle og
values, ingen advarsel ved siden af resultatet); Fordel uden Opdel med samme
nøgle i check og svaret.
