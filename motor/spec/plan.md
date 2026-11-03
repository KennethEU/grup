# Plan for den rene side

Uddrag af den samlede plan. Den rene side laver tre ting, i denne rækkefølge,
og hver har en port, som Kenneth godkender:

1. **Specifikation version 2** (`spec/specifikation.md`): idérunden rettet
   efter `svar.md` og Kenneths beslutninger, så der er ÉT dokument, der siger,
   hvad motoren skal kunne. Ingen kode.
2. **Dommeren og testklasserne**: regelmodulernes "mål"-del, der giver
   karakter til en færdig gruppedeling, uanset hvilken motor der har lavet den,
   plus en generator af opdigtede testklasser, "plantede" klasser med kendt
   svar og grænsetilfælde. Dommeren mutationstestes.
3. **Motoren, trin for trin**: opgave og størrelser; reglerne én ad gangen;
   Skal sammen og Opdel; emner og matrix; beskeder fra ét sted; fremgang
   undervejs, afspilningstrin og flere forsøg på flere kerner; efternølere.
   Hvert trin måles med dommeren mod resultaterne fra den nuværende motor
   (de kommer som tal i det fælles format, aldrig som kode).

Kravet hele vejen: **"Det er vigtigt at programmet kun bliver bedre."**
Aldrig flere brud på de tunge regler end den nuværende motor på samme klasse,
og bedre eller lige på målene i langt de fleste.
