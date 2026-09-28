import { standOf, topOf } from "./term.js";

const DEFAULT_CODES = {
  bad_name_code: "E_BAD_NAME",
  bad_term_code: "E_BAD_TERM",
  dup_voter_code: "E_DUP_VOTER",
  stale_code: "E_STALE_TERM",
  dup_stand_code: "E_DUP_STAND",
  no_voter_code: "E_NO_VOTER",
  dup_vote_code: "E_DUP_VOTE",
  no_candidate_code: "E_NO_CANDIDATE",
  event_error_code: "E_BAD_EVENT"
};

function code(spec, key) {
  return spec && spec[key] ? spec[key] : DEFAULT_CODES[key];
}

function fail(spec, key) {
  const tag = code(spec, key);
  const error = new Error(tag);
  error.code = tag;
  throw error;
}

function cloneState(state) {
  const source = state || {};
  return {
    voters: (source.voters || []).slice(),
    rounds: (source.rounds || []).map(function (row) {
      return [row[0], row[1].map(function (cell) { return [cell[0], cell[1].slice()]; })];
    }),
    records: (source.records || []).map(function (row) {
      return [row[0], row[1], row[2], row[3]];
    }),
    ledger: (source.ledger || []).map(function (tuple) { return tuple.slice(); }),
    applied: (source.applied || []).map(function (tuple) { return tuple.slice(); })
  };
}

function isName(value) {
  return typeof value === "string" && value.length > 0;
}

function isTerm(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function currentTerm(state) {
  return state.rounds.length ? state.rounds[state.rounds.length - 1][0] : 0;
}

function encode(event) {
  if (!event || typeof event !== "object" || typeof event.kind !== "string") {
    return ["?"];
  }
  if (event.kind === "join") return ["join", event.name];
  if (event.kind === "stand") return ["stand", event.candidate, event.term];
  if (event.kind === "vote") return ["vote", event.candidate, event.term, event.voter];
  if (event.kind === "elect") return ["elect"];
  return ["?"];
}

function seen(applied, tuple) {
  const mark = JSON.stringify(tuple);
  return applied.some(function (item) { return JSON.stringify(item) === mark; });
}

function validate(spec, tuple) {
  const kind = tuple[0];
  if (kind === "join") {
    if (!isName(tuple[1])) fail(spec, "bad_name_code");
  } else if (kind === "stand") {
    if (!isName(tuple[1])) fail(spec, "bad_name_code");
    if (!isTerm(tuple[2])) fail(spec, "bad_term_code");
  } else if (kind === "vote") {
    if (!isName(tuple[1])) fail(spec, "bad_name_code");
    if (!isTerm(tuple[2])) fail(spec, "bad_term_code");
    if (!isName(tuple[3])) fail(spec, "bad_name_code");
  } else if (kind === "elect") {
    if (tuple.length !== 1) fail(spec, "event_error_code");
  } else {
    fail(spec, "event_error_code");
  }
}

function applyJoin(spec, state, event) {
  if (state.voters.indexOf(event.name) >= 0) fail(spec, "dup_voter_code");
  state.voters.push(event.name);
  state.voters.sort();
}

function applyStand(spec, state, event) {
  const term = currentTerm(state);
  if (event.term < term) fail(spec, "stale_code");
  const row = state.rounds.find(function (item) { return item[0] === event.term; });
  if (row && row[1].some(function (cell) { return cell[0] === event.candidate; })) {
    fail(spec, "dup_stand_code");
  }
  state.rounds = standOf(state.rounds, event.candidate, event.term);
}

function applyVote(spec, state, event) {
  if (state.voters.indexOf(event.voter) < 0) fail(spec, "no_voter_code");
  const term = currentTerm(state);
  if (event.term !== term) fail(spec, "stale_code");
  const row = state.rounds.find(function (item) { return item[0] === term; });
  if (row) {
    for (const cell of row[1]) {
      if (cell[1].indexOf(event.voter) >= 0) fail(spec, "dup_vote_code");
    }
  }
  if (!row || !row[1].some(function (cell) { return cell[0] === event.candidate; })) {
    fail(spec, "no_candidate_code");
  }
  const target = row[1].find(function (cell) { return cell[0] === event.candidate; });
  target[1].push(event.voter);
}

function applyElect(spec, state) {
  const term = currentTerm(state);
  if (!term) return;
  const top = topOf(state.rounds, term);
  const voters = state.voters.length;
  const won = top.name !== "" && top.votes * 2 > voters ? 1 : 0;
  if (!state.records.some(function (record) { return record[0] === term; })) {
    state.records.push([term, top.name, top.votes, won]);
  }
}

function dispatch(spec, state, tuple) {
  const kind = tuple[0];
  if (kind === "join") {
    applyJoin(spec, state, { name: tuple[1] });
  } else if (kind === "stand") {
    applyStand(spec, state, { candidate: tuple[1], term: tuple[2] });
  } else if (kind === "vote") {
    applyVote(spec, state, { candidate: tuple[1], term: tuple[2], voter: tuple[3] });
  } else if (kind === "elect") {
    applyElect(spec, state);
  } else {
    fail(spec, "event_error_code");
  }
}

function run(spec, budget) {
  const state = cloneState(spec.state);
  const events = spec.events || [];
  const waiting = state.ledger.slice();
  state.ledger = [];
  const work = waiting.concat(events.map(encode));
  let served = 0;
  let capacity = Number.isFinite(budget) && budget > 0 ? Math.floor(budget) : 0;
  for (const tuple of work) {
    if (seen(state.applied, tuple)) continue;
    if (capacity <= 0) {
      state.ledger.push(tuple);
      continue;
    }
    validate(spec, tuple);
    dispatch(spec, state, tuple);
    state.applied.push(tuple);
    capacity -= 1;
    served += 1;
  }
  return { state: state, served: served, judged: served, judged_bound: work.length };
}

export function step(spec) {
  const result = run(spec, spec.budget || 0);
  return {
    state: result.state,
    served: result.served,
    ledger_before: result.state.ledger.length,
    ledger: result.state.ledger,
    judged: result.judged,
    judged_bound: result.judged_bound
  };
}

export function close(spec) {
  const state = cloneState(spec.state);
  let catchup = 0;
  while (state.ledger.length) {
    const tuple = state.ledger.shift();
    validate(spec, tuple);
    dispatch(spec, state, tuple);
    state.applied.push(tuple);
    catchup += 1;
  }
  return { state: state, catchup: catchup };
}
