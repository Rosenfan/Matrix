import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const PACKAGE_NAME = "@rosenfan/matrix";
const REGISTRY = "https://registry.npmjs.org/@rosenfan%2fmatrix/latest";

function parse(version) {
  const match = String(version ?? "").match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  return match ? { numeric: match.slice(1, 4).map(Number), prerelease: match[4] ?? null } : null;
}

export function compareVersions(left, right) {
  const a = parse(left); const b = parse(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) if (a.numeric[index] !== b.numeric[index]) return a.numeric[index] - b.numeric[index];
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === null) return 1;
  if (b.prerelease === null) return -1;
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true });
}

export async function latestVersion(fetchImpl = fetch) {
  const response = await fetchImpl(REGISTRY, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`registry returned ${response.status}`);
  const body = await response.json();
  if (!parse(body.version)) throw new Error("registry returned an invalid version");
  return body.version;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  return { ok: !result.error && result.status === 0, status: result.status, error: result.error?.message, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

export function validateCandidate(packageRoot, expectedVersion) {
  const manifestFile = path.join(packageRoot, "package.json");
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    if (manifest.name !== PACKAGE_NAME || manifest.version !== expectedVersion) return { ok: false, reason: "candidate package identity mismatch" };
    for (const directory of [".claude/skills", "assets/skills-zh-CN", "src", "bin"]) if (!fs.existsSync(path.join(packageRoot, directory))) return { ok: false, reason: `candidate missing ${directory}` };
    for (const languageRoot of [path.join(packageRoot, ".claude", "skills"), path.join(packageRoot, "assets", "skills-zh-CN")]) if (!fs.existsSync(path.join(languageRoot, "matrix", "SKILL.md"))) return { ok: false, reason: "candidate Matrix assets are incomplete" };
    for (const args of [["--version"], ["--help"], ["workflow", "doctor", "--json"]]) {
      const result = run(process.execPath, [path.join(packageRoot, "bin", "matrix.js"), ...args], { cwd: os.tmpdir() });
      if (!result.ok) return { ok: false, reason: `candidate command failed: matrix ${args.join(" ")}` };
    }
    return { ok: true };
  } catch (error) { return { ok: false, reason: error.message }; }
}

export function npmGlobalRoot() {
  const result = run("npm", ["root", "-g"]);
  if (!result.ok) throw new Error(result.error ?? result.stderr.trim() ?? "npm root -g failed");
  return result.stdout.trim();
}

export function validateRegistryCandidate(version) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-update-"));
  try {
    const install = run("npm", ["install", "--prefix", temporary, "--ignore-scripts", "--no-save", "--package-lock=false", `${PACKAGE_NAME}@${version}`], { cwd: temporary });
    if (!install.ok) return { ok: false, reason: install.error ?? install.stderr.trim() ?? "candidate installation failed" };
    return validateCandidate(path.join(temporary, "node_modules", "@rosenfan", "matrix"), version);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

export function installGlobal(version) {
  const result = run("npm", ["install", "--global", `${PACKAGE_NAME}@${version}`]);
  return result.ok ? { ok: true } : { ok: false, reason: result.error ?? result.stderr.trim() ?? "npm install failed" };
}

export function selfUpdate(currentVersion, targetVersion) {
  const candidate = validateRegistryCandidate(targetVersion);
  if (!candidate.ok) return candidate;
  const install = installGlobal(targetVersion);
  if (install.ok) return install;
  const rollback = installGlobal(currentVersion);
  return { ok: false, reason: `${install.reason}; ${rollback.ok ? `restored ${currentVersion}` : `rollback failed: ${rollback.reason}`}` };
}

export function globalBinPath() { return path.join(npmGlobalRoot(), "@rosenfan", "matrix", "bin", "matrix.js"); }
