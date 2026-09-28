// term.js：任期表读写与最高票（纯函数，不改入参）
export function standOf(rounds, candidate, term) {
  const next = rounds.map(function (row) {
    return [row[0], row[1].map(function (cell) { return [cell[0], cell[1].slice()]; })];
  });
  let row = next.find(function (item) { return item[0] === term; });
  if (!row) {
    row = [term, []];
    next.push(row);
    next.sort(function (a, b) { return a[0] - b[0]; });
  }
  if (!row[1].some(function (cell) { return cell[0] === candidate; })) {
    row[1].push([candidate, []]);
    row[1].sort(function (a, b) {
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    });
  }
  return next;
}

export function topOf(rounds, term) {
  const row = rounds.find(function (item) { return item[0] === term; });
  if (!row || row[1].length === 0) return { name: "", votes: 0 };
  let best = null;
  for (const cell of row[1]) {
    const name = cell[0];
    const votes = cell[1].length;
    if (!best || votes > best.votes || (votes === best.votes && name < best.name)) {
      best = { name: name, votes: votes };
    }
  }
  return best;
}
