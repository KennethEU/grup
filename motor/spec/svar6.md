# Svar på spørgsmål 36–39 (fra arbejdet med dommeren)

*3/11 2026. Samme mærker som svar2.md.*

**36. Låst gruppe uden emne — I dag: den får et emne.** En låst gruppe
beholder kun sit emne, hvis emnet står på klassens emneliste. Har den intet
emne, eller et emne der er fjernet fra listen, er den med i emnefordelingen
som de nye grupper og får et emne i `lockedTopics`. Dommeren bør kræve det.

**37. Grupper mellem Opdel-puljer ved lige gode fordelinger — I dag:**
hver pulje starter med én gruppe, og hver af de resterende grupper gives til
den pulje, hvis grupper ellers ville blive størst. Ved lighed vinder den
største pulje; er puljerne også lige store, vinder den pulje, hvis værdi
optræder først blandt eleverne. To puljer på 6 og 3 grupper: den første pulje
får 2, den anden 1. Dommerens nuværende krav (ingen pulje burde have givet en
gruppe videre) er rigtigt; det præcise valg ved lighed er kun en
tiebreaker, og motoren bør følge den, så resultatet kan genskabes.

**38. Saml: hvornår er en kolonne en "talkolonne"? — I dag: det afgøres pr.
gruppe.** En gruppe, hvor mindst én elev har et tal (eller en rangeret værdi)
i kolonnen, måles som en blød Ensartede på de elever, der har tal. En gruppe
uden tal måles på værditællingen. Dommerens valg passer med det.

**39. Fordel med tomme celler — I dag:** en gruppe er opfyldt, når ingen værdi
står flere gange end gruppens størrelse delt med antal værdier, rundet op.
Gruppens størrelse er hele gruppen, også elever med tom celle; antal værdier
tæller kun de udfyldte. Specifikationens "retfærdige antal" (spec. 16) er nyt
og må gerne bruge puljens hele størrelse, som dommeren gør. Dommeren skal
kunne vise dagens test ved siden af, så sammenligningen er fair (som ved Saml).
