import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawnSync } from "node:child_process";
import {
  captureWorkflowEntry,
  runWorkflowTransaction,
  workflowDoctor,
  workflowMkdirOperation,
  workflowMutationGate,
  workflowMoveOperation,
  workflowRemoveOperation,
  workflowWriteOperation
} from "./workflow-transaction.js";

const PHASES = ["open", "design", "build", "verify", "archive"];
const FULL_PROFILE = {
  id: "full",
  next: { open: "design", design: "build", build: "verify", verify: "archive" },
  contractFiles: ["proposal.md", "design.md", "plan.md"]
};
const LIGHTWEIGHT_PROFILE = {
  id: "lightweight",
  next: { open: "build", build: "verify", verify: "archive" },
  contractFiles: ["proposal.md"]
};
const FULL_RETURNS = [
  { from: "build", to: "design", reason: "design-gap" },
  { from: "verify", to: "build", reason: "verification-failed" },
  { from: "verify", to: "design", reason: "acceptance-or-design-gap" },
  { from: "archive", to: "design", reason: "acceptance-or-design-gap" }
];
const LIGHTWEIGHT_RETURNS = [
  { from: "build", to: "design", reason: "design-gap", upgrade: true },
  { from: "verify", to: "build", reason: "verification-failed" },
  { from: "verify", to: "design", reason: "acceptance-or-design-gap", upgrade: true },
  { from: "archive", to: "design", reason: "acceptance-or-design-gap", upgrade: true }
];
const RETURN_REASONS = new Set([...FULL_RETURNS, ...LIGHTWEIGHT_RETURNS].map(({ reason }) => reason));
const INVALIDATED_EVIDENCE = ["build", "test", "review", "archive"];
const ABORT_REASONS = new Set(["requirement-cancelled", "superseded", "no-longer-valuable", "blocked", "other"]);
const ORCHESTRATIONS = ["prim", "arch"];
const ARCH_SKILLS = [
  "grilling", "domain-modeling", "research", "wayfinder", "prototype",
  "codebase-design", "tdd", "diagnosing-bugs", "resolving-merge-conflicts", "code-review"
];
const ARTIFACT_POLICY = {
  proposal: ["## Goal", "## Scope", "## Non-goals", "## Acceptance", "## Risks"],
  design: ["## Decisions", "## Boundaries", "## Test seams", "## Risks"],
  plan: ["## Steps", "## Validation", "## Stop conditions"],
  build: ["## Build evidence"],
  verification: ["## Test evidence", "## Review evidence"]
};
const LIGHTWEIGHT_COMMON_PROPOSAL = ["## Goal", "## Scope", "## Non-goals", "## Approach", "## Acceptance", "## Validation", "## Risks", "## Upgrade conditions"];
const LIGHTWEIGHT_POLICY = {
  hotfix: {
    proposal: [...LIGHTWEIGHT_COMMON_PROPOSAL, "## Expected behavior", "## Actual behavior", "## Reproduction"],
    build: ["## Build evidence", "## Reproduction evidence", "## Root cause"],
    verification: ["## Test evidence", "## Regression evidence", "## Review evidence"]
  },
  tweak: {
    proposal: [...LIGHTWEIGHT_COMMON_PROPOSAL, "## Current behavior", "## Preserved behavior", "## Diff boundary"],
    build: ["## Build evidence", "## Scope evidence"],
    verification: ["## Test evidence", "## Scope review evidence", "## Review evidence"]
  }
};
const WORKSPACE_BASELINE_FILE = "workspace-baseline.json";
const WORKSPACE_EXCLUDES = new Set([".git", ".matrix", ".comet", "node_modules"]);
const WORKSPACE_MAX_FILES = 50000;
const WORKSPACE_MAX_BYTES = 512 * 1024 * 1024;
const WORKSPACE_MAX_DURATION_MS = 60000;
const skill = (phase) => `$matrix-${phase}`;
const stamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const rootFor = (cwd) => path.join(cwd, ".matrix");
const exists = (file) => fs.existsSync(file);
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function fail(code, message) { return { ok: false, code, message }; }
function option(args, name) { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; }
function flatYaml(file) {
  try {
    return Object.fromEntries(fs.readFileSync(file, "utf8").split(/\r?\n/).filter((line) => line.includes(":") && !line.startsWith(" ")).map((line) => {
      const [key, ...value] = line.split(":");
      return [key.trim(), value.join(":").trim().replace(/^"|"$/g, "")];
    }));
  } catch { return {}; }
}
function excludedWorkspacePath(relative) {
  const first = relative.replaceAll("\\", "/").split("/")[0];
  return WORKSPACE_EXCLUDES.has(first);
}
function workspaceFiles(cwd) {
  const git = spawnSync("git", ["-C", cwd, "ls-files", "-co", "--exclude-standard", "-z"], {
    encoding: "buffer",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024
  });
  if (!git.error && git.status === 0) {
    return {
      provider: "git",
      files: [...new Set(git.stdout.toString("utf8").split("\0").filter(Boolean))]
        .map((relative) => relative.replaceAll("\\", "/"))
        .filter((relative) => !excludedWorkspacePath(relative))
        .sort()
    };
  }
  const files = [];
  const visit = (directory, prefix = "") => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = path.join(prefix, entry.name).replaceAll("\\", "/");
      if (!prefix && WORKSPACE_EXCLUDES.has(entry.name)) continue;
      if (entry.isDirectory()) visit(path.join(directory, entry.name), relative);
      else files.push(relative);
      if (files.length > WORKSPACE_MAX_FILES) throw new Error(`Workspace baseline exceeds ${WORKSPACE_MAX_FILES} files.`);
    }
  };
  visit(cwd);
  return { provider: "physical", files };
}
function captureWorkspaceBaseline(cwd) {
  const startedAt = Date.now();
  const selection = workspaceFiles(cwd);
  const hash = crypto.createHash("sha256");
  hash.update("matrix/workspace-baseline/v1\0", "utf8");
  let totalBytes = 0;
  let fileCount = 0;
  for (const relative of selection.files) {
    if (Date.now() - startedAt > WORKSPACE_MAX_DURATION_MS) throw new Error(`Workspace baseline exceeds ${WORKSPACE_MAX_DURATION_MS} milliseconds.`);
    if (fileCount >= WORKSPACE_MAX_FILES) throw new Error(`Workspace baseline exceeds ${WORKSPACE_MAX_FILES} files.`);
    const absolute = path.join(cwd, relative);
    const pathBytes = Buffer.from(relative, "utf8");
    const pathLength = Buffer.alloc(4); pathLength.writeUInt32BE(pathBytes.length);
    hash.update(pathLength); hash.update(pathBytes);
    let stat;
    try { stat = fs.lstatSync(absolute); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      hash.update("missing\0", "utf8");
      fileCount += 1;
      continue;
    }
    if (stat.isSymbolicLink()) {
      const target = Buffer.from(fs.readlinkSync(absolute), "utf8");
      hash.update("symlink\0", "utf8"); hash.update(target);
      totalBytes += target.length;
    } else if (stat.isFile()) {
      const bytes = fs.readFileSync(absolute);
      totalBytes += bytes.length;
      if (totalBytes > WORKSPACE_MAX_BYTES) throw new Error(`Workspace baseline exceeds ${WORKSPACE_MAX_BYTES} bytes.`);
      hash.update("file\0", "utf8"); hash.update(bytes);
    } else {
      hash.update("special\0", "utf8");
    }
    fileCount += 1;
  }
  return {
    schema: "matrix/workspace-baseline/v1",
    provider: selection.provider,
    hash: `sha256:${hash.digest("hex")}`,
    file_count: fileCount,
    content_bytes: totalBytes
  };
}
function workspaceOrderGuard(cwd, p) {
  let baseline;
  try { baseline = read(p.workspaceBaseline); }
  catch (error) {
    return fail("WORKSPACE_BASELINE_MISSING", `Lightweight workflow baseline is unavailable: ${error.message}`);
  }
  let current;
  try { current = captureWorkspaceBaseline(cwd); }
  catch (error) {
    return fail("WORKSPACE_INSPECTION_FAILED", `Could not inspect the lightweight workflow boundary: ${error.message}`);
  }
  if (baseline.schema !== "matrix/workspace-baseline/v1" || !/^sha256:[0-9a-f]{64}$/.test(baseline.hash ?? "")) {
    return fail("WORKSPACE_BASELINE_INVALID", "Lightweight workflow baseline is invalid.");
  }
  if (current.hash !== baseline.hash) {
    return {
      ...fail("PREMATURE_IMPLEMENTATION", "Project files changed after lightweight initialization and before Build approval."),
      baseline_hash: baseline.hash,
      current_hash: current.hash
    };
  }
  return { ok: true, code: "OK", baseline_hash: baseline.hash, current_hash: current.hash };
}
function hashDirectory(directory) {
  const hash = crypto.createHash("sha256");
  const files = [];
  const visit = (current, relative = "") => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = path.join(current, entry.name);
      const childRelative = path.join(relative, entry.name).replaceAll("\\", "/");
      if (entry.isDirectory()) visit(child, childRelative);
      else if (entry.isFile()) files.push([childRelative, fs.readFileSync(child)]);
    }
  };
  visit(directory);
  for (const [relative, contents] of files.sort(([left], [right]) => left.localeCompare(right))) {
    hash.update(`${relative}\0`);
    hash.update(contents);
  }
  return hash.digest("hex");
}
function orchestrationConfig(cwd) {
  const config = flatYaml(path.join(rootFor(cwd), "config.yaml"));
  const scope = config.installation_scope === "global" ? "global" : "project";
  const manifestFile = scope === "global" ? path.join(os.homedir(), ".matrix", "installation.json") : path.join(rootFor(cwd), "installation.json");
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")); } catch {}
  const defaultOrchestration = ORCHESTRATIONS.includes(config.default_orchestration) ? config.default_orchestration
    : ORCHESTRATIONS.includes(manifest?.orchestration?.default) ? manifest.orchestration.default : "prim";
  const artifactLanguage = ["en", "zh-CN"].includes(config.language) ? config.language
    : ["en", "zh-CN"].includes(manifest?.language) ? manifest.language : "en";
  return { config, scope, manifestFile, manifest, defaultOrchestration, artifactLanguage };
}
function archIntegrity(cwd) {
  const { manifest, manifestFile } = orchestrationConfig(cwd);
  const platforms = Object.entries(manifest?.platforms ?? {});
  if (!manifest?.orchestration?.available?.includes("arch") || !platforms.length) {
    return { ok: false, code: "ARCH_INSTALLATION_INCOMPLETE", message: "Arch requires a verified managed Skill cohort on every configured platform.", recovery_command: "matrix init --with-mattpocock" };
  }
  const findings = [];
  for (const [platform, record] of platforms) {
    for (const skill of ARCH_SKILLS) {
      const installed = record?.matt?.skills?.[skill];
      if (!installed?.root || !installed?.hash || !fs.existsSync(path.join(installed.root, "SKILL.md"))) {
        findings.push({ platform, skill, reason: "missing" });
        continue;
      }
      try {
        if (hashDirectory(installed.root) !== installed.hash) findings.push({ platform, skill, reason: "modified" });
      } catch { findings.push({ platform, skill, reason: "unreadable" }); }
    }
  }
  return findings.length ? {
    ok: false, code: "ARCH_INSTALLATION_INCOMPLETE", message: "Arch installation integrity failed. Repair the managed cohort before continuing.",
    manifest: manifestFile, findings, recovery_command: "matrix init --with-mattpocock"
  } : { ok: true, code: "OK", manifest: manifestFile, platforms: platforms.map(([platform]) => platform) };
}
function taskContent(change, taskId, proposal, design, plan, resultPath, contractHash, approvalRevision) {
  return `# Claude Code task: ${taskId}\n\n## Metadata\n\n| Field | Value |\n| --- | --- |\n| Status | CLAUDE_QUEUED |\n| Matrix change | ${change} |\n| Decision owner | Codex |\n| Implementation actor | Claude Code |\n| Approved contract | ${contractHash} |\n| Approval revision | ${approvalRevision} |\n| Result | ${resultPath} |\n\n## Objective\n\nThe frozen Matrix artifacts below are authoritative. Do not expand their scope.\n\n## Proposal\n\n${proposal}\n\n## Frozen design\n\n${design}\n\n## Ordered plan\n\n${plan}\n\n## Allowed work\n\n- Read repository instructions and existing tests before implementing.\n- Change only files required by the frozen design and plan.\n\n## Prohibited work\n\n- Do not edit Matrix state, transition its phase, archive it, or alter the frozen design.\n- Do not add unrelated features, public APIs, dependencies, or external side effects.\n- Do not claim completion without recording verifiable evidence.\n\n## Stop and report\n\nStop with \`NEEDS_DECISION\` if the scope must expand, the design conflicts with the repository, validation cannot pass within scope, or an authorization/safety issue arises.\n\n## Required result\n\nCreate \`${resultPath}\` with metadata, changed files and reasons, commands and outcomes, test results, boundary confirmation, residual risks, and any \`NEEDS_DECISION\` items. Codex reviews the result and the actual diff.\n`;
}
function activeBoard(taskId, taskPath, resultPath, change) {
  return `# Active task board\n\n## Current objective\n\n| Field | Value |\n| --- | --- |\n| ID | ${taskId} |\n| Status | CLAUDE_QUEUED |\n| Matrix change | ${change} |\n| Task | ${taskPath} |\n| Result | ${resultPath} |\n`;
}
function paths(cwd, id, archived = false) {
  const root = rootFor(cwd);
  const change = path.join(root, archived ? "archive" : "changes", id);
  return {
    root,
    active: path.join(root, "active.json"),
    change,
    flow: path.join(change, "matrix.yaml"),
    artifacts: path.join(change, "artifacts"),
    workspaceBaseline: path.join(change, WORKSPACE_BASELINE_FILE)
  };
}
function normalizeFlow(flow) {
  if (!flow) return null;
  if (flow.schema !== "matrix/change/v2") return flow.schema ? { unsupported_schema: flow.schema } : null;
  const revision = Number(flow.revision);
  const approved = flow.approved_contract_hash || null;
  const approvalRevision = flow.contract_approved_revision === "" || flow.contract_approved_revision == null ? null : Number(flow.contract_approved_revision);
  const workflowProfile = flow.workflow_profile || null;
  if (
    typeof flow.id !== "string" || !flow.id ||
    !["full", "hotfix", "tweak"].includes(flow.workflow) ||
    !ORCHESTRATIONS.includes(flow.orchestration) ||
    !["active", "archived", "aborted"].includes(flow.status) ||
    !PHASES.includes(flow.phase) ||
    !Number.isInteger(revision) || revision < 1 ||
    (workflowProfile !== null && workflowProfile !== "lightweight") ||
    (workflowProfile === "lightweight" && !["hotfix", "tweak"].includes(flow.workflow)) ||
    (flow.artifact_language != null && !["en", "zh-CN"].includes(flow.artifact_language)) ||
    Boolean(approved) !== Boolean(approvalRevision) ||
    (approved && !/^sha256:[0-9a-f]{64}$/.test(approved)) ||
    (approvalRevision != null && (!Number.isInteger(approvalRevision) || approvalRevision < 1 || approvalRevision > revision))
  ) return null;
  return { ...flow, revision, workflow_profile: workflowProfile, artifact_language: flow.artifact_language ?? null, approved_contract_hash: approved, contract_approved_revision: approvalRevision };
}
function readFlow(p) {
  if (!fs.existsSync(p.flow)) return null;
  const parsed = Object.fromEntries(fs.readFileSync(p.flow, "utf8").split(/\r?\n/).filter((line) => line.includes(":") && !line.startsWith(" ")).map((line) => { const [key, ...value] = line.split(":"); return [key.trim(), value.join(":").trim().replace(/^"|"$/g, "")]; }));
  return normalizeFlow(parsed);
}
function flowContent(flow) {
  const order = ["schema", "id", "workflow", "workflow_profile", "orchestration", "artifact_language", "status", "phase", "revision", "approved_contract_hash", "contract_approved_revision", "title", "created_at", "updated_at", "acceptance", "scope"];
  return `${order.filter((key) => (key !== "workflow_profile" || flow[key]) && (key !== "artifact_language" || flow[key])).map((key) => `${key}: ${flow[key] ?? ""}`).join("\n")}\n`;
}
function active(cwd) { const activeFile = path.join(rootFor(cwd), "active.json"); if (!fs.existsSync(activeFile)) return null; return read(activeFile).change_id; }
function meaningful(file, headings) {
  if (!fs.existsSync(file)) return false;
  const value = fs.readFileSync(file, "utf8").trim();
  if (value.length < 40) return false;
  return headings.every((heading) => {
    const start = value.indexOf(heading);
    if (start < 0) return false;
    const bodyStart = start + heading.length;
    const next = value.indexOf("\n## ", bodyStart);
    return value.slice(bodyStart, next < 0 ? value.length : next).trim().length >= 8;
  });
}
function shortcut(flow) { return flow.workflow === "hotfix" || flow.workflow === "tweak"; }
function contractSnapshotForFiles(p, files) {
  const hash = crypto.createHash("sha256");
  hash.update("matrix/workflow-contract/v1\\0", "utf8");
  const contents = {};
  for (const name of files) {
    const logical = `artifacts/${name}`;
    let bytes;
    try { bytes = fs.readFileSync(path.join(p.artifacts, name)); }
    catch (error) { if (error.code === "ENOENT") return { missing: true, contents }; return { error, contents }; }
    const pathBytes = Buffer.from(logical, "utf8");
    const pathLength = Buffer.alloc(4); pathLength.writeUInt32BE(pathBytes.length);
    const contentLength = Buffer.alloc(8); contentLength.writeBigUInt64BE(BigInt(bytes.length));
    hash.update(pathLength); hash.update(pathBytes); hash.update(contentLength); hash.update(bytes);
    contents[name] = bytes.toString("utf8");
  }
  return { hash: `sha256:${hash.digest("hex")}`, contents };
}
function workflowProfile(p, flow) {
  if (!shortcut(flow)) return FULL_PROFILE;
  return flow.workflow_profile === "lightweight" ? LIGHTWEIGHT_PROFILE : { ...FULL_PROFILE, id: "legacy-full" };
}
function evidencePolicy(flow, profile) {
  return profile.id === "lightweight" ? flow.workflow : "full";
}
function structuralGuard(p, flow, phase) {
  const base = p.artifacts;
  const profile = workflowProfile(p, flow);
  const policy = evidencePolicy(flow, profile);
  const shortcutPolicy = LIGHTWEIGHT_POLICY[policy];
  const checks = phase === "open" ? [["proposal", meaningful(path.join(base, "proposal.md"), shortcutPolicy?.proposal ?? ARTIFACT_POLICY.proposal)]]
    : phase === "design" ? [["proposal", meaningful(path.join(base, "proposal.md"), ARTIFACT_POLICY.proposal)], ["design", meaningful(path.join(base, "design.md"), ARTIFACT_POLICY.design)], ["plan", meaningful(path.join(base, "plan.md"), ARTIFACT_POLICY.plan)]]
      : phase === "build" ? [
        ...(profile.id === "lightweight" ? [] : [["plan", meaningful(path.join(base, "plan.md"), ARTIFACT_POLICY.plan)]]),
        ["build evidence", meaningful(path.join(base, "verification.md"), shortcutPolicy?.build ?? ARTIFACT_POLICY.build)]
      ]
        : [["verification", meaningful(path.join(base, "verification.md"), shortcutPolicy?.verification ?? ARTIFACT_POLICY.verification)]];
  return { pass: checks.every(([, result]) => result), checks };
}
function contractSnapshot(p, flow) {
  return contractSnapshotForFiles(p, workflowProfile(p, flow).contractFiles);
}
function contractState(p, flow) {
  const snapshot = contractSnapshot(p, flow);
  if (snapshot.error) return { status: "unreadable", snapshot };
  if (!flow.approved_contract_hash) return { status: "unapproved", snapshot };
  if (snapshot.missing || snapshot.hash !== flow.approved_contract_hash) return { status: "changed", snapshot };
  return { status: "approved-and-matching", snapshot };
}
function contractFields(flow, contract) {
  return {
    contract_status: contract.status,
    current_contract_hash: contract.snapshot.hash ?? null,
    approved_contract_hash: flow.approved_contract_hash,
    contract_approved_revision: flow.contract_approved_revision
  };
}
function contractFailure(flow, contract) {
  if (contract.status === "approved-and-matching") return null;
  if (contract.status === "unreadable") return { ...fail("CONTRACT_READ_FAILED", contract.snapshot.error.message), ...contractFields(flow, contract) };
  return { ...fail(contract.status === "unapproved" ? "CONTRACT_UNAPPROVED" : "CONTRACT_CHANGED", `Workflow contract is ${contract.status}.`), ...contractFields(flow, contract) };
}
function addFramedEntry(hash, type, logicalPath, content = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, "utf8");
  const pathBytes = Buffer.from(logicalPath, "utf8");
  const typeLength = Buffer.alloc(4); typeLength.writeUInt32BE(typeBytes.length);
  const pathLength = Buffer.alloc(4); pathLength.writeUInt32BE(pathBytes.length);
  const contentLength = Buffer.alloc(8); contentLength.writeBigUInt64BE(BigInt(content.length));
  hash.update(typeLength); hash.update(typeBytes); hash.update(pathLength); hash.update(pathBytes); hash.update(contentLength); hash.update(content);
}
function addFramedFile(hash, entry) {
  const typeBytes = Buffer.from(entry.type, "utf8");
  const pathBytes = Buffer.from(entry.logicalPath, "utf8");
  const typeLength = Buffer.alloc(4); typeLength.writeUInt32BE(typeBytes.length);
  const pathLength = Buffer.alloc(4); pathLength.writeUInt32BE(pathBytes.length);
  const contentLength = Buffer.alloc(8); contentLength.writeBigUInt64BE(BigInt(entry.size));
  hash.update(typeLength); hash.update(typeBytes); hash.update(pathLength); hash.update(pathBytes); hash.update(contentLength);
  const descriptor = fs.openSync(entry.source, "r");
  try {
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || opened.size !== entry.size) throw new Error(`Archive file changed while opening: ${entry.logicalPath}.`);
    const chunk = Buffer.allocUnsafe(64 * 1024);
    let offset = 0;
    while (offset < entry.size) {
      const length = fs.readSync(descriptor, chunk, 0, Math.min(chunk.length, entry.size - offset), offset);
      if (length === 0) throw new Error(`Archive file changed while reading: ${entry.logicalPath}.`);
      hash.update(chunk.subarray(0, length));
      offset += length;
    }
    if (fs.readSync(descriptor, chunk, 0, 1, offset) !== 0) throw new Error(`Archive file changed while reading: ${entry.logicalPath}.`);
  } finally {
    fs.closeSync(descriptor);
  }
}
function archiveDirectoryEntries(root, relative = "") {
  const entries = [];
  const names = fs.readdirSync(path.join(root, relative)).sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  for (const name of names) {
    const childRelative = relative ? `${relative}/${name}` : name;
    const child = path.join(root, ...childRelative.split("/"));
    const stat = fs.lstatSync(child);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
      const error = new Error(`Archive change contains unsupported filesystem entry: ${childRelative}.`);
      error.code = "ARCHIVE_ENTRY_UNSUPPORTED";
      throw error;
    }
    if (stat.isDirectory()) {
      entries.push({ type: "directory", logicalPath: `change/${childRelative}`, content: Buffer.alloc(0) });
      entries.push(...archiveDirectoryEntries(root, childRelative));
    } else {
      entries.push({ type: "file", logicalPath: `change/${childRelative}`, source: child, size: stat.size });
    }
  }
  return entries;
}
function requireArchiveEntry(file, kind, label) {
  let stat;
  try { stat = fs.lstatSync(file); }
  catch (error) { return fail("ARCHIVE_PREFLIGHT_UNSTABLE", `${label} could not be inspected: ${error.message}`); }
  const valid = kind === "directory" ? stat.isDirectory() : stat.isFile();
  return stat.isSymbolicLink() || !valid ? fail("ARCHIVE_ENTRY_UNSUPPORTED", `${label} must be an ordinary ${kind}.`) : null;
}
function captureArchivePreflightOnce(p, id) {
  const target = path.join(p.root, "archive", id);
  if (fs.existsSync(target)) return { failure: fail("ARCHIVE_TARGET_EXISTS", `Archive target already exists: ${id}.`) };
  for (const [file, kind, label] of [[p.root, "directory", "Matrix state root"], [p.change, "directory", "Active change root"], [path.join(p.root, "archive"), "directory", "Archive root"], [p.active, "file", "Active Selection"]]) {
    const failure = requireArchiveEntry(file, kind, label); if (failure) return { failure };
  }
  let selection;
  try { selection = fs.readFileSync(p.active); }
  catch (error) { return { failure: fail("ARCHIVE_PREFLIGHT_UNSTABLE", `Active Selection could not be captured: ${error.message}`) }; }
  let entries;
  try {
    entries = archiveDirectoryEntries(p.change);
    entries.sort((left, right) => Buffer.compare(Buffer.from(left.logicalPath), Buffer.from(right.logicalPath)));
  }
  catch (error) {
    if (error.code === "ARCHIVE_ENTRY_UNSUPPORTED") return { failure: fail(error.code, error.message) };
    return { failure: fail("ARCHIVE_PREFLIGHT_UNSTABLE", `Archive inputs changed or could not be captured: ${error.message}`) };
  }
  const hash = crypto.createHash("sha256");
  hash.update("matrix/archive-preflight/v1\\0", "utf8");
  addFramedEntry(hash, "identity", "change-id", Buffer.from(id, "utf8"));
  addFramedEntry(hash, "identity", "archive-target", Buffer.from(`.matrix/archive/${id}`, "utf8"));
  addFramedEntry(hash, "selection", ".matrix/active.json", selection);
  addFramedEntry(hash, "fact", "archive-target-state", Buffer.from("absent", "utf8"));
  let fileCount = 0; let directoryCount = 0; let totalBytes = 0;
  try {
    for (const entry of entries) {
      if (entry.type === "file") {
        addFramedFile(hash, entry);
        fileCount += 1;
        totalBytes += entry.size;
      } else {
        addFramedEntry(hash, entry.type, entry.logicalPath, entry.content);
        directoryCount += 1;
      }
    }
  } catch (error) {
    return { failure: fail("ARCHIVE_PREFLIGHT_UNSTABLE", `Archive inputs changed or could not be captured: ${error.message}`) };
  }
  return { hash: `sha256:${hash.digest("hex")}`, fileCount, directoryCount, totalBytes };
}
function captureArchivePreflight(p, id) {
  const first = captureArchivePreflightOnce(p, id); if (first.failure) return first;
  const second = captureArchivePreflightOnce(p, id); if (second.failure) return second;
  if (first.hash !== second.hash) return { failure: fail("ARCHIVE_PREFLIGHT_UNSTABLE", "Archive inputs changed while the preflight snapshot was being captured. Retry dry-run.") };
  return second;
}
function archivePreflightChanged(expected, current) {
  return {
    ...fail("ARCHIVE_PREFLIGHT_CHANGED", "Archive inputs changed after dry-run. Run dry-run again and review the new preflight."),
    expected_preflight_hash: expected,
    current_preflight_hash: current,
    recovery_command: "matrix workflow archive --dry-run"
  };
}
function guard(p, flow, phase) {
  if (!["build", "verify", "archive"].includes(phase)) {
    const structural = structuralGuard(p, flow, phase);
    return { ok: structural.pass, code: structural.pass ? "OK" : "GUARD_FAILED", ...structural };
  }
  const contract = contractState(p, flow); const failure = contractFailure(flow, contract);
  if (failure) return { ok: false, ...failure, checks: [["contract", false]] };
  const structural = structuralGuard(p, flow, phase);
  return { ok: structural.pass, code: structural.pass ? "OK" : "GUARD_FAILED", ...structural, ...contractFields(flow, contract), checks: [["contract", true], ...structural.checks] };
}
function eventContent(file, name, before, after, revision, details = {}) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  return `${current}${JSON.stringify({ schema: "matrix/event/v1", at: stamp(), event: name, revision, from: before, to: after, ...details })}\n`;
}
export function invoke(argv, { cwd = process.cwd(), failAfterOperation = null } = {}) {
  const [command, ...args] = argv;
  if (command === "init") {
    const id = (args.shift() ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const workflow = args.includes("--workflow") ? args[args.indexOf("--workflow") + 1] : "full";
    const title = args.includes("--title") ? args[args.indexOf("--title") + 1] : null;
    const requestedOrchestration = option(args, "--orchestration");
    if (requestedOrchestration != null && !ORCHESTRATIONS.includes(requestedOrchestration)) return fail("INVALID_INTENT", "orchestration must be prim or arch.");
    const configured = orchestrationConfig(cwd);
    const orchestration = requestedOrchestration ?? configured.defaultOrchestration;
    if (!id || !title || !["full", "hotfix", "tweak"].includes(workflow)) return fail("INVALID_INTENT", "init requires a valid change id and --title.");
    if (orchestration === "arch") {
      const integrity = archIntegrity(cwd);
      if (!integrity.ok) return { ...integrity, orchestration };
    }
    if (active(cwd)) return fail("ACTIVE_CHANGE_EXISTS", `Active Matrix change already exists: ${active(cwd)}.`);
    const p = paths(cwd, id); if (fs.existsSync(p.change) || fs.existsSync(path.join(p.root, "archive", id))) return fail("CHANGE_EXISTS", `Matrix change already exists: ${id}.`);
    let workspaceBaseline = null;
    if (workflow === "hotfix" || workflow === "tweak") {
      try { workspaceBaseline = captureWorkspaceBaseline(cwd); }
      catch (error) { return fail("WORKSPACE_BASELINE_FAILED", `Could not initialize the lightweight workflow boundary: ${error.message}`); }
    }
    const flow = { schema: "matrix/change/v2", id, workflow, ...(workflow === "full" ? {} : { workflow_profile: "lightweight" }), orchestration, artifact_language: configured.artifactLanguage, status: "active", phase: "open", revision: 1, title, created_at: stamp(), updated_at: stamp(), acceptance: "pending", scope: "pending" };
    const operations = [
      ...(!fs.existsSync(path.join(p.root, "archive")) ? [workflowMkdirOperation(cwd, path.join(p.root, "archive"))] : []),
      workflowMkdirOperation(cwd, p.artifacts),
      ...(!fs.existsSync(path.join(p.root, "config.yaml")) ? [workflowWriteOperation(cwd, path.join(p.root, "config.yaml"), `schema: matrix/config/v1\nauto_transition: true\ndefault_orchestration: ${configured.defaultOrchestration}\ninstallation_scope: project\nlanguage: ${configured.artifactLanguage}\n`)] : []),
      ...(!fs.existsSync(path.join(p.root, ".gitignore")) ? [workflowWriteOperation(cwd, path.join(p.root, ".gitignore"), "active.json\ninstallation.json\nchanges/*/events.jsonl\nchanges/*/artifacts/handoff.md\n")] : []),
      workflowWriteOperation(cwd, p.flow, flowContent(flow)),
      ...(workspaceBaseline ? [workflowWriteOperation(cwd, p.workspaceBaseline, `${JSON.stringify(workspaceBaseline, null, 2)}\n`)] : []),
      workflowWriteOperation(cwd, path.join(p.change, "events.jsonl"), eventContent(path.join(p.change, "events.jsonl"), "initialized", null, "open", flow.revision, { workflow, orchestration, ...(shortcut(flow) ? { profile: "lightweight" } : {}) })),
      workflowWriteOperation(cwd, p.active, `${JSON.stringify({ change_id: id }, null, 2)}\n`)
    ];
    return runWorkflowTransaction({
      cwd,
      kind: "init",
      changeId: id,
      operations,
      failAfterOperation,
      result: { ok: true, code: "OK", change_id: id, workflow, profile: shortcut(flow) ? "lightweight" : "full", evidence_policy: workflow === "full" ? "full" : workflow, orchestration, artifact_language: flow.artifact_language, status: flow.status, phase: flow.phase, revision: flow.revision, next_skill: skill("open") }
    });
  }
  if (command === "doctor") {
    const parsed = { repair: false, transaction: null, strategy: null, lock: null };
    for (let index = 0; index < args.length; index += 1) {
      const token = args[index];
      if (token === "--repair") {
        if (parsed.repair) return fail("INVALID_INTENT", "Workflow doctor options may not be repeated.");
        parsed.repair = true;
        continue;
      }
      const field = ({ "--transaction": "transaction", "--strategy": "strategy", "--lock": "lock" })[token];
      const value = args[index + 1];
      if (!field || parsed[field] || !value || value.startsWith("--")) return fail("INVALID_INTENT", "Workflow doctor accepts --repair with --transaction/--strategy or --lock.");
      parsed[field] = value;
      index += 1;
    }
    return workflowDoctor(cwd, parsed);
  }
  const selected = active(cwd);
  const requested = command === "inspect" ? (option(args, "--change") ?? args.find((arg) => !arg.startsWith("--"))) : null;
  const id = requested ?? selected;
  if (!id) return fail("NO_ACTIVE_CHANGE", "No active Matrix change. Start with $matrix <request>.");
  let p = paths(cwd, id);
  if (command === "inspect" && !fs.existsSync(p.change)) p = paths(cwd, id, true);
  const flow = readFlow(p);
  if (flow?.unsupported_schema) return fail("STATE_VERSION_UNSUPPORTED", `Unsupported Matrix state schema: ${flow.unsupported_schema}.`);
  if (!flow) return fail("STATE_INVALID", "active.json does not reference a valid Matrix change.");
  const artifactLanguage = flow.artifact_language ?? orchestrationConfig(cwd).artifactLanguage;
  const integrity = flow.status === "active" && flow.orchestration === "arch" ? archIntegrity(cwd) : { ok: true, code: "OK" };
  if (["transition", "return", "abort"].includes(command) || (command === "archive" && !args.includes("--dry-run"))) {
    const blocked = workflowMutationGate(cwd);
    if (blocked) return blocked;
  }
  if (command === "inspect") {
    const profile = workflowProfile(p, flow);
    const contract = contractState(p, flow);
    const result = guard(p, flow, flow.phase);
    const failure = contract.status === "unreadable" ? contractFailure(flow, contract) : null;
    return {
      ...(failure ?? (!integrity.ok ? integrity : { ok: true, code: "OK" })),
      change_id: id,
      workflow: flow.workflow,
      profile: profile.id,
      evidence_policy: evidencePolicy(flow, profile),
      orchestration: flow.orchestration,
      artifact_language: artifactLanguage,
      status: flow.status,
      phase: flow.phase,
      revision: flow.revision,
      next_skill: flow.status === "active" ? skill(flow.phase) : null,
      guard_pass: result.ok,
      ...contractFields(flow, contract)
    };
  }
  if (!integrity.ok && command !== "abort") {
    const profile = workflowProfile(p, flow);
    return { ...integrity, change_id: id, workflow: flow.workflow, profile: profile.id, evidence_policy: evidencePolicy(flow, profile), orchestration: flow.orchestration, artifact_language: artifactLanguage, status: flow.status, phase: flow.phase, revision: flow.revision, next_skill: skill(flow.phase) };
  }
  if (command === "guard") {
    const phase = args[0] ?? flow.phase;
    if (!PHASES.includes(phase)) return fail("INVALID_INTENT", "Unknown phase.");
    const profile = workflowProfile(p, flow);
    if (profile.id === "lightweight" && phase === "design") return fail("PHASE_UNAVAILABLE", "Lightweight workflows do not have a Design phase.");
    return { phase, profile: profile.id, evidence_policy: evidencePolicy(flow, profile), artifact_language: artifactLanguage, ...guard(p, flow, phase) };
  }
  if (command === "transition") {
    const to = args[0];
    const confirmed = args.includes("--confirmed");
    if (args.slice(1).some((arg) => arg !== "--confirmed")) return fail("INVALID_INTENT", "Transition accepts only a target phase and optional --confirmed.");
    if (flow.status !== "active") return fail("CHANGE_NOT_ACTIVE", `Matrix change is ${flow.status}.`);
    const profile = workflowProfile(p, flow);
    if (profile.next[flow.phase] !== to) return fail("ILLEGAL_TRANSITION", `Illegal ${profile.id} transition ${flow.phase} -> ${to}.`);
    const result = guard(p, flow, flow.phase); if (!result.ok) return { ...result, message: result.message ?? "Current phase guard failed." };
    if (profile.id === "lightweight" && flow.phase === "open" && to === "build") {
      if (!confirmed) return fail("CONFIRMATION_REQUIRED", "Lightweight Open requires explicit user confirmation before Build.");
      const order = workspaceOrderGuard(cwd, p);
      if (!order.ok) return order;
    }
    const before = flow.phase;
    const approval = to === "build" ? contractState(p, flow) : null;
    if (approval && approval.status !== "approved-and-matching" && approval.status !== "unapproved") return { ...contractFailure(flow, approval), change_id: id };
    if (to === "build" && approval.snapshot.missing) return { ...fail("GUARD_FAILED", "Workflow contract artifacts are incomplete."), change_id: id };
    const next = { ...flow, schema: "matrix/change/v2", phase: to, revision: flow.revision + 1, updated_at: stamp(), ...(to === "build" ? { approved_contract_hash: approval.snapshot.hash, contract_approved_revision: flow.revision + 1 } : {}) };
    const nextProfile = workflowProfile(p, next);
    const details = to === "build"
      ? { approved_contract_hash: next.approved_contract_hash, contract_approved_revision: next.contract_approved_revision, ...(shortcut(flow) ? { confirmed, profile: nextProfile.id } : {}) }
      : shortcut(flow) ? { profile: nextProfile.id } : {};
    const resultFields = { ok: true, code: "OK", change_id: id, workflow: next.workflow, profile: nextProfile.id, evidence_policy: evidencePolicy(next, nextProfile), orchestration: next.orchestration, artifact_language: next.artifact_language ?? artifactLanguage, status: next.status, phase: to, revision: next.revision, next_skill: skill(to), ...contractFields(next, contractState(p, next)) };
    return runWorkflowTransaction({
      cwd,
      kind: "transition",
      changeId: id,
      failAfterOperation,
      operations: [
        workflowWriteOperation(cwd, p.flow, flowContent(next)),
        workflowWriteOperation(cwd, path.join(p.change, "events.jsonl"), eventContent(path.join(p.change, "events.jsonl"), "transition", before, to, next.revision, details))
      ],
      result: resultFields
    });
  }
  if (command === "return") {
    const to = args[0];
    const reason = option(args, "--reason");
    if (!reason) return fail("RETURN_REASON_REQUIRED", "Return requires --reason.");
    if (flow.status !== "active") return fail("CHANGE_NOT_ACTIVE", `Matrix change is ${flow.status}.`);
    if (!RETURN_REASONS.has(reason)) return fail("RETURN_REASON_UNSUPPORTED", `Unsupported Return reason: ${reason}.`);
    const profile = workflowProfile(p, flow);
    const returns = profile.id === "lightweight" ? LIGHTWEIGHT_RETURNS : FULL_RETURNS;
    const returnRule = returns.find((entry) => entry.from === flow.phase && entry.to === to && entry.reason === reason);
    if (!returnRule) return fail("ILLEGAL_RETURN", `Illegal ${profile.id} Return ${flow.phase} -> ${to} for reason ${reason}.`);
    if (flow.phase === "verify" && to === "build") { const contract = contractState(p, flow); const failure = contractFailure(flow, contract); if (failure) return failure; }
    const verification = path.join(p.artifacts, "verification.md");
    let destination = null;
    if (fs.existsSync(verification)) {
      const history = path.join(p.artifacts, "evidence-history");
      destination = path.join(history, `revision-${flow.revision}-verification.md`);
      if (fs.existsSync(destination)) return fail("EVIDENCE_INVALIDATION_FAILED", `Evidence history already exists for revision ${flow.revision}.`);
    }
    const next = {
      ...flow,
      schema: "matrix/change/v2",
      workflow: returnRule.upgrade ? "full" : flow.workflow,
      workflow_profile: returnRule.upgrade ? null : flow.workflow_profile,
      phase: to,
      revision: flow.revision + 1,
      updated_at: stamp(),
      ...(to === "design" ? { approved_contract_hash: null, contract_approved_revision: null } : {})
    };
    const nextProfile = workflowProfile(p, next);
    return runWorkflowTransaction({
      cwd,
      kind: "return",
      changeId: id,
      failAfterOperation,
      operations: [
        ...(destination ? [workflowMoveOperation(cwd, verification, destination)] : []),
        workflowWriteOperation(cwd, p.flow, flowContent(next)),
        workflowWriteOperation(cwd, path.join(p.change, "events.jsonl"), eventContent(path.join(p.change, "events.jsonl"), "returned", flow.phase, to, next.revision, { reason, invalidated_evidence: INVALIDATED_EVIDENCE, ...(returnRule.upgrade ? { workflow_from: flow.workflow, workflow_to: "full" } : {}) }))
      ],
      result: { ok: true, code: "OK", change_id: id, workflow: next.workflow, profile: nextProfile.id, evidence_policy: evidencePolicy(next, nextProfile), orchestration: next.orchestration, artifact_language: next.artifact_language ?? artifactLanguage, status: next.status, phase: to, revision: next.revision, next_skill: skill(to), event: "returned", invalidated_evidence: INVALIDATED_EVIDENCE, ...contractFields(next, contractState(p, next)) }
    });
  }
  if (command === "abort") {
    const reason = option(args, "--reason");
    const note = option(args, "--note");
    if (!reason) return fail("ABORT_REASON_REQUIRED", "Abort requires --reason.");
    if (!ABORT_REASONS.has(reason)) return fail("ABORT_REASON_UNSUPPORTED", `Unsupported Abort reason: ${reason}.`);
    if (flow.status !== "active") return fail("CHANGE_NOT_ACTIVE", `Matrix change is ${flow.status}.`);
    const next = { ...flow, schema: "matrix/change/v2", status: "aborted", revision: flow.revision + 1, updated_at: stamp() };
    const target = path.join(p.root, "archive", id);
    if (fs.existsSync(target)) return fail("ARCHIVE_TARGET_EXISTS", `Archive target already exists: ${id}.`);
    const sourceEvents = path.join(p.change, "events.jsonl");
    const targetFlow = path.join(target, "matrix.yaml");
    const targetEvents = path.join(target, "events.jsonl");
    return runWorkflowTransaction({
      cwd,
      kind: "abort",
      changeId: id,
      failAfterOperation,
      operations: [
        workflowMoveOperation(cwd, p.change, target),
        workflowWriteOperation(cwd, targetFlow, flowContent(next), { before: captureWorkflowEntry(p.flow) }),
        workflowWriteOperation(cwd, targetEvents, eventContent(sourceEvents, "aborted", flow.phase, flow.phase, next.revision, { reason, ...(note ? { note } : {}) }), { before: captureWorkflowEntry(sourceEvents) }),
        workflowRemoveOperation(cwd, p.active)
      ],
      result: { ok: true, code: "OK", change_id: id, workflow: next.workflow, orchestration: next.orchestration, artifact_language: next.artifact_language ?? artifactLanguage, status: next.status, phase: next.phase, revision: next.revision, next_skill: null, event: "aborted" }
    });
  }
  if (command === "archive") {
    if (flow.status !== "active") return fail("CHANGE_NOT_ACTIVE", `Matrix change is ${flow.status}.`);
    if (flow.phase !== "archive") return fail("ILLEGAL_TRANSITION", "Only an archive-phase change can be archived.");
    const profile = workflowProfile(p, flow);
    const dryRun = args.includes("--dry-run");
    const expected = option(args, "--expect-preflight");
    const confirmedByUser = args.includes("--confirmed");
    if ((dryRun && (expected || confirmedByUser)) || args.some((arg) => !["--dry-run", "--expect-preflight", "--confirmed", expected].includes(arg))) {
      return { ...fail("ARCHIVE_PREFLIGHT_INVALID", "Archive accepts either --dry-run or --expect-preflight <sha256>, not both or additional arguments."), recovery_command: "matrix workflow archive --dry-run" };
    }
    if (!dryRun && !expected) return { ...fail("ARCHIVE_PREFLIGHT_REQUIRED", "Archive requires an explicit dry-run followed by --expect-preflight <sha256>."), recovery_command: "matrix workflow archive --dry-run" };
    if (expected && !/^sha256:[0-9a-f]{64}$/.test(expected)) return { ...fail("ARCHIVE_PREFLIGHT_INVALID", "Expected preflight must be sha256 followed by 64 lowercase hexadecimal characters."), recovery_command: "matrix workflow archive --dry-run" };
    if (expected && shortcut(flow) && !confirmedByUser) return { ...fail("CONFIRMATION_REQUIRED", "Shortcut workflow Archive requires explicit user confirmation."), recovery_command: `matrix workflow archive --expect-preflight ${expected} --confirmed` };
    if (dryRun) {
      const result = guard(p, flow, "archive"); if (!result.ok) return { ...result, message: result.message ?? "Archive guard failed." };
      const captured = captureArchivePreflight(p, id); if (captured.failure) return captured.failure;
      const currentFlow = readFlow(p); if (!currentFlow) return fail("ARCHIVE_PREFLIGHT_UNSTABLE", "Canonical workflow state changed during dry-run.");
      const finalGuard = guard(p, currentFlow, "archive"); if (!finalGuard.ok) return { ...finalGuard, message: finalGuard.message ?? "Archive guard failed." };
      const confirmed = captureArchivePreflight(p, id); if (confirmed.failure) return confirmed.failure;
      if (captured.hash !== confirmed.hash) return fail("ARCHIVE_PREFLIGHT_UNSTABLE", "Archive inputs changed during dry-run. Retry dry-run.");
      return {
        ok: true, code: "OK", change_id: id, workflow: currentFlow.workflow, profile: profile.id, evidence_policy: evidencePolicy(currentFlow, profile), orchestration: currentFlow.orchestration, artifact_language: currentFlow.artifact_language ?? artifactLanguage, status: currentFlow.status, phase: currentFlow.phase, revision: currentFlow.revision,
        preflight_hash: confirmed.hash,
        effect_summary: { target: `.matrix/archive/${id}`, files: confirmed.fileCount, directories: confirmed.directoryCount, content_bytes: confirmed.totalBytes },
        commit_command: `matrix workflow archive --expect-preflight ${confirmed.hash}${shortcut(currentFlow) ? " --confirmed" : ""}`,
        ...contractFields(currentFlow, contractState(p, currentFlow))
      };
    }
    const captured = captureArchivePreflight(p, id);
    if (captured.failure) return captured.failure;
    if (captured.hash !== expected) return archivePreflightChanged(expected, captured.hash);
    const currentFlow = readFlow(p);
    if (!currentFlow || currentFlow.status !== "active" || currentFlow.phase !== "archive") return archivePreflightChanged(expected, captured.hash);
    const result = guard(p, currentFlow, "archive");
    if (!result.ok) return { ...result, message: result.message ?? "Archive guard failed." };
    const confirmed = captureArchivePreflight(p, id);
    if (confirmed.failure) return confirmed.failure;
    if (confirmed.hash !== expected) return archivePreflightChanged(expected, confirmed.hash);
    const contract = contractState(p, currentFlow);
    const next = { ...currentFlow, schema: "matrix/change/v2", status: "archived", revision: currentFlow.revision + 1, updated_at: stamp() };
    const target = path.join(p.root, "archive", id);
    const sourceEvents = path.join(p.change, "events.jsonl");
    const targetFlow = path.join(target, "matrix.yaml");
    const targetEvents = path.join(target, "events.jsonl");
    return runWorkflowTransaction({
      cwd,
      kind: "archive",
      changeId: id,
      failAfterOperation,
      operations: [
        workflowMoveOperation(cwd, p.change, target),
        workflowWriteOperation(cwd, targetFlow, flowContent(next), { before: captureWorkflowEntry(p.flow) }),
        workflowWriteOperation(cwd, targetEvents, eventContent(sourceEvents, "archived", "archive", "archive", next.revision, { preflight_hash: expected, confirmed: confirmedByUser }), { before: captureWorkflowEntry(sourceEvents) }),
        workflowRemoveOperation(cwd, p.active)
      ],
      result: {
        ok: true, code: "OK", archived: id, change_id: id, workflow: next.workflow, profile: profile.id, evidence_policy: evidencePolicy(next, profile), orchestration: next.orchestration, artifact_language: next.artifact_language ?? artifactLanguage, status: next.status, phase: next.phase, revision: next.revision, next_skill: null, event: "archived",
        preflight_hash: expected,
        effect_summary: { target: `.matrix/archive/${id}`, files: confirmed.fileCount, directories: confirmed.directoryCount, content_bytes: confirmed.totalBytes },
        ...contractFields(next, contract)
      }
    });
  }
  if (command === "handoff") { const destination = path.join(p.artifacts, "handoff.md"); fs.writeFileSync(destination, `# Matrix handoff: ${id}\n\n- Workflow: ${flow.workflow}\n- Current phase: ${flow.phase}\n- Resume with: \`${skill(flow.phase)}\`\n- Guard passes: ${guard(p, flow, flow.phase).ok}\n`); return { ok: true, code: "OK", path: destination }; }
  if (command === "export") {
    if (flow.phase !== "build") return fail("ILLEGAL_PHASE", "Export requires the build phase.");
    if (workflowProfile(p, flow).id === "lightweight") return fail("EXPORT_UNSUPPORTED_WORKFLOW", "Claude export requires the full three-artifact workflow contract.");
    const contract = contractState(p, flow); const failure = contractFailure(flow, contract); if (failure) return failure;
    const taskId = args.includes("--task-id") ? args[args.indexOf("--task-id") + 1] : args[0];
    const target = args.includes("--target") ? args[args.indexOf("--target") + 1] : "generic";
    const applyBoard = args.includes("--apply-fnsec-board");
    if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(taskId ?? "") || !["generic", "fnsec"].includes(target)) return fail("INVALID_INTENT", "export requires a task id and target generic or fnsec.");
    const { proposal, design, plan } = contract.snapshot.contents;
    if (target === "generic") {
      const destination = path.join(p.artifacts, "claude-task.md"); const result = path.join(p.artifacts, "claude-result.md");
      fs.writeFileSync(destination, taskContent(id, taskId, proposal, design, plan, path.relative(cwd, result).replaceAll("\\", "/"), flow.approved_contract_hash, flow.contract_approved_revision));
      return { ok: true, code: "OK", path: destination };
    }
    const tasks = path.join(cwd, "docs", "tasks"); const board = path.join(tasks, "active.md");
    if (!exists(tasks) || !exists(board)) return fail("FNSEC_TARGET_UNAVAILABLE", "FnSec target requires docs/tasks/active.md in the current project.");
    const destination = path.join(tasks, `claude-task-${taskId}.md`); const result = path.join(tasks, `claude-result-${taskId}.md`);
    if (exists(destination) || exists(result)) return fail("FNSEC_TASK_EXISTS", `FnSec task or result path already exists for ${taskId}.`);
    const currentBoard = fs.readFileSync(board, "utf8");
    if (applyBoard && !currentBoard.includes("NO_ACTIVE_OBJECTIVE")) return fail("FNSEC_BOARD_OCCUPIED", "FnSec active.md already has an objective; refused to overwrite it.");
    fs.writeFileSync(destination, taskContent(id, taskId, proposal, design, plan, path.relative(cwd, result).replaceAll("\\", "/"), flow.approved_contract_hash, flow.contract_approved_revision));
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
