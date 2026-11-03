# Svar på de 18 spørgsmål i spoergsmaal.md

*3/11 2026. Skrevet af den kendte side som en beskrivelse af, hvad programmet
gør set udefra, plus Kenneths beslutninger. Ingen kode, ingen filnavne, ingen
algoritmer fra den nuværende motor.*

Mærker: **Kenneth** = Kenneths beslutning. **I dag** = sådan opfører Grupper
sig nu (beholdes, medmindre andet står). **Valgt** = besluttet af den
koordinerende session ud fra Kenneths tidligere svar; Kenneth kan ændre det.

---

## Rangorden

**1. Forskellige tunge regler mod hinanden — Kenneth: den øverste vinder
altid.** Alle tunge regler sammenlignes i opskriftens rækkefølge, én ad
gangen. Ét brud mindre på den øverste er altid bedre, uanset hvad der sker
længere nede. Specifikationens forslag gælder.

**2. Undgå hinanden — Kenneth: først blandt de tunge.** Alle Undgå-aftaler
regnes som én tung regel, der står før alle tunge regler fra opskriften
(Adskil, Klyng og den automatiske "højst én fra hver kilde" i matrix). Adskil
altid står stadig over alt (som besluttet i svar.md).

Rækkefølgen bliver altså: Opdel (deler op) → Adskil altid → Undgå hinanden →
de tunge regler fra opskriften i deres rækkefølge → målene i deres rækkefølge.
Skal sammen er et krav og indgår ikke i rangordenen (se 5–6).

**3. Vægte mellem målene — Kenneth: trinvis.** Med *n* mål vejer det øverste
*n*, det næste *n*−1, … det nederste 1, efter at hvert mål er gjort om til
samme skala. Specifikationens forslag gælder.

**4. Matrix uden "Fuld" — Valgt: først blandt de tunge fra opskriften.**
"Højst én fra hver kilde" er det, der gør en matrixgruppe til en
matrixgruppe, så den står efter Undgå hinanden og før matrixens egne tunge
regler.

## Skal sammen

**5. Adskil altid inde i en blok — I dag: ja, dannelsen stopper.** Har to
elever i samme Skal sammen-blok samme valgte værdi i en Adskil altid-regel,
stopper dannelsen med en besked, præcis som ved Adskil og Undgå hinanden.

**6. Flere aftaler, der fejler — I dag: én ad gangen.** Beskeden nævner den
første aftale, der ikke kan opfyldes (med navne), og knappen "Dan grupper uden
aftalen" springer netop den over denne ene gang. Fejler en anden aftale også,
stopper den næste dannelse ved den. **Kan forbedres, og må gerne:** nævn alle
de aftaler, der fejler, i én besked, og lad ét klik springe dem alle over.
Valgt: gør det bedre (alle på én gang).

## Matrix

**7. "Fuld" med ulige store kilder — I dag: som forslaget.** Antal
matrixgrupper = antallet af elever i den mindste kilde. Hver matrixgruppe får
mindst én fra hver kilde, og de overskydende elever fra de større kilder
spredes så jævnt som muligt (to matrixgrupper har højst én overskydende mere
end hinanden fra samme kilde).

## Størrelser og emner

**8. Emner, Opdel og låste grupper — I dag:**
- Rundingen til et multiplum af antal emner gælder **det samlede antal
  grupper for hele klassen**, ikke hver pulje for sig.
- **Låste grupper tæller med** i det samlede antal, der rundes: er der 1 låst
  gruppe og 3 emner, rundes "låste + nye" til fx 6, og der dannes 5 nye.
- Med Opdel deles det rundede samlede antal derefter mellem puljerne, som
  beskrevet i svar.md 4 (antal grupper).

**9. Emnefordeling ved lighed — I dag: ja.** Har to emner lige få elever, får
det emne, der står først på klassens emneliste, den næste gruppe. Grupperne
tages fra den største til den mindste, og lige store grupper i
navnerækkefølge (Gruppe 2 før Gruppe 10).

## Regler

**10. Klyng — I dag: alle værdier i kolonnen.** Læreren vælger ingen værdier
til Klyng. Hver værdi, der findes i gruppen, skal stå mindst to gange.

**11. Adskil altid — I dag: ved en værdi i en kolonne**, præcis som Adskil:
læreren vælger en kolonne og én eller flere værdier, og der må højst være én
elev med nogen af de valgte værdier i hver gruppe. Adskil altid adskiller sig
fra Adskil kun i, hvor tungt den vejer. (Navngivne elever holdes adskilt med
"Undgå hinanden".)

**12. Ensartede "opfyldt" — I dag:** en gruppe er opfyldt, når spredningen
inden i gruppen er lille i forhold til kolonnens spænd: gruppens varians må
højst være 10 % af (spændet / 2)², dog mindst 1. Det svarer til en
standardafvigelse på højst ca. 16 % af spændet. (Balancér: gruppens snit
højst 5 % af spændet fra klassens snit.)

**13. "Kolonnens spænd" — I dag: hele opgaven** (alle de frie elever, der
dannes grupper af), også når der er Opdel. Forslaget gælder.

**14. Fordel "opfyldt" ved skæv fordeling — I dag:** testen er som i svar.md
9 og bliver ikke blødere, så en skæv klasse kan ikke nå 100 %. Opskriften
siger på forhånd, at Fordel ikke kan gå helt op (med tal: hvor mange der har
værdien, og hvor mange der er plads til). Forslaget gælder: behold testen, og
lad beskeden sige "uundgåeligt", når resultatet er lig det bedst mulige.

## Nye funktioner

**15. Tidligere makkere — Kenneth: senere.** Første version skal kunne det
samme som i dag og være målbart bedre. Reglen kommer bagefter.

**16. Efternølere — I dag:** Adskil altid står på samme trin som Undgå
hinanden og Adskil (efter Skal sammen, emnet og Opdel). En efternøler kommer
**aldrig** i en låst gruppe. Med den nye rangorden (punkt 2): Valgt: Adskil
altid før Undgå hinanden før Adskil, også her.

**17. Tidsloft — Valgt ud fra Kenneths svar 13:** Kenneth bruger ikke store
hold, og læreren kan godt vente længere, når fremgangen er synlig. Derfor:
motoren stopper, når løsningen er lig det bedst mulige på alle regler, eller
når læreren trykker stop, eller ved et loft. Loftet er 10 sekunder til
almindelige klasser, men må gerne være længere for store hold (fx 30
sekunder over 100 elever), så længe fremgangen vises og der kan stoppes.

**18. Afspilning — I dag:** afspilningen viser, hvordan eleverne først deles
ud, og derefter de bytninger, der gjorde grupperne bedre (ikke de forsøg,
der blev afvist). Den skal kunne vise det for den kørsel, der blev valgt som
den bedste. Den må ikke fylde ubegrænset: et loft på størrelsen (fx et par
MB) er fint, og når loftet nås, må de sidste skridt slås sammen. Valgt:
samme detaljeringsgrad som i dag.
