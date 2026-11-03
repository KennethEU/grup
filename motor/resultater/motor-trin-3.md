# Den nye motor, trin 3: byg grådigt, forbedr så

*3/11 2026.*

## Hvad er bygget

- `engine/search.js`, ét forsøg:
  1. **Byg** (spec. 10.1): Skal sammen-blokke først, de største først, og kun
     hvor resten stadig kan pakkes. Så elever med Adskil altid, så elever med
     Undgå, Adskil og Klyng (Klyng to og to), til sidst resten. Hver lægges,
     hvor den gør mindst skade efter rangordenen; lidt tilfældighed.
  2. **Forbedr** (10.2): byt to elever, flyt én elev fra en gruppe, der er én
     større, eller byt en blok mod en lige så stor blok eller mod lige så mange
     enkelte elever. Kun når rangordenen siger "bedre".
  3. **Ryst**: 2–5 tilfældige bytninger, og forbedr igen. Blev det ikke bedre,
     går forsøget tilbage til det bedste.
  Intet bytte bryder de faste krav (samme pulje, hele blokke, i matrix "Fuld"
  kilderne jævne).
- `engine/solve.js`: mange forsøg med hvert sit frø; den bedste efter
  rangordenen vinder (ved lighed det laveste nummer). Med et fast frø styres
  arbejdet af tællere, ikke af uret, så svaret aldrig afhænger af maskinen.
  Stopper før tid, når alle regler er ved det bedst mulige.

## Målt på sæt 1

Fem frø pr. input (1500 svar), samme budget som den nuværende motor (10 s,
20 forsøg). Den nye motors **dårligste** frø holdt op mod den nuværendes
svar (`node tools/summary.mjs <mappe>`, som bruger dommerens `compare`):

| | Bedre | Lige | Dårligere |
|---|---|---|---|
| **Tunge regler** (Adskil altid, Undgå, Adskil, Klyng, matrix-kilder) | 8 | 287 | **0** |
| **Mål og Saml** | 74 | 220 | 1 |

- **0 af 1500 svar bryder de faste krav.**
- **Samme 32 stop med samme grund** i alle fem frø (koderne er de samme som
  dommerens).
- De 5 kendte forskelle (143, 207, 274, 194, 213) overholder de faste krav.
- Den ene "dårligere" på målene, `117`, er ikke en tilbagegang: den nye motor
  er **bedre** på den øverste Klyng (2 elever alene mod 4), og det koster lidt
  på målene. Den øverste regel vinder (spec. 7.2).

Ved det bedst mulige i det dårligste frø (den nuværende motor i parentes):

| Regel | Ny | Nuværende |
|---|---|---|
| Adskil altid | 72 af 72 | 72 af 72 |
| Undgå hinanden | 93 af 93 | 93 af 93 |
| Adskil | 112 af 112 | 107 af 112 |
| Klyng | 56 af 69 | 53 af 69 |
| Fordel (retfærdigt antal) | 234 af 267 | 199 af 267 |
| Saml | 29 af 48 | 29 af 48 |

## Tid

Med 10 sekunders budget: i snit 1,1 s pr. svar; over 100 elever i snit 5,3 s
(højst 22,6 s, men da kørte 9 dannelser samtidig på maskinen; alene tager den
langsomste ca. 8 s). Den nuværende motor brugte i snit 6 s over 100 elever.
