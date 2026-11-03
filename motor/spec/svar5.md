# Svar på spørgsmål 34 og 35

*3/11 2026. Samme mærker som svar2.md.*

**34. Matrix "Fuld", "spredes jævnt" — Valgt: forslaget, begge dele er krav.**
Grupperne er højst én elev forskellige i størrelse, OG fra hver kilde har to
matrixgrupper højst én overskydende mere end hinanden. I dag holdes
"overskydende fra samme kilde" jævne som et Fordel-hensyn på kilden (ingen
gruppe får mere end sin andel af en kilde, rundet op), så forslaget er mindst
lige så godt som i dag. Kontrakten får sætningen med i næste version; indtil
da gælder specifikationen.

**35. Saml: hvornår er den opfyldt? — I dag, pr. gruppe:**
- **Tekst uden rangering:** en gruppe er opfyldt, når der kun står ÉN værdi i
  den. Hver ekstra værdi i gruppen tæller som et brud. En gruppe, hvor ingen
  har svaret, er ikke med.
- **Tal eller rangering:** en gruppe er opfyldt, når variansen er under
  Ensartedes grænse (varians ≤ max(1; 0,1 · (spænd / 2)²)).
- **Talkolonne, hvor nogle grupper ikke har tal:** hver gruppe måles på sin
  egen måde (grupper med tal på variansen, grupper uden tal på værditællingen).
  De to lægges ikke sammen til én skala i dag; "opfyldt" er bare andelen af
  grupper, der er opfyldt.

**Kan forbedres — Valgt: forslaget.** "Én værdi pr. gruppe" kan sjældent nås
og er et strengere krav, end Saml ("blødt") lover. Mål i stedet i forhold til
det bedst mulige (hver værdi i så få grupper som muligt), som forslaget siger,
og læg de to dele sammen på fælles skala som foreslået. Dommeren skal kunne
vise både det nye mål og dagens "én værdi pr. gruppe", så sammenligningen med
den nuværende motor er fair.
