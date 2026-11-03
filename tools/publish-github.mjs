#!/usr/bin/env node
//
// publish-github.mjs — læg Grupper's kildekode op på github.com/KennethEU/grup.
//
// HVORFOR: grup.dk er fri software under EUPL-1.2 (siden 3/11 2026; før var
// den AGPL, fordi motoren byggede på GroupEng). Kenneth besluttede 3/11 2026,
// at koden skal ligge på GitHub, så repoet skal følge med, hver gang en ny
// udgave deployes. Kun indholdet lægges op, ikke dida.dk's historik (den
// gamle historik indeholder GroupEng's Python-kode).
//
// KØR DEN efter hver deploy, hvor Grupper har ændret sig:
//     node tools/publish-github.mjs
//
// Den tager det COMMITTEDE indhold af grup.dk/ (git archive
// HEAD), aldrig arbejdstræet, så en anden sessions halvfærdige filer ikke
// kommer med. Er der ucommittede ændringer i mappen, stopper den.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_URL = 'git@github.com:KennethEU/grup.git';
// Hvem står som forfatter på GitHub. GitHubs anonyme adresse, ikke en rigtig
// mail: privatlivssiden skriver Kenneths mail som "km[snabel-a]dida.dk" med
// vilje, og en commit på GitHub kan alle læse.
const AUTHOR = ['-c', 'user.name=Kenneth Bozkurt Madsen', '-c', 'user.email=KennethEU@users.noreply.github.com'];
const FOLDER = 'grup.dk';
// Ligger i mappen, men er ikke en del af grup.dk (intet lige nu: designskabelonen
// og skill-filen er slettet 3/11 2026). Tilføj stier her, hvis det ændrer sig.
const LEAVE_OUT = [];

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const git = (args, cwd = root) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

// 1. Kun committet kode
const dirty = git(['status', '--porcelain', '--', FOLDER]);
if (dirty) {
  console.error(`Stopper: der er ucommittede ændringer i ${FOLDER}/:\n${dirty}`);
  process.exit(1);
}
const sha = git(['rev-parse', '--short', 'HEAD']);

// 2. Hent repoet i en midlertidig mappe og tøm det (undtagen .git)
const work = mkdtempSync(join(tmpdir(), 'grup-publish-'));
git(['clone', '--quiet', REPO_URL, work]);
for (const name of readdirSync(work)) {
  if (name !== '.git') rmSync(join(work, name), { recursive: true, force: true });
}

// 3. Pak mappen ud fra HEAD, uden mappenavnet foran
const tar = join(work, '.git', 'grupper.tar');
git(['archive', '--format=tar', `--output=${tar}`, `HEAD:${FOLDER}`]);
execFileSync('tar', ['-xf', tar, '-C', work, ...LEAVE_OUT.map(p => `--exclude=${p}`)]);
rmSync(tar);

// 4. Commit og push, hvis noget har ændret sig
git(['add', '--all'], work);
if (!git(['status', '--porcelain'], work)) {
  console.log(`Intet nyt: github.com/KennethEU/grup svarer allerede til ${sha}.`);
} else {
  const msgFile = join(work, '.git', 'PUBLISH_MSG');
  writeFileSync(msgFile, `grup.dk fra dida.dk ${sha}\n`);
  git([...AUTHOR, 'commit', '--quiet', '-F', msgFile], work);
  git(['push', '--quiet', 'origin', 'HEAD'], work);
  console.log(`Lagt op: github.com/KennethEU/grup svarer nu til dida.dk ${sha}.`);
}
rmSync(work, { recursive: true, force: true });
