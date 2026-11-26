import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { workflowWriteOperation } from "./workflow-transaction.js";

// Project-level `.matrix` conventions shared by the bundled Runtime and the global CLI:
// the flat `config.yaml` reader, the resolved workflow settings, and the managed
// `.gitignore` block that keeps runtime state and raw check logs out of Git.
export const WORKFLOWS = Object.freeze(["auto", "classic"]);
export const AUTONOMY_LEVELS = Object.freeze(["balanced", "strict"]);
export const RUN_LIMITS = Object.freeze({
  max_iterations: 5,
  max_stagnation: 2,
  max_submit_failures: 5,
  max_verifier_attempts: 3,
  check_timeout_ms: 120000
});

const MANAGED_BEGIN = "# BEGIN MATRIX MANAGED";
const MANAGED_END = "# END MATRIX MANAGED";
export const MATRIX_MANAGED_IGNORES = Object.freeze([
  "active.json",
  "current-run.json",
  "installation.json",
  "matt-installation.json",
  "workflow.lock",
  "transactions/",
  "staging/",
  "backups/",
  "runs/*/logs/",
  "archive/runs/*/logs/",
  "changes/*/events.jsonl",
  "changes/*/artifacts/handoff.md",
  "**/*.tmp"
]);

// Cuts an unquoted trailing `#` comment. A `#` only starts a comment at the beginning of
// the value or after whitespace, so values such as `http://host#fragment` stay intact.
function stripComment(value) {
  let quote = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) { if (character === quote) quote = null; }
    else if (character === '"' || character === "'") quote = character;
    else if (character === "#" && (index === 0 || /\s/.test(value[index - 1]))) return value.slice(0, index);
  }
  return value;
}
const unquote = (value) => value.length > 1 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) ? value.slice(1, -1) : value;

// Flat `key: value` reader for `.matrix/config.yaml`. It is deliberately not used for
// `matrix.yaml`, whose free-text values (titles) may legitimately contain `#`.
export function readConfigYaml(file) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); }
  catch { return {}; }
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon <= 0 || /^\s/.test(line)) continue;
    values[line.slice(0, colon).trim()] = unquote(stripComment(line.slice(colon + 1)).trim());
  }
  return values;
}

const positiveInt = (value, fallback) => { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback; };

// `default_workflow` resolves like `default_orchestration` already does: the project
// config wins, then the installation manifest of the configured scope (the only source for
// projects served by a global installation), then `classic` so upgraded projects keep their
// behavior until the user switches explicitly.
export function resolveWorkflowConfig(projectRoot, { home = os.homedir() } = {}) {
  const root = path.resolve(projectRoot);
  const config = readConfigYaml(path.join(root, ".matrix", "config.yaml"));
  const scope = config.installation_scope === "global" ? "global" : "project";
  const manifestFile = scope === "global" ? path.join(home, ".matrix", "installation.json") : path.join(root, ".matrix", "installation.json");
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")); } catch {}
  const limits = Object.fromEntries(Object.entries(RUN_LIMITS).map(([key, fallback]) => [key, positiveInt(config[key], fallback)]));
  return {
    default_workflow: WORKFLOWS.includes(config.default_workflow) ? config.default_workflow : WORKFLOWS.includes(manifest?.workflow) ? manifest.workflow : "classic",
    autonomy_level: AUTONOMY_LEVELS.includes(config.autonomy_level) ? config.autonomy_level : "balanced",
    scope,
    manifest,
    limits
  };
}

export function managedGitignoreText(existing) {
  const block = [MANAGED_BEGIN, ...MATRIX_MANAGED_IGNORES, MANAGED_END].join("\n");
  if (existing == null) return `${block}\n`;
  const lines = existing.split(/\r?\n/);
  const begin = lines.indexOf(MANAGED_BEGIN);
  const end = lines.indexOf(MANAGED_END);
  const kept = (begin >= 0 && end > begin ? [...lines.slice(0, begin), ...lines.slice(end + 1)] : lines)
    // Unmanaged duplicates of managed entries are dropped: the block already carries them.
    .filter((line) => line.trim() !== "" && !MATRIX_MANAGED_IGNORES.includes(line.trim()));
  return kept.length ? `${kept.join("\n")}\n\n${block}\n` : `${block}\n`;
}

export function managedGitignoreOperation(cwd) {
  const file = path.join(cwd, ".matrix", ".gitignore");
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  const next = managedGitignoreText(current);
  return next === current ? null : workflowWriteOperation(cwd, file, next);
}

// Non-journaled variant for the installer: the block is idempotent and only ever adds
// ignore rules, so leaving it behind after a failed installation is harmless.
export function ensureMatrixGitignore(cwd) {
  const file = path.join(cwd, ".matrix", ".gitignore");
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  const next = managedGitignoreText(current);
  if (next === current) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, next);
  fs.renameSync(temporary, file);
  return true;
}
