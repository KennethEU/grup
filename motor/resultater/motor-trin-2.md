# Den nye motor, trin 2: regelmodulerne

*3/11 2026.*

## Hvad er bygget

- `engine/rules.js`: for hver regel (Adskil altid, Undgå hinanden, Adskil,
  Klyng, Fordel, Balancér, Ensartede, Saml, matrix-kilderne) **mål**, **bedst
  mulige** og **opfyldt**, plus rangordenen fra spec. 7: de tunge regler én
  ad gangen i opskriftens rækkefølge, målene og Saml trinvist vægtet og gjort
  om til samme skala (200 tilfældige delinger med fast frø).
- `engine/modules.js`: de samme regler som **små tællere pr. gruppe**, så en
  bytning kan bedømmes uden at måle hele klassen igen (spec. 10.2). De kan
  også bedømme "én elev i én gruppe" (læg ind, læs, tag ud).
- `engine/state.js`: hvem er i hvilken gruppe, og hvad koster det på hvert
  trin. "Prøv" og "gør" går gennem samme kode.

## Målt

- **Motorens målinger = dommerens** på alle 268 svar fra den nuværende motor:
  hver regels tal, bedst mulige og opfyldt, og hele rangordens-rækken
  (`tests/rules-vs-judge.test.mjs`).
- **Tællerne = den præcise måling** efter 60 tilfældige bytninger i hvert af
  de 268 input, og "prøv" giver præcis samme ændring som "gør"
  (`tests/state.test.mjs`). Eneste undtagelse: Saml lægger under søgningen
  en fast størrelse til, som ikke ændrer sig ved bytning; den præcise måling
  afgør til sidst.
