# Den nye motor, trin 7 og samlet status

*3/11 2026.*

## Trin 7: "én elev i én gruppe"

`engine/placement.js`: regelmodulerne kan bedømme, hvad det koster at sætte én
elev i én bestemt gruppe, ud fra de små tællere og uden at måle alt forfra
(spec. 13). Den giver ændringen pr. trin i rangordenen og pr. regel. Der er
ingen indgang for efternølere endnu (den kommer i en senere kontrakt).

Testen (`tests/placement.test.mjs`) tager en elev ud af færdige grupper i ca.
100 input og sætter den i hver gruppe i sin pulje: ændringen er præcis den
samme, som når hele delingen måles før og efter.

## Den færdige motor på sæt 1

Fem frø pr. input (1500 svar), samme budget som den nuværende motor (10 s, 20
forsøg). Den nye motors **dårligste** frø mod den nuværende motors svar:

| | Bedre | Lige | Dårligere |
|---|---|---|---|
| **Tunge regler** | 8 | 287 | **0** |
| **Mål og Saml** | 74 | 220 | 1 |

- **0 af 1500 svar bryder de faste krav.**
- **Samme 32 stop med samme grund**, i alle fem frø.
- De 5 kendte forskelle overholder de faste krav: de tre, hvor størrelsen i
  dag er forkert (143, 207, 274), og de to matrix-input (194, 213).
- Mål og Saml: af de 220 "lige" har begge motorer 0 (perfekt) i 143. Hvor den
  nuværende ikke er perfekt (120 input), ligger den nye motors dårligste frø i
  midten på 92 % af den nuværendes tal, i snit 75 %.
- Den ene "dårligere" (`117`) er bedre på den øverste Klyng (2 alene mod 4);
  det koster lidt på målene. Det er rangordenen (spec. 7.2), ikke en fejl.

Ved det bedst mulige i det dårligste frø (den nuværende motor i parentes):

| Regel | Ny | Nuværende |
|---|---|---|
| Adskil altid | 72 af 72 | 72 af 72 |
| Undgå hinanden | 93 af 93 | 93 af 93 |
| Adskil | 112 af 112 | 107 af 112 |
| Klyng | 56 af 69 | 53 af 69 |
| Matrix: højst én fra hver kilde | 21 af 25 | 19 af 25 |
| Fordel (retfærdigt antal) | 234 af 267 | 199 af 267 |
| Saml | 29 af 48 | 29 af 48 |

## Tid

- Med 10 sekunders budget (som den nuværende): i snit 1,1 s pr. svar; over 100
  elever i snit 5,2 s (9 dannelser kørte samtidig på maskinen).
- Med motorens eget budget (30 s over 100 elever, ét frø, tre dannelser ad
  gangen): de 23 hold med grupper tog i snit 10,7 s. 12 af dem stoppede under
  1 sekund, fordi alle regler var ved det bedst mulige; de øvrige tog 4–39 s.
  Også her er de tunge regler **0 dårligere** (5 bedre, 21 lige) og målene 0
  dårligere (12 bedre, 14 lige) mod den nuværende motor.
- Med et fast frø er arbejdet et fast antal bytninger (ikke uret), så på en
  travl maskine kan det tage længere end `maxSeconds` (spørgsmål 42 i
  `spec/spoergsmaal.md`). Appen sender intet frø; så stopper motoren efter
  tiden.

## I browseren

`tools/browser/check.html` kører motoren i en Web Worker, som Grupper vil gøre.
Motoren starter selv 8 workers fra `engine/worker.js` og svarer rigtigt (også
"umulig"). Testene viser, at flere kerner giver samme svar som én.

Som appen (frø `null`, 30 s, 8 kerner) på et hold med 265 elever: første
fremgang efter 25 ms, aldrig mere end 0,9 s mellem fremgang, og Stop efter 1,5 s
blev besvaret på 142 ms med en hel deling. Stop efter 0,2 s (før noget forsøg
var færdigt) giver også en hel deling: den hurtige første opbygning.

## Hvad er ikke nået

- **Klyng** når ikke det bedst mulige i 13 af 69 regler (den nuværende i 16).
  Grænsen kan ikke altid nås, men nogle steder kan der måske hentes mere.
- **Saml med tal** når grænsen lige så ofte som i dag (29 af 48). Det er den
  laveste regel, så den viger for alt andet.
- **Efternølere** har ingen indgang endnu (kommer i en senere kontrakt).
- Rammer pakningen af Skal sammen-blokke sit loft før kørslen, og kan blokkene
  heller ikke lægges under opbygningen, svarer motoren "umulig" med
  `together-cannot-pack` bagefter (spec. 5.1). Det sker ikke i sæt 1.
- Backtracking for Adskil altid (spec. 10.4) er ikke bygget: den lokale søgning
  når allerede det bedst mulige i alle 72 regler, så den har ikke været nødvendig.
