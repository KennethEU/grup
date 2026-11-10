// Beskeder til læreren, fra ét sted (specifikation afsnit 8).
//
// Alle beskeder bliver først til et "fund" med samme form (regel, pulje,
// slags, tal, elever), og én funktion laver fundet om til kontraktens besked
// med en dansk tekst uden fagudtryk (kontrakt 3.4). Før kørslen bruges det
// bedst mulige ("Mindst to ender i samme gruppe"); efter kørslen det faktiske
// tal med samme skabelon ("To ender i samme gruppe ({gruppe:2})").
//
// Teksterne nævner aldrig en elevs navn eller _rowId: {elever} sættes ind af
// appen, og {gruppe:N} er gruppens plads i svarets groups.

import { evenSpreadPairs, atBound, pairs, separatePoolBest, clusterPoolBest } from './rules.js';

const MAX_GROUPS_IN_TEXT = 5;

// ------------------------------------------------------------ hjælpere

function quote(text) {
  return `"${text}"`;
}

// Hvad læreren kalder matrixens kilder (spec. 9.2): stamgrupper — eller emner,
// når der blandes på emne. "Kilde" er motorens eget ord; læreren ser det
// aldrig i appen, så det står ikke i beskederne (Kenneth 4/11 2026). En
// stamgruppe uden emne er sit eget emne og hedder sit eget navn.
function sourceWords(task) {
  const topics = task.matrix?.source === 'topic' && task.matrix.sources.some((s) => s.key.startsWith('topic:'));
  return topics
    ? { each: 'hvert emne', one: 'emne', the: 'Emnet', theMany: 'emnerne', many: 'emner' }
    : { each: 'hver stamgruppe', one: 'stamgruppe', the: 'Stamgruppen', theMany: 'stamgrupperne', many: 'stamgrupper' };
}

function number(x) {
  return Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100).replace('.', ',');
}

function spelling(rule, valueId) {
  const key = rule.valueKeys[valueId];
  return rule.spellings.get(key) ?? key;
}

function inPool(task, p) {
  return p !== null && p !== undefined && task.splitRules.length ? ` inden for ${quote(task.pools[p].name)}` : '';
}

function groupList(indexes) {
  const shown = indexes.slice(0, MAX_GROUPS_IN_TEXT).map((g) => `{gruppe:${g}}`);
  if (indexes.length > MAX_GROUPS_IN_TEXT) shown.push('…');
  return shown.join(', ');
}

function students(task, list) {
  return list.map((s) => (typeof s === 'number' ? task.ids[s] : s));
}

function message(task, finding, text) {
  const rule = finding.rule ?? null;
  const p = finding.pool ?? null;
  const msg = {
    type: finding.type,
    code: finding.code,
    rule,
    column: finding.column ?? (rule !== null ? task.rules[rule].column : null),
    pool: p !== null && task.splitRules.length ? task.pools[p].name : null,
    poolValues: p !== null && task.splitRules.length ? task.pools[p].values : null,
    students: students(task, finding.students || []),
    values: (finding.values || []).slice(0, 3),
    text,
  };
  if (finding.code === 'rule-not-met') msg.unavoidable = Boolean(finding.unavoidable);
  return msg;
}

// Grupperne i hver pulje, når opdelingen er kendt.
function groupsPerPool(task, layout) {
  const counts = task.pools.map(() => 0);
  if (layout.wholeTask) return [layout.total];
  for (const g of layout.groups) counts[g.pool]++;
  return counts;
}

// ------------------------------------------------- før kørslen (opskriften)

// Skal sammen og matrix-kilder: grunde til at stoppe (spec. 5.1).
export function stopMessages(task, reasons) {
  return reasons.map((r) => {
    const finding = { type: 'impossible', code: r.code, rule: r.rule ?? null, students: r.students };
    let text;
    switch (r.code) {
      case 'together-too-big':
        text = `Skal sammen samler ${r.count} elever ({elever}), men den største gruppe har ${r.biggest} pladser.`;
        break;
      case 'together-cannot-pack':
        finding.pool = r.pool;
        text = `Skal sammen-aftalerne${inPool(task, r.pool)} kan ikke fordeles i grupperne, fordi der ikke er plads nok i hver gruppe ({elever}).`;
        break;
      case 'together-vs-avoid':
        text = 'Skal sammen og Undgå hinanden siger det modsatte om de samme elever ({elever}).';
        break;
      case 'together-vs-separate': {
        const rule = task.rules[r.rule];
        text = `{elever} skal være sammen, men ${rule.name} på ${quote(rule.column)} holder nogle af dem adskilt.`;
        // Adskil (den almindelige) stopper kun, når blokken koster ekstra par.
        if (rule.type === 'separate') text += ' Sammen giver de flere par i samme gruppe, end klassen ellers er nødt til.';
        break;
      }
      case 'together-across-lock':
        text = '{elever} skal være sammen, men nogle af dem står i en låst gruppe og andre ikke.';
        break;
      case 'together-across-pool':
        finding.values = r.pools.map((p) => task.pools[p].name);
        text = `{elever} skal være sammen, men Opdel deler dem i hver sin pulje (${r.pools.map((p) => quote(task.pools[p].name)).join(' og ')}).`;
        break;
      case 'matrix-empty-source':
        finding.values = r.source !== null ? [r.source] : [];
        text =
          r.source !== null
            ? `${sourceWords(task).the} ${quote(r.source)} har ingen elever, så der kan ikke dannes matrixgrupper med én fra ${sourceWords(task).each}.`
            : 'Der er ingen stamgrupper at danne matrixgrupper ud fra.';
        break;
      default:
        text = 'Grupperne kan ikke dannes.';
    }
    if (r.code.startsWith('together-')) text += ' Du kan danne grupperne uden aftalen denne ene gang.';
    return message(task, finding, text);
  });
}

// Alt, opskriften kan sige på forhånd. Bruges af check(input) og af run().
// withRuleLimits: også "kan ikke opfyldes"-beskederne (de bedst mulige).
// separatePairs: blokke med flere fra en Adskil-regel, som ikke stopper
// dannelsen (fra checkFeasibility).
export function preRunMessages(task, layout, blocks, withRuleLimits = true, separatePairs = []) {
  const out = [];
  const perPool = groupsPerPool(task, layout);
  const poolCount = (p) => (layout.wholeTask ? layout.total : perPool[p]);

  // Opdel (3.5): tomme celler og små puljer.
  for (const rule of task.splitRules) {
    const empty = [];
    for (let s = 0; s < task.n; s++) if (rule.textId[s] < 0) empty.push(s);
    if (empty.length) {
      out.push(
        message(
          task,
          { type: 'note', code: 'split-empty-cells', rule: rule.index, students: empty },
          `Opdel på ${quote(rule.column)}: ${empty.length === 1 ? '1 elev har' : `${empty.length} elever har`} ikke udfyldt ${quote(rule.column)} og danner grupper for sig ({elever}).`,
        ),
      );
    }
  }
  if (task.splitRules.length && task.size.mode === 'perGroup') {
    const smallest = task.size.adjust === 'minus' ? task.size.target - 1 : task.size.target;
    task.pools.forEach((pool, p) => {
      if (pool.members.length < smallest) {
        out.push(
          message(
            task,
            { type: 'note', code: 'small-pool', rule: task.splitRules[0].index, pool: p },
            `Opdel: ${quote(pool.name)} har kun ${pool.members.length} ${pool.members.length === 1 ? 'elev' : 'elever'}, så gruppen bliver mindre end de andre.`,
          ),
        );
      }
    });
  }

  // Antal grupper (4): færre/flere end bedt om, emner.
  for (const note of layout.notes) {
    if (note.code === 'fewer-groups-than-asked') {
      out.push(message(task, { type: 'note', code: note.code }, `Der blev bedt om ${task.size.count} grupper, men der er kun ${task.n} elever at fordele. Der dannes ${layout.total} nye grupper.`));
    } else if (note.code === 'fewer-groups-than-pools') {
      out.push(
        message(
          task,
          { type: 'note', code: note.code, rule: task.splitRules[0]?.index ?? null },
          `Der blev bedt om ${task.size.count} grupper, men Opdel giver ${task.pools.length} puljer, og hver pulje skal have mindst én gruppe. Der dannes derfor ${layout.total} nye grupper.`,
        ),
      );
    } else if (note.code === 'topic-rounding') {
      const T = task.topics.length;
      out.push(
        message(
          task,
          { type: 'note', code: note.code },
          note.smaller
            ? `Der er ${T} emner, så der dannes ${note.to} grupper i alt (én pr. emne), selvom grupperne så kun får ${note.smallest} elever. Vil du hellere have større grupper, bliver der færre grupper, og et emne udgår.`
            : `Antallet af grupper er rundet fra ${note.from} til ${note.to}, så det går op med de ${T} emner.`,
        ),
      );
    }
  }
  const allGroups = layout.total + task.locked.length;
  if (task.view === 'home' && task.topics.length > allGroups && allGroups > 0) {
    out.push(
      message(
        task,
        { type: 'note', code: 'more-topics-than-groups', values: task.topics.slice(allGroups) },
        `Der er ${task.topics.length} emner, men kun ${allGroups} grupper, så ${task.topics.length - allGroups === 1 ? 'et emne får' : `${task.topics.length - allGroups} emner får`} ingen gruppe.`,
      ),
    );
  }

  // Matrix (9): kilden, der sætter loftet, og elever uden stamgruppe.
  if (task.view === 'matrix' && task.matrix) {
    const sources = task.matrix.sources;
    if (task.size.mode === 'full' && sources.length) {
      const sizes = sources.map((s) => s.members.length);
      const min = Math.min(...sizes);
      if (min > 0 && sizes.some((x) => x > min)) {
        const limiting = sources.filter((s) => s.members.length === min).map((s) => s.label);
        const w = sourceWords(task);
        // Hvor mange fra samme stamgruppe en matrixgruppe højst kan få
        const most = Math.ceil(Math.max(...sizes) / min);
        out.push(
          message(
            task,
            { type: 'note', code: 'matrix-limited-by', values: limiting },
            `Hver matrixgruppe får én elev fra ${w.each}. ` +
              `${limiting.length === 1 ? `${w.the} ${quote(limiting[0])}` : joinAnd(limiting.map(quote))} har kun ${min} ${min === 1 ? 'elev' : 'elever'}, så der bliver ${min} ${min === 1 ? 'matrixgruppe' : 'matrixgrupper'}. ` +
              `Eleverne til overs fra de større ${w.many} fordeles, så nogle matrixgrupper får ${most === 2 ? 'to' : `op til ${most}`} fra samme ${w.one}. ` +
              `Vil du have præcis én fra hver, skal ${w.theMany} være lige store${w.one === 'stamgruppe' ? ': dan dem fx igen med et andet antal grupper' : ''}.`,
          ),
        );
      }
    }
    if (task.matrix.outside.length) {
      const k = task.matrix.outside.length;
      out.push(
        message(
          task,
          { type: 'note', code: 'not-in-home-group', students: task.matrix.outside },
          `${k === 1 ? '1 elev står' : `${k} elever står`} ikke i nogen stamgruppe ({elever}) og er placeret alligevel.`,
        ),
      );
    }
  }

  // Tal og tekst (3.3).
  const seenColumns = new Set();
  for (const rule of task.rules) {
    if (!rule.num) continue;
    const key = `${rule.column}\u0000${rule.ranked}`;
    if (rule.ranked) {
      const off = [];
      const values = new Set();
      for (let s = 0; s < task.n; s++) {
        if (rule.textId[s] >= 0 && Number.isNaN(rule.num[s])) {
          off.push(s);
          values.add(spelling(rule, rule.textId[s]));
        }
      }
      if (off.length && !seenColumns.has(key)) {
        seenColumns.add(key);
        out.push(
          message(
            task,
            { type: 'note', code: 'unranked-values', rule: rule.index, students: off, values: [...values] },
            `${off.length === 1 ? '1 elev har' : `${off.length} elever har`} en værdi i ${quote(rule.column)}, som ikke står i rækkefølgen (${[...values].slice(0, 3).map(quote).join(', ')}), og placeres frit.`,
          ),
        );
      }
    } else if (rule.hasNumbers) {
      const off = [];
      const values = new Set();
      for (let s = 0; s < task.n; s++) {
        if (rule.textId[s] >= 0 && Number.isNaN(rule.num[s])) {
          off.push(s);
          values.add(spelling(rule, rule.textId[s]));
        }
      }
      if (off.length && !seenColumns.has(key)) {
        seenColumns.add(key);
        out.push(
          message(
            task,
            { type: 'note', code: 'non-numeric-cells', rule: rule.index, students: off, values: [...values] },
            `${off.length === 1 ? '1 elev har' : `${off.length} elever har`} en værdi i ${quote(rule.column)}, der ikke er et tal (${[...values].slice(0, 3).map(quote).join(', ')}), og placeres frit.`,
          ),
        );
      }
    } else if (rule.type !== 'group_sort' && rule.valueKeys.length) {
      out.push(
        message(
          task,
          { type: 'note', code: 'text-only-column', rule: rule.index },
          `${rule.name} på ${quote(rule.column)}: kolonnen har ingen tal, så reglen gør ingenting. Giv værdierne en rækkefølge (fx Lav < Middel < Høj), så kan reglen bruge dem.`,
        ),
      );
    }
  }

  // Regler, der trækker hver sin vej, og regler, der står to gange (6.10).
  for (let j = 0; j < task.rules.length; j++) {
    const b = task.rules[j];
    for (let i = 0; i < j; i++) {
      const a = task.rules[i];
      if (a.column !== b.column) continue;
      const types = new Set([a.type, b.type]);
      let code = null;
      if (a.type === b.type) {
        const same = a.type !== 'separate' && a.type !== 'strict_separate' ? true : sameSet(a.selected, b.selected);
        code = same ? 'duplicate-rule' : 'opposing-rules';
      } else if (types.has('balance') && types.has('minimizediff')) code = 'opposing-rules';
      else if ((types.has('separate') || types.has('strict_separate')) && (types.has('cluster') || types.has('group_sort'))) code = 'opposing-rules';
      if (!code) continue;
      out.push(
        message(
          task,
          { type: 'conflict', code, rule: b.index },
          code === 'duplicate-rule'
            ? `${b.name} på ${quote(b.column)} står to gange i opskriften, så den tæller dobbelt.`
            : `${a.name} og ${b.name} på ${quote(b.column)} trækker hver sin vej. Den øverste vejer tungest.`,
        ),
      );
      break;
    }
  }

  if (withRuleLimits) {
    out.push(...ruleLimitMessages(task, layout, blocks, poolCount));
    // Skal sammen og Adskil: ingen grund til at stoppe, men læreren skal vide,
    // at parret i blokken bliver et af de par, der ikke kan undgås (spørgsmål 51).
    for (const pair of separatePairs) {
      const rule = task.rules[pair.rule];
      out.push(
        message(
          task,
          { type: 'note', code: 'together-separate-pair', rule: rule.index, pool: pair.pool, students: pair.students, values: selectedSpellings(rule) },
          `{elever} skal være sammen og har ${pair.students.length === 2 ? 'begge' : 'alle'} en værdi, som ${rule.name} på ${quote(rule.column)}${inPool(task, pair.pool)} holder adskilt. Det giver ikke flere par i samme gruppe, end klassen alligevel er nødt til, så de bliver et af parrene.`,
        ),
      );
    }
  }
  return out;
}

function sameSet(a, b) {
  if (!a || !b || a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

// Det bedst mulige for de tunge regler og Fordel, før kørslen.
function ruleLimitMessages(task, layout, blocks, poolCount) {
  const out = [];
  for (const rule of task.rules) {
    if (rule.type === 'separate' || rule.type === 'strict_separate') {
      task.pools.forEach((pool, p) => {
        const marked = pool.members.filter((s) => rule.marked[s]);
        const k = poolCount(p);
        if (marked.length <= k) return;
        const best = evenSpreadPairs(marked.length, k);
        out.push(
          message(
            task,
            { type: 'impossible', code: 'separate-unavoidable', rule: rule.index, pool: layout.wholeTask ? null : p, students: marked, values: selectedSpellings(rule) },
            `${rule.name} på ${quote(rule.column)}${inPool(task, layout.wholeTask ? null : p)}: ${marked.length} elever skal adskilles, men der er kun ${k} ${k === 1 ? 'gruppe' : 'grupper'}. ${best === 1 ? 'Mindst to ender i samme gruppe.' : `Det giver mindst ${best} par i samme gruppe.`}`,
          ),
        );
      });
    } else if (rule.type === 'cluster') {
      task.pools.forEach((pool, p) => {
        const counts = new Map();
        for (const s of pool.members) if (rule.textId[s] >= 0) counts.set(rule.textId[s], (counts.get(rule.textId[s]) || 0) + 1);
        const lonely = [...counts].filter(([, c]) => c === 1).map(([v]) => v);
        if (lonely.length) {
          const who = pool.members.filter((s) => lonely.includes(rule.textId[s]));
          out.push(
            message(
              task,
              { type: 'impossible', code: 'cluster-unavoidable', rule: rule.index, pool: p, students: who, values: lonely.map((v) => spelling(rule, v)) },
              lonely.length === 1
                ? `Klyng på ${quote(rule.column)}${inPool(task, p)}: kun én elev har ${quote(spelling(rule, lonely[0]))} ({elever}), så eleven kan ikke klynges.`
                : `Klyng på ${quote(rule.column)}${inPool(task, p)}: ${lonely.length} værdier har kun én elev hver (${lonely.slice(0, 3).map((v) => quote(spelling(rule, v))).join(', ')}), så de elever kan ikke klynges ({elever}).`,
            ),
          );
        }
        // Plads til par: en gruppe med s pladser kan rumme ⌊s/2⌋ værdier med mindst to.
        const shared = [...counts.values()].filter((c) => c >= 2).length;
        const sizes = layout.wholeTask ? layout.pools[0].sizes : layout.pools[p].sizes;
        const room = sizes.reduce((sum, s) => sum + Math.floor(s / 2), 0);
        if (shared > room) {
          out.push(
            message(
              task,
              { type: 'impossible', code: 'cluster-unavoidable', rule: rule.index, pool: p },
              `Klyng på ${quote(rule.column)}${inPool(task, p)}: der er ${shared} forskellige værdier, men grupperne har kun plads til ${room} par. Nogle elever kommer til at stå alene med deres værdi.`,
            ),
          );
        }
      });
    } else if (rule.type === 'distribute') {
      task.pools.forEach((pool, p) => {
        const k = poolCount(p);
        if (k < 2) return;
        const uneven = unevenValues(task, rule, p, k);
        if (!uneven.length) return;
        const parts = uneven.slice(0, 3).map(([v, c]) => {
          const low = Math.floor(c / k);
          return `${c} med ${quote(spelling(rule, v))} i ${k} grupper, så nogle får ${low + 1}, andre ${low}`;
        });
        out.push(
          message(
            task,
            { type: 'note', code: 'rule-not-met', rule: rule.index, pool: p, values: uneven.map(([v]) => spelling(rule, v)), unavoidable: true },
            `Fordel på ${quote(rule.column)}${inPool(task, p)} kan ikke gå helt lige op: ${parts.join('; ')}.`,
          ),
        );
      });
    }
  }
  // Undgå hinanden: flere i en aftale end grupper (6.3).
  for (const list of task.avoid) {
    task.pools.forEach((pool, p) => {
      const inside = list.filter((s) => task.poolOf[s] === p);
      const k = poolCount(p);
      if (inside.length <= k || inside.length < 2) return;
      const best = evenSpreadPairs(inside.length, k);
      out.push(
        message(
          task,
          { type: 'impossible', code: 'avoid-unavoidable', pool: p, students: list },
          `Undgå hinanden${inPool(task, p)}: ${inside.length} elever ({elever}) skal i hver sin gruppe, men der er kun ${k} ${k === 1 ? 'gruppe' : 'grupper'}. ${best === 1 ? 'Mindst to ender i samme gruppe.' : `Det giver mindst ${best} par i samme gruppe.`}`,
        ),
      );
    });
  }
  // Matrix uden "Fuld": flere fra en kilde end matrixgrupper (9.3).
  const spread = sourceSpreadMessage(task, layout.total);
  if (spread) out.push(spread);
  return out;
}

// Matrix uden "Fuld", når en kilde har flere elever end der er matrixgrupper:
// så kan "højst én fra hver kilde" ikke holde, og det er klassens
// sammensætning, ikke en fejl i opsætningen. Beskeden siger, hvad læreren får
// i stedet: hvor mange fra hver af de store kilder, hver gruppe får. Det er en
// note (ikke rød). check(input) og svaret efter kørslen giver præcis den
// samme besked (samme code, values og tekst), så appen kan vise den én gang.
function sourceSpreadMessage(task, groupCount) {
  if (task.view !== 'matrix' || !task.matrix || task.size.mode === 'full' || groupCount <= 0) return null;
  const big = task.matrix.sources.filter((source) => source.members.length > groupCount);
  if (!big.length) return null;
  const parts = big.map((source) => {
    const low = Math.floor(source.members.length / groupCount);
    const high = Math.ceil(source.members.length / groupCount);
    return `${low === high ? low : `${low}–${high}`} fra ${quote(source.label)}`;
  });
  const w = sourceWords(task);
  const others = task.matrix.sources.length > big.length ? ` De andre ${w.many} har højst én i hver gruppe.` : '';
  // Så mange matrixgrupper skal der til, før hver kan nøjes med én fra hver
  const needed = Math.max(...big.map((source) => source.members.length));
  return message(
    task,
    { type: 'note', code: 'matrix-sources-spread', values: big.map((source) => source.label) },
    `Højst én fra ${w.each} kan ikke lade sig gøre med ${groupCount} matrixgrupper: nogle ${w.many} har flere elever, end der er grupper. ` +
      `Hver gruppe får ${joinAnd(parts)}, så jævnt som det kan blive.${others} ` +
      `Vil du have højst én fra hver, skal der være mindst ${needed} matrixgrupper.`,
  );
}

function joinAnd(list) {
  return list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} og ${list[list.length - 1]}`;
}

// Fordel: de værdier i puljen, hvis antal ikke går op i k grupper, som
// [værdi, antal]. Samme liste i check og efter kørslen, så beskedens values
// er de samme begge steder (spørgsmål 47).
function unevenValues(task, rule, p, k) {
  const counts = new Map();
  for (const s of task.pools[p].members) if (rule.textId[s] >= 0) counts.set(rule.textId[s], (counts.get(rule.textId[s]) || 0) + 1);
  return k > 0 ? [...counts].filter(([, c]) => c % k !== 0) : [];
}

function selectedSpellings(rule) {
  const out = [];
  rule.valueKeys.forEach((key, v) => {
    if (rule.selected.has(key)) out.push(spelling(rule, v));
  });
  return out;
}

// -------------------------------------------------- efter kørslen

// Hvordan gik det? Én besked pr. regel, der ikke er opfyldt (spec. 8.1):
//   - "Det kunne ikke undgås", når tallet er det bedst mulige (unavoidable),
//   - "det er nok det bedste, klassen tillader", når mange forsøg hver for
//     sig endte med præcis samme resultat (likelyBest; så hjælper det næppe
//     at danne igen),
//   - ellers "Prøv at danne igen".
// Adskil, Adskil altid, Klyng og Fordel får én besked pr. pulje (med Opdel),
// og Undgå hinanden én pr. aftale og pulje, så nøglen er den samme som
// advarslen før kørslen (spørgsmål 47). De andre regler får én besked i alt.
// info: { layout, bounds (fra bounds.js), likelyBest }.
export function postRunMessages(task, groups, evaluation, info = {}) {
  const bounds = info.bounds || new Map();
  const likelyBest = Boolean(info.likelyBest);
  const layout = info.layout;
  const wholeTask = Boolean(layout && layout.wholeTask);
  // Puljen for hver gruppe og antallet af grupper i hver pulje.
  const groupPool = groups.map((_, g) => (layout && !wholeTask ? layout.groups[g].pool : 0));
  const poolCount = (p) => (wholeTask ? groups.length : groupPool.filter((q) => q === p).length);
  // Med "Fuld" i matrix er hele opgaven én pulje (som før kørslen).
  const poolList = wholeTask ? [null] : task.pools.map((_, p) => p);
  const groupsIn = (p) => groups.map((_, g) => g).filter((g) => p === null || groupPool[g] === p);
  const ending = (unavoidable, short = false) => {
    if (unavoidable) return short ? ' Det kunne ikke undgås.' : ' Det kunne ikke undgås med denne klasse.';
    if (likelyBest) return ' Mange forsøg endte samme sted, så det er nok det bedste, denne klasse tillader.';
    return ' Prøv at danne igen.';
  };
  const note = (finding, text) => {
    const msg = message(task, { type: 'note', code: 'rule-not-met', ...finding }, text);
    msg.likelyBest = !finding.unavoidable && likelyBest;
    return msg;
  };
  const out = [];
  const { results, avoid, sources } = evaluation;
  for (const rule of task.rules) {
    const r = results[rule.index];
    if (rule.type === 'aggregate' || r.met !== false) continue;
    if (['strict_separate', 'separate', 'cluster', 'distribute'].includes(rule.type)) {
      for (const p of poolList) {
        const bad = groupsIn(p).filter((g) => r.groups[g].met === false);
        if (!bad.length) continue;
        const value = groupsIn(p).reduce((sum, g) => sum + r.groups[g].value, 0);
        let text;
        let unavoidable;
        let values = [];
        if (rule.type === 'distribute') {
          // Kun "uundgåeligt", når det retfærdige antal er nået i puljen, og
          // der beviseligt ikke kan være færre grupper uden om dagens test
          // end disse (bounds.js minMisses). values er de samme som i check
          // (værdierne, der ikke går lige op).
          unavoidable = value === 0 && p !== null && bad.length <= (bounds.get(rule.index)?.minMisses?.[p] ?? 0);
          const pools = p === null ? task.pools.map((_, q) => q) : [p];
          values = [...new Set(pools.flatMap((q) => unevenValues(task, rule, q, poolCount(q)).map(([v]) => spelling(rule, v))))];
          text = `Fordel på ${quote(rule.column)}${inPool(task, p)} går ikke helt op i ${bad.length === 1 ? '1 gruppe' : `${bad.length} grupper`} (${groupList(bad)}).`;
        } else if (rule.type === 'cluster') {
          const best = p === null ? r.best : clusterPoolBest(task, rule, p);
          unavoidable = value <= best;
          text = `Klyng på ${quote(rule.column)}${inPool(task, p)}: ${value === 1 ? '1 elev står' : `${value} elever står`} alene med sin værdi (${groupList(bad)}).`;
        } else {
          const best = p === null ? r.best : separatePoolBest(task, rule, info.blocks || [], p, poolCount(p));
          unavoidable = value <= best;
          text = `${rule.name} på ${quote(rule.column)}${inPool(task, p)}: ${value === 1 ? 'to ender i samme gruppe' : `${value} par ender i samme gruppe`} (${groupList(bad)}).`;
        }
        // Skal sammen-blokke med flere fra Adskil: beskeden nævner dem som et
        // af parrene (spørgsmål 51), og eleverne står i students.
        const inBlocks = (info.separatePairs || []).filter((x) => x.rule === rule.index && x.pool === p);
        const students = inBlocks.flatMap((x) => x.students);
        let blockText = '';
        if (inBlocks.length === 1 && students.length === 2) blockText = ' {elever} er et af parrene, fordi de skal være sammen.';
        else if (students.length) blockText = ' Parrene mellem {elever} kommer af, at de skal være sammen.';
        out.push(note({ rule: rule.index, pool: p, values, unavoidable, students }, text + ending(unavoidable) + blockText));
      }
      continue;
    }
    const bad = r.groups.map((g, i) => (g.met === false ? i : -1)).filter((i) => i >= 0);
    const unavoidable = r.best !== null && r.best !== undefined && r.value <= r.best + 1e-9;
    let text;
    switch (rule.type) {
      case 'balance':
        text = `Balancér på ${quote(rule.column)}: ${bad.length === 1 ? '1 gruppe ligger' : `${bad.length} grupper ligger`} mere end 5 % fra snittet (${groupList(bad)}).`;
        break;
      case 'minimizediff':
        text = `Ensartede på ${quote(rule.column)}: ${bad.length === 1 ? '1 gruppe er' : `${bad.length} grupper er`} ikke ensartede nok (${groupList(bad)}).`;
        break;
      case 'group_sort':
        text = `Saml på ${quote(rule.column)} er ikke helt opfyldt${bad.length ? ` (${groupList(bad)})` : ''}.`;
        break;
      default:
        continue;
    }
    // Balancér: nået grænsen fra bounds.js, eller så få grupper uden for de
    // 5 %, som klassens tal overhovedet tillader.
    const bound = rule.type === 'balance' ? bounds.get(rule.index) : null;
    const boundReached = Boolean(bound) && (atBound(r.value, bound.value) || bad.length <= bound.minBad);
    const isUnavoidable = unavoidable || boundReached;
    out.push(note({ rule: rule.index, unavoidable: isUnavoidable }, text + ending(isUnavoidable)));
  }
  // Undgå hinanden: én besked pr. aftale og pulje, med aftalens elever (som
  // advarslen før kørslen).
  if (avoid.value > 0) {
    const groupOf = new Int32Array(task.n).fill(-1);
    groups.forEach((members, g) => {
      for (const s of members) groupOf[s] = g;
    });
    for (const list of task.avoid) {
      for (const p of task.pools.map((_, q) => q)) {
        const inside = list.filter((s) => task.poolOf[s] === p && groupOf[s] >= 0);
        const counts = new Map();
        for (const s of inside) counts.set(groupOf[s], (counts.get(groupOf[s]) || 0) + 1);
        let value = 0;
        const bad = [];
        for (const [g, c] of counts) {
          value += pairs(c);
          if (c > 1) bad.push(g);
        }
        if (!value) continue;
        bad.sort((a, b) => a - b);
        const k = wholeTask ? groups.length : poolCount(p);
        const unavoidable = value <= evenSpreadPairs(inside.length, k);
        out.push(
          note(
            { pool: p, students: list, unavoidable },
            `Undgå hinanden${inPool(task, p)}: {elever} skal i hver sin gruppe, men ${value === 1 ? 'to af dem står' : `${value} par af dem står`} i samme gruppe (${groupList(bad)}).${ending(unavoidable)}`,
          ),
        );
      }
    }
  }
  // Matrix-kilder: er de spredt så jævnt, som det kan lade sig gøre, siger
  // noten fra før kørslen (matrix-sources-spread) det hele. Ellers nævnes
  // de grupper, hvor en kilde har flere end ⌈antal / grupper⌉.
  if (sources && sources.value > sources.best && task.size.mode !== 'full') {
    const k = groups.length;
    const sourceOf = task.matrix.sourceOf;
    const bad = [];
    const labels = new Set();
    groups.forEach((members, g) => {
      const counts = new Map();
      for (const s of members) if (sourceOf[s] >= 0) counts.set(sourceOf[s], (counts.get(sourceOf[s]) || 0) + 1);
      let over = false;
      for (const [src, c] of counts) {
        const source = task.matrix.sources[src];
        if (c > Math.ceil(source.members.length / k)) {
          over = true;
          labels.add(source.label);
        }
      }
      if (over) bad.push(g);
    });
    const names = [...labels].map(quote);
    out.push(
      note(
        { unavoidable: false, values: [...labels] },
        `Højst én fra ${sourceWords(task).each}: ${names.length ? `${joinAnd(names)} er ikke spredt så jævnt, som det kan lade sig gøre` : `${sourceWords(task).theMany} er ikke spredt så jævnt, som det kan lade sig gøre`}${bad.length ? ` (${groupList(bad)})` : ''}.${ending(false, true)}`,
      ),
    );
  }
  return out;
}

// "Samme besked" (spørgsmål 47): code + rule + pool + values + eleverne
// (sorteret). To beskeder med samme nøgle i ét svar er det samme forhold.
export function messageKey(m) {
  return JSON.stringify([m.code, m.rule, m.pool, m.values, [...m.students].sort()]);
}

// Sorterer beskederne som appen viser dem: røde, så konflikter, så noter.
// En besked med samme nøgle som en tidligere sendes kun én gang (fx to
// Undgå hinanden-aftaler med de samme elever).
export function sortMessages(list) {
  const order = { impossible: 0, conflict: 1, note: 2 };
  const seen = new Set();
  return list
    .filter((m) => {
      const key = messageKey(m);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((m, i) => ({ m, i }))
    .sort((a, b) => order[a.m.type] - order[b.m.type] || a.i - b.i)
    .map((x) => x.m);
}

