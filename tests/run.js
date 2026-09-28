import assert from "node:assert";
import { standOf, topOf } from "../term.js";
import { step, close } from "../termrun.js";
import { render } from "../app.js";

const base = {
  budget: 1,
  state: { voters: [], rounds: [], records: [], ledger: [], applied: [] },
  events: [{ id: 1, kind: "join", name: "a" }],
  bad_name_code: "E_BAD_NAME", bad_term_code: "E_BAD_TERM",
  dup_voter_code: "E_DUP_VOTER", stale_code: "E_STALE_TERM",
  dup_stand_code: "E_DUP_STAND", no_voter_code: "E_NO_VOTER",
  dup_vote_code: "E_DUP_VOTE", no_candidate_code: "E_NO_CANDIDATE",
  event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("standOf returns a list", () => {
  assert.ok(Array.isArray(standOf([], "x", 1)));
});

check("topOf returns name and votes", () => {
  const got = topOf([], 1);
  assert.strictEqual(typeof got.votes, "number");
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count_events, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
