# Specifikation af den nye gruppemotor — version 2

*3/11 2026. Trin 1 i [plan.md](plan.md). Ingen kode. Opdateret med svarene i
[svar2.md](svar2.md) til [svar7.md](svar7.md) og afstemt med
[kontrakt.md](kontrakt.md), version 2. Venter på Kenneths godkendelse; trin 2 (dommeren)
begynder først, når den koordinerende session giver lov.*

## 0. Hvor indholdet kommer fra (ren-rums-reglen)

Dokumentet er skrevet ud fra præcis ti filer i denne mappe:

- [ideer.md](ideer.md) (idérunden, med den oprindelige specifikation i afsnit 9),
- [svar.md](svar.md) (svar på idérundens spørgsmål og Kenneths beslutninger),
- [svar2.md](svar2.md) (svar på spørgsmål 1–18 i [spoergsmaal.md](spoergsmaal.md)
  og fire nye beslutninger fra Kenneth),
- [svar3.md](svar3.md) (svar på spørgsmål 19–21),
- [svar4.md](svar4.md) (svar på spørgsmål 30 og 33),
- [svar5.md](svar5.md) (svar på spørgsmål 34 og 35),
- [svar6.md](svar6.md) (svar på spørgsmål 36–39, fra arbejdet med dommeren),
- [svar7.md](svar7.md) (svar på spørgsmål 40–41, fra bedømmelsen af den nuværende motor),
- [kontrakt.md](kontrakt.md) (formatet for input og svar, version 2; svarer på
  spørgsmål 22–29, 31 og 32),
- [plan.md](plan.md) (faserne).

Intet andet er åbnet: ingen kode fra Grupper, ingen kode fra GroupEng eller
andre programmer til gruppedannelse, og heller ikke den note, der ligger i
den fælles notemappe for sessionerne (den ligger uden for denne mappe og
handler muligvis om den nuværende motor, så den er bevidst ikke læst).
Desuden er der brugt almindelig lærebogsviden om algoritmer.

Hvor `svar.md` eller `svar2.md` siger noget andet end `ideer.md`, gælder
svarene. Hvor de siger **Kan forbedres**, er der truffet et valg her, og det
står som **Afvigelse fra i dag** (den nye motor gør det bedre) eller **Som i
dag**. **Kenneth** markerer en beslutning fra Kenneth; **Valgt** en beslutning,
den koordinerende session har truffet ud fra Kenneths svar (Kenneth kan ændre
den). Hvor intet af dokumenterne giver svaret, står der **Forslag** her og et
spørgsmål i [spoergsmaal.md](spoergsmaal.md).

### Kontrakten er formatet

**Motoren skal levere i formatet i [kontrakt.md](kontrakt.md)** (version 2,
`contractVersion: 2`):
den får et input som i kontraktens afsnit 2, sender fremgang som i afsnit 4 og
svarer som i afsnit 3, gennem `run(input, hooks)` i `engine.js` (afsnit 7).
Kontrakten siger, *hvordan data ser ud*, og hvem der gør hvad (appen eller
motoren). Denne specifikation siger, *hvad motoren skal kunne*. Er de uenige om,
hvad motoren skal kunne, gælder specifikationen (koordinatorens note i
kontrakten). Version 2 kan bære alt, specifikationen kræver. Ét sted siger
kontrakten lidt mindre end specifikationen (jævnheden i matrix "Fuld", 9.2);
kontrakten får sætningen med i næste version, og indtil da gælder
specifikationen (svar5 34).

Kontraktens regeltyper svarer til reglerne her: `aggregate` = Opdel,
`strict_separate` = Adskil altid, `separate` = Adskil, `cluster` = Klyng,
`distribute` = Fordel, `balance` = Balancér, `minimizediff` = Ensartede,
`group_sort` = Saml. Aftalerne er `agreements.avoid` (Undgå hinanden) og
`agreements.together` (Skal sammen).

**Fordelingen mellem appen og motoren** følger kontraktens afsnit 6. Det
betyder bl.a., at appen allerede har fjernet fraværende og låste elever,
renset aftalerne og fjernet Adskil-værdier, som kun låste har, før motoren får
input. Hvor afsnit 3 nedenfor beskriver de trin, er det for at sige, hvad
*opgaven* skal indeholde; motoren gør dem kun, hvis appen ikke har gjort det.

---

## 1. Hvad er ændret siden idérunden

| Emne | Idérunden sagde | Nu gælder |
|---|---|---|
| Skal sammen | Plads 2 i rangordenen; kan måske brydes | Et krav, ikke en plads. Kan aldrig brydes. Kan aftalen ikke opfyldes, dannes ingen grupper; beskeden tilbyder at danne uden aftalen denne ene gang (afsnit 5) |
| Undgå hinanden | Vejer som Adskil altid (plads 1) | En tung regel, der kan brydes, hvis det ikke kan undgås; står først blandt de tunge, under Adskil altid (Kenneth) |
| Adskil-brud | Antal "for mange" (m − k) | Antal **par** (en gruppe med 3 giver 3 brud). Bedst mulige: jævn spredning, som for Adskil altid |
| Emner | Kunne være puljer; "inden for 'Klima'" | Emner gives til grupperne **bagefter**, uden for motoren. Reglerne gælder hele klassen. Kun Opdel laver puljer |
| Flere Opdel | Puljen er kombinationen | I dag deler kun den første. Den nye motor bruger kombinationen (Afvigelse fra i dag) |
| Rækkefølge | Rækkefølgen af regler i opskriften betød intet | Opdel → Adskil altid → Undgå hinanden → de tunge i opskriftens rækkefølge (den øverste vinder altid) → målene trinvist vægtet → Saml (Kenneth; afsnit 7) |
| Adskil altid | Et sæt elever (graf-farvelægning) | En værdi i en kolonne, præcis som Adskil; adskiller sig kun ved, hvor tungt den vejer |
| Flere sorteringsregler | Ikke nævnt | Alle tæller fuldt med; plads i opskriften afgør, hvor meget (Afvigelse fra i dag) |
| Fremgang | "Foreløbig bedste" undervejs var en idé | Et krav (Kenneths beslutning) |
| Flere kerner | Ikke nævnt | Et krav: flere forsøg på én gang, ét pr. kerne (Kenneths beslutning) |
| Afspilning, efternølere, "dan uden aftalen", emnefordeling | Ikke nævnt | Nye krav (afsnit 11–14) |
| Tal med komma | Åbent spørgsmål | Komma og punktum er begge decimaltegn; "1.000" er 1 |
| Tidligere grupper | Måske en særregel | Ingen særregel; Fordel på gemte gruppekolonner. En par-regel kommer senere (Kenneth; afsnit 8.4) |
| Tomme Opdel-celler | Åbent | Egen pulje, og ny besked (Afvigelse fra i dag) |
| Skal sammen, flere fejl | Ikke nævnt | Alle fejlende aftaler i én besked; ét klik springer dem alle over (Afvigelse fra i dag) |
| Saml | Samme værdi i samme gruppe | Med tal eller rangering: tætte værdier sammen, som en blød Ensartede (svar4 30). "Opfyldt" måles mod det bedst mulige i stedet for "én værdi pr. gruppe" (Afvigelse fra i dag, svar5 35) |
| Stop | Ikke nævnt | Læreren får den foreløbig bedste deling (`status: "stopped"`, kontrakt 5) |
| Tidsloft | 1500 ms som eksempel | 10 sekunder, længere for store hold (fx 30 over 100 elever); stop tidligere ved bedst mulige eller lærerens stop |

**Anbefalingen fra idérunden står ved magt**, med disse ændringer:

- Regelmoduler med *mål*, *bedst mulige* og *besked* (plus *ændring ved
  bytning*): uændret.
- Rangorden i stedet for vægte: uændret i princippet, men plads 2 (Skal sammen)
  er væk, Undgå hinanden er rykket ned under Adskil altid (men over de andre
  tunge), og opskriftens rækkefølge afgør inden for hvert trin (afsnit 7).
- Motoren "byg grådigt, forbedr så" (forslag C): uændret. Backtracking fra
  forslag B er nu kun nødvendig til to ting: Adskil altid og pakningen af Skal
  sammen-blokke (afsnit 10.4).
- Nyt: flere forsøg samtidig på flere kerner, fremgang undervejs og et
  afspilningsspor fra det vindende forsøg.

---

## 2. Hvad motoren skal kunne, kort

Motoren får en klasse (elever med kolonner), en opskrift (regler i en
rækkefølge), aftaler mellem elever, fravær og låste grupper. Den giver
grupper tilbage, der:

1. altid overholder de faste krav: størrelser, Opdel, Skal sammen, låste
   grupper, fravær (afsnit 15.1),
2. bryder **Adskil altid** så lidt som muligt (helst aldrig),
3. derefter bryder **Undgå hinanden** så lidt som muligt,
4. derefter de **tunge regler** fra opskriften (Adskil, Klyng) i opskriftens
   rækkefølge,
5. derefter opfylder **målene** (Fordel, Balancér, Ensartede) så godt som
   muligt, hvor det øverste vejer mest,
6. og til sidst **Saml**.

Den skal kunne sige på forhånd, hvad der ikke kan lade sig gøre, og bagefter,
hvad der blev nået, med de samme ord og fra det samme sted. Den skal vise
fremgang undervejs, kunne stoppes, bruge flere kerner, kunne fortælle hvad den
gjorde (afspilning) og kunne placere en efternøler uden at flytte andre.

Den skal køre i lærerens browser i en Web Worker, i ren JavaScript uden
tredjepartsbiblioteker, og elevlisten forlader aldrig computeren.

**Kravet hele vejen:** "Det er vigtigt at programmet kun bliver bedre." Aldrig
flere brud på de tunge regler end den nuværende motor på samme klasse, og
bedre eller lige på målene i langt de fleste.

---

## 3. Fra klasseliste til opgave

Før motoren går i gang, laves klasse, opskrift og aftaler om til én ren
**opgave**. Alle små regler om data bor her, så motoren og dommeren aldrig
selv skal tænke på dem.

### 3.1 Tekst

- Store og små bogstaver og mellemrum foran og bagved betyder ikke noget:
  "Pige", " pige" og "PIGE" er samme værdi.
- I beskeder bruges den **hyppigste stavemåde** af værdien i klassen.
- En **tom celle** er "ikke udfyldt", aldrig en værdi for sig. En elev med tom
  celle tæller ikke med i Fordel, Adskil, Klyng, Saml, Balancér eller
  Ensartede på den kolonne. (Opdel er en undtagelse, se 3.5.)

### 3.2 Tal

- En celle er et tal, hvis den kun består af cifre, evt. fortegn, **højst ét**
  decimaltegn og evt. mellemrum.
- **Komma og punktum er begge decimaltegn.** "7,5" og "7.5" er 7,5.
- **"1.000" er tallet 1.** Tusindtalsseparatorer kendes ikke (Som i dag).
- "1.000,5" er ikke et tal (to decimaltegn), og "7 dage" er heller ikke.

### 3.3 Talregler og tekst (Balancér, Ensartede, Saml)

- Har læreren givet tekstværdierne en **rangering** (Lav < Middel < Høj), bliver
  de til tallene 1, 2, 3 … for den regel.
- En elev, hvis værdi hverken er et tal eller i rangeringen, er "ikke udfyldt"
  for netop den regel: placeres frit og tæller ikke med i gennemsnit og spredning.
- **Blandet kolonne** (nogle tal, nogle tekst, ingen rangering): reglen regner
  kun på tallene, og læreren får beskeden: *2 elever har en værdi i
  "Karakter", der ikke er et tal ("Fritaget"), og placeres frit.*
- **Kun tekst og ingen rangering:** reglen gør ingenting; opskriften siger det
  og tilbyder at give værdierne en rækkefølge.
- Rangeringen gælder også **Saml** (`columnOrders` gælder `group_sort`): med
  tal eller en rangering trækker Saml tætte værdier sammen (6.9, svar4 30).

### 3.4 Fravær, låste grupper og aftaler

- **Fraværende** elever fjernes helt fra opgaven.
- **Låste grupper** tages helt ud: deres elever er ikke med i dannelsen, og
  reglerne og aftalerne ser kun på de frie elever.
  - En Adskil- eller Adskil altid-værdi, som kun låste elever har, gør
    ingenting, og der kommer ingen besked.
  - Gruppestørrelser: se 4.3.
- **Aftaler ryddes op:** slettede, fraværende og låste elever fjernes fra
  "Undgå hinanden"-aftaler. En aftale med under 2 elever tilbage gør ingenting.
- **Skal sammen** ryddes *ikke* op på samme måde: en aftale med en elev i en
  låst gruppe og en udenfor er en konflikt (afsnit 5). Fraværende og slettede
  elever fjernes dog fra den, og under 2 tilbage = den gør ingenting.
- **Skal sammen-blokke:** aftaler, der deler en elev, lægges sammen. Ali + Bo
  og Bo + Cem bliver blokken {Ali, Bo, Cem}. Motoren flytter blokken som én
  enhed.

### 3.5 Puljer (Opdel)

- **Kun Opdel laver puljer.** Emner gør ikke.
- **Flere Opdel-regler:** puljen er **kombinationen** af værdierne ("2.a +
  Klima"). **Afvigelse fra i dag:** i dag deler kun den første Opdel, og de
  øvrige prøver uden garanti. Den nye motor garanterer alle. Beskeden om, at
  kun den første deler, forsvinder.
- **Tom Opdel-celle:** eleverne med tom celle bliver deres egen pulje ("ikke
  udfyldt") og danner grupper med hinanden (Som i dag). **Afvigelse fra i dag:**
  der kommer en besked: *Opdel på "Hold": 3 elever har ikke udfyldt "Hold" og
  danner grupper for sig.* Navnene vises.
- Hver pulje er en selvstændig, mindre opgave. Alle regler måles inden for
  puljen (fx Balancér sammenligner gruppen med *sin* pulje).
- En pulje med færre elever end den mindste tilladte gruppe får stadig én
  gruppe (4.1); beskeden siger det: *Opdel på "Hold": "Valgfag" har kun 2
  elever.*
- Beskeder om en bestemt pulje siger det: *inden for "Klima"*. Det er de
  eneste beskeder med "inden for". Med flere Opdel er puljen en kombination
  (*inden for "2.a + Klima"*). I kontrakten er det `pool` (navnet, med " + "
  og `ikke udfyldt` for en tom celle) og `poolValues` (værdierne hver for sig)
  (kontrakt 3.4).

---

## 4. Gruppestørrelser

Antallet af grupper og deres størrelser regnes ud **før** motoren, af en lille
selvstændig regneregel. Motoren får kun en liste af pladser pr. pulje (gruppe
1 har plads til 4, gruppe 2 til 5 …).

### 4.1 Elever pr. gruppe (målet *t*), for *n* frie elever i en pulje

- **"+1":** antal grupper = *n* delt med *t*, rundet **ned**, mindst 1. Ville en
  gruppe så komme mere end én over *t*, lægges en gruppe til. Grupperne er *t*
  eller *t*+1.
- **"-1":** antal grupper = *n* delt med *t*, rundet **op**. Grupperne er *t*
  eller mindre.
- Eleverne deles altid **så jævnt som muligt**: to grupper adskiller sig højst
  med én elev.
- Eksempler, 4 pr. gruppe: 26 "+1" → 5, 5, 4, 4, 4, 4. 26 "-1" → 4, 4, 4, 4,
  4, 3, 3. 5 "+1" → 5. 5 "-1" → 3, 2.
- Med Opdel regner hver pulje for sig ud fra sine egne elever. Hver pulje får
  mindst én gruppe.

### 4.2 Antal grupper (*g*)

- Præcis *g* grupper minus de låste, dog aldrig flere grupper end elever.
- Med Opdel deles de *g* grupper mellem puljerne, så gruppestørrelserne bliver
  så ens som muligt på tværs af puljerne. Hver pulje får mindst én. Beder
  læreren om færre grupper end puljer, bliver det antallet af puljer, og
  læreren får at vide hvorfor.
- **Den præcise regel** (Som i dag, svar6 37), som motoren skal følge, så
  resultatet kan genskabes: hver pulje starter med én gruppe, og hver af de
  resterende grupper gives til den pulje, hvis grupper ellers ville blive
  størst. Ved lighed vinder den største pulje; er puljerne også lige store,
  den pulje, hvis værdi optræder først blandt eleverne. To puljer på 6 og 3
  grupper: den første får 2, den anden 1. Det samme gælder, når emnerne har
  rundet antallet (4.4). Dommeren godtager stadig alle lige gode fordelinger,
  men melder, om reglen ved lighed blev fulgt.

### 4.3 Låste grupper

- **Antal grupper:** de låste tæller med i lærerens tal (6 ønsket, 2 låst → 4
  nye).
- **Elever pr. gruppe:** der regnes kun på de frie elever.

### 4.4 Emner og antallet af grupper

- Med "+1" rundes antallet af grupper **ned** til et multiplum af antal emner,
  med "-1" **op**, men kun så længe alle grupper holder sig inden for "højst én
  over/under målet". Ellers beholdes antallet, og nogle emner får én gruppe mere.
- Opskriften viser, hvad det andet valg ville give.
- Rundingen gælder **det samlede antal grupper for hele klassen**, ikke hver
  pulje for sig (Som i dag).
- **Låste grupper tæller med** i det antal, der rundes: 1 låst gruppe og 3
  emner → "låste + nye" rundes til fx 6, og der dannes 5 nye (Som i dag).
- **Hver pulje regner først sit eget antal efter 4.1** (svar7 40). Rundingen
  gælder summen (med de låste). Med Opdel deles det rundede antal mellem
  puljerne som i 4.2, men **kun hvis alle puljers grupper bagefter holder
  lærerens størrelse**: "målet eller én over" ved "+1", "målet eller én under"
  ved "-1". Ellers rundes der ikke, og nogle emner får én gruppe mere end
  andre.
  - **Afvigelse fra i dag:** i dag regnes antallet for hele klassen og deles
    bagefter mellem puljerne. Det giver grupper uden for lærerens størrelse, og
    det er en fejl i den nuværende app. I sammenligningen er de input en
    bevidst forbedring (`resultater/kendte-forskelle.json`).
- **Undtagelse ved "-1": færre grupper end emner** (Som i dag, svar7 41).
  Giver lærerens størrelse færre grupper (låste + nye) end der er emner, får
  hvert emne alligevel én gruppe, selvom grupperne så bliver mere end én under
  målet. Et emne må ikke forsvinde i stilhed. Læreren får en besked, der siger
  prisen (hvor små grupperne bliver) og tilbyder den anden vej (færre grupper,
  hvor et emne udgår). Eksempel: 21 elever, 6 pr. gruppe "-1" og 5 emner giver
  5 grupper på 4–5. Ved "+1" er der ingen sådan undtagelse.

---

## 5. Skal sammen — et krav, ikke en vægt

- Eleverne i en blok havner **altid** i samme gruppe. Motoren bryder aldrig en
  aftale for at få en bedre fordeling. Skal sammen er derfor ikke med i
  rangordenen; det er et fast krav som størrelserne.
- Skal sammen gælder kun **stamgrupper**, ikke matrixgrupper.

### 5.1 Hvornår kan en blok ikke opfyldes

Før motoren kører, tjekkes hver blok. Kan en blok ikke opfyldes, **dannes
ingen grupper**, og læreren får en besked med elevernes navne. Det sker, når:

1. blokken har flere elever, end den største gruppe har pladser
   (*Skal sammen samler 6 elever, men den største gruppe har 5 pladser*),
2. blokkene tilsammen ikke kan pakkes ind i grupperne,
3. eleverne også har en "Undgå hinanden"-aftale med hinanden,
4. eleverne har en Adskil-regel imod sig (fx to med samme valgte værdi),
5. eleverne har en Adskil altid-regel imod sig (to i blokken med en af de
   valgte værdier) (Som i dag, svar2 5),
6. blokken går på tværs af en låst gruppe (én i den låste, én udenfor),
7. blokken går på tværs af en Opdel (eleverne er i hver sin pulje; med flere
   Opdel betyder det hver sin kombination).

Tjek 2 (pakning) skal være **sikkert**: motoren må ikke stoppe en dannelse,
fordi et hurtigt overslag fejlagtigt siger "umuligt". Tjekket prøver
systematisk (de største blokke først, med tilbagegang) og har et loft. Når
loftet nås uden svar, stopper dannelsen ikke; motoren forsøger, og lykkes det
ikke, kommer beskeden bagefter.

### 5.2 "Dan uden aftalen denne gang"

- Beskeden tilbyder at **danne grupperne uden netop den aftale denne ene
  gang**. Aftalen bliver stående i opskriften og gælder igen ved næste
  dannelse.
- Motoren skal derfor kunne få at vide, at bestemte Skal sammen-aftaler skal
  springes over i én kørsel.
- **Alle fejlende aftaler i én besked.** Tjekket i 5.1 kører for alle blokke,
  før dannelsen stopper. Beskeden nævner hver aftale, der ikke kan opfyldes,
  med navne og grund, og **ét klik** danner grupperne uden dem alle denne ene
  gang. **Afvigelse fra i dag** (Valgt, svar2 6): i dag nævnes kun den første,
  og næste dannelse stopper så ved den næste.
- I kontrakten svarer motoren `status: "impossible"` med **én
  `together-…`-besked pr. fejlende blok** (blokkens elever i `students`).
  Appens knap "Dan grupper uden aftalen" fjerner alle de blokke på én gang og
  kalder motoren igen (kontrakt 3.4).

---

## 6. Reglerne én for én

**k** = antal grupper i puljen. "Par" betyder to elever i samme gruppe. En
gruppe med *n* elever, der ikke må være sammen, giver *n*·(*n*−1)/2 par
(2 → 1, 3 → 3, 4 → 6).

**Jævn spredning** (bruges som "bedst mulige" for flere regler): *m* elever
fordelt så jævnt som muligt på *k* grupper. Er *m* ≤ *k*, er det 0 par. Ellers
får nogle grupper ⌈*m*/*k*⌉ og resten ⌊*m*/*k*⌋, og parrene lægges sammen.
Eksempel: 9 elever i 4 grupper → 3/2/2/2 → 3+1+1+1 = **6 par**. (Hvis
gruppestørrelserne eller blokke gør det umuligt at sprede så jævnt, er tallet
stadig en nedre grænse.)

### 6.1 Opdel
- Strukturel: deler i puljer (3.5). Ikke en vægt.
- *På forhånd:* lille pulje (3.5), Skal sammen på tværs (5.1), tomme celler (3.5).

### 6.2 Adskil altid
- **Virker præcis som Adskil (6.4)**: læreren vælger en kolonne og én eller
  flere værdier, og der må højst være én elev med *nogen* af de valgte værdier
  i hver gruppe (Som i dag, svar2 11). Forskellen er kun, hvor tungt den
  vejer: tungest af alt; brydes kun, hvis intet andet er muligt. Navngivne
  elever holdes adskilt med Undgå hinanden (6.3), ikke med Adskil altid.
- *Mål:* antal **par** af elever med en valgt værdi i samme gruppe.
- *På forhånd:* *m* elever med en valgt værdi i puljen, *k* grupper → bedst
  mulige = jævn spredning. Beskeden: *Adskil altid på "Niveau": 5 elever skal
  adskilles, men der er kun 4 grupper. Mindst to ender i samme gruppe.*
- **Flere Adskil altid-regler** på hver sin kolonne kan tilsammen være
  umulige, selvom hver for sig er fin (en elev kan have valgte værdier i to
  kolonner). Den øverste vinder (7.2). Om den bedst mulige for den lavere regel
  kan nås, afgøres ved forsøg, og om nødvendigt med reserven i 10.4.

### 6.3 Undgå hinanden (aftale)
- Et sæt på 2 eller flere navngivne elever, der alle skal i forskellige grupper.
- **En tung regel**, ikke som Adskil altid. Kan brydes, hvis det ikke kan
  undgås, og så får læreren beskeden. Alle Undgå-aftaler tilsammen står
  **først blandt de tunge** (Kenneth, svar2 2; afsnit 7).
- *Mål:* antal par fra samme aftale i samme gruppe, lagt sammen for alle
  aftaler. (Står to elever sammen i to aftaler, tæller parret i begge.)
- *På forhånd:* jævn spredning pr. aftale, samme besked som Adskil.

### 6.4 Adskil (på værdi)
- Læreren vælger én eller flere værdier i en kolonne. **Højst én elev med
  *nogen* af de valgte værdier pr. gruppe.** "Niveau = 1 og 2": højst én, der
  har enten 1 eller 2.
- *Mål:* antal **par** af elever med en valgt værdi i samme gruppe.
- *På forhånd:* *m* elever med en valgt værdi i puljen, *k* grupper → bedst
  mulige = jævn spredning. Beskeden: *Adskil på "Niveau": 5 elever skal
  adskilles, men der er kun 4 grupper. Mindst to ender i samme gruppe.*
- En valgt værdi, som ingen fri elev har, gør ingenting.

### 6.5 Klyng
- Gælder **alle værdier i kolonnen**; læreren vælger ingen værdier (Som i dag,
  svar2 10).
- Elever med samme værdi må ikke stå **alene** med den i deres gruppe. **"Ingen
  alene" er nok:** to, tre eller fire med samme værdi er lige gode.
- En værdi med 3 elever og grupper á 4: 3 sammen er fint; 2 sammen + 1 i en
  anden gruppe, hvor ingen andre har værdien, er ikke (den ene står alene).
- *Mål:* antal elever, der er de eneste i deres gruppe med deres værdi.
- *På forhånd:* (1) en værdi, kun én elev i puljen har, kan ikke klynges →
  besked, og eleven tæller med i "bedst mulige". (2) Flere forskellige
  værdier, end grupperne har plads til i par: et grådigt overslag giver
  beskeden; bagefter måles det faktiske tal.

### 6.6 Fordel
- Spreder **alle** værdier i kolonnen jævnt (der kan ikke vælges værdier).
- *Mål:* for hver værdi og hver gruppe: hvor langt antallet ligger uden for
  det "retfærdige" spænd (afsnit 16). Har puljen 13 piger og 6 grupper, er 2
  eller 3 piger pr. gruppe perfekt.
- *Opfyldt* (det læreren ser) i en gruppe, når begge dele gælder (Som i dag):
  - ingen værdi står flere gange i gruppen end gruppens størrelse delt med
    antal værdier, rundet op,
  - alle værdier, der findes i puljen, er med i gruppen (dog højst så mange,
    som gruppen har pladser).
- I dagens test er gruppens størrelse hele gruppen, også elever med tom
  celle, og "antal værdier" tæller kun de udfyldte (Som i dag, svar6 39).
  Det nye "retfærdige antal" (spec. 16) bruger puljens hele størrelse.
  Dommeren viser begge ved siden af hinanden, som ved Saml.
- Testen bliver ikke blødere for en skæv klasse (fx 20 drenge og 4 piger i
  grupper á 4), så en sådan klasse kan ikke nå 100 % (Som i dag, svar2 14).
  Er resultatet lig det bedst mulige, siger beskeden, at det var
  **uundgåeligt**.
- *På forhånd:* går det ikke op → den milde besked med tal (hvor mange der har
  værdien, og hvor mange pladser der er): *Fordel på "Køn": 13 piger i 6
  grupper — nogle får 3, andre 2.*
- Tidligere grupper: læreren gemmer en dannelse som kolonne og lægger Fordel
  på den (8.4).

### 6.7 Balancér
- Gør gruppernes gennemsnit i en talkolonne ens.
- *Mål:* **summen** over grupperne af afstanden fra gruppens snit til
  puljens snit. Puljens snit er det rigtige snit af alle elever i puljen med en
  gyldig værdi (ikke et snit af gruppesnittene). Elever uden tal tæller ikke
  med i hverken gruppens eller puljens snit (svar4 33).
- *Opfyldt* i en gruppe, når gruppens snit ligger inden for 5 % af kolonnens
  spænd fra puljens snit.
- **Kolonnens spænd** er største minus mindste gyldige værdi blandt **alle de
  frie elever i opgaven**, også når der er Opdel (Som i dag, svar2 13). Snittet,
  der sammenlignes med, er stadig puljens (svar.md 8).
- En gruppe, hvor ingen har et tal, er **ikke med i målingen**: den tæller
  hverken som opfyldt eller ikke opfyldt. Har **færre end to grupper** tal, er
  reglen "ikke målt" (`met: null`) (Som i dag, svar4 33). (Bemærk forskellen
  til Ensartede, hvor én gruppe med tal er nok.)
- *På forhånd:* tekst uden rangering → besked (3.3).

### 6.8 Ensartede
- Gør medlemmerne af hver gruppe så ens som muligt i en talkolonne.
- *Mål:* **summen** over grupperne af gruppens varians (spredning omkring
  gruppens eget snit).
- *Opfyldt* i en gruppe, når gruppens varians højst er 10 % af (spændet / 2)²,
  dog er grænsen mindst 1 (Som i dag, svar2 12). Det svarer til en
  standardafvigelse på højst ca. 16 % af spændet. Spændet er det samme som for
  Balancér (hele opgaven).
- **Variansen er delt med antal elever** (ikke antal − 1), og kun elever med
  et tal tæller (tom celle og tekst uden rangering er ikke med) (Som i dag,
  svar3 21).
- En gruppe med **kun én** værdi er opfyldt (variansen er 0). En gruppe, hvor
  **ingen** har et tal, tæller hverken som opfyldt eller ikke opfyldt. Har
  **ingen** gruppe tal, er reglen "ikke målt" (`met: null`) (Som i dag,
  svar3 21).
- Er Ensartede den eneste regel, findes det perfekte svar direkte (sortér og
  skær i grupper). Det bruges som facit i testene og kan bruges som start.

### 6.9 Saml
- Prøver blødt at samle elever, der ligner hinanden. Lettest af alle mål;
  viger for alt andet, også for mål, der står under den i opskriften (afsnit
  7.1, svar3 19).
- Saml virker forskelligt efter kolonnen (Som i dag, svar4 30):
  - **Tekst uden rangering — værditælling:** "samme værdi i samme gruppe".
    *Mål:* summen over grupperne af antal forskellige værdier i gruppen, minus
    det mindst mulige. (Det er det samme tal som "for hver værdi: antal
    grupper, den er spredt på", lagt sammen.)
  - **Tal, eller tekst med rangering — blød Ensartede:** elever med *tætte*
    værdier trækkes sammen; "Lav" og "Middel" er hellere sammen end "Lav" og
    "Høj". *Mål:* som Ensartede: summen af gruppernes varians (delt med antal).
  - **En gruppe, hvor ingen har et tal**, i en talkolonne, måles med
    værditællingen på sine (tekst)værdier. De to dele gøres hver for sig om
    til fælles skala (7.3) og lægges sammen (Valgt, svar5 35). I dag lægges de
    ikke sammen.
- Elever med tom celle er ikke med. I en rangeret kolonne er en værdi uden for
  rangeringen "ikke udfyldt" (som for Balancér og Ensartede).
- *Opfyldt* — **Afvigelse fra i dag** (Valgt, svar5 35). "Én værdi pr.
  gruppe" kan sjældent nås og er strengere, end en blød regel lover. Den nye
  motor måler i forhold til det bedst mulige:
  - **tekst uden rangering:** opfyldt, når værditællingen er lig det bedst
    mulige (hver værdi står i så få grupper som muligt; tal = 0),
  - **tal eller rangering:** opfyldt, når hver gruppe med tal har en varians
    under Ensartedes grænse, max(1; 0,1 · (spænd / 2)²),
  - **talkolonne, hvor nogle grupper ikke har tal:** begge dele skal holde
    (grupperne med tal under grænsen, og værditællingen for grupperne uden tal
    lig det bedst mulige).
- *Opfyldt i dag* (Som i dag, svar5 35), som dommeren også skal kunne vise, så
  sammenligningen med den nuværende motor er fair: pr. gruppe. En gruppe uden
  tal er opfyldt, når der kun står **én** værdi i den (hver ekstra værdi er et
  brud); en gruppe med tal, når variansen er under Ensartedes grænse; en
  gruppe, hvor ingen har svaret, er ikke med. Reglens "opfyldt" i dag er
  **andelen** af grupper, der er opfyldt.
- I kontrakten sender motoren det nye "opfyldt" som `rules[].met` og må
  sende dagens andel som et ekstra felt (`share`, kontrakt 3.5).

### 6.10 Regler, der trækker i hver sin retning

Opskriften siger fra **på forhånd**, når:
- Balancér og Ensartede står på samme kolonne,
- Adskil og Klyng eller Saml står på samme værdi,
- to regler af samme slags står på samme kolonne,
- samme regel står to gange.

---

## 7. Rangorden: hvilken gruppedeling er bedst?

Dommeren (afsnit 16) måler hver regel for sig. Dette afsnit siger, hvordan
tallene lægges sammen til én afgørelse, så motoren kan vælge mellem to
gruppedelinger. Holdes adskilt fra målingerne, så rangordenen kan justeres,
uden at dommeren ændres.

### 7.1 Pladserne

Løsninger sammenlignes **trin for trin**, som ord i en ordbog: først trin 1;
kun ved lighed trin 2 osv. Intet på et lavere trin kan "købe" et brud på et
højere.

Den fulde rækkefølge (Kenneth, svar2 1–3):

| Trin | Hvad | Hvordan inden for trinnet |
|---|---|---|
| — | **Faste krav:** størrelser, Opdel (deler op først), Skal sammen, låste, fravær | Brydes aldrig |
| 1 | **Adskil altid**, hver regel for sig | Én regel ad gangen i opskriftens rækkefølge |
| 2 | **Undgå hinanden**, alle aftaler som én regel | Ét tal |
| 3 | *Kun i matrix:* **"højst én fra hver kilde"** | Ét tal |
| 4 | **De tunge fra opskriften** (Adskil, Klyng), hver regel for sig | Én regel ad gangen i opskriftens rækkefølge |
| 5 | **Målene** (Fordel, Balancér, Ensartede) | Ét samlet tal: trinvist vægtet sum (7.2) |
| 6 | **Saml** | Ét samlet tal: trinvist vægtet sum (7.2) |

Trin 1–4 er altså en lang række af enkelte regler, hver med sit hele tal, og
trin 5 og 6 er hver ét kommatal. To gruppedelinger sammenlignes tal for tal
fra toppen af rækken.

I forhold til idérunden: plads 2 (Skal sammen) er væk, fordi Skal sammen er et
krav; Undgå hinanden er rykket ned under Adskil altid, men står over alle
tunge regler fra opskriften.

### 7.2 Den øverste regel vejer tungest (Kenneth)

Opskriften lover, at den øverste regel vejer tungest, og den nye motor holder
løftet. De tunge regler går altid før målene, uanset plads, og Opdel deler
stadig først.

- **De tunge regler (trin 1–4) — den øverste vinder altid** (Kenneth, svar2 1).
  Én gruppedeling, der bryder den øverste tunge regel én gang mindre, er
  bedre, uanset hvad der sker længere nede. Det gælder også mellem
  forskellige slags (en Klyng øverst slår en Adskil nederst). Fordi tallene er
  hele tal, er der ofte lighed, og så afgør den næste regel; de lavere regler
  betyder altså stadig meget.
- **Undgå hinanden står først blandt de tunge** (Kenneth, svar2 2). Den er en
  aftale og har ingen plads i opskriften; alle Undgå-aftaler regnes sammen som
  én regel. Adskil altid står stadig over den.
- **Matrix uden "Fuld":** "højst én fra hver kilde" står efter Undgå hinanden
  og før matrixens egne tunge regler (Valgt, svar2 4), fordi det er det, der
  gør en matrixgruppe til en matrixgruppe.
- **Målene (trin 5) — trinvis vægt** (Kenneth, svar2 3). Her er der næsten
  aldrig lighed (Balancér er et kommatal), så "én ad gangen" ville gøre alle
  regler under den øverste ligegyldige. I stedet gøres hvert mål om til samme
  skala (7.3), og med *n* mål vejer det øverste *n*, det næste *n*−1 … det
  nederste 1. Tallet for trin 5 er summen af (vægt × mål på fælles skala).
  Den øverste vejer altså tungest, men alle tæller.
- **Saml (trin 6)** vejes på samme måde indbyrdes (med *n* Saml-regler: *n*,
  *n*−1 … 1) og står efter alle andre mål, uanset plads i opskriften, fordi
  Saml "viger for alt andet" (Som i dag, svar3 19).
- Ingen vægte kan sættes af læreren. Vægtene følger af rækkefølgen alene.

### 7.3 Samme skala for målene

Hvert måls tal deles med det, en tilfældig gruppedeling i gennemsnit giver på
den regel (regnes én gang i starten for opgaven med et fast frø, fx 200
tilfældige gyldige delinger). 0,5 betyder så "halvt så skævt som tilfældigt"
for alle mål. Giver tilfældige delinger 0 (reglen er altid opfyldt), tæller
reglen 0.

### 7.4 Flere sorteringsregler — ligeværdigt

**Afvigelse fra i dag.** I dag styrer kun den første Balancér-, Ensartede- eller
Saml-regel, hvordan grupperne bygges; resten tæller svagere, og læreren får en
besked om det. I den nye motor er **alle regler fuldt med** både i opbygningen
og i forbedringen. Ligeværdigt betyder, at ingen regel er sat uden for; hvor
meget hver vejer, afgøres kun af pladsen i opskriften (7.2). Beskeden om, at
kun den første styrer, forsvinder.

---

## 8. Beskeder til læreren

### 8.1 Fra ét sted

Alle beskeder bliver til som **fund** med samme form: *regel, pulje, slags,
tal, elever*. Én funktion laver fundet om til dansk uden fagudtryk.

- **Før kørslen** (opskriften) bruges "bedst mulige": *Mindst to ender i samme
  gruppe.*
- **Efter kørslen** bruges "mål" med samme skabelon: *To ender i samme gruppe
  ({gruppe:2}).* Motoren skriver `{gruppe:N}` (N = plads i `groups`), og appen
  sætter det navn ind, læreren ser ("Gruppe 3"). En låst gruppe nævnes med sit
  `name` (kontrakt 3.4).
- Er det faktiske tal lig det bedst mulige, siger beskeden, at det var
  uundgåeligt. Er det større, vises det mildt (*Prøv at danne igen*), og
  testene tæller det som et svaghedstegn.

Opskriften og motoren spørger samme regelmodul, så de kan ikke være uenige.

**I kontraktens format** er et fund en besked i `messages` (kontrakt 3.4):
*regel* = `rule` (regelnummeret), *pulje* = `pool`, *slags* = `type` + `code`,
*elever* = `students`; tallene står i `text`. Teksten nævner aldrig en elevs
navn eller `_rowId`; skal eleverne nævnes, skriver motoren `{elever}`, og appen
sætter navnene ind. "Uundgåeligt" og "Prøv at danne igen" skelnes med
`unavoidable: true/false` på `rule-not-met`. De nye beskeder i denne
specifikation har koder i kontrakt version 2: `split-empty-cells` (tom
Opdel-celle), `small-pool` (lille pulje), `fewer-groups-than-pools` og
`cluster-unavoidable`.

**Før kørslen** laver appen i version 2 selv advarslerne i opskriften
(kontrakt 9.1). For at holde kravet om ét sted eksporterer `engine.js` også
`check(input)`, der svarer med `messages` uden grupper, ud fra de samme
regelmoduler (koordinatorens note). Appen tager den i brug, når den findes.

### 8.2 Hvilke beskeder skal findes

- en regel kan ikke opfyldes (Adskil altid, Undgå, Adskil, Klyng),
- Klyng har flere forskellige værdier, end der er plads til,
- Fordel kan ikke gå helt lige op,
- to regler trækker i hver sin retning, og en regel står to gange (6.10),
- talregler møder tekst (3.3),
- Skal sammen kan ikke opfyldes, med tilbud om at danne uden aftalen (5),
- tom Opdel-celle (3.5, ny), lille pulje, færre grupper end puljer (4.2),
- en matrixkilde er helt tom (9.2), en kilde sætter loftet for "Fuld", en elev
  står ikke i nogen stamgruppe (9.1),
- færre eller flere grupper end bedt om, flere emner end grupper, antallet er
  rundet efter emnerne (4),
- stort hold: det tager tid (vises før kørslen; appens besked, kontrakt 6).

Kontraktens `extra-split-rule` (kun den første Opdel deler) og
`extra-sort-rule` (sorteringsregler kan ikke vægtes lige) bruges ikke: den nye
motor deler på alle Opdel (3.5) og vægter alle sorteringsregler (7.4).

Er der Opdel, siger beskeden, hvilken pulje den gælder (*inden for "Klima"*).

### 8.3 Beskeden bliver stående

Kan en regel ikke gå helt op, bliver beskeden stående efter kørslen under
"Sidste dannelse", indtil læreren ændrer opskriften. Motoren skal derfor give
fundene med tilbage sammen med grupperne.

### 8.4 Tidligere makkere (Kan forbedres)

I dag spreder læreren gamle grupper med Fordel på en gemt gruppekolonne. Det
tæller ikke par. En regel "så få gamle makkere som muligt" ville være mere
præcis. **Kenneth: senere** (svar2 15). Første version skal kunne det samme
som i dag og være målbart bedre; reglen kommer bagefter. Regelmodulerne gør
den let at tilføje.

---

## 9. Matrixgrupper

### 9.1 Hvem er med
- **Fraværende** er ikke med.
- Elever i **låste matrixgrupper** er ude, som ved stamgrupper.
- Elever i **låste stamgrupper** er med som alle andre.
- **Skal sammen gælder ikke** i matrix. **Undgå hinanden gælder** også i
  matrix (kontrakt 2.2, `agreements`).
- En elev, der ikke står i nogen stamgruppe (fx tilføjet bagefter), placeres
  alligevel, og læreren får en besked (kontrakt, `not-in-home-group`).
- Matrixgrupperne har deres eget regelsæt (med samme regler og samme
  rangorden) og deres egen størrelse.

### 9.2 Kilden og størrelsen

Kilden er enten **emnerne** (standard: én fra hvert emne) eller
**stamgrupperne**. Er kilden emnerne, er en elevs emne det emne, elevens
stamgruppe fik; derfor skal emnerne være fordelt (afsnit 14), før
matrixgrupperne dannes. En stamgruppe uden emne er sit eget emne (kontrakt
2.2, `matrix`). Appen sender stamgrupperne med deres emner i `matrix.homeGroups`.

Læreren vælger:
- **"Fuld" (standard):** hver matrixgruppe får én fra hver kilde. Antal
  matrixgrupper = antallet af elever i den **mindste** kilde. Typisk størrelse:
  lige så mange pr. gruppe, som der er emner (3–5). Er en kilde helt tom (fx
  alle fraværende), får læreren en besked, der nævner den.
  - **Ulige store kilder** (Som i dag, svar2 7): hver matrixgruppe får
    **mindst én** fra hver kilde, og de overskydende elever fra de større
    kilder spredes så jævnt som muligt: to matrixgrupper har højst én
    overskydende mere end hinanden fra samme kilde. Begge dele er faste krav
    (15.1). Hvem af de overskydende der kommer hvor, afgøres af reglerne.
    Desuden er **matrixgrupperne højst én elev forskellige i størrelse**
    (kontrakt 2.2). **Begge dele er krav** (Valgt, svar5 34). Det kan altid
    lade sig gøre: de ekstra deles ud på skift (kilde for kilde, gruppe 1, 2,
    3 … rundt). I dag holdes de ekstra jævne som et Fordel-hensyn på kilden, så
    det nye er mindst lige så godt. Kontrakten nævner kun størrelsen; den får
    jævnheden pr. kilde med i næste version.
- **Elever pr. gruppe** eller **antal grupper**, som ved stamgrupper. Så er
  "højst én fra hver kilde" et **tungt hensyn**, ikke en garanti. Det står på
  trin 3 i rangordenen: efter Undgå hinanden og før matrixens egne tunge
  regler (Valgt, svar2 4).

### 9.3 Hvordan
Matrixdannelsen er en ny kørsel af samme motor, hvor kilden er en kolonne med
"højst én fra hver" på. Matrixgruppernes egne regler lægges ovenpå.

*På forhånd:* flere elever fra samme kilde end matrixgrupper → samme
regnestykke og besked som Adskil.

---

## 10. Selve motoren: byg grådigt, forbedr så (forslag C)

### 10.1 Byg
Sortér eleverne efter, hvor svære de er at placere: først Skal sammen-blokke og
elever med Adskil altid, så elever med Undgå-aftaler og værdier fra Adskil og
Klyng (Klyng-elever placeres to og to), til sidst resten. Sæt hver i den gruppe
med plads, hvor den lige nu gør mindst skade efter rangordenen (7). Lidt
tilfældighed i rækkefølgen (styret af frøet) gør forsøgene forskellige.

### 10.2 Forbedr
Byt to elever (eller to blokke af samme størrelse) i hver sin gruppe, hvis det
gør løsningen bedre efter rangordenen. Når intet bytte hjælper: en
"ryst"-runde med nogle få tilfældige bytninger, og fortsæt. Ændringen ved et
bytte regnes ud fra små tællere pr. gruppe (antal piger, sum af karakterer …),
ikke ved at måle hele klassen igen.

Flytninger og bytninger må aldrig bryde de faste krav (størrelser, puljer,
blokke, låste, og i matrix "Fuld" mindst én fra hver kilde med jævnt fordelte
overskydende).

### 10.3 Senere forbedring
Viser målingerne, at C sidder fast, kan "accepter nogle gange en dårligere
bytning" fra forslag A (annealing) lægges til. Rangordenen og regelmodulerne
er fælles, så A og C kan prøves mod hinanden i samme testopstilling.

### 10.4 Reserve med tilbagegang
Systematisk afprøvning med tilbagegang (fra forslag B) bruges kun til:
- **Adskil altid**, når opbygningen ikke kan undgå et brud, men analysen på
  forhånd siger, at det burde kunne undgås,
- **pakningen af Skal sammen-blokke** (5.1, tjek 2).

Begge har et loft, så de aldrig hænger.

### 10.5 Gentagelighed
Al tilfældighed kommer fra et **frø**. Samme opgave + samme frø = samme grupper.
"Dan grupper igen" bruger et nyt frø og giver nye grupper (Som i dag). Frøet
vises ikke for læreren, men kan bruges i test og fejlsøgning. "Tidligere
kørsler" og "Historik" er appens sag.

I kontrakten er frøet `seed`: et heltal (test og dommer) eller `null` (appen;
motoren vælger selv). **Med et heltal må tiden aldrig kunne ændre svaret**:
så styres antallet af forsøg af `budget.maxAttempts` og `budget.minAttempts`,
ikke af `maxSeconds`, så en langsom maskine giver det samme som en hurtig
(kontrakt 2.2).

---

## 11. Flere forsøg, flere kerner og fremgang (Kenneths beslutninger)

### 11.1 Flere forsøg på én gang
- Motoren kører mange **uafhængige forsøg**, hvert med sit eget frø.
- Forsøgene fordeles på **flere Web Workers, én pr. kerne** (så mange, som
  browseren oplyser, at computeren har). Den bedste efter rangordenen vinder.
- Med samme sæt frø skal resultatet være det samme, uanset hvor mange kerner
  der bruges (den bedste vælges efter rangorden og, ved lighed, efter frøets
  nummer).
- Virker flere Workers ikke i browseren, kører forsøgene efter hinanden i én.
- Efter kontrakten (afsnit 7) starter motoren selv sine ekstra workers fra
  filer i sin egen mappe, og i Node (dommeren og testene) skal den kunne køre
  på én kerne uden workers. Hvad et "forsøg" er, bestemmer motoren.

### 11.2 Hvornår stopper den
Den stopper ved det første af:
- alle regler har nået deres **bedst mulige** (så findes der ikke noget bedre),
- **læreren stopper** den (så bruges den bedste indtil nu),
- **tidsloftet** er nået.

**Budgettet kommer fra input** (kontrakt 2.2, `budget`): `maxSeconds`,
`maxAttempts` og `minAttempts`. Motoren følger de tal; det er appen, der
vælger dem. Loftet nedenfor er derfor et krav til, hvad appen sender, og
motoren skal kunne udnytte det. Kontrakt version 2 siger det samme som
specifikationen: motoren må stoppe før tid, når **alle regler har nået det
bedst mulige**; `maxSeconds` er 10, eller 30 over 100 elever; et "forsøg" er
motorens egen enhed (fx én runde på alle kerner), og `maxAttempts` (20) tæller
i den enhed.

**Stop** (kontrakt 3.2 og 5): motoren svarer inden for ca. 1 sekund med
`status: "stopped"` og den foreløbig bedste deling i `groups`, med beskeder og
`rules` for netop den deling (`playback` må være `null`). Har den endnu ingen
hel deling, er `groups` `null`, og grupperne på skærmen bliver stående.

**Loftet** (Valgt, svar2 17): **10 sekunder** for almindelige klasser, og
længere for store hold, **fx 30 sekunder over 100 elever**, så længe
fremgangen vises og der kan stoppes. Kenneth bruger ikke selv store hold, og
læreren kan godt vente længere, når hun kan se, at der sker noget.

Til sammenligning i dag: indtil alle regler er opfyldt, 20 forsøg eller 10
sekunder, dog mindst 3 forsøg (2 ved over 60 elever). Den nye motor har intet
fast antal forsøg, men skal inden for loftet nå mindst lige så mange forsøg,
som i dag (3, eller 2 over 60 elever), før den stopper på grund af tiden.

### 11.3 Fremgang undervejs
Motoren sender jævnligt en besked tilbage med:
- hvor mange forsøg der er lavet, og hvor lang tid der er gået,
- den **foreløbig bedste** gruppedeling,
- hvor mange regler der er opfyldt nu, og hvilke der ikke er,
- om den bedste er lig det bedst mulige.

Læreren kan stoppe, når hun er tilfreds. Det er vigtigere, at ventetiden er
synlig, end at den er kort.

**I kontraktens format** (afsnit 4) er det `hooks.onProgress` med `seconds`,
`attempt`, `rulesMet`, `rulesTotal`, `heavyBroken` (brud på Adskil altid,
Undgå hinanden, Adskil og Klyng lagt sammen), `best` og en valgfri `text`.
**Den første fremgang skal komme inden for 1 sekund, og derefter mindst hvert
2. sekund**; 20 sekunder uden livstegn får appen til at falde tilbage til den
nuværende motor. Motoren spørger `hooks.isCancelled()` jævnligt og svarer
inden for 1 sekund efter Stop. Hvilke regler der ikke er opfyldt, står i
`rulesNotMet` (regelnumre), og om den bedste er lig det bedst mulige, i
`atBestPossible`.

---

## 12. Afspilning af dannelsen

Læreren kan se dannelsen afspillet trin for trin: hvordan eleverne først
deles ud, og hvilke bytninger der gjorde grupperne bedre. Motoren skal derfor
kunne fortælle, **hvad den gjorde**, ikke kun resultatet.

- Sporet skal kunne vises for den kørsel, der blev valgt som den **bedste**
  (det vindende forsøg).
- **Samme detaljeringsgrad som i dag** (Valgt, svar2 18): (1) hver placering i
  opbygningen: elev (eller blok) → gruppe, i rækkefølge; (2) de bytninger, der
  gjorde grupperne bedre: hvem byttede, og hvilke regler blev bedre. Bytninger,
  der blev prøvet og afvist, vises ikke.
- "Ryst"-bytninger (10.2) gør ikke grupperne bedre, men ændrer dem. **De
  vises, markeret som "ryst"**, så afspilningen ender i de grupper, læreren
  faktisk fik (Valgt, svar3 20).
- **Loft på størrelsen**, fx et par MB. Når loftet nås, må de sidste skridt
  slås sammen til ét, så afspilningen stadig ender i det endelige resultat.
- Sporet må ikke gøre motoren mærkbart langsommere.

**I kontraktens format** (afsnit 3.6) er sporet `playback`: `deal` er
opbygningen (`[elev, gruppe]` i rækkefølge; en blok bliver én linje pr. elev),
`moves` er bytningerne (`swap`, `move`, eller `swaps` for en blok, der flytter
samlet), med `rule` (den regel, trinnet var for) og `effect`: `"better"` for en
forbedring, `"worse"` for en "ryst"-bytning. Uddelingen plus alle trin skal give
præcis forsøgets `groups`, og for det bedste forsøg er de lig svarets
`groups`. Når loftet nås (fx over 20.000 trin), lægges de sidste trin sammen
til ét `swaps`-trin, og `cut` er `true`, så afspilningen stadig slutter i
grupperne (kontrakt 3.6).

---

## 13. Efternølere

En elev, der kommer for sent (eller en fraværende, der kommer tilbage), kan
sættes ind i grupper, der allerede er dannet, **uden at de andre flyttes**.
Motoren foreslår den bedste gruppe, valgt i denne rækkefølge:

1. Skal sammen (eleven skal til sin blok),
2. emnet med færrest elever (i matrix: "én fra hver"),
3. Opdel (elevens pulje),
4. Adskil altid,
5. Undgå hinanden,
6. Adskil,
7. den mindste gruppe,
8. de øvrige regler som tiebreaker.

I dag står Adskil altid, Undgå hinanden og Adskil på samme trin; med den nye
rangorden kommer de i rækkefølgen Adskil altid → Undgå hinanden → Adskil
(Valgt, svar2 16). Flere Adskil (altid)-regler tages i opskriftens rækkefølge.

En efternøler kommer **aldrig** i en låst gruppe (Som i dag, svar2 16).

Det gøres med de **samme regelmoduler**, så forslaget og beskederne bruger
samme målinger.

**Ikke i kontraktens version 2** (kontrakt 6 og 9.3): i dag laver appen selv
placeringen, og indgangen til motoren kommer i en senere kontraktversion.
Kravet til første version er derfor, at regelmodulerne kan bedømme "én elev i
én bestemt gruppe" uden at måle alt forfra; selve indgangen bygges ikke endnu.

---

## 14. Emnernes fordeling (efter dannelsen)

Emner er **ikke** en del af motorens søgning. Eleverne vælger ikke emner, og
der er ingen emnekolonne. Emnerne gives til **grupperne**, efter at grupperne
er dannet, af en lille selvstændig funktion, der kører efter søgningen. Efter
kontrakten (afsnit 6) ligger funktionen i motorens pakke: svaret har emnet i
`groups[].topic`, og nye emner til låste grupper med et forældet emne i
`lockedTopics`. Låste grupper tæller med i fordelingen med deres emne.

- Antallet af grupper kan være påvirket af emnerne (4.4).
- Grupperne tages fra den største til den mindste. Hver gruppe får det emne,
  der **har færrest elever** indtil nu. Så bliver antallet af elever pr. emne så
  jævnt som muligt.
- Lige store grupper tages i **navnerækkefølge**, hvor tal i navnet læses som
  tal (Gruppe 2 før Gruppe 10), så samme klasse giver samme emnefordeling hver
  gang (Som i dag, svar2 9). Motoren kender numrene: de låste har deres
  `number` i input, og de nye grupper får de ledige numre 1, 2, 3 … i den
  rækkefølge, de står i `groups` (med låste nr. 2 og 4 får de nye 1, 3, 5, 6 …)
  (kontrakt 2.2 og 3.3).
- Har to emner lige få elever, får det emne, der står **først på klassens
  emneliste**, gruppen (Som i dag, svar2 9).
- En **låst gruppe beholder sit emne**, hvis emnet stadig er på klassens
  liste. Har den **intet emne**, eller er emnet fjernet, er den med i
  fordelingen som de nye grupper og får et emne i `lockedTopics` (Som i dag,
  svar6 36).

Reglerne gælder hele klassen, ikke inden for hvert emne.

---

## 15. Sådan vises det, at den nye motor er mindst lige så god

Idérundens afsnit 6 gælder uændret, med disse rettelser:

### 15.1 Faste kontroller (altid sande, for hver eneste kørsel)
- hver fri, tilstedeværende elev er i præcis én gruppe; fraværende i ingen,
- låste grupper er uændrede,
- gruppestørrelserne er præcis dem, regnereglen i afsnit 4 giver, pr. pulje,
- hver gruppe er "ren" på **alle** Opdel-kolonner (kombinationen),
- Skal sammen-blokke er hele (undtagen aftaler, der er sprunget over denne
  gang),
- matrix "Fuld": hver matrixgruppe har mindst én fra hver kilde, to
  matrixgrupper har højst én overskydende mere end hinanden fra samme kilde,
  og matrixgrupperne er højst én elev forskellige i størrelse (svar5 34),
- efternøler: aldrig placeret i en låst gruppe,
- efternøler: ingen andre elever er flyttet.

### 15.2 Sammenligningen med den nuværende motor
- Den gamle motors resultater kommer som tal i det fælles format, aldrig som
  kode, og lavet af en anden end den, der skriver den nye motor.
- Begge køres med flere frø. Som standard får hver motor sit eget budget, som
  i lærerens browser (kontrakt 8): den nuværende 10 sekunder, den nye 30 over
  100 elever. Det viser, hvad læreren faktisk får. For en ren sammenligning af
  motorerne køres også med samme budget (adapterens `--budget-fra-input`).
- Den nyes dårligste frø sammenlignes med den gamles bedste på de tunge trin
  (1–4). Ét tilfælde, hvor den nye er dårligere, er en fejl, der skal
  undersøges.
- Adapteren deler kun efter den første Opdel (kontrakt 8). Ved flere Opdel
  melder dommerens faste kontrol derfor brud hos den nuværende motor; det er
  en kendt forskel, ikke en fejl i dommeren.
- **Bemærk:** hvor den nye motor bevidst gør noget andet (flere Opdel som
  kombination, alle sorteringsregler fuldt med, øverste regel vinder blandt de
  tunge, Undgå hinanden over Adskil og Klyng, trinvise vægte på målene, Saml
  "opfyldt" mod det bedst mulige),
  sammenlignes kun på de regler, de to motorer er enige om, og forskellen
  beskrives for sig.

### 15.3 Testklasser og mutationstest
Opdigtede klasser (8–300 elever), den realistiske testklasse, "plantede"
klasser med kendt svar og grænsetilfælde, som i idérunden. Dommeren
mutationstestes. Ingen rigtige elevnavne.

---

## 16. Hvad dommeren skal måle

Dommeren får to ting i kontraktens format: et **input** (kontrakt afsnit 2)
og et **svar** (afsnit 3), hvor den kun læser `status` og `groups` (elev →
gruppe). Ud fra input laver dommeren selv **opgaven** (afsnit 3: puljer,
regler med behandlede værdier, aftaler, størrelser) med det samme
opgave-modul som motoren. Den læser ikke motorens `messages`, `rules` eller
`playback` (kontrakt 8: den nuværende motors beskeder er ufuldstændige).
Dommeren ved intet om, hvilken motor der har lavet grupperne. Ved
`status: "impossible"` bedømmer den kun, om det var rigtigt at stoppe (5.1).
Svar med `status: "stopped"` er ikke med i sammenligningen (læreren stoppede
før tid); dommeren kan bedømme deres `groups`, hvis de findes.

Dommerens "opfyldt" for en hel regel er det, motoren skal sende som
`rules[].met` (kontrakt 3.5), så de to kan sammenlignes.

For hver regel giver dommeren:
- **tal**: det rå mål (≥ 0; 0 = perfekt), og pr. gruppe hvor det giver mening,
- **bedst mulige**: den nedre grænse, hvor den kendes,
- **opfyldt**: ja/nej pr. gruppe og for reglen samlet, eller "ikke målt"
  (Balancér og Ensartede uden nok tal, 6.7–6.8), som i kontrakten er
  `met: null`. For Saml både det nye og dagens "opfyldt" (6.9), så de kan
  vises side om side.

Rangordenen (afsnit 7) er et lag *oven på* dommerens tal, ikke en del af den.
Men dommeren **afleverer tallene i rangordenens rækkefølge** (tabellen
nedenfor går fra top til bund), så rangordenslaget bare skal læse dem i
rækkefølge:

1. faste krav,
2. hver Adskil altid-regel, i opskriftens rækkefølge,
3. Undgå hinanden (alle aftaler som ét tal),
4. *kun matrix:* "højst én fra hver kilde",
5. hver Adskil- og Klyng-regel, i opskriftens rækkefølge (blandet, som de står),
6. hvert mål (Fordel, Balancér, Ensartede) med sin plads *i* blandt *n* mål og
   sin vægt *n* − *i* + 1,
7. hver Saml-regel med sin plads og vægt på samme måde.

Fælles: alt måles **inden for hver pulje** og lægges sammen over puljerne.
Kun elever med en gyldig værdi tæller. *P*(*n*) = *n*·(*n*−1)/2. **Spænd** =
største minus mindste gyldige værdi i kolonnen blandt alle frie elever i
opgaven (også med Opdel).

| Trin | Regel | Tal (præcist) | Bedst mulige | Opfyldt |
|---|---|---|---|---|
| — | **Faste krav** | Liste over brud på 15.1 (skal være tom) | tom | tom liste |
| 1 | **Adskil altid** (pr. regel) | For hver gruppe: *P*(antal elever med *nogen* af de valgte værdier). Sum | Jævn spredning af de *m* elever på *k* grupper | Gruppe: højst én. Regel: tal = 0 |
| 2 | **Undgå hinanden** (alle aftaler) | For hver aftale og hver gruppe: *P*(antal fra aftalen i gruppen). Sum over aftaler | Jævn spredning pr. aftale, lagt sammen | Gruppe: 0 par. Regel: tal = 0 |
| 3 | **Matrix, "højst én fra hver kilde"** | For hver matrixgruppe og hver kilde: *P*(antal fra kilden). Sum | Jævn spredning pr. kilde | Gruppe: højst én fra hver |
| 4 | **Adskil** (pr. regel) | Som Adskil altid | Som Adskil altid | Som Adskil altid |
| 4 | **Klyng** (pr. regel) | Antal elever, der er de eneste i deres gruppe med deres værdi (alle værdier i kolonnen) | Antal værdier med kun én elev i puljen (+ pakke-overslag) | Gruppe: ingen værdi præcis én gang |
| 5 | **Fordel** (pr. regel) | For hver værdi *v* og gruppe *g*: *f* = *c*ᵥ · *s*_g / *N*, hvor *c*ᵥ = antal i puljen med *v*, *s*_g = gruppens størrelse, *N* = antal elever i puljen (også dem med tom celle, så de "ikke udfyldte" ikke presser de andre op). Afvigelse = max(0, ⌊*f*⌋ − *n*) + max(0, *n* − ⌈*f*⌉), hvor *n* = antal med *v* i *g*. Sum | 0 | **I dag:** gruppe: svar.md 9's to dele (6.6), regel: alle grupper; vises også som andel. **Nyt:** afvigelse = 0 |
| 5 | **Balancér** (pr. regel) | Sum over grupper med mindst én gyldig værdi af \|gruppens snit − puljens snit\|. Uvægtet (hver gruppe tæller én gang). Snit kun over elever med tal | ingen kendt; 0 | Gruppe: afstanden ≤ 0,05 · spænd; en gruppe uden tal tæller ikke. Regel: alle grupper med tal; færre end to grupper med tal = ikke målt |
| 5 | **Ensartede** (pr. regel) | Sum over grupper af gruppens varians: snittet af (værdi − gruppens snit)² over gruppens gyldige værdier. En gruppe med under 2 gyldige værdier giver 0 | Sortér-og-skær giver facit, når den er eneste regel | Gruppe: varians ≤ max(1; 0,1 · (spænd / 2)²); en gruppe uden tal tæller ikke. Regel: alle grupper med tal; ingen grupper med tal = ikke målt |
| 6 | **Saml**, tekst uden rangering (pr. regel) | Værditælling: sum over grupper af antal forskellige værdier i gruppen − Σᵥ ⌈*c*ᵥ / største gruppestørrelse i puljen⌉ | 0 | **Nyt:** tal = 0. **I dag:** andel af grupper med præcis én værdi (grupper uden svar tæller ikke) |
| 6 | **Saml**, tal eller rangering (pr. regel) | To tal: (a) sum over grupper med tal af gruppens varians, som Ensartede; (b) værditælling som ovenfor, kun for grupper uden tal. Til rangordenen lægges de sammen på fælles skala (7.3) | Sortér-og-skær giver facit for (a), når den er eneste regel | **Nyt:** hver gruppe med tal har varians ≤ max(1; 0,1 · (spænd / 2)²), og (b) = 0. **I dag:** andel af grupper, der er opfyldt (grupper med tal: variansgrænsen; uden tal: præcis én værdi) |

Noter til trin 2:
- "Snit" og "varians" regnes på de behandlede tal (3.2–3.3), med fuld
  præcision; afrunding kun i beskeder. Variansen er "delt med antal" (ikke
  antal − 1) (svar3 21).
- Dommeren regner også tallet for **en tilfældig gruppedeling** pr. mål og pr.
  Saml-regel (for Saml med tal: for hver af de to dele) (7.3), med et fast frø,
  så rangordenslaget kan gøre målene om til samme skala.
- Dommeren skal kunne bedømme den gamle motors grupper præcis som den nyes:
  den læser kun "hvem er i hvilken gruppe".
