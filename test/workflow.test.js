import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { hashDirectory } from "../src/catalog.js";
import { invoke } from "../src/workflow.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stateAdapter = path.join(root, ".claude", "skills", "matrix", "scripts", "matrix_state.py");
const claudeAdapter = path.join(root, ".claude", "skills", "matrix", "scripts", "matrix_claude.py");
const python = spawnSync("python", ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" }).stdout.trim();
const adapterEnv = { ...process.env, PATH: path.dirname(process.execPath), MATRIX_DEVELOPMENT_RUNTIME: path.join(root, "src", "workflow.js") };

function adapter(script, args, cwd) { return spawnSync(python, [script, ...args], { cwd, encoding: "utf8", env: adapterEnv }); }
function statePath(cwd, id, archived = false) { return path.join(cwd, ".matrix", archived ? "archive" : "changes", id, "matrix.yaml"); }
function artifacts(cwd, id) { return path.join(cwd, ".matrix", "changes", id, "artifacts"); }
function events(cwd, id, archived = false) { return fs.readFileSync(path.join(cwd, ".matrix", archived ? "archive" : "changes", id, "events.jsonl"), "utf8").trim().split(/\r?\n/).map(JSON.parse); }
function writeContract(base) {
  fs.writeFileSync(path.join(base, "proposal.md"), "## Goal\nGoal text.\n\n## Scope\nScope text.\n\n## Non-goals\nNo extra work.\n\n## Acceptance\nAcceptance text.\n\n## Risks\nKnown risk.");
  fs.writeFileSync(path.join(base, "design.md"), "## Decisions\nDecision text.\n\n## Boundaries\nBoundary text.\n\n## Test seams\nUse invoke argv.\n\n## Risks\nKnown risk.");
  fs.writeFileSync(path.join(base, "plan.md"), "## Steps\n1. Build it.\n\n## Validation\nRun tests.\n\n## Stop conditions\nStop on scope change.");
}
function start(cwd, id = "change") { assert.equal(invoke(["init", id, "--title", id], { cwd }).ok, true); return artifacts(cwd, id); }
function build(cwd, id = "change") { const base = start(cwd, id); writeContract(base); assert.equal(invoke(["transition", "design"], { cwd }).ok, true); const result = invoke(["transition", "build"], { cwd }); assert.equal(result.ok, true, result.message); return { base, result }; }
function verify(cwd, id = "change") { const { base } = build(cwd, id); fs.writeFileSync(path.join(base, "verification.md"), "## Build evidence\nBuild passed with enough detail."); assert.equal(invoke(["transition", "verify"], { cwd }).ok, true); fs.writeFileSync(path.join(base, "verification.md"), "## Build evidence\nBuild passed.\n\n## Test evidence\nTests passed with enough detail.\n\n## Review evidence\nReview passed with enough detail."); return base; }
function archivePhase(cwd, id = "change") { const base = verify(cwd, id); assert.equal(invoke(["transition", "archive"], { cwd }).ok, true); return base; }
function preflight(cwd) { const result = invoke(["archive", "--dry-run"], { cwd }); assert.equal(result.ok, true, result.message); return result; }
function normalizeArchiveTimes(cwd, id) {
  const state = fs.readFileSync(statePath(cwd, id), "utf8").replace(/^(created_at|updated_at): .*$/gm, "$1: 2026-01-01T00:00:00Z");
  fs.writeFileSync(statePath(cwd, id), state);
  const eventPath = path.join(cwd, ".matrix", "changes", id, "events.jsonl");
  const normalized = fs.readFileSync(eventPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.stringify({ ...JSON.parse(line), at: "2026-01-01T00:00:00Z" })).join("\n");
  fs.writeFileSync(eventPath, `${normalized}\n`);
}

function writeArchInstallation(cwd, platforms = ["codex"]) {
  const records = {};
  for (const platform of platforms) {
    const root = path.join(cwd, platform === "codex" ? ".agents" : ".claude", "skills");
    const skills = {};
    for (const skill of ["grilling", "domain-modeling", "research", "wayfinder", "prototype", "codebase-design", "tdd", "diagnosing-bugs", "resolving-merge-conflicts", "code-review"]) {
      const target = path.join(root, skill);
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, "SKILL.md"), `# ${skill}\n`);
      skills[skill] = { root: target, hash: hashDirectory(target) };
    }
    records[platform] = { matt: { state: "complete", skills } };
  }
  fs.mkdirSync(path.join(cwd, ".matrix"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".matrix", "installation.json"), `${JSON.stringify({ version: 2, orchestration: { default: "arch", available: ["prim", "arch"] }, platforms: records }, null, 2)}\n`);
  fs.writeFileSync(path.join(cwd, ".matrix", "config.yaml"), "schema: matrix/config/v1\nauto_transition: true\ndefault_orchestration: arch\ninstallation_scope: project\n");
}

test("workflow freezes Prim by default and rejects unsupported orchestration identifiers", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-prim-")); t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const created = invoke(["init", "prim-change", "--title", "Prim change"], { cwd });
  assert.equal(created.orchestration, "prim");
  assert.match(fs.readFileSync(statePath(cwd, "prim-change"), "utf8"), /^orchestration: prim$/m);
  assert.equal(events(cwd, "prim-change")[0].orchestration, "prim");
  assert.equal(invoke(["inspect"], { cwd }).orchestration, "prim");
  fs.writeFileSync(path.join(cwd, ".matrix", "config.yaml"), "schema: matrix/config/v1\nauto_transition: true\ndefault_orchestration: arch\ninstallation_scope: project\n");
  assert.equal(invoke(["inspect"], { cwd }).orchestration, "prim");
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-invalid-mode-")); t.after(() => fs.rmSync(other, { recursive: true, force: true }));
  assert.equal(invoke(["init", "invalid", "--title", "Invalid", "--orchestration", "legacy"], { cwd: other }).code, "INVALID_INTENT");
});

test("Arch requires verified project-wide installation facts and freezes Arch into state", (t) => {
  const missing = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-arch-missing-")); t.after(() => fs.rmSync(missing, { recursive: true, force: true }));
  assert.equal(invoke(["init", "missing", "--title", "Missing", "--orchestration", "arch"], { cwd: missing }).code, "ARCH_INSTALLATION_INCOMPLETE");
  assert.equal(fs.existsSync(path.join(missing, ".matrix", "changes", "missing")), false);

  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-arch-")); t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  writeArchInstallation(cwd, ["claude-code", "codex"]);
  const created = invoke(["init", "arch-change", "--title", "Arch change"], { cwd });
  assert.equal(created.ok, true, created.message);
  assert.equal(created.orchestration, "arch");
  assert.equal(invoke(["inspect"], { cwd }).orchestration, "arch");
  fs.rmSync(path.join(cwd, ".agents", "skills", "tdd", "SKILL.md"));
  const damaged = invoke(["inspect"], { cwd });
  assert.equal(damaged.code, "ARCH_INSTALLATION_INCOMPLETE");
  assert.equal(damaged.orchestration, "arch");
  assert.deepEqual(damaged.findings[0], { platform: "codex", skill: "tdd", reason: "missing" });
});

test("Arch integrity rejects content changes without silently falling back to Prim", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-arch-modified-")); t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  writeArchInstallation(cwd);
  assert.equal(invoke(["init", "modified", "--title", "Modified"], { cwd }).orchestration, "arch");
  fs.appendFileSync(path.join(cwd, ".agents", "skills", "code-review", "SKILL.md"), "\nchanged");
  const result = invoke(["inspect"], { cwd });
  assert.equal(result.code, "ARCH_INSTALLATION_INCOMPLETE");
  assert.equal(result.orchestration, "arch");
  assert.deepEqual(result.findings[0], { platform: "codex", skill: "code-review", reason: "modified" });
});

test("v0.1.2 initializes only final v2 state and rejects old schema without mutation", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-v2-")); t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  start(cwd, "final");
  const state = fs.readFileSync(statePath(cwd, "final"), "utf8");
  assert.match(state, /^schema: matrix\/change\/v2$/m);
  assert.doesNotMatch(state, /run-state/);
  assert.equal(fs.existsSync(path.join(cwd, ".matrix", "changes", "final", "run-state.json")), false);
  fs.writeFileSync(statePath(cwd, "final"), state.replace("matrix/change/v2", "matrix/change/v1"));
  const before = fs.readFileSync(statePath(cwd, "final"), "utf8");
  assert.equal(invoke(["inspect"], { cwd }).code, "STATE_VERSION_UNSUPPORTED");
  assert.equal(fs.readFileSync(statePath(cwd, "final"), "utf8"), before);
});

test("design to build approves an exact contract and drift fails before evidence guards", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-contract-")); t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const { base, result } = build(cwd, "contract");
  assert.equal(result.approved_contract_hash, "sha256:6631e3edc6f98e07ff1563195ea07a5e8397b5ee1c0e1013d45d9b95c4eb02c4");
  assert.equal(result.contract_status, "approved-and-matching");
  assert.equal(result.contract_approved_revision, result.revision);
  assert.equal(events(cwd, "contract").at(-1).approved_contract_hash, result.approved_contract_hash);
  fs.appendFileSync(path.join(base, "plan.md"), "\nWhitespace changes approval too.");
  const state = fs.readFileSync(statePath(cwd, "contract"), "utf8"); const history = fs.readFileSync(path.join(cwd, ".matrix", "changes", "contract", "events.jsonl"), "utf8");
  const changed = invoke(["transition", "verify"], { cwd });
  assert.equal(changed.code, "CONTRACT_CHANGED");
  assert.equal(changed.contract_status, "changed");
  assert.equal(invoke(["guard", "build"], { cwd }).code, "CONTRACT_CHANGED");
  assert.equal(fs.readFileSync(statePath(cwd, "contract"), "utf8"), state); assert.equal(fs.readFileSync(path.join(cwd, ".matrix", "changes", "contract", "events.jsonl"), "utf8"), history);
});

test("unreadable approved Contract fails closed before structural evidence checks", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-unreadable-")); t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const { base } = build(cwd, "unreadable"); const state = fs.readFileSync(statePath(cwd, "unreadable"), "utf8"); const history = fs.readFileSync(path.join(cwd, ".matrix", "changes", "unreadable", "events.jsonl"), "utf8");
  const original = fs.readFileSync;
  fs.readFileSync = function (file, ...rest) {
    if (path.resolve(String(file)) === path.resolve(path.join(base, "plan.md"))) { const error = new Error("simulated read failure"); error.code = "EIO"; throw error; }
    return original.call(this, file, ...rest);
  };
  try {
    const guarded = invoke(["guard", "build"], { cwd }); const inspected = invoke(["inspect"], { cwd });
    assert.equal(guarded.code, "CONTRACT_READ_FAILED"); assert.equal(inspected.code, "CONTRACT_READ_FAILED"); assert.equal(inspected.ok, false);
  } finally { fs.readFileSync = original; }
  assert.equal(fs.readFileSync(statePath(cwd, "unreadable"), "utf8"), state); assert.equal(fs.readFileSync(path.join(cwd, ".matrix", "changes", "unreadable", "events.jsonl"), "utf8"), history);
});

test("contract identity is stable across change ids and exact bytes distinguish newline changes", (t) => {
  const first = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-contract-a-")); const second = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-contract-b-"));
  t.after(() => fs.rmSync(first, { recursive: true, force: true })); t.after(() => fs.rmSync(second, { recursive: true, force: true }));
  const a = build(first, "a").result.approved_contract_hash; const { base, result } = build(second, "b");
  assert.equal(a, result.approved_contract_hash);
  fs.appendFileSync(path.join(base, "proposal.md"), "\n");
  assert.equal(invoke(["inspect"], { cwd: second }).contract_status, "changed");
});

test("controlled Return clears or preserves approval and archive can recover to design", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-return-contract-")); t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const base = verify(cwd, "returning");
  const approved = invoke(["inspect"], { cwd }).approved_contract_hash;
  const returned = invoke(["return", "build", "--reason", "verification-failed"], { cwd });
  assert.equal(returned.ok, true); assert.equal(returned.approved_contract_hash, approved);
  fs.writeFileSync(path.join(base, "verification.md"), "## Build evidence\nFresh build evidence after Return.");
  assert.equal(invoke(["transition", "verify"], { cwd }).ok, true);
  fs.writeFileSync(path.join(base, "verification.md"), "## Test evidence\nTests passed with enough detail.\n\n## Review evidence\nReview passed with enough detail.");
  assert.equal(invoke(["transition", "archive"], { cwd }).ok, true);
  fs.appendFileSync(path.join(base, "design.md"), "\nChanged while awaiting archive.");
  assert.equal(invoke(["archive", "--dry-run"], { cwd }).code, "CONTRACT_CHANGED");
  const recovered = invoke(["return", "design", "--reason", "acceptance-or-design-gap"], { cwd });
  assert.equal(recovered.ok, true); assert.equal(recovered.approved_contract_hash, null);
});

test("Abort is available without contract input from every active phase", (t) => {
  for (const phase of ["open", "design", "build", "verify", "archive"]) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `matrix-abort-${phase}-`)); t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
    const id = `abort-${phase}`; let base;
    if (phase === "open") base = start(cwd, id);
    else if (phase === "design") { base = start(cwd, id); writeContract(base); assert.equal(invoke(["transition", "design"], { cwd }).ok, true); }
    else if (phase === "build") base = build(cwd, id).base;
    else base = verify(cwd, id);
    if (phase === "archive") assert.equal(invoke(["transition", "archive"], { cwd }).ok, true);
    fs.rmSync(path.join(base, "proposal.md"), { force: true });
    const result = invoke(["abort", "--reason", "blocked"], { cwd });
    assert.equal(result.ok, true); assert.equal(result.status, "aborted");
  }
});

test("Claude export is a read-only matching-Build handoff with approval metadata", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-export-contract-")); t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const { base, result } = build(cwd, "handoff"); const before = fs.readFileSync(statePath(cwd, "handoff"), "utf8"); const count = events(cwd, "handoff").length;
  const exported = invoke(["export", "--task-id", "TASK-1"], { cwd });
  assert.equal(exported.ok, true); assert.equal(fs.readFileSync(statePath(cwd, "handoff"), "utf8"), before); assert.equal(events(cwd, "handoff").length, count);
  assert.match(fs.readFileSync(path.join(base, "claude-task.md"), "utf8"), new RegExp(result.approved_contract_hash));
  fs.appendFileSync(path.join(base, "proposal.md"), "\nchanged");
  assert.equal(invoke(["export", "--task-id", "TASK-2"], { cwd }).code, "CONTRACT_CHANGED");
});

test("direct lifecycle archives with matching approval and terminal records remain inspectable", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-direct-")); t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  archivePhase(cwd, "direct");
  const before = fs.readFileSync(statePath(cwd, "direct"), "utf8"); const beforeEvents = events(cwd, "direct").length;
  assert.equal(invoke(["archive"], { cwd }).code, "ARCHIVE_PREFLIGHT_REQUIRED");
  const prepared = preflight(cwd); assert.match(prepared.preflight_hash, /^sha256:[0-9a-f]{64}$/); assert.match(prepared.commit_command, /--expect-preflight sha256:/);
  assert.equal(fs.readFileSync(statePath(cwd, "direct"), "utf8"), before); assert.equal(events(cwd, "direct").length, beforeEvents);
  assert.equal(preflight(cwd).preflight_hash, prepared.preflight_hash);
  const archived = invoke(["archive", "--expect-preflight", prepared.preflight_hash], { cwd }); assert.equal(archived.ok, true); assert.equal(archived.preflight_hash, prepared.preflight_hash); assert.equal(archived.contract_status, "approved-and-matching"); assert.equal(archived.approved_contract_hash, archived.current_contract_hash);
  const inspected = invoke(["inspect", "direct"], { cwd }); assert.equal(inspected.status, "archived"); assert.equal(inspected.contract_status, "approved-and-matching");
  assert.equal(fs.existsSync(path.join(cwd, ".matrix", "archive", "direct", "artifacts", "verification.md")), true);
});

test("Archive preflight has a fixed public identity vector and globally sorted typed paths", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-preflight-vector-")); t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const base = archivePhase(cwd, "vector"); normalizeArchiveTimes(cwd, "vector");
  fs.mkdirSync(path.join(base, "a")); fs.mkdirSync(path.join(base, "empty"));
  fs.writeFileSync(path.join(base, "a", "z.txt"), "nested"); fs.writeFileSync(path.join(base, "a.txt"), "sibling");
  assert.equal(preflight(cwd).preflight_hash, "sha256:b06a477774ff1ef3f03b0735ccafd629870a8b9217863027a3950f3ed5e65d13");
});

test("Archive preflight rejects drift, cross-change reuse, lock contention, and unsupported entries without mutation", (t) => {
  const first = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-preflight-a-")); const second = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-preflight-b-"));
  t.after(() => fs.rmSync(first, { recursive: true, force: true })); t.after(() => fs.rmSync(second, { recursive: true, force: true }));
  const firstBase = archivePhase(first, "first"); archivePhase(second, "second");
  const prepared = preflight(first); const state = fs.readFileSync(statePath(first, "first"), "utf8"); const history = fs.readFileSync(path.join(first, ".matrix", "changes", "first", "events.jsonl"), "utf8");
  assert.equal(invoke(["archive", "--expect-preflight", prepared.preflight_hash], { cwd: second }).code, "ARCHIVE_PREFLIGHT_CHANGED");
  fs.writeFileSync(path.join(firstBase, "handoff.md"), "changed after preflight");
  const changed = invoke(["archive", "--expect-preflight", prepared.preflight_hash], { cwd: first }); assert.equal(changed.code, "ARCHIVE_PREFLIGHT_CHANGED");
  assert.equal(fs.readFileSync(statePath(first, "first"), "utf8"), state); assert.equal(fs.readFileSync(path.join(first, ".matrix", "changes", "first", "events.jsonl"), "utf8"), history);
  fs.writeFileSync(path.join(first, ".matrix", "workflow.lock"), `${JSON.stringify({ schema: "matrix/workflow-lock/v1", transaction_id: "active-owner", pid: process.pid, hostname: os.hostname(), nonce: "test-owner", created_at: "2026-01-01T00:00:00Z" })}\n`);
  assert.equal(invoke(["archive", "--expect-preflight", preflight(first).preflight_hash], { cwd: first }).code, "WORKFLOW_BUSY");
  assert.equal(invoke(["abort", "--reason", "blocked"], { cwd: first }).code, "WORKFLOW_BUSY");
  fs.rmSync(path.join(first, ".matrix", "workflow.lock"));
  assert.equal(invoke(["archive", "--expect-preflight", "sha256:bad"], { cwd: first }).code, "ARCHIVE_PREFLIGHT_INVALID");
  const originalLstat = fs.lstatSync;
  fs.lstatSync = function (file, ...rest) {
    if (path.resolve(String(file)) === path.resolve(path.join(firstBase, "handoff.md"))) return { isSymbolicLink: () => true, isDirectory: () => false, isFile: () => false };
    return originalLstat.call(this, file, ...rest);
  };
  try { assert.equal(invoke(["archive", "--dry-run"], { cwd: first }).code, "ARCHIVE_ENTRY_UNSUPPORTED"); }
  finally { fs.lstatSync = originalLstat; }
  const originalOpen = fs.openSync; const originalRead = fs.readSync; const interruptedDescriptors = new Set();
  fs.openSync = function (file, ...args) {
    const descriptor = originalOpen.call(this, file, ...args);
    if (path.resolve(String(file)) === path.resolve(path.join(firstBase, "handoff.md"))) interruptedDescriptors.add(descriptor);
    return descriptor;
  };
  fs.readSync = function (descriptor, ...args) {
    if (interruptedDescriptors.delete(descriptor)) return 0;
    return originalRead.call(this, descriptor, ...args);
  };
  try { assert.equal(invoke(["archive", "--dry-run"], { cwd: first }).code, "ARCHIVE_PREFLIGHT_UNSTABLE"); }
  finally { fs.openSync = originalOpen; fs.readSync = originalRead; }
});

test("workflow doctor is read-only and interrupted transitions require an explicit transaction and strategy", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-workflow-doctor-")); t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const base = start(cwd, "recover"); writeContract(base);
  const interrupted = invoke(["transition", "design"], { cwd, failAfterOperation: 0 });
  assert.equal(interrupted.code, "WORKFLOW_PERSISTENCE_FAILED");
  assert.match(interrupted.transaction_id, /^[0-9a-f-]{36}$/);
  const journal = path.join(cwd, ".matrix", "transactions", interrupted.transaction_id, "journal.json");
  const beforeDoctor = fs.readFileSync(journal, "utf8");
  const diagnosis = invoke(["doctor"], { cwd });
  assert.equal(diagnosis.ok, true);
  assert.equal(diagnosis.health, "recovery-required");
  assert.deepEqual(diagnosis.transactions.find((item) => item.id === interrupted.transaction_id).strategies, ["continue", "rollback"]);
  assert.equal(fs.readFileSync(journal, "utf8"), beforeDoctor);
  assert.equal(invoke(["doctor", "--repair"], { cwd }).code, "WORKFLOW_TRANSACTION_REQUIRED");
  assert.equal(invoke(["doctor", "--repair", "--transaction", interrupted.transaction_id], { cwd }).code, "WORKFLOW_STRATEGY_REQUIRED");
  fs.writeFileSync(path.join(cwd, ".matrix", "workflow.lock"), `${JSON.stringify({ schema: "matrix/workflow-lock/v1", transaction_id: interrupted.transaction_id, pid: 2147483647, hostname: os.hostname(), nonce: "interrupted-owner", created_at: "2026-01-01T00:00:00Z" })}\n`);
  const repaired = invoke(["doctor", "--repair", "--transaction", interrupted.transaction_id, "--strategy", "continue"], { cwd });
  assert.equal(repaired.ok, true, repaired.message);
  assert.equal(repaired.repaired, true);
  assert.equal(invoke(["inspect"], { cwd }).phase, "design");
  assert.equal(events(cwd, "recover").filter((item) => item.event === "transition").length, 1);
  assert.match(fs.readFileSync(journal, "utf8"), /matrix\/workflow-transaction-receipt\/v1/);
});

test("rollback restores the exact pre-transaction workflow facts and is idempotent", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-workflow-rollback-")); t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const base = start(cwd, "rollback"); writeContract(base);
  const stateBefore = fs.readFileSync(statePath(cwd, "rollback"), "utf8");
  const eventsBefore = fs.readFileSync(path.join(cwd, ".matrix", "changes", "rollback", "events.jsonl"), "utf8");
  const interrupted = invoke(["transition", "design"], { cwd, failAfterOperation: 0 });
  const repaired = invoke(["doctor", "--repair", "--transaction", interrupted.transaction_id, "--strategy", "rollback"], { cwd });
  assert.equal(repaired.ok, true, repaired.message);
  assert.equal(repaired.disposition, "rolled-back");
  assert.equal(fs.readFileSync(statePath(cwd, "rollback"), "utf8"), stateBefore);
  assert.equal(fs.readFileSync(path.join(cwd, ".matrix", "changes", "rollback", "events.jsonl"), "utf8"), eventsBefore);
  const replay = invoke(["doctor", "--repair", "--transaction", interrupted.transaction_id, "--strategy", "rollback"], { cwd });
  assert.equal(replay.ok, true);
  assert.equal(replay.repaired, false);
  assert.equal(replay.disposition, "rolled-back");
});

test("all state-changing lifecycle commands leave bounded terminal transaction receipts", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-workflow-receipts-")); t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  archivePhase(cwd, "receipts");
  const prepared = preflight(cwd);
  assert.equal(invoke(["archive", "--expect-preflight", prepared.preflight_hash], { cwd }).ok, true);
  const transactionRoot = path.join(cwd, ".matrix", "transactions");
  const receipts = fs.readdirSync(transactionRoot).map((id) => JSON.parse(fs.readFileSync(path.join(transactionRoot, id, "journal.json"), "utf8")));
  assert.deepEqual(receipts.map((item) => item.kind).sort(), ["archive", "init", "transition", "transition", "transition", "transition"].sort());
  assert.equal(receipts.every((item) => item.schema === "matrix/workflow-transaction-receipt/v1" && item.status === "committed"), true);
  assert.equal(receipts.every((item) => item.operations.every((operation) => !("bytes" in operation))), true);
});

test("init, Return, Abort, and Archive continue safely after every injected operation boundary", (t) => {
  for (let boundary = 0; boundary < 7; boundary += 1) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `matrix-init-crash-${boundary}-`)); t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
    const interrupted = invoke(["init", `init-${boundary}`, "--title", "Interrupted init"], { cwd, failAfterOperation: boundary });
    assert.equal(interrupted.code, "WORKFLOW_PERSISTENCE_FAILED");
    const repaired = invoke(["doctor", "--repair", "--transaction", interrupted.transaction_id, "--strategy", "continue"], { cwd });
    assert.equal(repaired.ok, true, `init boundary ${boundary}: ${repaired.message}`);
    assert.equal(invoke(["inspect"], { cwd }).phase, "open");
  }
  for (let boundary = 0; boundary < 3; boundary += 1) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `matrix-return-crash-${boundary}-`)); t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
    verify(cwd, `return-${boundary}`);
    const interrupted = invoke(["return", "build", "--reason", "verification-failed"], { cwd, failAfterOperation: boundary });
    assert.equal(interrupted.code, "WORKFLOW_PERSISTENCE_FAILED");
    const repaired = invoke(["doctor", "--repair", "--transaction", interrupted.transaction_id, "--strategy", "continue"], { cwd });
    assert.equal(repaired.ok, true, `Return boundary ${boundary}: ${repaired.message}`);
    assert.equal(invoke(["inspect"], { cwd }).phase, "build");
  }
  for (let boundary = 0; boundary < 4; boundary += 1) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `matrix-abort-crash-${boundary}-`)); t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
    start(cwd, `abort-${boundary}`);
    const interrupted = invoke(["abort", "--reason", "blocked"], { cwd, failAfterOperation: boundary });
    assert.equal(interrupted.code, "WORKFLOW_PERSISTENCE_FAILED");
    const repaired = invoke(["doctor", "--repair", "--transaction", interrupted.transaction_id, "--strategy", "continue"], { cwd });
    assert.equal(repaired.ok, true, `Abort boundary ${boundary}: ${repaired.message}`);
    assert.equal(invoke(["inspect", `abort-${boundary}`], { cwd }).status, "aborted");
  }
  for (let boundary = 0; boundary < 4; boundary += 1) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `matrix-archive-crash-${boundary}-`)); t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
    archivePhase(cwd, `archive-${boundary}`);
    const prepared = preflight(cwd);
    const interrupted = invoke(["archive", "--expect-preflight", prepared.preflight_hash], { cwd, failAfterOperation: boundary });
    assert.equal(interrupted.code, "WORKFLOW_PERSISTENCE_FAILED");
    const repaired = invoke(["doctor", "--repair", "--transaction", interrupted.transaction_id, "--strategy", "continue"], { cwd });
    assert.equal(repaired.ok, true, `Archive boundary ${boundary}: ${repaired.message}`);
    assert.equal(invoke(["inspect", `archive-${boundary}`], { cwd }).status, "archived");
  }
});

test("terminal receipt retention is capped at the newest 32 without deleting unresolved journals", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-receipt-limit-")); t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  for (let index = 0; index < 17; index += 1) {
    assert.equal(invoke(["init", `receipt-${index}`, "--title", `Receipt ${index}`], { cwd }).ok, true);
    assert.equal(invoke(["abort", "--reason", "superseded"], { cwd }).ok, true);
  }
  const transactionRoot = path.join(cwd, ".matrix", "transactions");
  assert.equal(fs.readdirSync(transactionRoot).length, 32);
  assert.equal(fs.readdirSync(transactionRoot).every((id) => JSON.parse(fs.readFileSync(path.join(transactionRoot, id, "journal.json"), "utf8")).schema === "matrix/workflow-transaction-receipt/v1"), true);
});

test("corrupt journals fail closed and remain byte-identical for manual resolution", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-corrupt-journal-")); t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  start(cwd, "corrupt");
  const broken = path.join(cwd, ".matrix", "transactions", "broken", "journal.json");
  fs.mkdirSync(path.dirname(broken));
  fs.writeFileSync(broken, "{not-json");
  const before = fs.readFileSync(broken);
  const diagnosis = invoke(["doctor"], { cwd });
  assert.equal(diagnosis.health, "conflict");
  assert.equal(diagnosis.findings.some((item) => item.code === "WORKFLOW_TRANSACTION_CORRUPT"), true);
  assert.equal(invoke(["transition", "design"], { cwd }).code, "WORKFLOW_RECOVERY_REQUIRED");
  assert.equal(invoke(["doctor", "--repair", "--transaction", "broken", "--strategy", "continue"], { cwd }).code, "WORKFLOW_TRANSACTION_CORRUPT");
  assert.deepEqual(fs.readFileSync(broken), before);
});

test("journal integrity rejects content-addressed operation tampering", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-journal-integrity-")); t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const base = start(cwd, "integrity"); writeContract(base);
  const interrupted = invoke(["transition", "design"], { cwd, failAfterOperation: 0 });
  const journalPath = path.join(cwd, ".matrix", "transactions", interrupted.transaction_id, "journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  journal.operations[0].after.hash = `sha256:${"0".repeat(64)}`;
  fs.writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
  const before = fs.readFileSync(journalPath);
  const diagnosis = invoke(["doctor"], { cwd });
  assert.equal(diagnosis.health, "conflict");
  assert.equal(diagnosis.findings.some((item) => item.transaction_id === interrupted.transaction_id && item.code === "WORKFLOW_TRANSACTION_CORRUPT"), true);
  assert.equal(invoke(["doctor", "--repair", "--transaction", interrupted.transaction_id, "--strategy", "continue"], { cwd }).code, "WORKFLOW_TRANSACTION_CORRUPT");
  assert.deepEqual(fs.readFileSync(journalPath), before);
});

test("standalone stale lock cleanup requires its exact doctor-reported identity", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-stale-lock-")); t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  start(cwd, "lock");
  const receiptId = fs.readdirSync(path.join(cwd, ".matrix", "transactions"))[0];
  const lockPath = path.join(cwd, ".matrix", "workflow.lock");
  fs.writeFileSync(lockPath, `${JSON.stringify({ schema: "matrix/workflow-lock/v1", transaction_id: receiptId, pid: 2147483647, hostname: os.hostname(), nonce: "stale-owner", created_at: "2026-01-01T00:00:00Z" })}\n`);
  const diagnosis = invoke(["doctor"], { cwd });
  assert.equal(diagnosis.lock.owner, "absent");
  assert.equal(invoke(["doctor", "--repair"], { cwd }).code, "WORKFLOW_LOCK_REQUIRED");
  assert.equal(invoke(["doctor", "--repair", "--lock", "sha256:wrong"], { cwd }).code, "WORKFLOW_LOCK_CONFLICT");
  const repaired = invoke(["doctor", "--repair", "--lock", diagnosis.lock.id], { cwd });
  assert.equal(repaired.ok, true, repaired.message);
  assert.equal(repaired.disposition, "lock-removed");
  assert.equal(fs.existsSync(lockPath), false);
});

test("CLI, bundled Runtime, and Python adapters preserve the final contract envelope", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-adapter-")); t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const nodeCwd = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-node-")); t.after(() => fs.rmSync(nodeCwd, { recursive: true, force: true }));
  build(cwd, "adapter"); build(nodeCwd, "adapter");
  const cli = spawnSync(process.execPath, [path.join(root, "bin", "matrix.js"), "workflow", "inspect", "--json"], { cwd, encoding: "utf8" });
  const bundled = spawnSync(process.execPath, [path.join(root, "src", "workflow.js"), "inspect"], { cwd, encoding: "utf8" });
  assert.deepEqual(JSON.parse(cli.stdout), JSON.parse(bundled.stdout));
  const pythonResult = adapter(stateAdapter, ["inspect"], nodeCwd); assert.equal(pythonResult.status, 0, pythonResult.stderr);
  assert.equal(JSON.parse(pythonResult.stdout).contract_status, "approved-and-matching");
  const pythonExport = adapter(claudeAdapter, ["export", "--task-id", "PY-1"], nodeCwd); assert.equal(pythonExport.status, 0, pythonExport.stderr);
});
