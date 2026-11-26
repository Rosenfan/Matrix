import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { invoke } from "../src/workflow.js";
import { invokeRun } from "../src/run-engine.js";
import { credentialIn } from "../src/run-engine.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plainCommand = (argumentsText) => `node ${JSON.stringify(path.join(root, "src", "workflow.js"))} ${argumentsText}`;

function project(t, { git = true } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-run-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  if (git) {
    assert.equal(spawnSync("git", ["init"], { cwd, encoding: "utf8" }).status, 0);
    assert.equal(spawnSync("git", ["config", "user.email", "matrix@example.invalid"], { cwd, encoding: "utf8" }).status, 0);
    assert.equal(spawnSync("git", ["config", "user.name", "Matrix Test"], { cwd, encoding: "utf8" }).status, 0);
    fs.writeFileSync(path.join(cwd, "baseline.txt"), "baseline\n");
    assert.equal(spawnSync("git", ["add", "baseline.txt"], { cwd, encoding: "utf8" }).status, 0);
    assert.equal(spawnSync("git", ["commit", "-m", "baseline"], { cwd, encoding: "utf8" }).status, 0);
  }
  return cwd;
}

const start = async (cwd, request = "make the login redirect safe") => {
  const created = await invokeRun(["start", "--request", request], { cwd, command: plainCommand });
  assert.equal(created.ok, true, created.message);
  return created;
};

test("run start persists raw request, acquires the lease, and inspects report workflow settings", async (t) => {
  const cwd = project(t);
  const created = await start(cwd);
  assert.equal(created.phase, "understand");
  assert.equal(created.status, "active");
  assert.equal(created.continuation.lease, true);
  const state = JSON.parse(fs.readFileSync(path.join(cwd, ".matrix", "runs", created.run_id, "state.json"), "utf8"));
  assert.equal(state.raw_request, "make the login redirect safe");
  const gitignore = fs.readFileSync(path.join(cwd, ".matrix", ".gitignore"), "utf8");
  assert.match(gitignore, /# BEGIN MATRIX MANAGED/);
  assert.match(gitignore, /runs\/\*\/logs\//);
  assert.match(gitignore, /workflow\.lock/);
  const inspected = await invokeRun(["inspect"], { cwd, command: plainCommand });
  assert.equal(inspected.default_workflow, "classic");
  assert.equal(inspected.autonomy_level, "balanced");
  assert.equal(inspected.run.run_id, created.run_id);
  // A v2 inspect with no active change reports the held run directly as the unified entry.
  const unified = invoke(["inspect"], { cwd });
  assert.equal(unified.default_workflow, "classic");
  assert.equal(unified.run.run_id, created.run_id);
});

test("run ids are cleaned, reject reserved device names, and deduplicate collisions", async (t) => {
  const cwd = project(t);
  assert.equal((await invokeRun(["start", "--request", "x", "--id", "CON"], { cwd, command: plainCommand })).code, "INVALID_RUN_ID");
  const cleaned = await invokeRun(["start", "--request", "x", "--id", "Fix the Login!"], { cwd, command: plainCommand });
  assert.equal(cleaned.ok, true);
  assert.equal(cleaned.run_id, "fix-the-login");
  const first = await invokeRun(["start", "--request", "x", "--id", "login-fix"], { cwd, command: plainCommand });
  const second = await invokeRun(["start", "--request", "y", "--id", "login-fix"], { cwd, command: plainCommand });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.run_id, "login-fix-2");
  assert.equal(second.continuation.lease, true);
  const firstView = await invokeRun(["inspect", first.run_id], { cwd, command: plainCommand });
  assert.equal(firstView.run.lease, false);
});

test("frame in balanced mode enters execute and echoes; strict mode or explicit flags await the user", async (t) => {
  const cwd = project(t);
  const created = await start(cwd);
  const revision = created.revision;
  const auto = await invokeRun(["frame", "--goal", "Redirects keep the session", "--accept", "A1=Login redirects preserve the session", "--check", "C1=node -e \"process.exit(0)\"", "--expect-revision", String(revision)], { cwd, command: plainCommand });
  assert.equal(auto.ok, true, auto.message);
  assert.equal(auto.phase, "execute");
  assert.equal(auto.user_echo_required, true);
  assert.deepEqual(auto.frame.acceptance, [{ id: "A1", text: "Login redirects preserve the session" }]);

  const strict = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-run-strict-"));
  t.after(() => fs.rmSync(strict, { recursive: true, force: true }));
  fs.mkdirSync(path.join(strict, ".matrix"), { recursive: true });
  fs.writeFileSync(path.join(strict, ".matrix", "config.yaml"), "schema: matrix/config/v1\ndefault_workflow: auto\nautonomy_level: strict\n");
  const strictRun = await start(strict);
  const strictFrame = await invokeRun(["frame", "--goal", "g", "--accept", "A1=a", "--no-checks-reason", "no executable checks exist", "--expect-revision", String(strictRun.revision)], { strict: true, cwd: strict, command: plainCommand });
  assert.equal(strictFrame.code, "AWAIT_USER");
  assert.equal(strictFrame.phase, "understand");
  const resolved = await invokeRun(["resolve", "--confirmed", "--expect-revision", String(strictFrame.revision)], { cwd: strict, command: plainCommand });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.phase, "execute");
});

test("missing or stale expect-revision and foreign leases are rejected deterministically", async (t) => {
  const cwd = project(t);
  const created = await start(cwd);
  const missing = await invokeRun(["frame", "--goal", "g", "--accept", "A1=a", "--check", "C1=node -e \"process.exit(0)\""], { cwd, command: plainCommand });
  assert.equal(missing.code, "REVISION_REQUIRED");
  const stale = await invokeRun(["frame", "--goal", "g", "--accept", "A1=a", "--check", "C1=exit 0", "--expect-revision", "999"], { cwd, command: plainCommand });
  assert.equal(stale.code, "REVISION_MISMATCH");
  const other = project(t);
  const foreign = await invokeRun(["frame", "--goal", "g", "--accept", "A1=a", "--check", "C1=exit 0", "--expect-revision", String(created.revision), created.run_id], { cwd: other, command: plainCommand });
  assert.equal(foreign.code, "RUN_NOT_FOUND");
  const released = await invokeRun(["select", "--none"], { cwd, command: plainCommand });
  assert.equal(released.ok, true);
  const noLease = await invokeRun(["frame", "--goal", "g", "--accept", "A1=a", "--check", "C1=exit 0", "--expect-revision", String(created.revision), created.run_id], { cwd, command: plainCommand });
  assert.equal(noLease.code, "LEASE_NOT_HELD");
});

test("run submit executes frozen checks itself; failures stay in execute and pass advances to verify", async (t) => {
  const cwd = project(t);
  const created = await start(cwd);
  const framed = await invokeRun(["frame", "--goal", "green build", "--accept", "A1=the suite is green", "--check", "C1=node -e \"process.exit(0)\"", "--check", "C2=node -e \"process.exit(7)\"", "--expect-revision", String(created.revision)], { cwd, command: plainCommand });
  const submitted = await invokeRun(["submit", "--summary", "first candidate", "--expect-revision", String(framed.revision)], { cwd, command: plainCommand });
  assert.equal(submitted.code, "CHECKS_FAILED");
  assert.equal(submitted.phase, "execute");
  assert.equal(submitted.checks.find((check) => check.id === "C2").exit_code, 7);
  assert.equal(submitted.checks.find((check) => check.id === "C2").status, "failed");
  const retry = await invokeRun(["submit", "--summary", "second candidate", "--expect-revision", String(submitted.revision)], { cwd, command: plainCommand });
  assert.equal(retry.code, "CHECKS_FAILED");
  const state = JSON.parse(fs.readFileSync(path.join(cwd, ".matrix", "runs", created.run_id, "state.json"), "utf8"));
  assert.equal(state.submit_failures, 2);
  assert.equal(state.iteration, 0);
  // Logs exist on disk but raw output never lands in state.json.
  const logDirectory = path.join(cwd, ".matrix", "runs", created.run_id, "logs");
  assert.ok(fs.readdirSync(logDirectory).length >= 4);
  assert.equal(JSON.stringify(state).includes("second candidate"), false);
  assert.ok(state.required_checks.every((check) => typeof check.results[0].exit_code === "number"));
});

test("a passing submit advances to verify and stores the candidate fingerprint", async (t) => {
  const cwd = project(t);
  const created = await start(cwd);
  const framed = await invokeRun(["frame", "--goal", "green build", "--accept", "A1=green", "--check", "C1=node -e \"process.exit(0)\"", "--expect-revision", String(created.revision)], { cwd, command: plainCommand });
  const submitted = await invokeRun(["submit", "--summary", "candidate", "--expect-revision", String(framed.revision)], { cwd, command: plainCommand });
  assert.equal(submitted.code, "OK");
  assert.equal(submitted.phase, "verify");
  const state = JSON.parse(fs.readFileSync(path.join(cwd, ".matrix", "runs", created.run_id, "state.json"), "utf8"));
  assert.match(state.candidate.diff_fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(state.iteration, 1);
});

test("verify requires full acceptance coverage, honest reviewers, and blocks missing reasons", async (t) => {
  const cwd = project(t);
  const created = await start(cwd);
  const framed = await invokeRun(["frame", "--goal", "green build", "--accept", "A1=green", "--accept", "A2=still green", "--check", "C1=exit 0", "--expect-revision", String(created.revision)], { cwd, command: plainCommand });
  const submitted = await invokeRun(["submit", "--summary", "candidate", "--expect-revision", String(framed.revision)], { cwd, command: plainCommand });
  const partial = await invokeRun(["verify", "--reviewer", "self", "--result", "A1=passed", "--expect-revision", String(submitted.revision)], { cwd, command: plainCommand });
  assert.equal(partial.code, "VERIFY_INPUT_INVALID");
  assert.equal(partial.verifier_attempt, 1);
  const state = JSON.parse(fs.readFileSync(path.join(cwd, ".matrix", "runs", created.run_id, "state.json"), "utf8"));
  assert.equal(state.budget.stagnation_count, 0, "verifier executor errors must not feed stagnation");
  const fakeReviewer = await invokeRun(["verify", "--reviewer", "independent", "--result", "A1=passed", "--result", "A2=passed", "--expect-revision", String(partial.revision)], { cwd, command: plainCommand });
  assert.equal(fakeReviewer.code, "VERIFY_INPUT_INVALID");
  assert.equal(fakeReviewer.verifier_attempt, 2);
  const noReason = await invokeRun(["verify", "--reviewer", "self", "--result", "A1=passed", "--result", "A2=failed", "--expect-revision", String(fakeReviewer.revision)], { cwd, command: plainCommand });
  assert.equal(noReason.code, "VERIFY_INPUT_INVALID");
  assert.equal(noReason.verifier_attempt, 3, "the third invalid attempt caps into await-user");
  assert.equal(noReason.status, "await-user");
  const unlocked = await invokeRun(["resolve", "--confirmed", "--expect-revision", String(noReason.revision)], { cwd, command: plainCommand });
  assert.equal(unlocked.ok, true);
  const resubmitted = await invokeRun(["submit", "--summary", "candidate", "--expect-revision", String(unlocked.revision)], { cwd, command: plainCommand });
  assert.equal(resubmitted.phase, "verify");
  const passed = await invokeRun(["verify", "--reviewer", "subagent", "--result", "A1=passed", "--result", "A2=passed", "--summary", "all green", "--expect-revision", String(resubmitted.revision)], { cwd, command: plainCommand });
  assert.equal(passed.ok, true, passed.message);
  assert.equal(passed.phase, "close");
  assert.match(fs.readFileSync(path.join(cwd, ".matrix", "runs", created.run_id, "verification.md"), "utf8"), /Reviewer: subagent/);
});

test("failed verification returns to execute, stagnation caps into await-user, resolve extends the budget", async (t) => {
  const cwd = project(t);
  const created = await start(cwd);
  const framed = await invokeRun(["frame", "--goal", "g", "--accept", "A1=a", "--check", "C1=exit 0", "--expect-revision", String(created.revision)], { cwd, command: plainCommand });
  assert.equal(framed.phase, "execute");
  const submitRound = async () => {
    const inspected = await invokeRun(["inspect"], { cwd, command: plainCommand });
    const revision = inspected.run.revision;
    if (inspected.run.phase === "execute") {
      const submitted = await invokeRun(["submit", "--summary", "candidate", "--expect-revision", String(revision)], { cwd, command: plainCommand });
      assert.equal(submitted.phase, "verify");
      return submitted.revision;
    }
    return revision;
  };
  let revision = await submitRound();
  for (let round = 0; round < 3; round += 1) {
    const verified = await invokeRun(["verify", "--reviewer", "self", "--result", "A1=failed:still broken", "--expect-revision", String(revision)], { cwd, command: plainCommand });
    assert.equal(verified.code, round < 1 ? "VERIFY_FAILED" : "AWAIT_USER", `round ${round}`);
    if (verified.code === "AWAIT_USER") {
      const resolved = await invokeRun(["resolve", "--confirmed", "--extend-budget", "5", "--expect-revision", String(verified.revision)], { cwd, command: plainCommand });
      assert.equal(resolved.ok, true);
      assert.equal(resolved.phase, "execute");
      revision = await submitRound();
      const retried = await invokeRun(["verify", "--reviewer", "self", "--result", "A1=failed:still broken", "--expect-revision", String(revision)], { cwd, command: plainCommand });
      assert.equal(retried.code, "VERIFY_FAILED", "extended budget allows another round");
      return;
    }
    revision = await submitRound();
  }
  assert.fail("stagnation should have capped the loop");
});

test("blocked verification waits for the user and resolve --answer resumes", async (t) => {
  const cwd = project(t);
  const created = await start(cwd);
  const framed = await invokeRun(["frame", "--goal", "g", "--accept", "A1=a", "--check", "C1=exit 0", "--expect-revision", String(created.revision)], { cwd, command: plainCommand });
  const submitted = await invokeRun(["submit", "--summary", "candidate", "--expect-revision", String(framed.revision)], { cwd, command: plainCommand });
  const blocked = await invokeRun(["verify", "--reviewer", "external", "--result", "A1=blocked:needs the key owner", "--expect-revision", String(submitted.revision)], { cwd, command: plainCommand });
  assert.equal(blocked.code, "VERIFY_BLOCKED");
  const resolved = await invokeRun(["resolve", "--answer", "rotate the key first", "--expect-revision", String(blocked.revision)], { cwd, command: plainCommand });
  assert.equal(resolved.ok, true);
  const state = JSON.parse(fs.readFileSync(path.join(cwd, ".matrix", "runs", created.run_id, "state.json"), "utf8"));
  assert.equal(state.budget.stagnation_count, 0);
});

test("run submit without declared checks warns when code changed; checks are refused with credentials", async (t) => {
  const cwd = project(t);
  const created = await start(cwd);
  const framed = await invokeRun(["frame", "--goal", "docs pass", "--accept", "A1=docs updated", "--no-checks-reason", "pure documentation rewording", "--expect-revision", String(created.revision)], { cwd, command: plainCommand });
  fs.writeFileSync(path.join(cwd, "baseline.txt"), "changed\n");
  const submitted = await invokeRun(["submit", "--summary", "candidate", "--expect-revision", String(framed.revision)], { cwd, command: plainCommand });
  assert.equal(submitted.code, "OK");
  assert.deepEqual(submitted.warnings, ["CODE_CHANGED_WITHOUT_CHECKS"]);
  const refused = await invokeRun(["check", "--cmd", "curl -H \"Authorization: Bearer sk-live-abc123\" https://api.example.invalid", "--expect-revision", String(submitted.revision)], { cwd, command: plainCommand });
  assert.equal(refused.code, "CHECK_COMMAND_CREDENTIAL");
});

test("credentialIn distinguishes real secrets from placeholders and urls", () => {
  assert.match(credentialIn("curl -H \"Authorization: Bearer sk-live-abc123\" https://x"), /sk-live/);
  assert.equal(credentialIn("node scripts/deploy.js --token $DEPLOY_TOKEN"), null);
  assert.equal(credentialIn("node scripts/deploy.js --token %DEPLOY_TOKEN%"), null);
  assert.equal(credentialIn("git clone https://github.com/rpamis/comet"), null);
  assert.match(credentialIn("psql postgresql://admin:hunter2@db.example.invalid/app"), /hunter2/);
});

test("pivot invalidates prior conclusions; a changed worktree after verify is sent back to execute", async (t) => {
  const cwd = project(t);
  const created = await start(cwd);
  const framed = await invokeRun(["frame", "--goal", "green", "--accept", "A1=green", "--check", "C1=exit 0", "--expect-revision", String(created.revision)], { cwd, command: plainCommand });
  const pivoted = await invokeRun(["pivot", "--reason", "the seam sits one layer higher", "--expect-revision", String(framed.revision)], { cwd, command: plainCommand });
  assert.equal(pivoted.ok, true);
  assert.equal(pivoted.phase, "execute");
  const submitted = await invokeRun(["submit", "--summary", "candidate", "--expect-revision", String(pivoted.revision)], { cwd, command: plainCommand });
  const verified = await invokeRun(["verify", "--reviewer", "self", "--result", "A1=passed", "--expect-revision", String(submitted.revision)], { cwd, command: plainCommand });
  assert.equal(verified.phase, "close");
  fs.writeFileSync(path.join(cwd, "baseline.txt"), "changed after verify\n");
  const closed = await invokeRun(["close", "--expect-revision", String(verified.revision)], { cwd, command: plainCommand });
  assert.equal(closed.code, "CANDIDATE_CHANGED");
  assert.equal(closed.phase, "execute");
});

test("close archives the run atomically, clears the lease, and archived runs are read-only", async (t) => {
  const cwd = project(t);
  const created = await start(cwd);
  const framed = await invokeRun(["frame", "--goal", "green", "--accept", "A1=green", "--check", "C1=exit 0", "--expect-revision", String(created.revision)], { cwd, command: plainCommand });
  const submitted = await invokeRun(["submit", "--summary", "candidate", "--expect-revision", String(framed.revision)], { cwd, command: plainCommand });
  const verified = await invokeRun(["verify", "--reviewer", "external", "--result", "A1=passed", "--summary", "ok", "--expect-revision", String(submitted.revision)], { cwd, command: plainCommand });
  const closed = await invokeRun(["close", "--expect-revision", String(verified.revision)], { cwd, command: plainCommand });
  assert.equal(closed.ok, true);
  assert.equal(fs.existsSync(path.join(cwd, ".matrix", "runs", created.run_id)), false);
  assert.match(fs.readFileSync(path.join(cwd, ".matrix", "archive", "runs", created.run_id, "verification.md"), "utf8"), /Verdict: passed/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(cwd, ".matrix", "current-run.json"), "utf8")).run_id, null);
  const blocked = await invokeRun(["frame", "--goal", "g", "--accept", "A1=a", "--expect-revision", "1", created.run_id], { cwd, command: plainCommand });
  assert.equal(blocked.code, "RUN_ARCHIVED");
  const listed = await invokeRun(["list"], { cwd, command: plainCommand });
  assert.equal(listed.runs.length, 0);
});

test("run close --abort preserves the aborted run in the archive without a verification verdict", async (t) => {
  const cwd = project(t);
  const created = await start(cwd);
  const aborted = await invokeRun(["close", "--abort", "--reason", "superseded by a platform fix", "--expect-revision", String(created.revision)], { cwd, command: plainCommand });
  assert.equal(aborted.ok, true);
  assert.equal(aborted.status, "aborted");
  const state = JSON.parse(fs.readFileSync(path.join(cwd, ".matrix", "archive", "runs", created.run_id, "state.json"), "utf8"));
  assert.equal(state.status, "aborted");
  assert.equal(fs.existsSync(path.join(cwd, ".matrix", "runs", created.run_id)), false);
});

test("submit failure budget caps repeated check failures into await-user", async (t) => {
  const cwd = project(t);
  const created = await start(cwd);
  const framed = await invokeRun(["frame", "--goal", "green", "--accept", "A1=green", "--check", "C1=exit 3", "--expect-revision", String(created.revision)], { cwd, command: plainCommand });
  let revision = framed.revision;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const submitted = await invokeRun(["submit", "--summary", `try ${attempt}`, "--expect-revision", String(revision)], { cwd, command: plainCommand });
    assert.equal(submitted.code, "CHECKS_FAILED", `attempt ${attempt}`);
    revision = submitted.revision;
  }
  const capped = await invokeRun(["submit", "--summary", "try 4", "--expect-revision", String(revision)], { cwd, command: plainCommand });
  assert.equal(capped.code, "AWAIT_USER");
  const resolved = await invokeRun(["resolve", "--confirmed", "--extend-budget", "5", "--expect-revision", String(capped.revision)], { cwd, command: plainCommand });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.submit_failures_view ?? resolved.continuation.budget.submit_failures, 0);
});

test("huge command output never kills the check; the tail is preserved and the log is marked truncated", async (t) => {
  const cwd = project(t);
  const created = await start(cwd);
  // No process.exit: exiting right after a large pipe write truncates the output
  // before it drains (Node flushes pipes best-effort on exit), which would test
  // the emitter's bug instead of the runtime's truncation marking.
  const emit = "node -e \"process.stdout.write('x'.repeat(4 * 1024 * 1024) + String.fromCharCode(10) + 'TAIL-MARKER' + String.fromCharCode(10))\"";
  const framed = await invokeRun(["frame", "--goal", "loud build", "--accept", "A1=exit code is what counts", "--check", `C1=${emit}`, "--expect-revision", String(created.revision)], { cwd, command: plainCommand });
  const submitted = await invokeRun(["submit", "--summary", "candidate", "--expect-revision", String(framed.revision)], { cwd, command: plainCommand });
  assert.equal(submitted.code, "OK");
  const result = submitted.checks.find((check) => check.id === "C1");
  assert.equal(result.status, "passed");
  assert.equal(result.log_truncated, true);
  const log = fs.readFileSync(path.join(cwd, result.log_ref), "utf8");
  assert.ok(log.length < 512 * 1024 + 65536);
  assert.match(log, /TAIL-MARKER/);
});

test("check timeout kills the whole process tree and records timed_out without leaking handles", async (t) => {
  const cwd = project(t);
  const created = await start(cwd);
  const sleeper = process.platform === "win32" ? "ping -n 30 127.0.0.1 >nul" : "sleep 30";
  const framed = await invokeRun(["frame", "--goal", "timeout", "--accept", "A1=timeout is recorded", "--check", `C1=${sleeper}`, "--expect-revision", String(created.revision)], { cwd, command: plainCommand });
  const submitted = await invokeRun(["submit", "--summary", "candidate", "--timeout", "1500", "--expect-revision", String(framed.revision)], { cwd, command: plainCommand });
  assert.equal(submitted.code, "CHECKS_FAILED");
  assert.equal(submitted.checks[0].status, "timed_out");
  assert.equal(submitted.checks[0].timed_out, true);
});

test("exploratory run check records diagnostics without touching acceptance", async (t) => {
  const cwd = project(t);
  const created = await start(cwd);
  const checked = await invokeRun(["check", "--cmd", "node -e \"console.log('probe')\"", "--expect-revision", String(created.revision)], { cwd, command: plainCommand });
  assert.equal(checked.ok, true);
  assert.equal(checked.check.status, "passed");
  const state = JSON.parse(fs.readFileSync(path.join(cwd, ".matrix", "runs", created.run_id, "state.json"), "utf8"));
  assert.equal(state.exploratory_checks.length, 1);
  assert.equal(state.acceptance.length, 0);
});

test("the bundled runtime entry executes run commands from paths with special characters", async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-hash-path-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const scripts = path.join(base, "hash#dir", "pct%20dir", "scripts");
  fs.mkdirSync(scripts, { recursive: true });
  fs.copyFileSync(path.join(root, "src", "workflow.js"), path.join(scripts, "matrix-runtime.mjs"));
  for (const name of ["workflow-transaction.js", "run-engine.js", "matrix-config.js", "matt-catalog.mjs"]) fs.copyFileSync(path.join(root, "src", name), path.join(scripts, name));
  fs.writeFileSync(path.join(scripts, "package.json"), '{"type":"module"}\n');
  const project = path.join(base, "project");
  fs.mkdirSync(project);
  const listed = spawnSync(process.execPath, [path.join(scripts, "matrix-runtime.mjs"), "run", "list"], { cwd: project, encoding: "utf8" });
  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(JSON.parse(listed.stdout), { ok: true, code: "OK", current: null, runs: [] });
});

test("a v2 workflow and a run share the same WAL gate, and v2 lifecycle still works beside a run", async (t) => {
  const cwd = project(t);
  const created = await start(cwd);
  const change = invoke(["init", "beside-run", "--title", "Beside a run"], { cwd });
  assert.equal(change.ok, true, change.message);
  assert.equal(invoke(["inspect"], { cwd }).phase, "open");
  assert.equal(invoke(["inspect"], { cwd }).active_run.run_id, created.run_id);
  const guarded = await invokeRun(["submit", "--summary", "candidate", "--expect-revision", String(created.revision)], { cwd, command: plainCommand });
  assert.equal(guarded.code, "ILLEGAL_PHASE");
});

test("select switches the lease and warns when leaving a dirty execute run", async (t) => {
  const cwd = project(t);
  const first = await start(cwd, "first change");
  const framed = await invokeRun(["frame", "--goal", "first goal", "--accept", "A1=first", "--no-checks-reason", "docs only", "--expect-revision", String(first.revision)], { cwd, command: plainCommand });
  fs.writeFileSync(path.join(cwd, "baseline.txt"), "dirty\n");
  const second = await start(cwd, "second change");
  assert.deepEqual(second.warnings, ["WORKTREE_DIRTY_ON_LEASE_SWITCH"]);
  const firstView = await invokeRun(["inspect", first.run_id], { cwd, command: plainCommand });
  assert.equal(firstView.run.lease, false, "the previous run must have lost the lease");
  const reselected = await invokeRun(["select", first.run_id], { cwd, command: plainCommand });
  assert.equal(reselected.ok, true);
  assert.equal(reselected.continuation.lease, true);
  const cleared = await invokeRun(["select", "--none"], { cwd, command: plainCommand });
  assert.equal(cleared.ok, true);
  const orphan = await invokeRun(["submit", "--summary", "candidate", "--expect-revision", String(framed.revision)], { cwd, command: plainCommand });
  assert.equal(orphan.code, "NO_CURRENT_RUN");
});

test("run frame requires at least one acceptance item and a check declaration or explicit reason", async (t) => {
  const cwd = project(t);
  const created = await start(cwd);
  const noAccept = await invokeRun(["frame", "--goal", "g", "--check", "C1=exit 0", "--expect-revision", String(created.revision)], { cwd, command: plainCommand });
  assert.equal(noAccept.code, "INVALID_INTENT");
  const noChecks = await invokeRun(["frame", "--goal", "g", "--accept", "A1=a", "--expect-revision", String(created.revision)], { cwd, command: plainCommand });
  assert.equal(noChecks.code, "CHECKS_REQUIRED");
  const both = await invokeRun(["frame", "--goal", "g", "--accept", "A1=a", "--check", "C1=exit 0", "--no-checks-reason", "why", "--expect-revision", String(created.revision)], { cwd, command: plainCommand });
  assert.equal(both.code, "INVALID_INTENT");
  const duplicate = await invokeRun(["frame", "--goal", "g", "--accept", "A1=a", "--accept", "A1=b", "--check", "C1=exit 0", "--expect-revision", String(created.revision)], { cwd, command: plainCommand });
  assert.equal(duplicate.code, "INVALID_INTENT");
});

test("run requests longer than the argv budget travel through files", async (t) => {
  const cwd = project(t);
  const requestFile = path.join(os.tmpdir(), `matrix-request-${Date.now()}.txt`);
  t.after(() => fs.rmSync(requestFile, { force: true }));
  const body = `${"用户的需求非常长。".repeat(500)}\n`;
  fs.writeFileSync(requestFile, body);
  const created = await invokeRun(["start", "--request-file", requestFile], { cwd, command: plainCommand });
  assert.equal(created.ok, true);
  const state = JSON.parse(fs.readFileSync(path.join(cwd, ".matrix", "runs", created.run_id, "state.json"), "utf8"));
  assert.equal(state.raw_request, body);
});

test("reframing after execute requires user confirmation and resets the loop counters", async (t) => {
  const cwd = project(t);
  const created = await start(cwd);
  const framed = await invokeRun(["frame", "--goal", "first", "--accept", "A1=a", "--check", "C1=exit 0", "--expect-revision", String(created.revision)], { cwd, command: plainCommand });
  const submitted = await invokeRun(["submit", "--summary", "candidate", "--expect-revision", String(framed.revision)], { cwd, command: plainCommand });
  const reframed = await invokeRun(["frame", "--goal", "second", "--accept", "A1=a", "--check", "C1=exit 0", "--expect-revision", String(submitted.revision)], { cwd, command: plainCommand });
  assert.equal(reframed.code, "AWAIT_USER");
  const resolved = await invokeRun(["resolve", "--confirmed", "--expect-revision", String(reframed.revision)], { cwd, command: plainCommand });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.phase, "execute");
  assert.equal(resolved.continuation.budget.iteration, 0, "a reframed goal starts a fresh cycle");
});

test("the workflow entry no longer silently exits on paths containing # or %", (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-entry-path-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const scripts = path.join(base, "hash#dir", "pct%20dir");
  fs.mkdirSync(scripts, { recursive: true });
  fs.copyFileSync(path.join(root, "src", "workflow.js"), path.join(scripts, "matrix-runtime.mjs"));
  for (const name of ["workflow-transaction.js", "run-engine.js", "matrix-config.js", "matt-catalog.mjs"]) fs.copyFileSync(path.join(root, "src", name), path.join(scripts, name));
  fs.writeFileSync(path.join(scripts, "package.json"), '{"type":"module"}\n');
  const runtime = pathToFileURL(path.join(scripts, "matrix-runtime.mjs")).href;
  assert.equal(import.meta.url !== runtime, true);
  const project = path.join(base, "project");
  fs.mkdirSync(project);
  const listed = spawnSync(process.execPath, [path.join(scripts, "matrix-runtime.mjs"), "run", "list"], { cwd: project, encoding: "utf8" });
  assert.notEqual(listed.stdout.length, 0, "the entry must emit JSON even from a # path");
  assert.equal(JSON.parse(listed.stdout).code, "OK");
});
