// term.js：任期表读写与最高票
// rounds 形如 [[任期号, [[候选人, [投票人...]], ...]], ...]，按任期号升序，候选人按名字升序。

export function standOf(rounds, candidate, term) {
  let entry = null;
  for (const row of rounds) {
    if (row[0] === term) { entry = row; break; }
  }
  if (!entry) {
    entry = [term, []];
    rounds.push(entry);
    rounds.sort(function (a, b) { return a[0] - b[0]; });
  }
  let found = false;
  for (const cell of entry[1]) {
    if (cell[0] === candidate) { found = true; break; }
  }
  if (!found) {
    entry[1].push([candidate, []]);
    entry[1].sort(function (a, b) { return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0); });
  }
  return rounds;
}

export function topOf(rounds, term) {
  let entry = null;
  for (const row of rounds) {
    if (row[0] === term) { entry = row; break; }
  }
  const best = { name: "", votes: 0 };
  if (!entry) { return best; }
  for (const cell of entry[1]) {
    if (cell[1].length > best.votes) {
      best.name = cell[0];
      best.votes = cell[1].length;
    }
  }
  return best;
}
