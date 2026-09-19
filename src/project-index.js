import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const projectsIndexPath = (home = os.homedir()) => path.join(home, ".matrix", "projects.json");

function writeAtomically(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

export function readProjectsIndex({ home = os.homedir() } = {}) {
  try {
    const parsed = JSON.parse(fs.readFileSync(projectsIndexPath(home), "utf8"));
    if (!Array.isArray(parsed)) return { ok: false, code: "PROJECTS_INDEX_CORRUPT", projects: [] };
    const projects = parsed.filter((entry) => entry && typeof entry.path === "string");
    return { ok: true, projects };
  } catch (error) {
    if (error.code === "ENOENT") return { ok: true, projects: [] };
    return { ok: false, code: "PROJECTS_INDEX_CORRUPT", projects: [] };
  }
}

export function registerProject({ projectRoot, scope, platforms, language, home = os.homedir() } = {}) {
  const resolved = path.resolve(projectRoot);
  const { ok, projects } = readProjectsIndex({ home });
  const next = (ok ? projects : []).filter((entry) => entry.path !== resolved);
  next.unshift({ path: resolved, scope, platforms, language, updatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z") });
  writeAtomically(projectsIndexPath(home), next);
  return { ok: true, projects: next };
}

export function pruneProject({ projectRoot, home = os.homedir() } = {}) {
  const resolved = path.resolve(projectRoot);
  const { ok, projects } = readProjectsIndex({ home });
  if (!ok) return { ok: false, removed: null };
  const removed = projects.find((entry) => entry.path === resolved) ?? null;
  if (!removed) return { ok: true, removed: null };
  writeAtomically(projectsIndexPath(home), projects.filter((entry) => entry.path !== resolved));
  return { ok: true, removed };
}
