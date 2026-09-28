// termrun.js：按处理预算处理事件，用尽的压到账上，收尾把账做完
import { standOf, topOf } from "./term.js";

function codesOf(spec) {
  return {
    bad_event: spec.event_error_code || "E_BAD_EVENT",
    bad_name: spec.bad_name_code || "E_BAD_NAME",
    bad_term: spec.bad_term_code || "E_BAD_TERM",
    dup_voter: spec.dup_voter_code || "E_DUP_VOTER",
    stale_term: spec.stale_code || "E_STALE_TERM",
    dup_stand: spec.dup_stand_code || "E_DUP_STAND",
    dup_vote: spec.dup_vote_code || "E_DUP_VOTE",
    no_voter: spec.no_voter_code || "E_NO_VOTER",
    no_candidate: spec.no_candidate_code || "E_NO_CANDIDATE"
  };
}

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function copyState(state) {
  state = state || {};
  return {
    voters: (state.voters || []).slice(),
    rounds: (state.rounds || []).map(function (row) {
      return [row[0], row[1].map(function (cell) { return [cell[0], cell[1].slice()]; })];
    }),
    records: (state.records || []).map(function (row) { return row.slice(); }),
    ledger: (state.ledger || []).map(function (entry) { return entry.slice(); }),
    applied: (state.applied || []).slice()
  };
}

// 事件压成签名数组：join->[join,name]，stand->[stand,candidate,term]，
// vote->[vote,candidate,term,voter]，elect->[elect]；结构不合法给 null。
function signatureOf(event) {
  if (!event || typeof event !== "object") { return null; }
  switch (event.kind) {
    case "join": return ["join", event.name];
    case "stand": return ["stand", event.candidate, event.term];
    case "vote": return ["vote", event.candidate, event.term, event.voter];
    case "elect": return ["elect"];
    default: return null;
  }
}

function currentTerm(rounds) {
  return rounds.length > 0 ? rounds[rounds.length - 1][0] : 0;
}

function checkName(name, codes) {
  if (typeof name !== "string" || name === "") { fail(codes.bad_name); }
}

function checkTerm(term, codes) {
  if (!Number.isInteger(term) || term <= 0) { fail(codes.bad_term); }
}

function applySignature(state, sig, codes) {
  const kind = sig[0];
  if (kind === "join") {
    const name = sig[1];
    checkName(name, codes);
    if (state.voters.indexOf(name) !== -1) { fail(codes.dup_voter); }
    state.voters.push(name);
    state.voters.sort();
    return;
  }
  if (kind === "stand") {
    const candidate = sig[1];
    const term = sig[2];
    checkName(candidate, codes);
    checkTerm(term, codes);
    if (term < currentTerm(state.rounds)) { fail(codes.stale_term); }
    for (const row of state.rounds) {
      if (row[0] === term) {
        for (const cell of row[1]) {
          if (cell[0] === candidate) { fail(codes.dup_stand); }
        }
      }
    }
    standOf(state.rounds, candidate, term);
    return;
  }
  if (kind === "vote") {
    const candidate = sig[1];
    const term = sig[2];
    const voter = sig[3];
    checkName(candidate, codes);
    checkTerm(term, codes);
    checkName(voter, codes);
    if (state.voters.indexOf(voter) === -1) { fail(codes.no_voter); }
    if (term !== currentTerm(state.rounds)) { fail(codes.stale_term); }
    let entry = null;
    for (const row of state.rounds) {
      if (row[0] === term) { entry = row; break; }
    }
    for (const cell of entry[1]) {
      if (cell[1].indexOf(voter) !== -1) { fail(codes.dup_vote); }
    }
    for (const cell of entry[1]) {
      if (cell[0] === candidate) {
        cell[1].push(voter);
        return;
      }
    }
    fail(codes.no_candidate);
    return;
  }
  if (kind === "elect") {
    if (state.rounds.length === 0) { return; }
    const term = currentTerm(state.rounds);
    const top = topOf(state.rounds, term);
    if (top.name !== "" && top.votes * 2 > state.voters.length) {
      state.records.push([term, top.name, top.votes, 1]);
    }
    return;
  }
  fail(codes.bad_event);
}

export function step(spec) {
  const state = copyState(spec.state);
  const events = spec.events || [];
  const codes = codesOf(spec);
  const appliedSet = {};
  for (const key of state.applied) { appliedSet[key] = true; }
  let budget = typeof spec.budget === "number" ? spec.budget : 0;
  let served = 0;
  for (const event of events) {
    const sig = signatureOf(event);
    const key = sig ? JSON.stringify(sig) : null;
    // 只按进来时已有的 applied 跳过重放；本批内新处理的照样再判，
    // 这样同批重复提名、重复选举才会按规则报错或生效。
    if (key && appliedSet[key]) { continue; }
    if (budget <= 0) {
      state.ledger.push(sig ? sig : [String(event && event.kind)]);
      continue;
    }
    budget -= 1;
    if (!sig) { fail(codes.bad_event); }
    applySignature(state, sig, codes);
    state.applied.push(key);
    served += 1;
  }
  return {
    state: state,
    served: served,
    ledger_before: state.ledger.length,
    ledger: state.ledger,
    judged: served,
    judged_bound: events.length
  };
}

export function close(spec) {
  const state = copyState(spec.state);
  const codes = codesOf(spec);
  const appliedSet = {};
  for (const key of state.applied) { appliedSet[key] = true; }
  let catchup = 0;
  while (state.ledger.length > 0) {
    const sig = state.ledger.shift();
    const key = JSON.stringify(sig);
    if (appliedSet[key]) { continue; }
    applySignature(state, sig, codes);
    appliedSet[key] = true;
    state.applied.push(key);
    catchup += 1;
  }
  return { state: state, catchup: catchup };
}
