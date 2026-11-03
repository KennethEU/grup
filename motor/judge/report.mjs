// Laver dommerens karakter om til en rapport, et menneske kan læse.

function formatNumber(value) {
  if (value === null || value === undefined) return '–';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3).replace('.', ',');
}

function formatMet(met) {
  if (met === true) return 'opfyldt';
  if (met === false) return 'IKKE opfyldt';
  return 'ikke målt';
}

export function formatReport(grade, title = '') {
  const lines = [];
  const add = (line = '') => lines.push(line);
  add(`=== Dommerens karakter${title ? `: ${title}` : ''} ===`);
  add(`Status: ${grade.status} · ${grade.students} elever · forventet ${grade.layout.total} grupper`);
  for (const note of grade.layout.notes) add(`  (${note})`);
  add();

  if (grade.failures.length) {
    add('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    add(`!!! FASTE KRAV BRUDT: ${grade.failures.length} fejl — svaret er IKKE gyldigt !!!`);
    add('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    for (const f of grade.failures) {
      add(`  ✗ ${f.name}: ${f.text}${f.students && f.students.length ? ` [${f.students.slice(0, 8).join(', ')}${f.students.length > 8 ? ' …' : ''}]` : ''}`);
    }
    add();
  } else if (grade.gradable) {
    add('Faste krav: alle overholdt ✓');
    add();
  }

  if (grade.status === 'impossible') {
    const j = grade.stop.justified;
    add(`Motoren stoppede ("umulig"). Dommeren: ${j === true ? 'rigtigt at stoppe' : j === false ? 'FORKERT at stoppe' : 'kan ikke afgøre det (pakningen ramte loftet)'}.`);
    for (const r of grade.stop.reasons) add(`  - ${r.code}: ${r.text}`);
    return lines.join('\n');
  }
  if (!grade.gradable) {
    add(`Svaret kan ikke bedømmes (status "${grade.status}", eller ingen grupper).`);
    return lines.join('\n');
  }

  add('Rangorden (læses fra toppen; lavere er bedre):');
  for (const step of grade.precedence.steps) {
    add(`  [trin ${step.step}] ${step.label.padEnd(44)} ${formatNumber(step.value)}`);
  }
  add();
  add('Reglerne én for én:');
  for (const r of grade.rules) {
    const best = r.best === null ? '' : ` · bedst mulige ${formatNumber(r.best)} · afstand ${formatNumber(r.distance)}`;
    add(`  ${String(r.rule).padStart(2)}. ${r.name} på "${r.column}": tal ${formatNumber(r.value)}${best} · ${formatMet(r.met)}`);
    if (r.type === 'distribute') {
      add(`      Opfyldt — i dag: ${Math.round(r.today.share * 100)} % af grupperne · retfærdigt antal (nyt): ${formatMet(r.fair.met)}`);
    }
    if (r.type === 'group_sort') {
      add(`      Saml (${r.mode === 'text' ? 'værditælling' : 'tal/rangering'}): varians ${formatNumber(r.parts.variance)}, værditælling ${formatNumber(r.parts.valueCount)}`);
      const share = r.today.share === null ? 'ikke målt' : `${Math.round(r.today.share * 100)} % af grupperne`;
      add(`      Opfyldt — nyt (mod det bedst mulige): ${formatMet(r.met)} · i dag ("én værdi pr. gruppe"): ${share}`);
    }
  }
  if (grade.avoid.met !== null) {
    add(`  Undgå hinanden: ${formatNumber(grade.avoid.value)} par · bedst mulige ${formatNumber(grade.avoid.best)} · ${formatMet(grade.avoid.met)}`);
  }
  if (grade.matrixSources) {
    add(`  Højst én fra hver kilde: ${formatNumber(grade.matrixSources.value)} par · bedst mulige ${formatNumber(grade.matrixSources.best)}`);
  }
  if (grade.tiebreak && grade.tiebreak.applies && !grade.tiebreak.followed) {
    add(`  Bemærk: grupperne er fordelt lige godt mellem puljerne, men ikke efter reglen ved lighed (${grade.tiebreak.actual.join(', ')} i stedet for ${grade.tiebreak.expected.join(', ')}).`);
  }
  if (grade.stop.packing === 'unknown') add('  (Bemærk: pakningen af Skal sammen-blokkene ramte loftet.)');
  return lines.join('\n');
}
