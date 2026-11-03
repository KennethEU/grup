# Den nye motor, trin 6: fremgang, Stop, afspilning og flere kerner

*3/11 2026.*

## Hvad er bygget

- **Fremgang** (spec. 11.3, kontrakt 4): `hooks.onProgress` med `seconds`,
  `attempt`, `rulesMet`, `rulesTotal`, `rulesNotMet`, `atBestPossible`,
  `heavyBroken`, `best` og en kort tekst. Før det første forsøg er færdigt,
  vises den deling, forsøget er nået til.
- **Stop** (kontrakt 5): motoren kigger op ca. hvert 0,15 sekund (og holder en
  lille pause, så beskeder som Stop kan nå frem), og svarer `status:
  "stopped"` med den foreløbig bedste hele deling. `playback` er da `null`.
- **Afspilning** (spec. 12, `engine/playback.js`): det vindende forsøgs
  uddeling og trinene bagefter: forbedringer (`effect: "better"`, med den
  regel, der blev bedre) og ryst (`"worse"`). Over 20.000 trin lægges resten
  sammen til ét `swaps`-trin (og evt. få `move`), og `cut` er `true`.
- **Flere kerner** (spec. 11.1, `engine/worker.js`): i browseren én worker pr.
  kerne (højst 8, én kerne levnes til resten). Vinderen vælges efter
  forsøgenes numre, så svaret er det samme som på én kerne. Kan workers ikke
  startes, eller fejler én, kører forsøgene på én kerne. I Node altid én kerne.
- **Budget:** med fast frø et fast antal afprøvede bytninger pr. forsøg
  (1 million pr. sekund i `maxSeconds`, delt på `maxAttempts`), aldrig uret.
  Uden frø (appen) startes der ikke flere forsøg, når `maxSeconds` er gået, og
  `minAttempts` er nået.

## Målt (testene)

- Første fremgang under 1 sekund og derefter aldrig mere end 2 sekunder imellem
  på et hold med 265 elever; Stop besvaret på under 1 sekund, med en hel deling
  uden fejl i de faste krav.
- Tre kerner (Node's tråde, klædt ud som browserens Worker) giver præcis samme
  grupper og samme vindende forsøg som én kerne.
- Afspilningen ender i svarets grupper, også når den skæres af ved loftet.
