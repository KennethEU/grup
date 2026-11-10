# Mutationstest af de nye tests (swap og fordel-misses), i en KOPI af motoren:
# ødelæg én ting ad gangen og se, om testene bliver røde.
#   python3 tools/fable/mutate.py "$(pwd)" /en/tom/midlertidig/mappe
import subprocess, shutil, os, sys
src, work = sys.argv[1], sys.argv[2]
MUT = [
 ('engine/modules.js', "        if (c === 1) a--;\n        else if (c === 2) a++;\n      }\n      if (u >= 0) {", "        if (c === 1) a--;\n      }\n      if (u >= 0) {", 'Klyng after: glemmer, at én bliver alene, når der var to', 'swap'),
 ('engine/modules.js', "sum += count[L * G + g] - inList[L * n + out];", "sum += count[L * G + g];", 'Undgå after: tæller eleven, der gik ud, med', 'swap'),
 ('engine/modules.js', "      return pairs(count[g] - marked[out] + marked[inn]);", "      return pairs(count[g] + marked[inn]);", 'Adskil after: eleven, der går ud, trækkes ikke fra', 'swap'),
 ('engine/modules.js', "          if (c === maxEach) o++;", "          if (c === maxEach + 1) o++;", 'Dagens test after: grænsen for "for mange" én for høj', 'swap'),
 ('engine/modules.js', "        if (c > 0) dev += fairDeviation(k + 1, c, s, N) - fairDeviation(k, c, s, N);", "", 'Fordel after: eleven, der kommer ind, tælles ikke', 'swap'),
 ('engine/modules.js', "        total = c === 0 ? 0 : total - x;\n      }\n      if (y === y) {\n        c++;\n        total += y;\n      }\n      const target", "        total = c === 0 ? 0 : total - x;\n      }\n      if (y === y) {\n        total += y;\n      }\n      const target", 'Balancér after: antallet tælles ikke op for den nye', 'swap'),
 ('engine/modules.js', "        squares += y * y;\n      }\n      if (c < 2) return 0;", "      }\n      if (c < 2) return 0;", 'Ensartede after: kvadratsummen glemmer den nye', 'swap'),
 ('engine/modules.js', "      if (u >= 0 && count[u * G + g] === 0) d++;", "      if (u >= 0) d++;", 'Saml (tekst) after: ny værdi tælles altid som ny', 'swap'),
 ('engine/modules.js', "        if (count[u * G + g] - (u === outText ? 1 : 0) === 0) d++;", "        if (count[u * G + g] === 0) d++;", 'Saml (tal) after: glemmer, at samme tekstværdi lige gik ud', 'swap'),
 ('engine/modules.js', "      if (b >= 0) sum += count[b * G + g];\n      return sum;", "      return sum;", 'Kilder after: den nye fra en kilde tælles ikke', 'swap'),
 ('engine/state.js', "      const d = mod.after(g, s, t) - contrib[m][g] + (mod.after(h, t, s) - contrib[m][h]);", "      const d = mod.after(g, s, t) - contrib[m][g];", 'trySwap: ser kun på den ene gruppe', 'swap'),
 ('engine/search.js', "      if (swapsTried) state.moveLast(s);", "", 'moveLast kaldes ikke (anden rækkefølge end den gamle vej)', 'swap'),
 ('engine/messages.js', "bad.length <= (bounds.get(rule.index)?.minMisses?.[p] ?? 0)", "Boolean(bounds.get(rule.index)?.pools?.[p])", 'Beskeden: som før (nok at mindst én må falde uden om)', 'fordel-misses'),
 ('engine/rules.js', "      if (misses.some((count, p) => count > bound.minMisses[p])) return false;", "      if (misses.some((count, p) => count > 0 && bound.minMisses[p] === 0)) return false;", 'Stopreglen: som før (nok at mindst én må falde uden om)', 'fordel-misses'),
 ('engine/bounds.js', "room += i < f ? largestFirst[i] : Math.ceil(largestFirst[i] / V);", "room += Math.ceil(largestFirst[i] / V);", 'Grænsen: grupper uden om giver ikke ekstra plads (for høj grænse)', 'fordel-misses'),
 ('engine/bounds.js', "    if (need > reach) continue;\n    return f;", "    return f;", 'Grænsen: dækningsreglen glemmes (for lav grænse)', 'fordel-misses'),
 ('engine/bounds.js', "    if (valueCounts.some((c) => c > room)) continue;", "", 'Grænsen: pladsreglen glemmes (for lav grænse)', 'fordel-misses'),
]
killed = 0
for path, old, new, what, testfile in MUT:
    if os.path.exists(work): shutil.rmtree(work)
    shutil.copytree(src, work, symlinks=True, ignore=shutil.ignore_patterns('node_modules'))
    f = os.path.join(work, path); text = open(f).read()
    if text.count(old) != 1: print('KAN IKKE BRUGES (teksten står %d gange): %s' % (text.count(old), what)); continue
    open(f, 'w').write(text.replace(old, new))
    r = subprocess.run(['node', '--test', 'tests/%s.test.mjs' % testfile], cwd=work, capture_output=True, text=True)
    dead = r.returncode != 0
    killed += dead
    print(('dræbt ✓   ' if dead else 'OVERLEVEDE ') + path + ': ' + what)
print('%d af %d mutanter dræbt' % (killed, len(MUT)))
shutil.rmtree(work)
