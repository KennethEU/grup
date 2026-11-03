# Den nye motor, trin 5: beskeder fra ét sted

*3/11 2026.*

## Hvad er bygget

`engine/messages.js`: alle beskeder bliver til som et fund (regel, pulje,
slags, tal, elever), og én funktion laver dem om til kontraktens besked med en
dansk tekst. Teksterne nævner aldrig navne eller `_rowId` (`{elever}` og
`{gruppe:N}` sættes ind af appen).

- **`check(input)`** i `engine.js` svarer med beskederne før kørslen, uden
  grupper, fra de samme regelmoduler som `run`. Så kan opskriften og motoren
  ikke være uenige (spec. 8.1).
- **Før kørslen:** Skal sammen (én besked pr. blok, alle på én gang), tom
  matrix-kilde, Adskil/Adskil altid/Undgå/Klyng kan ikke opfyldes (med det
  bedst mulige: "Mindst to ender i samme gruppe"), Fordel kan ikke gå lige op,
  regler der trækker hver sin vej eller står to gange, tal mod tekst, tomme
  Opdel-celler, lille pulje, færre/flere grupper, emne-runding (også svar7 41),
  flere emner end grupper, kilden der sætter loftet, elever uden stamgruppe.
- **Efter kørslen:** én `rule-not-met` pr. regel, der ikke er opfyldt, med de
  grupper, det gælder, og `unavoidable`: "Det kunne ikke undgås" når tallet er
  det bedst mulige (for Fordel: når det retfærdige antal er nået), ellers
  "Prøv at danne igen".

## Målt

- Sæt 1 giver 24 af kontraktens koder fra `check` (alle undtagen
  `more-groups-than-asked`, der dækkes af `fewer-groups-than-pools`, og de to,
  den nye motor ikke sender).
- Testene tjekker kontraktens felter, at koden er på listen, at ingen tekst
  nævner en `_rowId`, og at de 32 stop har præcis dommerens koder.
