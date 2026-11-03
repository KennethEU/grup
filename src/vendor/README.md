# Vendorede biblioteker

Filer her er hentet ind i repo'et som-de-er og ligger IKKE i `package.json`.
Samme princip som `public/lib/` i resten af dida.dk.

## xlsx.mjs — SheetJS Community Edition 0.20.3

Læser lærerens Excel-filer ved import og skriver Excel-arkene i zip-eksporten.

**Hvorfor ligger den her og ikke i `package.json`?**
SheetJS holdt op med at udgive på npm efter 0.18.5. Den version — den eneste
`npm install xlsx` kan hente — har to kendte huller, som begge rammer præcis
det vi bruger biblioteket til, nemlig at parse en fil læreren har fået udefra:

- **CVE-2023-30533** (prototype pollution), lukket i 0.19.3
- **CVE-2024-22363** (ReDoS — fanen fryser), lukket i 0.20.2

`npm audit` melder derfor `xlsx *  HIGH  fixAvailable: false`: der findes ingen
rettet version på npm at opgradere til. Den rettede kode udgives i stedet på
SheetJS' egen server, og den anbefalede installation er en URL i `package.json`.
Det ville gøre `npm install` afhængig af at dét domæne svarer — så i stedet
ligger filen her, hvor den virker på enhver maskine, også uden internet.

**Hentet fra**
```
https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz   (package/xlsx.mjs)
sha256 8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8
```

**Licens:** Apache-2.0 — se `xlsx-LICENSE.txt`.

**Opdatering:** hent en nyere tarball fra cdn.sheetjs.com, pak `package/xlsx.mjs`
ud oven i denne fil, og kør `npm run test:unit` + `npm run build`. Filen
importeres kun tre steder (`ImportSection.vue`, `ExportSection.vue`) — søg efter
`vendor/xlsx.mjs`.
