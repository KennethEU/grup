# Åbne spørgsmål til specifikationen

*3/11 2026. Hører til [specifikation.md](specifikation.md). Svarene skal
beskrive, hvad programmet skal gøre (set udefra), ikke hvordan den gamle kode
gør det.*

## Besvarede (se [svar2.md](svar2.md))

Spørgsmål 1–18 er besvaret i [svar2.md](svar2.md) og arbejdet ind i
specifikationen. Afsnittet i parentes er, hvor svaret står nu.

1. De tunge regler indbyrdes — **Besvaret** (svar2 1, Kenneth): den øverste
   vinder altid (spec. 7.2).
2. Hvor står Undgå hinanden — **Besvaret** (svar2 2, Kenneth): først blandt de
   tunge, under Adskil altid (spec. 7.1–7.2).
3. Vægte mellem målene — **Besvaret** (svar2 3, Kenneth): trinvis *n*, *n*−1 …
   1 (spec. 7.2).
4. Matrix uden "Fuld" — **Besvaret** (svar2 4, Valgt): efter Undgå hinanden,
   før matrixens egne tunge regler (spec. 7.1, 9.2).
5. Adskil altid inde i en blok — **Besvaret** (svar2 5): dannelsen stopper
   (spec. 5.1).
6. Flere fejlende Skal sammen — **Besvaret** (svar2 6, Valgt): alle i én
   besked, ét klik (spec. 5.2).
7. Matrix "Fuld" med ulige kilder — **Besvaret** (svar2 7): mindst én fra
   hver, overskud spredt jævnt (spec. 9.2, 15.1).
8. Emner + Opdel + låste — **Besvaret** (svar2 8): rundes for hele klassen,
   låste tæller med (spec. 4.4).
9. Emnefordeling ved lighed — **Besvaret** (svar2 9): først på emnelisten;
   lige store grupper i navnerækkefølge (spec. 14).
10. Klyng — **Besvaret** (svar2 10): alle værdier (spec. 6.5).
11. Adskil altid — **Besvaret** (svar2 11): ved en værdi i en kolonne, som
    Adskil (spec. 6.2).
12. Ensartede "opfyldt" — **Besvaret** (svar2 12): varians ≤ max(1;
    0,1 · (spænd/2)²) (spec. 6.8, 16).
13. Kolonnens spænd — **Besvaret** (svar2 13): hele opgaven (spec. 6.7, 16).
14. Fordel "opfyldt" ved skæv fordeling — **Besvaret** (svar2 14): testen
    beholdes; "uundgåeligt" i beskeden (spec. 6.6).
15. Tidligere makkere — **Besvaret** (svar2 15, Kenneth): senere (spec. 8.4).
16. Efternølere — **Besvaret** (svar2 16): Adskil altid → Undgå → Adskil;
    aldrig i en låst gruppe (spec. 13).
17. Tidsloft — **Besvaret** (svar2 17, Valgt): 10 s, fx 30 s over 100 elever
    (spec. 11.2).
18. Afspilning — **Besvaret** (svar2 18, Valgt): som i dag, for den bedste
    kørsel, loft på størrelsen (spec. 12).

## Besvarede (se [svar3.md](svar3.md))

19. Hvor står Saml — **Besvaret** (svar3 19): altid efter alle andre mål;
    flere Saml vejes trinvist (spec. 7.2).
20. "Ryst" i afspilningen — **Besvaret** (svar3 20, Valgt): vises, markeret
    som "ryst" (spec. 12).
21. Varians i Ensartede — **Besvaret** (svar3 21): delt med antal; gruppe uden
    tal tæller ikke; ingen tal = "ikke målt" (spec. 6.8, 16).

## Besvarede (se [kontrakt.md](kontrakt.md) version 2 og [svar4.md](svar4.md))

Kontrakten (version 1) holdt op mod specifikationen gav spørgsmål 22–32;
kontraktversion 2 svarer på 22–29, 31 og 32, og svar4.md på 30 og 33.

22. Matrix "Fuld" — **Besvaret** (kontrakt 2 afsnit 2.2): mindst én fra hver
    kilde, de ekstra spredes jævnt (spec. 9.2). Se dog 34.
23. `pool` med flere Opdel — **Besvaret** (kontrakt 2 afsnit 3.4): `pool` =
    "2.a + Klima", `poolValues` = værdierne (spec. 3.5).
24. Nye beskedkoder — **Besvaret** (kontrakt 2 afsnit 3.4): `split-empty-cells`,
    `small-pool`, `fewer-groups-than-pools`, `cluster-unavoidable` og
    `unavoidable` på `rule-not-met` (spec. 8.1).
25. Gruppenumre — **Besvaret** (kontrakt 2 afsnit 2.2, 3.3, 3.4): `{gruppe:N}`
    i teksten, og låste grupper har `number` og `name` (spec. 8.1, 14).
26. Stop — **Besvaret** (kontrakt 2 afsnit 3.2, 5): `status: "stopped"` med
    den foreløbig bedste (spec. 11.2).
27. Stopbetingelse og budget — **Besvaret** (kontrakt 2 afsnit 2.2): stop ved
    "bedst mulige på alle regler"; 30 s over 100 elever; forsøg er motorens
    egen enhed (spec. 11.2).
28. "Ikke målt" — **Besvaret** (kontrakt 2 afsnit 3.5): `met: null` (spec. 16).
29. Ét klik for alle Skal sammen — **Besvaret** (kontrakt 2 afsnit 3.4): én
    besked pr. umulig blok; knappen fjerner dem alle (spec. 5.2).
30. Saml og rangering — **Besvaret** (svar4 30): med tal eller rangering er
    Saml en blød Ensartede; uden, en værditælling (spec. 6.9, 16).
31. Afspilning ved loftet — **Besvaret** (kontrakt 2 afsnit 3.6): de sidste
    trin samles i ét `swaps`-trin, `cut: true` (spec. 12).
32. Mere i fremgangen — **Besvaret** (kontrakt 2 afsnit 4): `rulesNotMet` og
    `atBestPossible` (spec. 11.3).
33. Balancér uden tal — **Besvaret** (svar4 33): gruppen er ikke med; færre
    end to grupper med tal = "ikke målt" (spec. 6.7, 16).

## Besvarede (se [svar5.md](svar5.md))

34. Matrix "Fuld", "spredes jævnt" — **Besvaret** (svar5 34, Valgt): begge
    dele er krav, jævnt pr. kilde og højst én elev forskel i størrelse (spec.
    9.2, 15.1). Kontrakten får det med i næste version.
35. Saml "opfyldt" — **Besvaret** (svar5 35): i dag pr. gruppe ("én værdi" /
    variansgrænsen, andel af grupper); Valgt forbedring: mod det bedst mulige,
    de to dele lagt sammen på fælles skala. Dommeren viser begge (spec. 6.9,
    16).

## Besvarede (se [svar6.md](svar6.md))

Spørgsmål 36–39 kom fra arbejdet med dommeren (trin 2).

- 36 — **Besvaret** (svar6 36): ja, den låste gruppe får et emne. Dommeren
  kræver det nu (spec. 14).
- 37 — **Besvaret** (svar6 37): den største pulje vinder ved lighed, så den,
  der optræder først. Det er nu et krav til motoren (spec. 4.2). Dommeren
  godtager lige gode fordelinger og melder, om reglen blev fulgt.
- 38 — **Besvaret** (svar6 38): det afgøres pr. gruppe, som dommeren gør.
- 39 — **Besvaret** (svar6 39): dommeren viser dagens test ved siden af det
  nye "retfærdige antal" (spec. 6.6, 16).

Spørgsmålene, som de blev stillet:

36. **Låst gruppe uden emne.** Klassen har emner, og en låst gruppe har
    `topic: null`. Får gruppen et nyt emne i `lockedTopics` (som en låst gruppe
    med et forældet emne), eller beholder den "intet emne"? **Dommeren nu:**
    godtager begge dele.
37. **Grupper mellem Opdel-puljer, når flere fordelinger er lige gode.** Med
    "antal grupper" (og efter emne-runding) deles grupperne mellem puljerne,
    "så ens som muligt". To puljer på 6 elever og 3 grupper kan blive 2 + 1
    eller 1 + 2. Hvilken bruger programmet i dag (fx den første pulje først)?
    **Dommeren nu:** godtager alle lige gode fordelinger. Kravet er kun, at
    ingen pulje burde have givet en gruppe videre til en anden.
38. **Saml: hvornår er en kolonne en "talkolonne"?** **Dommeren nu:** Saml
    regner som en blød Ensartede, så snart én elev har et tal (eller der er en
    rangering). Ellers tæller den værdier.
39. **Fordel med tomme celler.** I det "retfærdige" antal (spec. 16) tæller
    puljens størrelse *N* også elever med tom celle. Gruppens størrelse er hele
    gruppen. **Dommeren nu:** som spec. 16.

## Besvarede (se [svar7.md](svar7.md))

- 40 — **Besvaret** (svar7 40): i dag er det en fejl. Den nye motor regner pr.
  pulje, og rundingen kræver, at alle puljer holder størrelsen (spec. 4.4).
  143, 207 og 274 er en bevidst forbedring i sammenligningen.
- 41 — **Besvaret** (svar7 41): det er bevidst. Ved "-1" og færre grupper end
  emner får hvert emne én gruppe (spec. 4.4). Dommeren godtager 164.

Spørgsmålene, som de blev stillet:

Dommeren følger spec. 4.1 og 4.4, som de står. På disse to punkter gør den
nuværende motor noget andet, og dommeren melder derfor en fejl i
størrelserne. Spørgsmålet er, om det er beskrivelsen, der er upræcis, eller
motoren, der afviger.

40. **Emner og Opdel: regnes antallet af grupper for hele klassen eller pr.
    pulje?** Spec. 4.1 siger, at med Opdel regner hver pulje for sig, og
    svar2 8 siger, at emnerne runder det samlede antal. Den nuværende motor ser
    ud til at regne antallet for hele klassen, når der er emner, og så dele
    det mellem puljerne. Det giver grupper uden for "målet eller én over/under":
    - `207-…`: 15 elever (7 i 2.a, 8 i 2.b), 2 pr. gruppe "+1", 5 emner. Den
      nuværende motor danner 5 grupper (2.a: 4 og 3; 2.b: 2, 3, 3). Dommeren
      venter 7 (3 + 4). Rundingen ned til 5 ville give grupper på 4, altså to
      over målet.
    - `143-…` (4 pr. gruppe "-1", 5 emner): 2.b får grupper på 4, 4, 4, 5, altså
      én over målet, selvom "-1" betyder målet eller under.
    - `274-…` (5 pr. gruppe "+1", 4 emner, 1 låst): 2.a's 7 elever kommer i én
      gruppe på 7.

    Er det sådan, programmet skal gøre (og dommeren rettes), eller er det en
    fejl, som den nye motor ikke skal gentage? **Forslag:** den nye motor
    følger spec. 4.1, og forskellen beskrives som en bevidst forbedring.
41. **"-1" med emner: hvor langt under målet må rundingen gå?** `164-…`: 21
    elever, 6 pr. gruppe "-1", 5 emner. Spec. 4.4 (svar2 12): "kun så længe
    grupperne holder sig inden for højst én under målet". Den nuværende motor
    runder 4 grupper op til 5, så grupperne bliver 4 og 5, altså to under
    målet. Dommeren venter 4 grupper. Hvilken grænse gælder? **Forslag:**
    "højst én under", som beskrevet.

## Åbne (fra motoren, trin 3–7)

42. **Budgettet med et fast frø.** Kontrakt 2.2 siger: med et frø styres
    antallet af forsøg af `maxAttempts` og `minAttempts`, ikke af
    `maxSeconds`, så tiden aldrig ændrer svaret. Motoren gør nu sådan: med et
    frø kører den altid `maxAttempts` forsøg (eller færre, hvis alle regler er
    ved det bedst mulige), og hvert forsøg må prøve et **fast antal**
    bytninger, regnet som 1 million pr. sekund i `maxSeconds`, delt på
    `maxAttempts`. Uret bruges aldrig, så samme input og frø giver samme svar
    på enhver maskine. Men `maxSeconds` i input påvirker altså arbejdet (10
    eller 30 sekunder giver forskellige svar med samme frø), og på en
    langsom eller travl maskine kan en kørsel med frø vare længere end
    `maxSeconds` (op til ca. 39 s for et hold over 100 elever, når tre kørte
    samtidig). Uden frø (appen) stopper motoren efter tiden som aftalt.
    **Er det i orden**, eller skal arbejdet med frø slet ikke afhænge af
    `maxSeconds`? **Motoren nu:** som beskrevet.

## Åbne (fra motoren, efter Kenneths prøve på grup.dk)

43. **Budget uden frø og beskeden "Prøv at danne igen".** Kenneth fik
    "Balancér på "Niveau": 3 grupper ligger mere end 5 % fra snittet (…). Prøv
    at danne igen", selvom en ny dannelse ikke kunne hjælpe. Motoren gør nu to
    ting, som kontrakten ikke beskriver:
    - **`maxAttempts` uden frø.** Kontrakt 2.2 siger "højst så mange forsøg".
      Uden frø (appen) er `maxAttempts` nu et **mindste** antal: motoren
      fortsætter, til de seneste `maxAttempts` forsøg ikke har fundet noget
      bedre, og mindst 5 forsøg hver for sig er endt med samme resultat (eller
      intet er blevet bedre i dobbelt så mange forsøg, som det tog at finde
      det bedste), til alle regler er ved det bedst mulige, eller til
      `maxSeconds` er gået. Store hold, der stadig bliver lidt bedre, kan
      derfor bruge hele `maxSeconds` (30 s over 100 elever).
      Med et frø er alt som før (højst `maxAttempts`).
    - **Nyt felt `likelyBest` på `rule-not-met`** (sand/falsk, kommer altid
      med ved siden af `unavoidable`). `true`, når reglen ikke er bevist
      uundgåelig, men mindst 5 forsøg endte med præcis samme resultat. Teksten
      slutter så med "Mange forsøg endte samme sted, så det er nok det
      bedste, denne klasse tillader." i stedet for "Prøv at danne igen".
      `unavoidable` betyder stadig kun "bevist".
    - Balancér har nu en nedre grænse (`engine/bounds.js`). Når den er nået,
      eller der er så få grupper uden for de 5 %, som tallene tillader, er
      beskeden `unavoidable: true` ("Det kunne ikke undgås med denne
      klasse"). Det kræver intet nyt felt.

    **Er det i orden** at skrive dette ind i kontrakten (2.2 og 3.4)? Appen kan
    vise `likelyBest` som `unavoidable` eller blot bruge teksten.

44. **Nyt i `stats`: hvilket forsøg vandt, og hvor mange andre endte lige så
    godt.** Kenneth spurgte, om han ikke skulle kunne se de 20 forsøg.
    Afspilningen viser kun det vindende forsøg, men nu kan appen sige fx
    *"Forsøg 13 af 20 – det bedste. 9 andre forsøg endte lige så godt."*
    **Forslag til kontrakt version 3 (3.7 `stats`):**

    | Felt | Type | Betydning |
    |---|---|---|
    | `attempts` | heltal ≥ 0 | Som nu: antal **færdige** forsøg. |
    | `winner` | heltal ≥ 1, eller `null` | Det vindende forsøgs nummer blandt de færdige forsøg (1 = det første). Altid ≤ `attempts`. `null`, når Stop kom, før noget forsøg var færdigt (så er grupperne den hurtige første opbygning). |
    | `sameAsWinner` | heltal ≥ 0, eller `null` | Hvor mange **andre** færdige forsøg endte lige så godt som vinderen efter rangordenen (ens rangordens-række på 6 betydende cifre; Fordels sidste trin, dagens test, tæller ikke med). `null` sammen med `winner: null`. |

    - Forsøgenes numre er den rækkefølge, de blev sat i gang i. På flere
      kerner giver samme frø samme numre og samme `winner` som på én kerne.
      Uden frø tælles kun færdige forsøg, så nummeret aldrig er over
      `attempts`, heller ikke ved Stop.
    - Det er den samme optælling som "nok det bedste" i beskederne:
      `likelyBest: true` ⇔ `sameAsWinner` ≥ 4 (mindst 5 forsøg i alt endte
      ens), når kørslen ikke er stoppet.
    - Afspilningen ændres ikke: den viser stadig kun vinderen, og
      sammenlægningen ved loftet (`cut`) rører ikke tallene.
    - `stats` mangler ved `unsupported` og `error`. Ved `impossible` er
      `attempts` 0, og `winner`/`sameAsWinner` mangler.

45. **Matrix-kilderne: tekst, farve og "samme besked" i check og efter
    kørslen.** Kenneth fik tre røde/gule beskeder om "par i samme gruppe" i en
    matrix med 2 kilder og 6 grupper, selvom resultatet var det bedst mulige.
    Motoren gør nu sådan (forslag til kontrakt version 3):
    - **Ny kode `matrix-sources-spread`** (`type: "note"`, `rule: null`,
      `values`: de kilder, der har flere elever end der er matrixgrupper).
      Tekst: *Højst én fra hver kilde kan ikke lade sig gøre med 6
      matrixgrupper. Hver gruppe får 2 fra "Ukraine" og 2–3 fra "Island", så
      jævnt som det kan blive.* Den erstatter de røde `separate-unavoidable`
      for matrix-kilder (de bruges nu kun for Adskil og Adskil altid).
    - Efter kørslen kommer der kun en besked mere (`rule-not-met`, `rule:
      null`, `values`: kilderne), hvis kilderne **ikke** er spredt så jævnt,
      som det kan lade sig gøre. Er de det, er der ingen "par"-besked.
    - **Farven (hvordan `type` bestemmes):**
      - `impossible` (rødt): motoren stopper (status `impossible`), eller en
        regel, **læreren selv har sat** (Adskil altid, Adskil, Undgå hinanden,
        Klyng), kan ikke opfyldes med klassen, uanset deling. Det er noget,
        læreren kan rette i opsætningen.
      - `conflict` (gult): to regler trækker hver sin vej (som nu).
      - `note`: alt andet, også en regel, der er ved det bedst mulige, og
        matrixens egen "højst én fra hver kilde", som læreren ikke selv har
        valgt.
    - **Samme besked i check og efter kørslen:** nøglen er `code` + `rule` +
      `pool` + `values` (i den rækkefølge, de står). Har en besked fra
      `check(input)` og en fra svaret samme nøgle, er det det samme forhold,
      og appen viser den én gang. For `matrix-sources-spread` er også
      teksten den samme. (For `rule-not-met` er teksten efter kørslen den
      gældende; Fordels "kan ikke gå helt lige op" fra check erstattes af
      svarets.)

46. **Små ændringer fra kodegennemgangen, som kontrakten bør kende:**
    - **Ugyldigt input** (ingen elever, eller en størrelse, der giver 0
      grupper, fx `mode: "full"` uden matrix): `run` og `check` svarer
      `status: "unsupported"` med `reason: { code: "invalid-input", text }`
      i stedet for `impossible` uden beskeder, så appens tilbagefald virker.
    - **Fremgangens `rulesTotal`** tæller kun regler, der kan måles (ikke
      `met: null`), og `rulesMet` kun dem med `met: true`.
    - **Fordel og "Det kunne ikke undgås":** kommer nu kun, når det
      retfærdige antal er nået, **og** dagens test beviseligt ikke kan
      bestås med klassen. Ellers "nok det bedste" eller "Prøv at danne
      igen". Motoren foretrækker nu delinger, der består dagens test: antallet
      af grupper, der ikke gør, er et ekstra **sidste** trin i rangordenen
      (efter Saml). Det afgør kun mellem delinger, der er lige gode på alt
      andet, så intet andet bliver dårligere; reglens eget tal er uændret.
      (Et tillæg blandt målene, som kodegennemgangen foreslog, blev prøvet:
      det gav færre grupper uden om dagens test, men byttede med Balancér og
      Saml, så målene blev dårligere i 34–52 af 1500 svar pr. sæt.)

## Åbne (fra motoren, efter appens prøve af 2a58e1f)

47. **Ugyldige størrelser giver `invalid-input` (og `check` hænger aldrig).**
    Med `perGroup` og `target: -2` ("+1") kom `check(input)` aldrig tilbage:
    løkken, der lægger grupper til, til ingen gruppe er mere end én over
    målet, kunne aldrig nå et negativt mål. `count: 0` og `-1` svarede `ok`
    med én gruppe. Motoren gør nu sådan, i både `run` og `check`:
    - `target` og `count` skal være **hele tal fra 1 til 999** (som kontrakt
      2.1 siger), og `count` skal være større end antallet af låste grupper.
      `mode` skal være `perGroup`, `count` eller `full`. Ellers: `status:
      "unsupported"`, `reason: { code: "invalid-input", text }` (fx "Elever
      pr. gruppe skal være et helt tal fra 1 til 999."). `check` svarer
      desuden `messages: []`.
    - Det gælder også et tal sendt som tekst (`"4"`) og et kommatal (`2.5`).
      Ingen af de 600 input i sæt 1 og 2 rammes af det.
    - Løkken har desuden et loft (højst én gruppe pr. elev), så en størrelse,
      tjekket ikke fanger, heller ikke kan få den til at hænge.
    - `tools/fuzz-sizes.mjs` prøvede 13 028 kald (target −5…200 med "+1" og
      "-1", count −5…200, med 1, 5, 30 og 300 elever, og almindelig klasse,
      emner, Opdel, matrix og låste grupper; `check` med alle, `run` med et
      udvalg og et lille budget med frø). Intet hang eller kastede. Kørt
      alene tog `check` højst 0,001 s og `run` højst 0,8 s (med `maxSeconds:
      1`). Mens maskinen også kørte testsættene, tog fire `run` på 300 elever
      i matrix 1,0–1,1 s.

    **Er det i orden** at skrive "hele tal fra 1 til 999, ellers
    `invalid-input`" ind i kontrakten (2.1 og 3.2)?

48. **`contractVersion: 3`.** `ENGINE_INFO.contractVersion` og alle svar og al
    fremgang har nu 3, med spørgsmål 43–47 og 49–50. Motoren afviser ikke
    input med `contractVersion: 2`.

49. **Nøglen for "samme besked" har eleverne med.** Spørgsmål 45 sagde `code`
    + `rule` + `pool` + `values`. Det skiller ikke to Undgå hinanden-advarsler
    (input 121: r1, r2, r9 og r2, r5, r7) eller to Skal sammen-beskeder (257)
    ad. **Forslag til kontrakten (3.4):**

    > To beskeder er det samme forhold, når de har samme `code`, `rule`,
    > `pool`, `values` (i den rækkefølge, de står) og `students` (sorteret).
    > Motoren sender aldrig to beskeder med samme nøgle i ét svar eller ét
    > `check`. En besked fra `check(input)` og en fra svaret med samme nøgle
    > er det samme forhold og vises én gang.

    To aftaler, der efter at elever uden for dannelsen er fjernet har de
    samme elever, giver derfor kun én besked.

50. **Resultatet efter kørslen har samme nøgle som advarslen før, og
    erstatter den.** Motoren gør nu sådan (forslag til kontrakten 3.4):
    - **Adskil, Adskil altid, Klyng og Fordel giver én `rule-not-met` pr.
      pulje** (med Opdel), med `pool` og `poolValues` sat, som advarslerne
      før kørslen. Uden Opdel er der som før én pr. regel (`pool: null`).
      Balancér, Ensartede og Saml giver stadig én pr. regel. **Det er nyt for
      appen**: med Opdel kan samme regel have flere `rule-not-met`.
      `unavoidable` regnes for puljen (puljens tal mod puljens bedst mulige).
    - **Fordel** sender de samme `values` i check og i svaret for samme regel
      og pulje: de værdier, hvis antal i puljen ikke går op i puljens antal
      grupper (højst tre, i klassens rækkefølge). I sæt 1 og 2 gav check og
      svaret før forskellige `values` i alle par (fx ["Pige","Dreng","Andet"]
      mod []).
    - **Undgå hinanden giver én `rule-not-met` pr. aftale og pulje**, med
      `students` = aftalens elever (de samme som aftalens `avoid-unavoidable`
      før kørslen) og `rule: null`. Teksten: *Undgå hinanden: {elever} skal i
      hver sin gruppe, men to af dem står i samme gruppe ({gruppe:3}).* Før
      var der én besked for alle aftaler, med eleverne fra flere aftaler.
    - **Har en regel og pulje (for Undgå hinanden: en aftale og pulje) et
      resultat efter kørslen, sender svaret ikke også advarslen**
      (`separate-unavoidable`, `cluster-unavoidable`, `avoid-unavoidable`).
      `check(input)` sender stadig advarslen. I praksis har en sådan advarsel
      altid et resultat (reglen kan jo ikke opfyldes), så advarslerne står
      kun i `check`.
    - Fordels stopregel (alle regler ved det bedst mulige) ser nu også pr.
      pulje: en gruppe uden om dagens test er kun "bedst mulig", hvis dens
      egen pulje beviseligt ikke kan bestå testen. Før så den på reglen, så
      sæt 2-input 210 stoppede efter første forsøg, selvom en pulje kunne
      gøres bedre.

    `tools/check-keys.mjs` tæller de fire ting, appen målte (to beskeder med
    samme nøgle, Fordels `values`, advarsel og resultat i ét svar, Undgå
    hinanden-resultater, der ikke er én aftale); se tallene i
    `resultater/motor-runde-noegler.md`.

51. **Skal sammen og Adskil (den almindelige) stopper kun, når aftalen gør
    det værre** (Kenneths beslutning; ændrer svar2 5 for Adskil). Har to
    elever i samme Skal sammen-blok en værdi, som en almindelig Adskil holder
    adskilt, sammenligner motoren for reglen i blokkens pulje:
    - **uden blokke:** det bedst mulige antal par, præcist (de markerede
      lægges hele tiden i den gruppe med færrest, der stadig har plads),
    - **med blokke:** en nedre grænse (hver blok i sin egen gruppe, resten
      spredt så jævnt som muligt).

    Er grænsen med blokke større, er det bevist, at aftalen koster mindst ét
    par, og dannelsen stopper som før (`together-vs-separate`, rød, med "Dan
    grupper uden aftalen"; teksten siger nu også "Sammen giver de flere par i
    samme gruppe, end klassen ellers er nødt til."). Ellers stopper den ikke,
    og parret i blokken er et af de par, klassen alligevel ikke kan undgå.
    Adskil altid og Undgå hinanden i en blok stopper stadig altid.

    **Nyt i kontrakten (3.4):**
    - **Ny kode `together-separate-pair`** (`type: "note"`, blå): kun i
      `check(input)`, når en blok ikke stopper dannelsen. `rule` = Adskil-
      reglen, `pool` = blokkens pulje (med Opdel), `students` = blokkens
      elever med værdien, `values` = reglens valgte værdier. Tekst: *{elever}
      skal være sammen og har begge en værdi, som Adskil på "Rolle" holder
      adskilt. Det giver ikke flere par i samme gruppe, end klassen alligevel
      er nødt til, så de bliver et af parrene.*
    - **Efter kørslen** nævner Adskils `rule-not-met` for samme regel og pulje
      parret: `students` = de samme elever, og teksten slutter med *{elever}
      er et af parrene, fordi de skal være sammen.* (flere blokke: *Parrene
      mellem {elever} kommer af, at de skal være sammen.*). Som i spørgsmål
      50 sender svaret så ikke noten ved siden af resultatet.
      Kenneths klasse: *Adskil på "Rolle": 2 par ender i samme gruppe
      (Gruppe 4, Gruppe 6). Det kunne ikke undgås med denne klasse. Asta
      Brink og Bertram Hvid er et af parrene, fordi de skal være sammen.*
    - Nøglen for "samme besked" er uændret (spørgsmål 49). Noten og
      resultatet har forskellig `code`; de hører sammen ved `rule` + `pool`,
      ligesom advarslerne i spørgsmål 50.

    Dommeren (`judge/feasibility.mjs`) har fået samme regel, så den ved,
    hvornår et svar med rette stopper. I sæt 1 og 2 kører 4 input nu, som
    før stoppede af denne grund (sæt 1: 142, 215, 257; sæt 2: 116). 7 stopper
    stadig af den (sæt 1: 133, 149, 184; sæt 2: 081, 120, 134, 212), og 1 til
    stoppede kun af en anden grund (sæt 2: 175).
