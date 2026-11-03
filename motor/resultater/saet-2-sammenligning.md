# Den nye motor mod den nuværende på testsæt 2 (aldrig set før)

*3/11 2026. Skrevet af den koordinerende session. Sæt 2 er 300 nye input med
andre frø end sæt 1; motoren er ikke tunet efter det. Den nye motor er kørt
med fem frø (201–205, budget 10 s); den nuværende med ét frø gennem
adapteren. Svarene fra den nye motor er ikke gemt her (de kan laves igen med
`node tools/run-set.mjs testdata/saet-2 <mappe> --seeds 201,202,203,204,205
--max-seconds 10`).*

## Kort fortalt

- **Den nye motor:** 0 af 1500 svar bryder de faste krav.
- **Den nuværende motor:** 12 af 300 svar bryder de faste krav (16
  gruppestørrelser, 13 matrix "mindst én fra hver kilde", 1 forkert stop).
- **Tunge regler** (den nyes dårligste frø mod den nuværende): **12 bedre ·
  287 lige · 1 dårligere.**
- **Mål og Saml:** **84 bedre · 210 lige · 6 dårligere.**

## Det ene "dårligere" på de tunge regler: 107

Adskil 12 par mod 10. Men den nuværende motors svar er ugyldigt: den laver 9
grupper, hvor reglen giver 8 (4 grupper i puljen "2.c", hvor der skal være 3).
Det er fejlen med emner + Opdel (svar7 40). Med flere grupper bliver Adskil
lettere. Den nye motor holder størrelsen, og så er 12 det bedst mulige
(dommeren: afstand 0). Ikke en regression.

## De 6 "dårligere" på målene

| Input | Forklaring |
|---|---|
| 107 | Som ovenfor: den nuværende har for mange grupper |
| 125, 172, 270 | Den nye er **bedre på de tunge regler**; målene viger (rangordenen) |
| 204 | Den nuværende motors svar er ugyldigt (3 fejl i de faste krav) |
| 277 | Ægte: samme tunge regler, lidt dårligere mål. Det eneste af 300 |

## Fejl i den nuværende motor, som sæt 2 viste

- **Matrix "Fuld"** bryder "mindst én fra hver kilde" i 13 svar (sæt 1: 1).
  Det er langt hyppigere, end sæt 1 antydede.
- **Emner + Opdel / låste grupper** giver forkerte gruppestørrelser (16).
- **127:** den nuværende motor stopper med "Skal sammen samler 4 elever, men
  den største gruppe har 3 pladser", men med 8 frie elever og 3 pr. gruppe
  "+1" bliver det 2 grupper på 4, og blokken passer. Antallet af grupper er
  regnet forkert (emner og en låst gruppe). Den nye motor danner grupperne.

## Konklusion

Den nye motor holder kravet på et sæt, den aldrig har set: aldrig dårligere
på de tunge regler (det ene tilfælde er den nuværendes fejl), bedre på
målene i 84 og dårligere i 6, hvoraf 5 er forklaret. Og den overholder de
faste krav overalt, hvor den nuværende ikke gør.
