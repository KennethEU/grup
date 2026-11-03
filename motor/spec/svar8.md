# Svar på spørgsmål 42

*3/11 2026.*

**42. Budgettet med et fast frø — Valgt: som motoren gør nu.** Frøet bruges
kun til test og fejlsøgning; appen sender aldrig et frø. Det vigtige er, at
samme input og samme frø giver samme svar på enhver maskine, og det gør det.
At `maxSeconds` er en del af input og derfor ændrer arbejdet, er i orden. At
en kørsel med frø kan tage længere end `maxSeconds` på en travl maskine, er
også i orden, så længe det kun gælder kørsler med frø.
