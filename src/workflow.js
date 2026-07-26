import fs from "node:fs";
import path from "node:path";

const PHASES = ["open", "design", "build", "verify", "archive"];
const NEXT = { open: "design", design: "build", build: "verify", verify: "archive" };
const skill = (phase) => `$matrix-${phase}`;
const stamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const rootFor = (cwd) => path.join(cwd, ".matrix");
const exists = (file) => fs.existsSync(file);
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

function fail(code, message) { return { ok: false, code, message }; }
function taskContent(change, taskId, proposal, design, plan, resultPath) {
  return `# Claude Code task: ${taskId}\n\n## Metadata\n\n| Field | Value |\n| --- | --- |\n| Status | CLAUDE_QUEUED |\n| Matrix change | ${change} |\n| Decision owner | Codex |\n| Implementation actor | Claude Code |\n| Result | ${resultPath} |\n\n## Objective\n\nThe frozen Matrix artifacts below are authoritative. Do not expand their scope.\n\n## Proposal\n\n${proposal}\n\n## Frozen design\n\n${design}\n\n## Ordered plan\n\n${plan}\n\n## Allowed work\n\n- Read repository instructions and existing tests before implementing.\n- Change only files required by the frozen design and plan.\n- Run every validation command specified by the plan.\n\n## Prohibited work\n\n- Do not edit Matrix state, transition its phase, archive it, or alter the frozen design.\n- Do not add unrelated features, public APIs, dependencies, or external side effects.\n- Do not claim completion without recording verifiable evidence.\n\n## Stop and report\n\nStop with \`NEEDS_DECISION\` if the scope must expand, the design conflicts with the repository, validation cannot pass within scope, or an authorization/safety issue arises.\n\n## Required result\n\nCreate \`${resultPath}\` with metadata, changed files and reasons, commands and outcomes, test results, boundary confirmation, residual risks, and any \`NEEDS_DECISION\` items. Codex reviews the result and the actual diff.\n`;
}
function activeBoard(taskId, taskPath, resultPath, change) {
  return `# Active task board\n\n## Current objective\n\n| Field | Value |\n| --- | --- |\n| ID | ${taskId} |\n| Status | CLAUDE_QUEUED |\n| Matrix change | ${change} |\n| Task | ${taskPath} |\n| Result | ${resultPath} |\n`;
}
function paths(cwd, id) { const root = rootFor(cwd); return { root, active: path.join(root, "active.json"), change: path.join(root, "changes", id), flow: path.join(root, "changes", id, "matrix.json"), legacyFlow: path.join(root, "changes", id, "matrix.yaml"), artifacts: path.join(root, "changes", id, "artifacts") }; }
function readFlow(p) { if (fs.existsSync(p.flow)) return read(p.flow); if (!fs.existsSync(p.legacyFlow)) return null; return Object.fromEntries(fs.readFileSync(p.legacyFlow, "utf8").split(/\r?\n/).filter((line) => line.includes(":") && !line.startsWith(" ")).map((line) => { const [key, ...value] = line.split(":"); return [key.trim(), value.join(":").trim().replace(/^"|"$/g, "")]; })); }
function writeFlow(p, flow) { if (fs.existsSync(p.legacyFlow)) { const order = ["schema", "id", "workflow", "status", "phase", "title", "created_at", "updated_at", "acceptance", "scope"]; fs.writeFileSync(p.legacyFlow, `${order.map((key) => `${key}: ${flow[key] ?? ""}`).join("\n")}\n`); } else write(p.flow, flow); }
function active(cwd) { const activeFile = path.join(rootFor(cwd), "active.json"); if (!fs.existsSync(activeFile)) return null; return read(activeFile).change_id; }
function meaningful(file, headings) { if (!fs.existsSync(file)) return false; const value = fs.readFileSync(file, "utf8").trim(); return value.length >= 40 && headings.every((heading) => value.includes(heading)); }
function guard(cwd, id, phase) {
  const base = paths(cwd, id).artifacts;
  const checks = phase === "open" ? [["proposal", meaningful(path.join(base, "proposal.md"), ["## Goal", "## Scope", "## Acceptance"])]]
    : phase === "design" ? [["design", meaningful(path.join(base, "design.md"), ["## Decisions", "## Test seams"])], ["plan", meaningful(path.join(base, "plan.md"), ["## Steps", "## Validation"])]]
      : phase === "build" ? [["plan", meaningful(path.join(base, "plan.md"), ["## Steps"])], ["build evidence", meaningful(path.join(base, "verification.md"), ["## Build evidence"])]]
        : [["verification", meaningful(path.join(base, "verification.md"), ["## Test evidence", "## Review evidence"])]];
  return { pass: checks.every(([, result]) => result), checks };
}
function event(p, name, before, after) { fs.appendFileSync(path.join(p.change, "events.jsonl"), `${JSON.stringify({ at: stamp(), event: name, from: before, to: after })}\n`); }

export function invoke(argv, { cwd = process.cwd() } = {}) {
  const [command, ...args] = argv;
  if (command === "init") {
    const id = (args.shift() ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const workflow = args.includes("--workflow") ? args[args.indexOf("--workflow") + 1] : "full";
    const title = args.includes("--title") ? args[args.indexOf("--title") + 1] : null;
    if (!id || !title || !["full", "hotfix", "tweak"].includes(workflow)) return fail("INVALID_INTENT", "init requires a valid change id and --title.");
    if (active(cwd)) return fail("ACTIVE_CHANGE_EXISTS", `Active Matrix change already exists: ${active(cwd)}.`);
    const p = paths(cwd, id); if (fs.existsSync(p.change) || fs.existsSync(path.join(p.root, "archive", id))) return fail("CHANGE_EXISTS", `Matrix change already exists: ${id}.`);
    fs.mkdirSync(p.artifacts, { recursive: true }); fs.mkdirSync(path.join(p.root, "archive"), { recursive: true });
    if (!fs.existsSync(path.join(p.root, "config.yaml"))) fs.writeFileSync(path.join(p.root, "config.yaml"), "schema: matrix/config/v1\nauto_transition: true\n");
    if (!fs.existsSync(path.join(p.root, ".gitignore"))) fs.writeFileSync(path.join(p.root, ".gitignore"), "active.json\ninstallation.json\nchanges/*/run-state.json\nchanges/*/events.jsonl\nchanges/*/artifacts/handoff.md\n");
    const flow = { schema: "matrix/change/v1", id, workflow, status: "active", phase: "open", title, created_at: stamp(), updated_at: stamp(), acceptance: "pending", scope: "pending" };
    fs.writeFileSync(p.legacyFlow, ""); writeFlow(p, flow); write(path.join(p.change, "run-state.json"), { schema: "matrix/run/v1", current_step: "open", iteration: 0, pending_gate: null, updated_at: stamp() }); write(p.active, { change_id: id }); event(p, "initialized", null, "open"); return { ok: true, code: "OK", change_id: id, next_skill: skill("open") };
  }
  const id = active(cwd); if (!id) return fail("NO_ACTIVE_CHANGE", "No active Matrix change. Start with $matrix <request>.");
  const p = paths(cwd, id); const flow = readFlow(p); if (!flow) return fail("STATE_INVALID", "active.json does not reference a valid Matrix change.");
  if (command === "inspect") { const result = guard(cwd, id, flow.phase); return { ok: true, code: "OK", change_id: id, workflow: flow.workflow, phase: flow.phase, next_skill: skill(flow.phase), guard_pass: result.pass }; }
  if (command === "guard") { const phase = args[0] ?? flow.phase; if (!PHASES.includes(phase)) return fail("INVALID_INTENT", "Unknown phase."); const result = guard(cwd, id, phase); return { ok: result.pass, code: result.pass ? "OK" : "GUARD_FAILED", phase, ...result }; }
  if (command === "transition") { const to = args[0]; if (NEXT[flow.phase] !== to) return fail("ILLEGAL_TRANSITION", `Illegal transition ${flow.phase} -> ${to}.`); const result = guard(cwd, id, flow.phase); if (!result.pass) return fail("GUARD_FAILED", "Current phase guard failed."); const before = flow.phase; flow.phase = to; flow.updated_at = stamp(); writeFlow(p, flow); event(p, "transition", before, to); return { ok: true, code: "OK", change_id: id, phase: to, next_skill: skill(to) }; }
  if (command === "archive") {
    if (flow.phase !== "archive") return fail("ILLEGAL_TRANSITION", "Only an archive-phase change can be archived.");
    const result = guard(cwd, id, "archive"); if (!result.pass) return fail("GUARD_FAILED", "Archive guard failed.");
    flow.status = "archived"; flow.updated_at = stamp(); writeFlow(p, flow); event(p, "archived", "archive", "archived");
    const target = path.join(p.root, "archive", id); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.renameSync(p.change, target); fs.rmSync(p.active);
    return { ok: true, code: "OK", archived: id };
  }
  if (command === "handoff") { const destination = path.join(p.artifacts, "handoff.md"); fs.writeFileSync(destination, `# Matrix handoff: ${id}\n\n- Workflow: ${flow.workflow}\n- Current phase: ${flow.phase}\n- Resume with: \`${skill(flow.phase)}\`\n- Guard passes: ${guard(cwd, id, flow.phase).pass}\n`); return { ok: true, code: "OK", path: destination }; }
  if (command === "export") {
    if (flow.phase !== "design") return fail("ILLEGAL_PHASE", "Export requires the design phase.");
    if (!guard(cwd, id, "design").pass) return fail("GUARD_FAILED", "Design guard failed.");
    const taskId = args.includes("--task-id") ? args[args.indexOf("--task-id") + 1] : args[0];
    const target = args.includes("--target") ? args[args.indexOf("--target") + 1] : "generic";
    const applyBoard = args.includes("--apply-fnsec-board");
    if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(taskId ?? "") || !["generic", "fnsec"].includes(target)) return fail("INVALID_INTENT", "export requires a task id and target generic or fnsec.");
    const artifacts = ["proposal.md", "design.md", "plan.md"].map((name) => path.join(p.artifacts, name));
    if (artifacts.some((file) => !fs.existsSync(file))) return fail("ARTIFACT_MISSING", "Export requires proposal.md, design.md, and plan.md.");
    const [proposal, design, plan] = artifacts.map((file) => fs.readFileSync(file, "utf8"));
    if (target === "generic") {
      const destination = path.join(p.artifacts, "claude-task.md"); const result = path.join(p.artifacts, "claude-result.md");
      fs.writeFileSync(destination, taskContent(id, taskId, proposal, design, plan, path.relative(cwd, result).replaceAll("\\", "/")));
      return { ok: true, code: "OK", path: destination };
    }
    const tasks = path.join(cwd, "docs", "tasks"); const board = path.join(tasks, "active.md");
    if (!exists(tasks) || !exists(board)) return fail("FNSEC_TARGET_UNAVAILABLE", "FnSec target requires docs/tasks/active.md in the current project.");
    const destination = path.join(tasks, `claude-task-${taskId}.md`); const result = path.join(tasks, `claude-result-${taskId}.md`);
    if (exists(destination) || exists(result)) return fail("FNSEC_TASK_EXISTS", `FnSec task or result path already exists for ${taskId}.`);
    const currentBoard = fs.readFileSync(board, "utf8");
    if (applyBoard && !currentBoard.includes("NO_ACTIVE_OBJECTIVE")) return fail("FNSEC_BOARD_OCCUPIED", "FnSec active.md already has an objective; refused to overwrite it.");
    fs.writeFileSync(destination, taskContent(id, taskId, proposal, design, plan, path.relative(cwd, result).replaceAll("\\", "/")));
    if (applyBoard) fs.writeFileSync(board, activeBoard(taskId, path.relative(cwd, destination).replaceAll("\\", "/"), path.relative(cwd, result).replaceAll("\\", "/"), id));
    return { ok: true, code: "OK", path: destination, board: applyBoard ? board : null };
  }
  return fail("INVALID_INTENT", `Unknown workflow command: ${command}.`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll("\\", "/")}`).href) {
  const result = invoke(process.argv.slice(2));
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 2;
}
