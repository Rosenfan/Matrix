import fs from "node:fs";
import path from "node:path";
import { createDistribution } from "./distribution.js";
import { MATRIX_SKILLS, MATT_SKILLS, PLATFORMS, sourceSkillsRoot } from "./catalog.js";

export { MATRIX_SKILLS, MATT_SKILLS, sourceSkillsRoot };

export function destinationFor({ scope, projectRoot, platform = "claude-code", home }) {
  const base = scope === "global" ? (home ?? process.env.USERPROFILE ?? process.env.HOME) : projectRoot;
  return PLATFORMS[platform].skillRoot(base);
}

export function inspectInstallation(destination) {
  const inspect = (names) => names.filter((skill) => {
    try { return Boolean(destination) && requireExists(destination, skill); } catch { return false; }
  });
  const installed = inspect(MATRIX_SKILLS);
  const mattInstalled = inspect(MATT_SKILLS);
  return { installed, missing: MATRIX_SKILLS.filter((skill) => !installed.includes(skill)), mattInstalled, mattMissing: MATT_SKILLS.filter((skill) => !mattInstalled.includes(skill)) };
}

function requireExists(destination, skill) {
  // Avoid exposing a second installation policy through this legacy helper.
  return fs.existsSync(path.join(destination, skill, "SKILL.md"));
}

export function installMatrix({ destination, mode = "copy", conflict = "error", dryRun = false }) {
  const platform = destination?.includes(".agents") ? "codex" : "claude-code";
  const projectRoot = path.resolve(destination, "..", "..");
  const distribution = createDistribution();
  const evaluation = distribution.evaluate({ projectRoot, scope: "project", platforms: [platform], mode, matrixPolicy: conflict === "replace" ? "replace" : "safe", dryRun });
  if (!evaluation.ok) throw new Error(evaluation.diagnostics?.[0]?.message ?? evaluation.code);
  const result = distribution.commit(evaluation.plan);
  if (!result.ok) throw new Error(result.error ?? result.code);
  return { installed: result.committed ?? MATRIX_SKILLS, skipped: [], existing: [], backupRoot: result.backups?.[0] ? result.backups[0].backup : null };
}

export function installMattSkills({ projectRoot, platforms = ["claude-code"], skills = MATT_SKILLS, global = false, timeout = 300_000 }) {
  void projectRoot; void platforms; void skills; void global; void timeout;
  const error = new Error("Direct Matt installation was retired; run matrix init --with-mattpocock so Distribution owns the complete Matrix/Matt transaction.");
  error.code = "MATT_DIRECT_INSTALL_UNSUPPORTED";
  throw error;
}

export function findPython() { return null; }
