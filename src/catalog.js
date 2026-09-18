import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MATT_INSTALLABLE_SKILLS, MATT_ROLES } from "./matt-catalog.mjs";

export const LANGUAGE_IDS = ["en", "zh-CN"];
export const PLATFORM_IDS = ["claude-code", "codex"];
export const MATRIX_SKILLS = [
  "matrix", "matrix-open", "matrix-design", "matrix-build", "matrix-verify",
  "matrix-archive", "matrix-hotfix", "matrix-tweak", "matrix-status", "matrix-claude"
];
export const MATT_SKILLS = MATT_INSTALLABLE_SKILLS;
export const UNMANAGED_MATT_SKILLS = MATT_ROLES.incompatible;

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageManifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
export const MATRIX_VERSION = packageManifest.version;

export const PLATFORMS = {
  "claude-code": {
    id: "claude-code", name: "Claude Code", skillsCliAgent: "claude-code",
    skillRoot(base) { return path.join(base, ".claude", "skills"); },
    legacyRoots() { return []; }
  },
  codex: {
    id: "codex", name: "Codex", skillsCliAgent: "codex",
    skillRoot(base) { return path.join(base, ".agents", "skills"); },
    legacyRoots(base) { return [path.join(base, ".codex", "skills")]; }
  }
};

export function sourceSkillsRoot(language = "en") {
  const localized = language === "zh-CN"
    ? path.join(packageRoot, "assets", "skills-zh-CN")
    : path.join(packageRoot, "assets", "skills");
  if (!fs.existsSync(localized)) throw new Error(`Matrix package is incomplete: ${language} assets are missing.`);
  return localized;
}

export function scopeBase(scope, projectRoot, home = os.homedir()) {
  return scope === "global" ? home : projectRoot;
}

export function installationRoot(scope, projectRoot, home) {
  return path.join(scopeBase(scope, projectRoot, home), ".matrix");
}

export function manifestPath(scope, projectRoot, home) {
  return path.join(installationRoot(scope, projectRoot, home), "installation.json");
}

// Content digests must identify logical file content, not checkout line endings:
// a git working tree (autocrlf CRLF), the npm tarball and a local tgz must agree.
const normalizeEol = (contents) => Buffer.from(contents.toString("utf8").replaceAll("\r\n", "\n").replaceAll("\r", "\n"), "utf8");

export function hashDirectory(directory, extraFiles = []) {
  const hash = crypto.createHash("sha256");
  const files = new Map();
  const visit = (current, relative = "") => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = path.join(current, entry.name);
      const childRelative = path.join(relative, entry.name).replaceAll("\\", "/");
      if (entry.isDirectory()) visit(child, childRelative);
      else if (entry.isFile()) {
        files.set(childRelative, fs.readFileSync(child));
      }
    }
  };
  visit(directory);
  for (const extra of extraFiles) files.set(extra.path, Buffer.from(extra.contents));
  for (const [relative, contents] of [...files.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    hash.update(`${relative}\0`);
    hash.update(normalizeEol(contents));
  }
  return hash.digest("hex");
}

export function workflowRuntimeSource() { return path.join(packageRoot, "src", "workflow.js"); }
export function workflowTransactionSource() { return path.join(packageRoot, "src", "workflow-transaction.js"); }
export function mattCatalogSource() { return path.join(packageRoot, "src", "matt-catalog.mjs"); }

export function releaseCatalog(language = "en") {
  if (!LANGUAGE_IDS.includes(language)) throw new Error(`Unsupported language: ${language}`);
  const root = sourceSkillsRoot(language);
  const missing = MATRIX_SKILLS.filter((skill) => !fs.existsSync(path.join(root, skill, "SKILL.md")));
  if (missing.length) throw new Error(`Matrix package is incomplete. Missing: ${missing.join(", ")}`);
  const runtime = fs.readFileSync(workflowRuntimeSource());
  const transaction = fs.readFileSync(workflowTransactionSource());
  const mattCatalog = fs.readFileSync(mattCatalogSource());
  const sharedRuntimeFiles = [
    { path: "scripts/package.json", contents: Buffer.from('{"type":"module"}\n') },
    { path: "scripts/matrix-runtime.mjs", contents: runtime },
    { path: "scripts/workflow-transaction.js", contents: transaction },
    { path: "scripts/matt-catalog.mjs", contents: mattCatalog }
  ];
  const compatibilityFiles = ["matrix_state.py", "matrix_claude.py"].map((filename) => ({
    path: `scripts/${filename}`,
    contents: fs.readFileSync(path.join(sourceSkillsRoot("en"), "matrix", "scripts", filename))
  }));
  const skills = Object.fromEntries(MATRIX_SKILLS.map((skill) => [skill, hashDirectory(
    path.join(root, skill),
    skill === "matrix" ? [...sharedRuntimeFiles, ...compatibilityFiles] : sharedRuntimeFiles
  )]));
  return { language, root, version: MATRIX_VERSION, skills, digest: crypto.createHash("sha256").update(JSON.stringify(skills)).digest("hex") };
}
