# Budget uden frø og "Prøv at danne igen"

*3/11 2026. Efter Kenneths prøve på grup.dk: 27 elever, 6 grupper, Fordel Køn,
Balancér Niveau (Lav/Middel/Høj). Beskeden sagde "3 grupper ligger mere end 5 %
fra snittet … Prøv at danne igen", men nye forsøg gav det samme hver gang.*

## Hvad er ændret

1. **En grænse for Balancér** (`engine/bounds.js`). Er tallene hele tal (en
   rangering er altid 1, 2, 3), er hver gruppes sum et helt tal, og summerne
   skal tilsammen give klassens sum. Eksempel (som Kenneths klasse, input 010
   med kun de to regler): 23 elever med niveau, summen 47 (snit 2,04), fem
   grupper med 4 tal og én med 3. Inden for 5 % kræver sum 8 og 6, men
   5 · 8 + 6 = 46, ikke 47. Mindst én gruppe *må* ligge uden for. Grænsen
   regnes på højst ca. 0,1 s og er aldrig over det, et gyldigt svar når (tjekket
   på facit og den nuværende motors svar i sæt 1 og 2). Når den er nået, siger
   beskeden "Det kunne ikke undgås med denne klasse", og motoren stopper.
   Kenneths eksempel: **1 forsøg, 0,007 s**, i stedet for 20 forsøg og "Prøv at
   danne igen".
2. **"Nok det bedste".** Motoren tæller, hvor mange forsøg der hver for sig
   endte med præcis samme resultat som vinderen. Er det mindst 5, slutter
   beskeden med "Mange forsøg endte samme sted, så det er nok det bedste, denne
   klasse tillader." og har `likelyBest: true` (nyt felt, spørgsmål 43). "Prøv
   at danne igen" står kun, når forsøgene var spredte.
3. **Budget uden frø.** `maxAttempts` er nu et *mindste* antal. Derefter
   fortsætter motoren, til (a) alle regler er ved det bedst mulige, (b)
   `maxSeconds` er gået, (c) de seneste `maxAttempts` (20) forsøg ikke har
   fundet noget bedre, og mindst 5 forsøg er endt med samme resultat, eller (d)
   intet er blevet bedre i dobbelt så mange forsøg, som det tog at finde det
   bedste (mindst 40). (d) er til store hold, hvor forsøgene sjældent ender
   helt ens. Med frø er alt som før. Kun vinderens hele deling gemmes, så mange
   forsøg ikke fylder.

## Hvorfor 20 og 5

Jeg kørte op til 200 forsøg (eller 10 s) pr. input i sæt 1 og 2 (520 input
med grupper) og prøvede stopreglerne bagefter på de samme forsøg:

- 200 forsøg slog de første 20 i kun **5 af 520** input, og kun på tredje
  decimal i målene. Flere forsøg hjælper altså sjældent; reglen handler mest
  om ikke at spilde tid.
- "20 uden forbedring og 5 ens" fangede 4 af de 5 og kostede i snit 0,13 s
  ekstra. Med 40 i stedet for 20 fangedes også 4, men det kostede 0,49 s; med
  10 eller 2–3 ens fangedes færre.

## Før og efter (uden frø, som appen)

*Målt i Node: én kerne pr. hold, 10 s budget, 4 hold ad gangen. Det er ikke
det, læreren oplever (appen bruger 8 kerner og 30 s over 100 elever); se
næste afsnit for de store hold.*

Begge udgaver af motoren er kørt med samme hovedfrø (værktøjet erstatter
`Math.random`), fem gange pr. input, 10 s budget, 4 ad gangen.
Sammenligningen er frø for frø: de første 20 forsøg er de samme, så "efter"
kan kun blive dårligere, hvis tiden løber ud før.

| | Tunge regler: bedre / lige / dårligere | Mål: bedre / lige / dårligere |
|---|---|---|
| Sæt 1 (1500 svar) | 0 / 1340 / 0 | 3 / 1335 / 2 |
| Sæt 2 (1500 svar) | 0 / 1260 / 0 | 6 / 1250 / 4 |

De 6 dårligere mål er alle store hold (189–242 elever: 130, 202, 266), der
rammer de 10 s. I den kørsel nåede "efter" færre forsøg end "før" (fx 202: 7
mod 12), fordi flere store hold kørte samtidig og gjorde hvert forsøg
langsommere. Kørt alene er hvert forsøg lige hurtigt i begge udgaver (295 og
130: 0,28–0,32 s), og "efter" når flere forsøg end "før" (32 og 36 mod 20).
I appen kører kun én dannelse ad gangen. (En første kørsel med 8 ad gangen,
hvor halvdelen landede på maskinens langsomme kerner, gav af samme grund flere
af den slags.)

Mod den nuværende motor (dårligste af fem frø) er tallene de samme før og
efter: sæt 1 tunge 8 / 287 / 0, mål 73 / 221 / 1; sæt 2 tunge 12 / 287 / 1
(107, den nuværendes fejl), mål 82→83 bedre / 7 dårligere. 0 fejl i de faste
krav, samme stop.

Tid pr. svar:

| | Før | Efter |
|---|---|---|
| Sæt 1, snit / højst | 0,69 s / 10,7 s | 0,84 s / 11,0 s |
| Sæt 1, over 100 elever | 3,55 s | 3,66 s |
| Sæt 2, snit / højst | 1,03 s / 11,5 s | 1,13 s / 11,6 s |
| Sæt 2, over 100 elever | 4,42 s | 5,47 s |
| Forsøg sæt 1 / sæt 2, snit (højst) | 8,5 (20) / 8,6 (20) | 8,7 (51) / 8,8 (74) |

Mange hold stopper nu efter første forsøg ved Balancérs grænse, så snittet
stiger kun lidt, selvom andre fortsætter efter de 20.

## Store hold med appens budget (30 s, over 100 elever)

De 49 hold over 100 elever i sæt 1 og 2, kørt med appens budget for store hold
(30 s og 20 forsøg) og op til 60 forsøg hver, i Node. Bagefter er det talt,
hvor reglerne ville stoppe:

- **23 stopper i første forsøg**, fordi alle regler er ved det bedst mulige.
- **Hovedparten af resten stopper efter 21–23 forsøg** (i dag: 20).
- **5 hold (136, 295, 206, 160 i sæt 1; 202 i sæt 2) bruger hele tiden.** De
  bliver ved med at blive lidt bedre (fx 295: forbedringer i forsøg 17 og 35;
  136: i 22 og 46), så motoren stopper ikke dem. På 8 kerner svarer 20 forsøg
  for dem til ca. 2–6 s i dag; nu tager de 30 s med fremgang undervejs.
- To hold (232, 266), der ikke blev bedre efter forsøg 1–2, men hvor
  forsøgene aldrig endte ens, stopper nu ved regel (d) efter 41–42 forsøg i
  stedet for at bruge hele tiden.
- I snit 17 forsøg mod 11 i dag; 5 af de 49 får et bedre svar end med 20.

I browseren nåede jeg ikke at måle tiderne pålideligt: browserpanelet var
skjult, og så bremser browseren workerne (hold 225 tog 38 s for 24 forsøg,
hvor 24 forsøg à ca. 1,3 s fordelt på 8 kerner burde tage ca. 4 s). Det bør måles i
Grupper med synlig fane.

## Beskederne

I de 3000 svar uden frø (sæt 1 og 2) stod "Prøv at danne igen" **1315 gange
før og 134 gange efter**; "nok det bedste" 1081 gange, "Det kunne ikke
undgås" 2515 → 2614. Balancér: før 320 gange "Prøv igen"; efter 100 "Det
kunne ikke undgås", 194 "nok det bedste" og 26 "Prøv igen".

## Med frø

Svarene ændres kun, hvor et forsøg nu stopper ved Balancérs grænse (samme
værdi, måske andre grupper). Sæt 1, fem frø: tunge 8 / 287 / 0, mål 74 / 220 /
1, 0 fejl i de faste krav, samme 160 stop, som før; snittid 1,12 s → 0,88 s.
Sæt 2, fem frø: de samme tal som i `saet-2-sammenligning.md` (tunge 12 / 287 /
1, mål 84 / 210 / 6).

## I browseren

`tools/browser/check.html` (8 kerner): input 010 uden frø 28 forsøg på 1,1 s;
Stop besvaret efter 135–139 ms.

## Ikke afprøvet

Kenneths egen klasse (27 elever, 3 grupper uden for de 5 %) har jeg ikke haft.
Kun en klasse som den (input 010 med de to regler) er kørt. Hans klasse ender
med "kunne ikke undgås", "nok det bedste" eller "Prøv at danne igen" alt
efter, om grænsen nås, og om forsøgene ender ens.

## Kontrakten

To ting står ikke i kontrakten: `maxAttempts` som mindste antal uden frø, og
feltet `likelyBest` på `rule-not-met`. Begge er beskrevet i spørgsmål 43 i
`spec/spoergsmaal.md`.
