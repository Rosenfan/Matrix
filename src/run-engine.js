import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { captureWorkflowEntry, runWorkflowTransaction, workflowMkdirOperation, workflowMoveOperation, workflowWriteOperation } from "./workflow-transaction.js";
import { managedGitignoreOperation, resolveWorkflowConfig } from "./matrix-config.js";

// Autonomous Run engine (`matrix/run/v1`). The Runtime owns every state transition:
// it freezes the goal with its acceptance items and check commands, executes those
// commands itself when a candidate is submitted, validates that verification covered
// every acceptance item, and archives the Run atomically.
const RUN_SCHEMA = "matrix/run/v1";
const EVENT_SCHEMA = "matrix/run-event/v1";
const LEASE_SCHEMA = "matrix/current-run/v1";
const PHASES = ["understand", "execute", "verify", "close"];
const REVIEWERS = ["self", "subagent", "external"];
const VERDICTS = ["passed", "failed", "blocked"];
const RUN_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/;
const TEXT_LIMIT = 1024 * 1024;
const ITEM_LIMIT = 4000;
const SUMMARY_LIMIT = 8000;
const FINDINGS_LIMIT = 50;
const EXPLORATORY_LIMIT = 50;
const LOG_LIMIT_BYTES = 512 * 1024;
const LOG_TAIL_BYTES = 64 * 1024;
const MANAGED_PREFIX = ".matrix/";
const LEASE_SWITCH_NOTE = "The previous run is mid-execute and this worktree has uncommitted changes outside .matrix/. Finish or park that run, or use a separate git worktree, before implementing another run here: its in-progress edits would be counted by the new run's checks.";

const COMMANDS = {
  start: { value: ["--id", "--request", "--request-file", "--title", "--domain"] },
  list: {},
  select: { boolean: ["--none"], id: "optional" },
  inspect: { id: "optional" },
  frame: { value: ["--goal", "--scope", "--no-checks-reason", "--brief-file", "--wait", "--expect-revision"], repeat: ["--accept", "--check"], boolean: ["--require-confirmation"], id: "optional" },
  resolve: { value: ["--answer", "--answer-file", "--extend-budget", "--expect-revision"], boolean: ["--confirmed"], id: "optional" },
  pivot: { value: ["--reason", "--scope", "--expect-revision"], id: "optional" },
  check: { value: ["--cmd", "--timeout", "--expect-revision"], id: "optional" },
  submit: { value: ["--summary", "--timeout", "--expect-revision"], id: "optional" },
  verify: { value: ["--reviewer", "--result-file", "--findings-file", "--summary", "--expect-revision"], repeat: ["--result"], id: "optional" },
  close: { value: ["--reason", "--expect-revision"], boolean: ["--abort"], id: "optional" }
};

const stamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const fail = (code, message, extra = {}) => ({ ok: false, code, message, ...extra });
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const matrixRoot = (cwd) => path.join(cwd, ".matrix");
const runDirectory = (cwd, id) => path.join(matrixRoot(cwd), "runs", id);
const archiveDirectory = (cwd, id) => path.join(matrixRoot(cwd), "archive", "runs", id);
const leaseFile = (cwd) => path.join(matrixRoot(cwd), "current-run.json");
const exists = (file) => fs.existsSync(file);
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } };
const positive = (value, fallback) => { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback; };
const trimmed = (value, limit, label) => {
  const text = (value ?? "").trim();
  if (text.length > limit) return { error: fail("INVALID_INTENT", `${label} exceeds ${limit} characters; pass it through a file option instead.`) };
  return { text };
};
const sameSet = (left, right) => left.length === right.length && left.every((item, index) => item === right[index]);
const budgetView = (state) => ({
  iteration: state.iteration, max_iterations: state.budget.max_iterations,
  submit_failures: state.submit_failures, max_submit_failures: state.budget.max_submit_failures,
  stagnation_count: state.budget.stagnation_count, max_stagnation: state.budget.max_stagnation,
  verifier_attempt: state.verifier_attempt, max_verifier_attempts: state.budget.max_verifier_attempts
});

// A run id becomes a directory name, so it is validated before it is ever joined into a path.
function loadRun(cwd, id) {
  if (!RUN_ID.test(id ?? "")) return { error: fail("INVALID_RUN_ID", "Run id must be lowercase kebab-case.") };
  for (const archived of [false, true]) {
    const dir = archived ? archiveDirectory(cwd, id) : runDirectory(cwd, id);
    const state = readJson(path.join(dir, "state.json"));
    if (state?.schema === RUN_SCHEMA && state.run_id === id && Number.isInteger(state.revision) && PHASES.includes(state.phase)) return { state, dir, archived };
  }
  return { error: fail("RUN_NOT_FOUND", `No Matrix run named ${id}.`) };
}

function listRuns(cwd) {
  const root = path.join(matrixRoot(cwd), "runs");
  const names = exists(root) ? fs.readdirSync(root).sort() : [];
  const holder = leaseHolder(cwd);
  return names.flatMap((name) => {
    const loaded = loadRun(cwd, name);
    return loaded.error ? [] : [{ run_id: name, title: loaded.state.title, phase: loaded.state.phase, status: loaded.state.status, revision: loaded.state.revision, iteration: loaded.state.iteration, lease: holder === name, updated_at: loaded.state.updated_at }];
  });
}

export function leaseHolder(cwd) {
  const lease = readJson(leaseFile(cwd));
  return RUN_ID.test(lease?.run_id ?? "") ? lease.run_id : null;
}

function leaseOperation(cwd, runId) {
  return workflowWriteOperation(cwd, leaseFile(cwd), json({ schema: LEASE_SCHEMA, run_id: runId, updated_at: stamp() }));
}

function eventLine(event, revision, details = {}) {
  return `${JSON.stringify({ schema: EVENT_SCHEMA, at: stamp(), event, revision, ...details })}\n`;
}

function eventOperation(cwd, dir, event, revision, details) {
  const file = path.join(dir, "events.jsonl");
  return workflowWriteOperation(cwd, file, `${exists(file) ? fs.readFileSync(file, "utf8") : ""}${eventLine(event, revision, details)}`);
}

function commit(cwd, run, next, { kind, event, details = {}, operations = [] }) {
  next.updated_at = stamp();
  return runWorkflowTransaction({
    cwd, kind, changeId: run.state.run_id,
    operations: [workflowWriteOperation(cwd, path.join(run.dir, "state.json"), json(next)), eventOperation(cwd, run.dir, event, next.revision, details), ...operations],
    result: { ok: true, code: "OK" }
  });
}

// Every Run command returns the exact next invocation, so the Agent never has to guess
// Runtime syntax or the current revision.
function continuation(cwd, state, command) {
  const revision = `--expect-revision ${state.revision}`;
  let next = null;
  if (state.status === "await-user") {
    const kind = state.wait?.kind ?? "confirmation";
    next = ["run resolve", kind === "question" || kind === "blocked" ? `--answer "<answer>"` : "--confirmed", ...(kind === "budget" ? ["--extend-budget <n>"] : []), revision].join(" ");
  } else if (state.phase === "understand") next = `run frame --goal "<goal>" --accept "A1=<acceptance>" ${revision}`;
  else if (state.phase === "execute") next = `run submit --summary "<summary>" ${revision}`;
  else if (state.phase === "verify") next = `run verify --reviewer <self|subagent|external> --result "A1=<passed|failed|blocked>" ${revision}`;
  else if (state.phase === "close") next = `run close ${revision}`;
  return { lease: leaseHolder(cwd) === state.run_id, budget: budgetView(state), next_args: next, next_command: next ? command(next) : null };
}

const reply = (cwd, run, payload, command) => ({
  ok: true, code: "OK", ...payload, run_id: run.state.run_id, phase: run.state.phase, status: run.state.status, revision: run.state.revision,
  continuation: continuation(cwd, run.state, command)
});

function parseArguments(name, args) {
  const spec = COMMANDS[name];
  const flags = {};
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token.startsWith("--")) {
      const equals = token.indexOf("=");
      const key = equals > 2 ? token.slice(0, equals) : token;
      const inline = equals > 2 ? token.slice(equals + 1) : undefined;
      if (spec.repeat?.includes(key)) {
        const value = inline ?? args[++index];
        if (!value) return fail("INVALID_INTENT", `${key} requires a value.`);
        (flags[key] ??= []).push(value);
      } else if (spec.value?.includes(key)) {
        const value = inline ?? args[++index];
        if (!value || value.startsWith("--")) return fail("INVALID_INTENT", `${key} requires a value.`);
        flags[key] = value;
      } else if (spec.boolean?.includes(key)) flags[key] = true;
      else return fail("INVALID_INTENT", `Unknown option for run ${name}: ${key}`);
    } else {
      if (spec.id !== "optional" || positional.length) return fail("INVALID_INTENT", `Unexpected argument for run ${name}: ${token}`);
      positional.push(token);
    }
  }
  return { flags, id: positional[0] ?? null };
}

function textInput(cwd, flags, name) {
  if (flags[name] != null) return { text: flags[name] };
  if (flags[`${name}-file`] == null) return { error: fail("INVALID_INTENT", `${name} or ${name}-file is required.`) };
  return readTextFile(path.resolve(cwd, flags[`${name}-file`]));
}

function readTextFile(file) {
  let stat;
  try { stat = fs.statSync(file); }
  catch { return { error: fail("INPUT_UNREADABLE", `Cannot read ${file}.`) }; }
  if (!stat.isFile() || stat.size > TEXT_LIMIT) return { error: fail("INPUT_UNREADABLE", `${file} must be a file of at most ${TEXT_LIMIT} bytes.`) };
  return { text: fs.readFileSync(file, "utf8") };
}

function sanitizeId(raw) {
  const value = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64).replace(/-$/, "");
  if (!value) return { error: fail("INVALID_RUN_ID", "Run id must contain letters or digits.") };
  if (RESERVED_NAME.test(value)) return { error: fail("INVALID_RUN_ID", `Run id ${value} is a reserved device name on Windows.`) };
  return { value };
}

function uniqueRunId(cwd, id) {
  const taken = new Set(["runs", path.join("archive", "runs")].flatMap((relative) => {
    const directory = path.join(matrixRoot(cwd), relative);
    return exists(directory) ? fs.readdirSync(directory).map((name) => name.toLowerCase()) : [];
  }));
  if (!taken.has(id)) return id;
  for (let serial = 2; ; serial += 1) {
    const suffix = `-${serial}`;
    const candidate = `${id.slice(0, 64 - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function automaticId(text) {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const slug = (text.match(/[A-Za-z0-9]+/g) ?? []).slice(0, 4).join("-").toLowerCase() || "run";
  return sanitizeId(`${date}-${slug}`);
}

function parseLabeled(items, prefix, label) {
  const entries = [];
  for (const item of items) {
    const match = new RegExp(`^(${prefix}[1-9]\\d*)=([\\s\\S]+)$`).exec(item);
    const id = match ? match[1] : `${prefix}${entries.length + 1}`;
    const text = (match ? match[2] : item).trim();
    if (!text) return { error: fail("INVALID_INTENT", `${label} text must not be empty.`) };
    if (text.length > ITEM_LIMIT) return { error: fail("INVALID_INTENT", `${label} ${id} exceeds ${ITEM_LIMIT} characters.`) };
    if (entries.some((entry) => entry.id === id)) return { error: fail("INVALID_INTENT", `Duplicate ${label} id ${id}.`) };
    entries.push({ id, text });
  }
  return { entries };
}

// A redacted command cannot be executed again on the next iteration, so a command that
// carries a literal credential is refused instead: the Agent must read it from the environment.
const SECRET_PATTERNS = [
  /\bbearer\s+([^\s"']+)/i,
  /--?(?:token|password|passwd|secret|api[-_]?key|apikey|access[-_]?key)["']?\s*[=:]\s*["']?([^\s"']+)/i,
  /\w[\w+.-]*:\/\/[^/\s:@]+:([^/\s@]+)@/,
  /\b[A-Z][A-Z0-9_]*(?:TOKEN|PASSWORD|PASSWD|SECRET|KEY)=([^\s]+)/,
  /\b(?:token|password|passwd|secret)\s*[=:]\s*["']?([^\s"']+)/i
];
const PLACEHOLDER = /^(?:[$%<{]|process\.env\.|os\.environ|env\.|x{3,}$|\*{3,}$|\.{3,}$|your[-_])/i;
export function credentialIn(command) {
  for (const pattern of SECRET_PATTERNS) {
    const match = pattern.exec(command);
    if (match && !PLACEHOLDER.test(match[1])) return match[0];
  }
  return null;
}

function gitBytes(cwd, args) {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "buffer", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return result.error || result.status !== 0 ? null : result.stdout;
}

function dirtyWorktree(cwd) {
  const status = gitBytes(cwd, ["status", "--porcelain", "--untracked-files=normal"]);
  if (status === null) return false;
  return status.toString("utf8").split("\n").some((line) => {
    if (!line.trim()) return false;
    const subject = line.slice(3);
    return !(subject.includes(" -> ") ? subject.slice(subject.indexOf(" -> ") + 4) : subject).replaceAll("\\", "/").startsWith(MANAGED_PREFIX);
  });
}

// A cheap change detector, not a whole-tree hash: the HEAD commit, the diff against it,
// and the size/mtime of untracked files, all outside `.matrix/`. It proves the candidate
// that passed `run submit` is still the candidate that gets verified and archived.
export function worktreeFingerprint(cwd) {
  if (gitBytes(cwd, ["rev-parse", "--git-dir"]) === null) return null;
  const head = gitBytes(cwd, ["rev-parse", "--verify", "HEAD^{commit}"]);
  const diff = gitBytes(cwd, ["diff", ...(head ? ["HEAD"] : ["--cached"]), "--binary", "--", ".", ":(exclude).matrix"]);
  const hash = crypto.createHash("sha256").update("matrix/worktree-fingerprint/v1\0").update(head ?? "unborn").update(diff ?? "diff-unavailable");
  const others = gitBytes(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]);
  if (others) for (const relative of others.toString("utf8").split("\0").filter((item) => item && !item.startsWith(MANAGED_PREFIX))) {
    let facts = "missing";
    try { const stat = fs.statSync(path.join(cwd, relative)); facts = `${stat.size}:${Math.floor(stat.mtimeMs)}`; } catch {}
    hash.update(`${relative}\0${facts}\0`);
  }
  return `sha256:${hash.digest("hex")}`;
}

function killTree(child) {
  if (child.pid == null || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    // `shell: true` spawns cmd.exe; killing it alone leaves grandchildren alive holding file handles.
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    return;
  }
  try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
  setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 2000).unref();
}

// Streams stdout/stderr to a bounded log. Output volume never decides the outcome: past
// the limit the streams keep being drained, the head is kept and the tail is appended.
function executeCheck({ cwd, directory, cmd, id, sequence, timeoutMs }) {
  const logFile = path.join(directory, "logs", `${id}-r${sequence}.log`);
  return new Promise((resolve) => {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    const log = fs.createWriteStream(logFile);
    const headLimit = LOG_LIMIT_BYTES - LOG_TAIL_BYTES;
    const startedAt = Date.now();
    const tail = [];
    let tailBytes = 0;
    let written = 0;
    let truncated = false;
    let logError = null;
    let timedOut = false;
    let spawnError = null;
    let settled = false;
    log.on("error", (error) => { logError = error; });
    const child = spawn(cmd, { cwd, shell: true, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeoutMs);
    const absorb = (chunk) => {
      const room = headLimit - written;
      if (room > 0) { const accepted = chunk.subarray(0, room); log.write(accepted); written += accepted.length; }
      if (room < chunk.length) truncated = true;
      tail.push(chunk);
      tailBytes += chunk.length;
      while (tail.length > 1 && tailBytes - tail[0].length >= LOG_TAIL_BYTES) tailBytes -= tail.shift().length;
    };
    child.stdout.on("data", absorb);
    child.stderr.on("data", absorb);
    child.on("error", (error) => { spawnError = error; setTimeout(() => finish(null), 5000).unref(); });
    child.on("close", finish);
    function finish(code) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const tailText = Buffer.concat(tail).toString("utf8");
      if (truncated) log.write(`\n\n[... output truncated; tail follows ...]\n\n${tailText.slice(-32000)}`);
      log.end(() => resolve({
        id, iteration: 0, cmd, cwd: ".", duration_ms: Date.now() - startedAt,
        status: timedOut ? "timed_out" : spawnError || logError || code === null ? "interrupted" : code === 0 ? "passed" : "failed",
        exit_code: code, timed_out: timedOut, interrupted: timedOut || spawnError != null || logError != null || code === null,
        log_ref: path.relative(cwd, logFile).replaceAll("\\", "/"), log_truncated: truncated,
        error: spawnError?.message ?? logError?.message ?? null, tail: tailText.slice(-2048)
      }));
    }
  });
}

function recordResult(result, iteration) {
  const { tail, error, ...record } = result;
  return { ...record, iteration, at: stamp(), ...(error ? { error } : {}) };
}

function renderVerification(state) {
  const verification = state.verification;
  const cell = (value) => String(value ?? "").replaceAll("\n", " ").replaceAll("|", "\\|");
  const latest = state.required_checks.flatMap((check) => check.results.length ? [check.results.at(-1)] : []);
  return [
    `# Verification: ${state.run_id}`, "",
    `- Status: ${state.status}`, `- Phase: ${state.phase}`, `- Iteration: ${state.iteration}`,
    `- Reviewer: ${verification?.reviewer ?? "none"} (declared by the executing agent; it is a provenance label, not a trusted proof)`,
    `- Verdict: ${verification?.verdict ?? "pending"}`, `- Generated: ${state.updated_at}`, "",
    "## Goal", "", state.goal ?? "_not framed_", "",
    "## Acceptance", "", "| ID | Result | Reason |", "| --- | --- | --- |",
    ...state.acceptance.map((item) => `| ${item.id} | ${item.result} | ${cell(item.reason)} |`), "",
    "## Checks", "",
    ...(state.required_checks.length
      ? ["| ID | Command | Status | Exit | Duration (ms) | Log |", "| --- | --- | --- | --- | --- | --- |", ...latest.map((item) => `| ${item.id} | ${cell(item.cmd)} | ${item.status} | ${item.exit_code ?? "n/a"} | ${item.duration_ms} | ${item.log_ref} |`)]
      : [`_No runtime checks: ${cell(state.no_checks_reason ?? "none declared")}._`]), "",
    "## Findings", "", ...(verification?.findings?.length ? verification.findings.map((item) => `- ${cell(item)}`) : ["_none_"]), "",
    "## Summary", "", verification?.summary ?? "_none_", ""
  ].join("\n");
}

function verificationOperation(cwd, run, state) {
  return workflowWriteOperation(cwd, path.join(run.dir, "verification.md"), renderVerification(state));
}

async function leaseSwitchWarnings(cwd, previous) {
  if (!previous) return [];
  const loaded = loadRun(cwd, previous);
  if (loaded.error || loaded.archived || loaded.state.status !== "active" || loaded.state.phase !== "execute") return [];
  return dirtyWorktree(cwd) ? ["WORKTREE_DIRTY_ON_LEASE_SWITCH"] : [];
}

function locate(cwd, id) {
  const target = id ?? leaseHolder(cwd);
  if (!target) return { error: fail("NO_CURRENT_RUN", "No Matrix run holds the workspace lease. Start one with run start or select one with run select.") };
  const loaded = loadRun(cwd, target);
  if (loaded.error) return loaded;
  if (loaded.archived) return { error: fail("RUN_ARCHIVED", `Run ${target} is archived and read-only.`) };
  return loaded;
}

function guard(cwd, run, flags, command) {
  const base = { run_id: run.state.run_id, revision: run.state.revision, continuation: continuation(cwd, run.state, command) };
  if (leaseHolder(cwd) !== run.state.run_id) return fail("LEASE_NOT_HELD", `Run ${run.state.run_id} does not hold the workspace lease. Run "run select ${run.state.run_id}" first.`, base);
  const expected = Number(flags["--expect-revision"]);
  if (flags["--expect-revision"] == null || !Number.isInteger(expected)) return fail("REVISION_REQUIRED", `Pass --expect-revision ${run.state.revision}; "run inspect" always reports the current revision.`, base);
  if (expected !== run.state.revision) return fail("REVISION_MISMATCH", `Run ${run.state.run_id} is at revision ${run.state.revision}, not ${expected}. Rerun "run inspect" before retrying.`, base);
  return null;
}

async function start({ flags }, { cwd, command }) {
  const request = textInput(cwd, flags, "--request");
  if (request.error) return request.error;
  if (!request.text.trim()) return fail("INVALID_INTENT", "run start requires a non-empty request.");
  const id = flags["--id"] != null ? sanitizeId(flags["--id"]) : automaticId(flags["--title"] ?? request.text);
  const title = trimmed(flags["--title"], 200, "title");
  if (id.error) return id.error;
  if (title.error) return title.error;
  const runId = uniqueRunId(cwd, id.value);
  const warnings = await leaseSwitchWarnings(cwd, leaseHolder(cwd));
  const now = stamp();
  const state = {
    schema: RUN_SCHEMA, run_id: runId, title: title.text || null, domain: (flags["--domain"] ?? "").trim() || null,
    phase: "understand", status: "active", revision: 1, iteration: 0, submit_failures: 0, verifier_attempt: 0,
    raw_request: request.text, goal: null, scope: null, acceptance: [], required_checks: [], no_checks_reason: null, exploratory_checks: [],
    wait: null, budget: { ...resolveWorkflowConfig(cwd).limits, stagnation_count: 0, last_unresolved_ids: [] },
    candidate: null, verification: null, created_at: now, updated_at: now
  };
  const dir = runDirectory(cwd, runId);
  const gitignoreOperation = managedGitignoreOperation(cwd);
  const outcome = runWorkflowTransaction({
    cwd, kind: "run-start", changeId: runId,
    operations: [
      workflowMkdirOperation(cwd, dir),
      workflowWriteOperation(cwd, path.join(dir, "state.json"), json(state)),
      workflowWriteOperation(cwd, path.join(dir, "events.jsonl"), eventLine("started", 1)),
      ...(gitignoreOperation ? [gitignoreOperation] : []),
      leaseOperation(cwd, runId)
    ],
    result: { ok: true, code: "OK" }
  });
  if (!outcome.ok) return outcome;
  return reply(cwd, { state, dir, archived: false }, { transaction_id: outcome.transaction_id, warnings }, command);
}

async function select({ flags, id }, { cwd, command }) {
  const previous = leaseHolder(cwd);
  let next = null;
  if (flags["--none"]) {
    if (id) return fail("INVALID_INTENT", "run select accepts a run id or --none, not both.");
  } else {
    if (!id) return fail("INVALID_INTENT", "run select requires a run id or --none.");
    const loaded = loadRun(cwd, id);
    if (loaded.error) return loaded.error;
    if (loaded.archived) return fail("RUN_ARCHIVED", `Run ${id} is archived and read-only.`);
    next = loaded;
  }
  const warnings = next && next.state.run_id !== previous ? await leaseSwitchWarnings(cwd, previous) : [];
  const outcome = runWorkflowTransaction({ cwd, kind: "run-select", changeId: next?.state.run_id ?? null, operations: [leaseOperation(cwd, next?.state.run_id ?? null)], result: { ok: true, code: "OK" } });
  if (!outcome.ok) return outcome;
  if (!next) return { ok: true, code: "OK", current: null, transaction_id: outcome.transaction_id, runs: listRuns(cwd), continuation: { lease: false, budget: null, next_args: null, next_command: null } };
  return reply(cwd, next, { transaction_id: outcome.transaction_id, warnings }, command);
}

function runView(cwd, run, command) {
  const state = run.state;
  return {
    ok: true, code: "OK",
    run: {
      run_id: state.run_id, title: state.title, domain: state.domain, phase: state.phase, status: state.status, revision: state.revision,
      iteration: state.iteration, archived: run.archived, lease: !run.archived && leaseHolder(cwd) === state.run_id,
      raw_request: state.raw_request, goal: state.goal, scope: state.scope, acceptance: state.acceptance,
      checks: state.required_checks.map((check) => ({ id: check.id, cmd: check.cmd, latest: check.results.at(-1) ?? null })),
      no_checks_reason: state.no_checks_reason, exploratory_checks: state.exploratory_checks.length, wait: state.wait, budget: budgetView(state),
      verification: state.verification ? { reviewer: state.verification.reviewer, verdict: state.verification.verdict, summary: state.verification.summary } : null,
      created_at: state.created_at, updated_at: state.updated_at
    },
    continuation: run.archived ? null : continuation(cwd, state, command)
  };
}

async function inspect({ id }, { cwd, command }) {
  const located = locate(cwd, id);
  const config = resolveWorkflowConfig(cwd);
  const runs = listRuns(cwd);
  if (located.error) return { ...located.error, runs };
  return { ...runView(cwd, located, command), runs, default_workflow: config.default_workflow, autonomy_level: config.autonomy_level };
}

async function frame({ flags, id }, { cwd, command }) {
  const located = locate(cwd, id);
  if (located.error) return located.error;
  const run = located;
  const denied = guard(cwd, run, flags, command);
  if (denied) return denied;
  const state = run.state;
  if (state.status !== "active") return fail("ILLEGAL_PHASE", `Run ${state.run_id} is ${state.status}; resolve it with run resolve first.`, { continuation: continuation(cwd, state, command) });
  const goal = trimmed(flags["--goal"], ITEM_LIMIT, "goal");
  if (flags["--goal"] == null) return fail("INVALID_INTENT", "run frame requires --goal.");
  if (goal.error) return goal.error;
  if (!goal.text) return fail("INVALID_INTENT", "run frame requires a non-empty --goal.");
  const scope = trimmed(flags["--scope"], ITEM_LIMIT, "scope");
  if (scope.error) return scope.error;
  const acceptance = parseLabeled(flags["--accept"] ?? [], "A", "acceptance");
  if (acceptance.error) return acceptance.error;
  if (!(flags["--accept"] ?? []).length) return fail("INVALID_INTENT", "run frame requires at least one --accept \"A1=<text>\".");
  const checks = parseLabeled(flags["--check"] ?? [], "C", "check");
  if (checks.error) return checks.error;
  const noChecksReason = flags["--no-checks-reason"]?.trim() || null;
  if (checks.entries.length && noChecksReason) return fail("INVALID_INTENT", "Pass either --check or --no-checks-reason, not both.");
  if (!checks.entries.length && !noChecksReason) return fail("CHECKS_REQUIRED", "Declare at least one --check \"C1=<command>\", or --no-checks-reason when the task has no executable check.");
  for (const check of checks.entries) {
    const credential = credentialIn(check.text);
    if (credential) return fail("CHECK_COMMAND_CREDENTIAL", `Check ${check.id} contains a literal credential (${credential}). Read it from an environment variable instead; Matrix never writes credentials into state.json.`);
  }
  const question = trimmed(flags["--wait"], ITEM_LIMIT, "--wait");
  if (question.error) return question.error;
  const brief = flags["--brief-file"] != null ? readTextFile(path.resolve(cwd, flags["--brief-file"])) : null;
  if (brief?.error) return brief.error;
  const reframe = state.phase !== "understand";
  const autonomy = resolveWorkflowConfig(cwd).autonomy_level;
  const awaits = reframe || Boolean(flags["--require-confirmation"]) || Boolean(question.text) || autonomy === "strict";
  const next = structuredClone(state);
  next.goal = goal.text;
  next.scope = scope.text || null;
  next.acceptance = acceptance.entries.map((item) => ({ ...item, result: "pending", reason: null }));
  next.required_checks = checks.entries.map((item) => ({ id: item.id, cmd: item.text, results: [] }));
  next.no_checks_reason = noChecksReason;
  next.wait = awaits ? { kind: question.text ? "question" : "confirmation", question: question.text || "Confirm the goal, acceptance items, and checks before execution.", since: stamp() } : null;
  next.phase = awaits ? "understand" : "execute";
  next.status = awaits ? "await-user" : "active";
  // A new frame is a new goal cycle: earlier iterations and conclusions no longer apply.
  next.iteration = 0;
  next.submit_failures = 0;
  next.verifier_attempt = 0;
  next.budget.stagnation_count = 0;
  next.budget.last_unresolved_ids = [];
  next.candidate = null;
  next.verification = null;
  next.revision += 1;
  const echo = { goal: next.goal, scope: next.scope, acceptance: next.acceptance.map(({ id: item, text }) => ({ id: item, text })), checks: next.required_checks.map(({ id: item, cmd }) => ({ id: item, cmd })), no_checks_reason: next.no_checks_reason };
  const outcome = commit(cwd, run, next, {
    kind: "run-frame", event: "framed", details: { acceptance: next.acceptance.map((item) => item.id), checks: next.required_checks.map((item) => item.id), awaits, reframe },
    operations: brief ? [workflowWriteOperation(cwd, path.join(run.dir, "brief.md"), brief.text)] : []
  });
  if (!outcome.ok) return outcome;
  return reply(cwd, { state: next, dir: run.dir, archived: false }, { code: awaits ? "AWAIT_USER" : "OK", transaction_id: outcome.transaction_id, frame: echo, user_echo_required: !awaits }, command);
}

async function resolve({ flags, id }, { cwd, command }) {
  const located = locate(cwd, id);
  if (located.error) return located.error;
  const run = located;
  const denied = guard(cwd, run, flags, command);
  if (denied) return denied;
  const state = run.state;
  if (state.status !== "await-user" || !state.wait) return fail("ILLEGAL_PHASE", `Run ${state.run_id} is not waiting for the user.`, { continuation: continuation(cwd, state, command) });
  const kind = state.wait.kind;
  const answer = kind === "question" || kind === "blocked" ? textInput(cwd, flags, "--answer") : null;
  if (answer?.error) return answer.error;
  if (kind === "question" && !answer.text.trim()) return fail("INVALID_INTENT", "This wait needs the user's answer: pass --answer \"<text>\" or --answer-file <path>.");
  if ((kind === "confirmation" || kind === "verifier-attempts") && !flags["--confirmed"]) return fail("CONFIRMATION_REQUIRED", `Present the pending ${kind === "confirmation" ? "goal and acceptance" : "verifier failure"} to the user, then rerun with --confirmed.`, { continuation: continuation(cwd, state, command) });
  const extension = flags["--extend-budget"] != null ? Number(flags["--extend-budget"]) : 0;
  if (!Number.isInteger(extension) || extension < 0 || extension > 100) return fail("INVALID_INTENT", "--extend-budget must be an integer from 0 to 100.");
  if (kind === "budget" && state.wait.reason === "max-iterations" && extension < 1) return fail("BUDGET_EXTENSION_REQUIRED", "The iteration budget is exhausted; pass --extend-budget <n> to add iterations.", { continuation: continuation(cwd, state, command) });
  const next = structuredClone(state);
  next.status = "active";
  next.phase = "execute";
  next.wait = null;
  next.budget.max_iterations += extension;
  next.budget.stagnation_count = 0;
  next.budget.last_unresolved_ids = [];
  next.submit_failures = 0;
  next.verifier_attempt = 0;
  next.revision += 1;
  const outcome = commit(cwd, run, next, { kind: "run-resolve", event: "resolved", details: { kind, ...(answer?.text ? { answer: answer.text } : {}), extend_budget: extension } });
  if (!outcome.ok) return outcome;
  return reply(cwd, { state: next, dir: run.dir, archived: false }, { transaction_id: outcome.transaction_id }, command);
}

async function pivot({ flags, id }, { cwd, command }) {
  const located = locate(cwd, id);
  if (located.error) return located.error;
  const run = located;
  const denied = guard(cwd, run, flags, command);
  if (denied) return denied;
  const state = run.state;
  if (state.status !== "active" || !["execute", "verify"].includes(state.phase)) return fail("ILLEGAL_PHASE", "run pivot records an approach change inside execute or verify.", { continuation: continuation(cwd, state, command) });
  const reason = trimmed(flags["--reason"], ITEM_LIMIT, "--reason");
  if (flags["--reason"] == null) return fail("INVALID_INTENT", "run pivot requires --reason.");
  if (reason.error) return reason.error;
  if (!reason.text) return fail("INVALID_INTENT", "run pivot requires a non-empty --reason.");
  const scope = trimmed(flags["--scope"], ITEM_LIMIT, "scope");
  if (scope.error) return scope.error;
  const next = structuredClone(state);
  next.phase = "execute";
  next.scope = scope.text || next.scope;
  next.candidate = null;
  next.verification = null;
  next.revision += 1;
  const outcome = commit(cwd, run, next, { kind: "run-pivot", event: "pivoted", details: { reason: reason.text } });
  if (!outcome.ok) return outcome;
  return reply(cwd, { state: next, dir: run.dir, archived: false }, { transaction_id: outcome.transaction_id }, command);
}

async function check({ flags, id }, { cwd, command }) {
  const located = locate(cwd, id);
  if (located.error) return located.error;
  const run = located;
  const denied = guard(cwd, run, flags, command);
  if (denied) return denied;
  const state = run.state;
  if (state.status !== "active") return fail("ILLEGAL_PHASE", `Run ${state.run_id} is ${state.status}; resolve it first.`, { continuation: continuation(cwd, state, command) });
  const cmd = flags["--cmd"]?.trim();
  if (!cmd) return fail("INVALID_INTENT", "run check requires --cmd.");
  const credential = credentialIn(cmd);
  if (credential) return fail("CHECK_COMMAND_CREDENTIAL", `This command contains a literal credential (${credential}). Read it from an environment variable instead.`);
  const result = await executeCheck({ cwd, directory: run.dir, cmd, id: "x", sequence: state.exploratory_checks.length + 1, timeoutMs: positive(flags["--timeout"], state.budget.check_timeout_ms) });
  const next = structuredClone(state);
  next.exploratory_checks = [...next.exploratory_checks, recordResult(result, state.iteration)].slice(-EXPLORATORY_LIMIT);
  next.revision += 1;
  const outcome = commit(cwd, run, next, { kind: "run-check", event: "check-recorded", details: { status: result.status, exit_code: result.exit_code } });
  if (!outcome.ok) return outcome;
  return reply(cwd, { state: next, dir: run.dir, archived: false }, { transaction_id: outcome.transaction_id, check: result }, command);
}

async function submit({ flags, id }, { cwd, command }) {
  const located = locate(cwd, id);
  if (located.error) return located.error;
  const run = located;
  const denied = guard(cwd, run, flags, command);
  if (denied) return denied;
  const state = run.state;
  if (state.status !== "active" || state.phase !== "execute") return fail("ILLEGAL_PHASE", `run submit requires an active run in execute; this run is ${state.status} in ${state.phase}.`, { continuation: continuation(cwd, state, command) });
  const summary = trimmed(flags["--summary"], SUMMARY_LIMIT, "summary");
  if (flags["--summary"] == null) return fail("INVALID_INTENT", "run submit requires --summary.");
  if (summary.error) return summary.error;
  if (!summary.text) return fail("INVALID_INTENT", "run submit requires a non-empty --summary.");
  // Checks run outside the transaction lock; the guarded revision is re-checked afterwards
  // so a slow command can never overwrite a concurrent mutation.
  const timeoutMs = positive(flags["--timeout"], state.budget.check_timeout_ms);
  const results = [];
  for (const required of state.required_checks) results.push(await executeCheck({ cwd, directory: run.dir, cmd: required.cmd, id: required.id, sequence: required.results.length + 1, timeoutMs }));
  const current = readJson(path.join(run.dir, "state.json"));
  if (current?.revision !== state.revision) return fail("REVISION_MISMATCH", `Run ${state.run_id} changed while its checks were running; rerun "run inspect".`, { continuation: continuation(cwd, current ?? state, command) });
  const iteration = state.iteration + 1;
  const recorded = results.map((result) => recordResult(result, iteration));
  const warnings = [];
  if (!recorded.length && dirtyWorktree(cwd)) warnings.push("CODE_CHANGED_WITHOUT_CHECKS");
  const failed = recorded.filter((result) => result.status !== "passed");
  const next = structuredClone(state);
  next.required_checks.forEach((required, index) => { if (recorded[index]) required.results.push(recorded[index]); });
  next.revision += 1;
  let code = "OK";
  let event = "submitted";
  if (failed.length) {
    next.submit_failures += 1;
    if (next.submit_failures >= next.budget.max_submit_failures) {
      next.status = "await-user";
      next.wait = { kind: "budget", reason: "submit-failures", question: `The declared checks failed ${next.submit_failures} submissions in a row. Review the approach with the user, or extend the budget to continue.`, since: stamp() };
      code = "AWAIT_USER";
    } else code = "CHECKS_FAILED";
  } else {
    next.iteration = iteration;
    next.submit_failures = 0;
    next.phase = "verify";
    next.candidate = { summary: summary.text, at: stamp(), diff_fingerprint: worktreeFingerprint(cwd) };
  }
  const outcome = commit(cwd, run, next, {
    kind: "run-submit", event, details: { summary: summary.text, iteration, checks: recorded.map(({ tail, error, ...result }) => result), failed: failed.map((result) => result.id), warnings }
  });
  if (!outcome.ok) return outcome;
  return reply(cwd, { state: next, dir: run.dir, archived: false }, { code, transaction_id: outcome.transaction_id, checks: results, warnings }, command);
}

function parseVerificationInput(flags, state) {
  let results = [];
  let findings = [];
  let summary = flags["--summary"]?.trim() || "";
  if (flags["--result-file"] != null) {
    const file = readTextFile(flags["--result-file"]);
    if (file.error) return file.error;
    let document;
    try { document = JSON.parse(file.text); } catch { return fail("VERIFY_INPUT_INVALID", "--result-file is not valid JSON."); }
    const body = Array.isArray(document) ? { results: document } : document;
    if (!body || !Array.isArray(body.results)) return fail("VERIFY_INPUT_INVALID", "--result-file must be an array of results or an object with a results array.");
    ({ results = [], findings = [], summary = "" } = body);
  } else results = (flags["--result"] ?? []).map((item) => {
    const match = /^([AC]\d+)=([^:]+)(?::([\s\S]*))?$/.exec(item);
    return match ? { id: match[1], result: match[2].trim(), reason: (match[3] ?? "").trim() } : { id: item, result: "", reason: "" };
  });
  if (flags["--findings-file"] != null) {
    const file = readTextFile(flags["--findings-file"]);
    if (file.error) return file.error;
    const lines = file.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    let parsed;
    try { parsed = file.text.trim().startsWith("[") ? JSON.parse(file.text) : lines; } catch { return fail("VERIFY_INPUT_INVALID", "--findings-file is not a JSON array or plain text."); }
    findings = [...findings, ...(Array.isArray(parsed) ? parsed : [String(parsed)])];
  }
  if (!Array.isArray(results) || !Array.isArray(findings) || typeof summary !== "string") return fail("VERIFY_INPUT_INVALID", "Results, findings, and summary have invalid types.");
  if (summary.length > SUMMARY_LIMIT) return fail("VERIFY_INPUT_INVALID", `Summary exceeds ${SUMMARY_LIMIT} characters.`);
  findings = findings.map((item) => String(item).trim()).filter(Boolean).slice(0, FINDINGS_LIMIT);
  if (findings.some((item) => item.length > ITEM_LIMIT)) return fail("VERIFY_INPUT_INVALID", `Each finding is limited to ${ITEM_LIMIT} characters.`);
  const seen = new Set();
  for (const result of results) {
    const known = state.acceptance.some((item) => item.id === result?.id);
    if (!known || seen.has(result?.id)) return fail("VERIFY_INPUT_INVALID", `Result id ${result?.id} is unknown or duplicated.`);
    seen.add(result.id);
    if (!VERDICTS.includes(result.result)) return fail("VERIFY_INPUT_INVALID", `Result for ${result.id} must be passed, failed, or blocked.`);
    if (result.result !== "passed" && !(result.reason ?? "").trim()) return fail("VERIFY_INPUT_INVALID", `A ${result.result} result for ${result.id} needs a reason.`);
  }
  const missing = state.acceptance.filter((item) => !seen.has(item.id)).map((item) => item.id);
  if (missing.length) return fail("VERIFY_INPUT_INVALID", `Verification must cover every acceptance item; missing ${missing.join(", ")}.`);
  return { ok: true, results: results.map(({ id, result: verdict, reason }) => ({ id, result: verdict, reason: (reason ?? "").trim() || null })), findings, summary };
}

async function verify({ flags, id }, { cwd, command }) {
  const located = locate(cwd, id);
  if (located.error) return located.error;
  const run = located;
  const denied = guard(cwd, run, flags, command);
  if (denied) return denied;
  const state = run.state;
  if (state.status !== "active" || state.phase !== "verify") return fail("ILLEGAL_PHASE", `run verify requires an active run in verify; this run is ${state.status} in ${state.phase}.`, { continuation: continuation(cwd, state, command) });
  const reviewer = flags["--reviewer"];
  const parsed = parseVerificationInput(flags, state);
  // Malformed or missing verifier output is an executor failure, not an implementation
  // failure: it costs an attempt and never feeds the stagnation counter.
  if (!REVIEWERS.includes(reviewer) || !parsed.ok) {
    const message = parsed.ok ? "Reviewer must be declared as self, subagent, or external." : parsed.message;
    const next = structuredClone(state);
    next.verifier_attempt += 1;
    if (next.verifier_attempt >= next.budget.max_verifier_attempts) {
      next.status = "await-user";
      next.wait = { kind: "verifier-attempts", question: `Verification produced no valid result ${next.verifier_attempt} times in a row.`, since: stamp() };
    }
    next.revision += 1;
    const outcome = commit(cwd, run, next, { kind: "run-verify-rejected", event: "verify-rejected", details: { attempt: next.verifier_attempt, message } });
    if (!outcome.ok) return outcome;
    return { ...fail("VERIFY_INPUT_INVALID", message), run_id: state.run_id, verifier_attempt: next.verifier_attempt, status: next.status, revision: next.revision, continuation: continuation(cwd, next, command) };
  }
  const next = structuredClone(state);
  const { results, findings, summary } = parsed;
  const at = stamp();
  next.acceptance = next.acceptance.map((item) => ({ ...item, ...(results.find((result) => result.id === item.id) ?? {}) }));
  next.verifier_attempt = 0;
  next.revision += 1;
  const blocked = results.filter((result) => result.result === "blocked");
  const failed = results.filter((result) => result.result === "failed");
  let code = "OK";
  if (blocked.length) {
    next.status = "await-user";
    next.wait = { kind: "blocked", question: `Acceptance ${blocked.map((result) => result.id).join(", ")} is blocked and needs a user decision.`, since: at };
    next.verification = { reviewer, verdict: "blocked", summary, findings, at, diff_fingerprint: null };
    code = "VERIFY_BLOCKED";
  } else if (failed.length) {
    const unresolved = failed.map((result) => result.id).sort();
    const stalled = sameSet(unresolved, next.budget.last_unresolved_ids);
    next.budget.stagnation_count = stalled ? next.budget.stagnation_count + 1 : 1;
    next.budget.last_unresolved_ids = unresolved;
    next.phase = "execute";
    next.candidate = null;
    next.verification = { reviewer, verdict: "failed", summary, findings, at, diff_fingerprint: null };
    const exhaustedBy = next.iteration >= next.budget.max_iterations ? "max-iterations" : next.budget.stagnation_count >= next.budget.max_stagnation ? "stagnation" : null;
    if (exhaustedBy) {
      next.status = "await-user";
      next.wait = { kind: "budget", reason: exhaustedBy, question: exhaustedBy === "max-iterations" ? `Verification failed in ${next.iteration} of ${next.budget.max_iterations} iterations.` : `The same acceptance items (${unresolved.join(", ")}) failed ${next.budget.stagnation_count} rounds in a row; a different fix hypothesis is needed.`, since: at };
      code = "AWAIT_USER";
    } else code = "VERIFY_FAILED";
  } else {
    const fingerprint = worktreeFingerprint(cwd);
    const candidate = next.candidate?.diff_fingerprint ?? null;
    if (fingerprint !== null && candidate !== null && fingerprint !== candidate) {
      next.phase = "execute";
      next.candidate = null;
      next.submit_failures += 1;
      code = "CANDIDATE_CHANGED";
      if (next.submit_failures >= next.budget.max_submit_failures) {
        next.status = "await-user";
        next.wait = { kind: "budget", reason: "submit-failures", question: "The implementation kept changing between submission and verification.", since: at };
        code = "AWAIT_USER";
      }
    } else {
      next.phase = "close";
      next.verification = { reviewer, verdict: "passed", summary, findings, at, diff_fingerprint: fingerprint };
    }
  }
  const outcome = commit(cwd, run, next, {
    kind: "run-verify", event: "verified",
    details: { reviewer, verdict: next.verification?.verdict ?? null, unresolved: [...blocked, ...failed].map((result) => result.id), iteration: next.iteration, budget_wait: next.wait?.kind === "budget" ? next.wait.reason : null },
    operations: next.verification ? [verificationOperation(cwd, run, next)] : []
  });
  if (!outcome.ok) return outcome;
  return reply(cwd, { state: next, dir: run.dir, archived: false }, { code, transaction_id: outcome.transaction_id, unresolved: [...blocked, ...failed].map(({ id: item, reason }) => ({ id: item, reason })), verification: next.verification ? `${path.relative(cwd, path.join(run.dir, "verification.md")).replaceAll("\\", "/")}` : null }, command);
}

async function close({ flags, id }, { cwd, command }) {
  const located = locate(cwd, id);
  if (located.error) return located.error;
  const run = located;
  const denied = guard(cwd, run, flags, command);
  if (denied) return denied;
  const state = structuredClone(run.state);
  const abort = Boolean(flags["--abort"]);
  const reason = trimmed(flags["--reason"], ITEM_LIMIT, "--reason");
  if (reason.error) return reason.error;
  if (abort) {
    if (!reason.text) return fail("INVALID_INTENT", "An aborted close requires --reason.");
    state.status = "aborted";
  } else {
    if (state.status !== "active" || state.phase !== "close") return fail("ILLEGAL_PHASE", `run close requires a passed verification; this run is ${state.status} in ${state.phase}.`, { continuation: continuation(cwd, state, command) });
    const fingerprint = worktreeFingerprint(cwd);
    const verified = state.verification?.diff_fingerprint ?? null;
    if (fingerprint !== null && verified !== null && fingerprint !== verified) {
      state.phase = "execute";
      state.verification = null;
      state.candidate = null;
      state.submit_failures += 1;
      state.revision += 1;
      const outcome = commit(cwd, run, state, { kind: "run-close", event: "candidate-changed", details: { reason: "worktree changed after verification" } });
      if (!outcome.ok) return outcome;
      return reply(cwd, { state, dir: run.dir, archived: false }, { code: "CANDIDATE_CHANGED", transaction_id: outcome.transaction_id }, command);
    }
    state.status = "archived";
  }
  state.revision += 1;
  const target = archiveDirectory(cwd, state.run_id);
  if (exists(target)) return fail("ARCHIVE_TARGET_EXISTS", `Archive target already exists: ${state.run_id}.`);
  // Snapshots are taken from the live directory before the move and reused as the `before`
  // state of the writes that land inside the archive.
  const before = Object.fromEntries(["state.json", "verification.md", "events.jsonl"].map((name) => [name, captureWorkflowEntry(path.join(run.dir, name))]));
  const events = path.join(run.dir, "events.jsonl");
  const eventsText = `${exists(events) ? fs.readFileSync(events, "utf8") : ""}${eventLine(abort ? "aborted" : "closed", state.revision, abort ? { reason: reason.text } : { reviewer: state.verification?.reviewer ?? null })}`;
  const archiveRuns = path.join(matrixRoot(cwd), "archive", "runs");
  const outcome = runWorkflowTransaction({
    cwd, kind: "run-close", changeId: state.run_id,
    operations: [
      ...(exists(archiveRuns) ? [] : [workflowMkdirOperation(cwd, archiveRuns)]),
      workflowMoveOperation(cwd, run.dir, target),
      workflowWriteOperation(cwd, path.join(target, "state.json"), json(state), { before: before["state.json"] }),
      workflowWriteOperation(cwd, path.join(target, "verification.md"), renderVerification(state), { before: before["verification.md"] }),
      workflowWriteOperation(cwd, path.join(target, "events.jsonl"), eventsText, { before: before["events.jsonl"] }),
      ...(leaseHolder(cwd) === state.run_id ? [leaseOperation(cwd, null)] : [])
    ],
    result: { ok: true, code: "OK" }
  });
  if (!outcome.ok) return outcome;
  return {
    ok: true, code: "OK", archived: state.run_id, status: state.status, revision: state.revision, transaction_id: outcome.transaction_id,
    archive: path.relative(cwd, target).replaceAll("\\", "/"),
    continuation: { lease: false, budget: budgetView(state), next_args: null, next_command: null }
  };
}

const HANDLERS = { start, list: async ({}, { cwd }) => ({ ok: true, code: "OK", current: leaseHolder(cwd), runs: listRuns(cwd) }), select, inspect, frame, resolve, pivot, check, submit, verify, close };
const defaultCommand = (argsText) => `node ${process.platform === "win32" ? `"${path.join(path.dirname(fileURLToPath(import.meta.url)), "matrix-runtime.mjs")}"` : `'${path.join(path.dirname(fileURLToPath(import.meta.url)), "matrix-runtime.mjs").replaceAll("'", "'\\''")}'`} ${argsText}`;

export async function invokeRun(argv, { cwd = process.cwd(), command = defaultCommand } = {}) {
  const [name, ...args] = argv;
  if (!COMMANDS[name]) return fail("INVALID_INTENT", `Unknown run command: ${name ?? ""}. Commands: ${Object.keys(COMMANDS).join(", ")}.`);
  const parsed = parseArguments(name, args);
  if (parsed.ok === false) return parsed;
  try { return await HANDLERS[name](parsed, { cwd, command }); }
  catch (error) { return fail("RUN_ENGINE_FAILED", error.message); }
}

export { loadRun as findRun, listRuns, runView };
