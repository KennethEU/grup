
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { brotliCompressSync, constants as zlibConstants } from 'node:zlib'
import { join } from 'node:path'

// Brotli-udgaver af de store JS/CSS-filer, lagt ved siden af de rå
// (index-XXXX.js → index-XXXX.js.br). routes/grupper-assets.js sender dem,
// når browseren tager imod brotli — ellers går alt som før.
//
// Pakningen sker HER og ikke på webhotellet: brotli på højeste niveau tager
// ~0,5 sek. for index.js, og Node har ÉN tråd, som alle dida.dk's værktøjer
// deler.
//
// Kun filer over MIN_BYTES: på de små sparer brotli under 200 bytes, og hver
// fil er en fil mere i git og i FTP-uploaden. Målt 24/9 giver det 7 filer.
const MIN_BYTES = 10_000

function precompressAssets(outDir) {
    return {
        name: 'precompress-assets',
        apply: 'build',
        closeBundle() {
            const dir = join(outDir, 'assets')
            let names
            try { names = readdirSync(dir) } catch { return }
            for (const name of names) {
                if (!/\.(js|css)$/.test(name)) continue
                const raw = readFileSync(join(dir, name))
                if (raw.length < MIN_BYTES) continue
                const br = brotliCompressSync(raw, {
                    params: {
                        [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
                        [zlibConstants.BROTLI_PARAM_SIZE_HINT]: raw.length,
                    },
                })
                writeFileSync(join(dir, name + '.br'), br)
            }
        }
    }
}

// /privacy-link.js (Privatlivspolitik-linket nederst på siden) ligger i
// repoets public/, ikke i grup.dk/public/. I produktionen
// serverer app.js' express.static('public') den også på grup.dk; Vites
// dev-server kender kun sin egen public/ og svarede med SPA-fallbacken
// (index.html med status 200 — scriptet fejlede som "Unexpected token '<'"
// på hver sidevisning, og e2e-suiten så det samme). Løsning: server den
// rigtige fil herfra. EN FIL DER IKKE FINDES SKAL GIVE 404 — også her
// (SPA-fallbacken ville svare 200 med index.html; se CLAUDE.md om 404).
function servePrivacyLinkInDev(file) {
    return {
        name: 'serve-privacy-link-in-dev',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use('/privacy-link.js', (req, res) => {
                let body
                try { body = readFileSync(file) } catch {
                    res.statusCode = 404
                    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
                    return res.end('Ukendt fil')
                }
                res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
                res.end(body)
            })
        },
    }
}

export default defineConfig({
    plugins: [
        vue(),
        servePrivacyLinkInDev('../public/privacy-link.js'),
        precompressAssets('../public/grupper'),
    ],
    base: './', // Use relative paths for assets so it can sit in any subdirectory
    // Root of the project is where Vite expects to find index.html
    root: '.',
    publicDir: 'public',
    server: {
        port: 3000,
        // Åbner ikke browseren af sig selv (Kenneths valg 2/11 2026): hver
        // testkørsel og hver genstart gav ellers et nyt vindue. Åbn selv
        // http://localhost:3000, eller start med `npm run dev -- --open`.
        open: false
    },
    build: {
        outDir: '../public/grupper',
        emptyOutDir: true,
        target: 'esnext',
        // HVILKE BROWSERE STILARKET SKRIVES TIL. Uden et mål går minifieren
        // (Lightning CSS) ud fra den nyeste browser og skriver KILDEN om til
        // det kortest mulige: `@media (max-width: 640px)` blev til
        // `(width<=640px)`, som Safari først forstår fra 16.4 — så ALLE
        // Grupper's medieforespørgsler var væk i Safari 15.4-16.3. Og den
        // lod `backdrop-filter` stå uden `-webkit-`, som Safari kræver helt
        // frem til 18, og `text-decoration: line-through 1px` samlet, som
        // ældre Safari ifølge Lightning CSS' browserdata ikke læser (så stod
        // fraværende elever uden streg). Med målet gør den det modsatte:
        // skriver om, så det virker dér.
        //
        // safari15.4 er samme gulv som JavaScriptet (docs/grupper.md,
        // "browserunderstøttelse") og den første Safari med oklch().
        // Chrome/Edge 111 og Firefox 113 er de første med oklch() — et lavere
        // tal ville få minifieren til at regne ALLE farver om til rgb.
        // Værn: built_css.test.js læser det byggede stilark.
        cssTarget: ['safari15.4', 'chrome111', 'firefox113', 'edge111']
    },
})
