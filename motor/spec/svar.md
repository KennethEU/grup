# Svar på de åbne spørgsmål — ny gruppemotor i JavaScript

*3/11 2026. Hører til [ideer.md](ideer.md), afsnit 7.*

## Hvordan svarene er skrevet

Idédokumentet blev skrevet uden adgang til koden (ren-rums-reglen). Svarene
her er skrevet af en session, der KENDER den nuværende kode, og de er derfor
skrevet som en beskrivelse af **hvad programmet gør set udefra**: hvad læreren
ser, og hvad der kommer ud af en gruppedannelse. Der er ingen kode, ingen
filnavne, ingen funktionsnavne og ingen algoritmer fra den nuværende motor.

Den, der senere skriver den nye motor, må læse dette dokument og
idédokumentet, men ikke den gamle kode.

Hvor svaret er "sådan gør programmet i dag, men det er ikke nødvendigvis det
rigtige", står det som **Kan forbedres**.

**Godkendt af Kenneth 3/11 2026**, sammen med to beslutninger til den nye motor:

1. **Den øverste regel i opskriften vejer tungest.** Opskriften lover det i
   dag, og den nye motor skal holde løftet: inden for samme slags regler (fx to
   Fordel-regler) vinder den, der står øverst. De tunge regler (Adskil altid,
   Undgå hinanden, Adskil, Klyng) går stadig før målene (Fordel, Balancér,
   Ensartede, Saml), uanset plads. Opdel deler stadig op først.
2. **Den nye motor skal kunne bruge flere af computerens kerner** (fx køre
   flere forsøg på én gang, ét pr. kerne), og den skal vise sin fremgang
   undervejs (se svar 13).

---

## Svarene

### 1. "Skal sammen" og "Undgå hinanden": hvor tungt vejer de?

**Skal sammen er et krav, ikke en vægt.** Eleverne i en aftale (og aftaler,
der deler en elev, lægges sammen til én blok) havner altid i samme gruppe.
Programmet bryder aldrig en aftale for at få en bedre fordeling.

Kan blokken ikke opfyldes, **danner programmet ingen grupper**, og læreren får
en besked med elevernes navne. Det sker, når:
- blokken har flere elever, end den største gruppe har pladser
  ("Skal sammen samler 6 elever, men den største gruppe har 5 pladser")
- blokkene tilsammen ikke kan pakkes ind i grupperne
- eleverne også har en "Undgå hinanden"-aftale med hinanden
- eleverne har en Adskil-regel imod sig (fx to med samme valgte værdi)
- blokken går på tværs af en låst gruppe (en i den låste, en udenfor)
- blokken går på tværs af en Opdel (eleverne er i hver sin pulje)

I alle de tilfælde tilbyder beskeden at **danne grupperne uden netop den
aftale denne ene gang**. Aftalen bliver stående og gælder igen ved næste
dannelse.

Skal sammen gælder kun **stamgrupper**, ikke matrixgrupper.

**Undgå hinanden vejer som Adskil (tungt), ikke som Adskil altid.** Den kan
brydes, hvis det ikke kan undgås (fx 5 elever og 4 grupper), og så får
læreren beskeden. Idédokumentets antagelse (plads 1 sammen med Adskil altid)
er altså forkert for i dag: Undgå hinanden hører til plads 3.

### 2. Emner: hvordan havner en elev i et emne?

**Eleven vælger ikke et emne, og der er ingen emnekolonne.** Emnerne gives til
GRUPPERNE, efter at grupperne er dannet. Reglerne gælder for hele klassen, ikke
inden for hvert emne.

Emnerne fordeles, så antallet af ELEVER pr. emne bliver så jævnt som muligt
(den største gruppe går til det emne, der har færrest elever indtil nu). Lige
store grupper tages i fast rækkefølge, så samme klasse giver samme
emnefordeling hver gang.

En låst gruppe beholder sit emne, hvis emnet stadig er på klassens liste. Er
emnet fjernet fra listen, får gruppen et nyt emne som de andre.

Beskeder med "inden for 'Klima'" kommer IKKE fra emnerne, men fra **Opdel**,
når Opdel-kolonnen tilfældigvis hedder noget med emner (fx en kolonne
"Emne", som eleverne selv har valgt). Se også 4.

### 3. Opdel og tomme celler

Elever med tom celle i Opdel-kolonnen bliver **deres egen pulje** ("ikke
udfyldt") og danner grupper med hinanden. Der kommer ingen særlig besked.

**Kan forbedres:** en lærer forventer måske ikke, at de "glemte" elever ender
sammen. En besked ville være bedre.

### 4. Opdel og gruppestørrelse

- **"Elever pr. gruppe":** hver pulje regner sit eget antal grupper ud fra sit
  eget antal elever, med de samme regler som hele klassen (se 12). Hver pulje
  får mindst én gruppe.
- **"Antal grupper":** det samlede antal deles mellem puljerne, så
  gruppestørrelserne bliver så ens som muligt på tværs af puljerne. Hver pulje
  får mindst én. Beder læreren om færre grupper, end der er puljer, bliver det
  antallet af puljer, og læreren får at vide hvorfor.

**Flere Opdel-regler:** kun den FØRSTE deler klassen i puljer. De øvrige
prøver bare at undgå blandede grupper inde i puljen, uden garanti. Læreren får
en besked om det.

**Kan forbedres:** idédokumentets forslag (puljen er kombinationen af alle
Opdel-værdierne) er bedre end i dag.

### 5. Låste grupper

- Eleverne i en låst gruppe er **helt ude** af dannelsen. Reglerne og aftalerne
  ser kun på de frie elever.
- En Adskil-værdi, som KUN låste elever har, gør ingenting (reglen springes
  over for den værdi), og der kommer ingen besked om den.
- Undgå hinanden: kun de frie elever i aftalen tæller. Er der under to tilbage,
  gør aftalen ingenting.
- Skal sammen på tværs af en lås: se 1 (dannelsen stopper med en besked).
- **Antal grupper:** med "antal grupper" tæller de låste grupper MED i
  lærerens tal (beder hun om 6, og 2 er låst, dannes 4 nye). Med "elever pr.
  gruppe" regnes kun på de frie elever.

### 6. Adskil med flere valgte værdier

**Højst én elev med NOGEN af de valgte værdier pr. gruppe.** Vælger læreren
"Niveau = 1 og 2", må der højst være én elev, der har enten 1 eller 2, i hver
gruppe.

Bruddet måles i **par**: en gruppe med 3 af dem tæller som 3 brud (3 par), ikke
2. Så motoren foretrækker altid at bryde en klump op.

### 7. Klyng

**"Ingen alene" er nok.** Reglen er opfyldt i en gruppe, når ingen værdi står
der præcis én gang. To, tre eller fire med samme værdi er lige gode, og
programmet prøver ikke at samle så mange som muligt.

En værdi med 3 elever og grupper på 4: både 3 sammen og "2 + 1 i en gruppe med
nogle, der har en anden værdi" er tilladt, så længe ingen står alene med sin
værdi. (2 + 1 alene er ikke tilladt; den ene er så alene.)

Måles som antal elever, der står alene med deres værdi i deres gruppe.

### 8. Balancér og Ensartede: den værste gruppe eller summen?

- **Balancér: summen.** For hver gruppe måles afstanden fra gruppens snit til
  klassens snit, og afstandene lægges sammen. Klassens snit er det rigtige snit
  af alle elever (ikke et snit af gruppesnittene).
- **Ensartede: summen.** For hver gruppe måles, hvor meget medlemmerne
  spreder sig omkring deres egen gruppes snit (variansen), og det lægges
  sammen.
- Med Opdel måles begge **inden for hver pulje**: gruppen sammenlignes med
  SIN pulje, ikke hele klassen.
- Til lærerens "opfyldt / ikke opfyldt" bruges en tolerance i forhold til
  kolonnens spænd: Balancér er opfyldt, når gruppens snit ligger inden for 5 %
  af spændet fra klassens snit; Ensartede har en tilsvarende, lidt løsere
  grænse.

### 9. Fordel med mange værdier

**Alle værdier i kolonnen fordeles**, ikke kun nogle udvalgte. Der kan ikke
vælges værdier til Fordel.

En gruppe er "opfyldt", når begge dele gælder:
- ingen værdi står flere gange i gruppen end gruppestørrelsen delt med antal
  værdier, rundet op
- alle værdier, der findes i klassen, er med i gruppen (dog højst så mange, som
  gruppen har pladser; 5 værdier kan ikke alle være i en gruppe på 4)

Med Opdel måles det inden for hver pulje: en værdi, der ikke findes i puljen,
kan ingen gruppe dér mangle.

### 10. Tal med komma, og blandede kolonner

- En celle er et tal, hvis den kun består af cifre, fortegn, ét decimaltegn og
  eventuelt mellemrum. **Komma og punktum er begge decimaltegn.** "7,5" og "7.5"
  er 7,5.
- **"1.000" er tallet 1**, ikke tusind. Tusindtalsseparatorer kendes ikke. Det
  rammer ikke karakterer, fravær i procent osv., men er værd at vide.
- "1.000,5" er ikke et tal (to tegn), og "7 dage" er heller ikke.
- **Blandet kolonne** (nogle tal, nogle tekst): talreglerne regner kun på de
  celler, der er tal. De andre elever placeres frit på den regel, og læreren
  får en besked: "2 elever har en værdi i "Karakter", der ikke er et tal
  ("Fritaget")".
- Er der KUN tekst i kolonnen, siger opskriften, at reglen ikke gør noget, og
  tilbyder at give værdierne en rækkefølge.
- Store og små bogstaver: værdier, der kun adskiller sig ved store og små
  bogstaver, regnes som samme værdi, og den hyppigste stavemåde bruges i
  beskeder.

### 11. Matrix

**Fraværende** elever er ikke med i matrixgrupperne. Elever i **låste
matrixgrupper** er ude af dannelsen, som ved stamgrupper. Elever i låste
STAMgrupper er med i matrixdannelsen som alle andre.

Læreren vælger mellem:
- **"Fuld" (standard):** hver matrixgruppe får én fra hver kilde. Kilden er
  enten **emnerne** (standard: én fra hvert emne) eller **stamgrupperne**. Antal
  matrixgrupper = antallet af elever i den MINDSTE kilde, så alle
  matrixgrupper kan få én fra hver. Er en kilde helt tom (fx alle fraværende),
  får læreren en besked, der nævner den.
- **Elever pr. gruppe** eller **antal grupper**, som ved stamgrupper. Så er
  "højst én fra hver kilde" et tungt hensyn, ikke en garanti.

Typisk størrelse ved "Fuld": lige så mange elever pr. matrixgruppe, som der er
emner (3–5). **Bekræftet af Kenneth 3/11 2026.**

### 12. "+1"/"-1" og meget små klasser

**Elever pr. gruppe:**
- **"+1":** antallet af grupper er antal elever delt med målet, rundet NED
  (mindst 1). Bliver en gruppe så mere end én over målet, lægges en gruppe til.
  Grupperne er altså målet eller én over.
- **"-1":** antallet af grupper er antal elever delt med målet, rundet OP.
  Grupperne er målet eller mindre.
- Eleverne deles altid så jævnt som muligt: to grupper adskiller sig højst med
  én elev.

Eksempler, 4 pr. gruppe:
- 26 elever "+1": 6 grupper (5, 5, 4, 4, 4, 4). "-1": 7 grupper (4, 4, 4, 4, 4, 3, 3).
- 5 elever "+1": 1 gruppe på 5. "-1": 2 grupper på 3 og 2.

**Antal grupper:** præcis det antal (minus låste), dog aldrig flere grupper end
elever.

**Emner** kan ændre antallet: med "+1" rundes ned til et multiplum af antal
emner, med "-1" op, men kun så længe grupperne holder sig inden for "højst én
over/under målet". Ellers beholdes antallet, og nogle emner får én gruppe mere.
Opskriften viser, hvad det andet valg ville give.

### 13. Tidsbudget

I dag: programmet danner grupper igen og igen, indtil **alle regler er
opfyldt** eller **20 forsøg** eller **10 sekunder** er brugt, alt efter hvad der
kommer først. Det kører dog altid mindst 3 forsøg (2 ved over 60 elever).

Målt i dag: en klasse på 28 tager ca. 0,1 sekund; et hold på 250 tager ca. 12
sekunder. På 22 elever med 6 Fordel-regler finder ét forsøg en perfekt løsning
i 27 % af tilfældene, og med op til 20 forsøg i 99,8 %.

Læreren kan stoppe en kørsel undervejs. Over en vis størrelse får læreren en
besked om, at det tager tid, før kørslen starter.

**Kenneth (3/11 2026):** han bruger ikke selv Grupper med så store hold.
Læreren kan godt vente længere, hvis hun kan **se, at der sker noget**, fx hvad
motoren gør undervejs. Det er altså vigtigere, at ventetiden er synlig, end at
den er kort. Idédokumentets forslag om at sende "foreløbig bedste" tilbage
undervejs (afsnit 5) passer til det: vis fremgangen, fx hvor mange regler der
er opfyldt nu, og lad læreren stoppe, når hun er tilfreds. Afspilningen (se
nedenfor) viser allerede motorens arbejde, men først bagefter.

### 14. Gentagelighed

"Dan grupper igen" giver **nye grupper hver gang**. Der kan ikke vælges et frø,
og læreren kan ikke selv genskabe en bestemt deling ad den vej. I stedet gemmes
de seneste dannelser i **"Tidligere kørsler"** (kun i denne fane), og læreren
kan gemme en session i **Historik** og gendanne den.

Et frø til test og fejlsøgning (idédokumentets forslag) er en god idé, men det
behøver ikke vises for læreren.

### 15. Tidligere grupper

**Der er ingen særlig regel for "ikke med de samme som sidst".** Læreren gemmer
en dannelse som en kolonne i elevlisten ("Gem som kolonne": hver elev får sit
gruppenavn fra den gang) og lægger så en **Fordel-regel** på den kolonne. Gøres
det for flere tidligere dannelser, bliver det flere Fordel-regler (opskriften
er bygget til at kunne rumme mange).

**Kan forbedres:** Fordel på et gammelt gruppenavn spreder de gamle grupper ud,
men det tæller ikke par. En regel for "så få gamle makkere som muligt" ville
være mere præcis, og en ny motor kunne tilbyde den.

---

## Det, specifikationen manglede

Gennemgangen viste fem ting, Grupper kan i dag, som ikke stod i
specifikationen. En ny motor skal også kunne dem (eller der skal træffes et
bevidst valg om at droppe dem):

1. **Afspilning af dannelsen.** Læreren kan se en dannelse blive afspillet trin
   for trin: hvordan eleverne først deles ud, og hvilke bytninger der gjorde
   grupperne bedre. Motoren skal derfor kunne fortælle, hvad den gjorde, ikke
   kun hvad resultatet blev.
2. **Efternølere.** En elev, der kommer for sent (eller en fraværende, der kommer
   tilbage), kan sættes ind i grupper, der allerede er dannet, uden at de andre
   flyttes. Programmet foreslår den bedste gruppe: Skal sammen først, så emnet
   med færrest elever (eller i matrix "én fra hver"), så Opdel, så Undgå
   hinanden og Adskil, så den mindste gruppe, og til sidst de øvrige regler som
   tiebreaker. I dag er det en separat beregning; med idédokumentets
   regelmoduler kunne de samme moduler bedømme placeringen.
3. **"Dan uden aftalen denne gang"**: se svar 1.
4. **Flere sorteringsregler:** har læreren flere Balancér-, Ensartede- og
   Saml-regler, er det i dag kun den første, der styrer, hvordan grupperne
   bygges, mens resten tæller svagere. Læreren får en besked om det. **Kan
   forbedres:** en ny motor med regelmoduler kan behandle dem ligeværdigt.
5. **Emnernes fordeling** sker efter dannelsen og efter antallet af elever, ikke
   efter elevernes valg (svar 2).

Desuden to ting om beskeder, som idédokumentets "beskeder fra ét sted" skal
dække:
- Programmet siger fra på forhånd, når **to regler trækker i hver sin
  retning** på samme kolonne (fx Balancér og Ensartede, eller to regler af samme
  slags), og når en regel står to gange.
- Kan en regel ikke gå helt op, bliver beskeden **stående efter kørslen** under
  "Sidste dannelse", indtil læreren ændrer opskriften.

---

## Rettelser til idédokumentet

| Sted | Idédokumentet antog | Sådan er det |
|---|---|---|
| 2.4, plads 1 | "Undgå hinanden" vejer som Adskil altid | Vejer som Adskil (plads 3) |
| 2.4, plads 2 | "Skal sammen" kan brydes | Kan aldrig brydes; dannelsen stopper med en besked og tilbyder at springe aftalen over |
| 3, Emner | Emner kunne være puljer | Emner gives til grupperne bagefter; puljer kommer kun fra Opdel |
| 3, Opdel | Flere Opdel = kombination | I dag deler kun den første; kombinationen ville være en forbedring |
| 7, spørgsmål 15 | Måske en særregel for tidligere grupper | Ingen særregel; Fordel på gemte gruppekolonner |
