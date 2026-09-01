import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PLATFORMS, hashDirectory } from "./catalog.js";
import { MATT_CATALOG_DIGEST, MATT_COMPATIBILITY, MATT_CONTENT_HASHES, MATT_INSTALLABLE_SKILLS } from "./matt-catalog.mjs";

export const mattReceiptPath = (projectRoot) => path.join(path.resolve(projectRoot), ".matrix", "matt-installation.json");

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function releaseOrder(left, right) {
  const parse = (value) => String(value ?? "").replace(/^v/, "").split(".").map((part) => Number(part));
  const a = parse(left); const b = parse(right);
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return null;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) > (b[index] ?? 0) ? 1 : -1;
  }
  return 0;
}

export function inspectMattInstallation({ projectRoot, platforms, home = os.homedir(), contentHashes = MATT_CONTENT_HASHES }) {
  const receipt = readJson(mattReceiptPath(projectRoot));
  const selected = [...new Set(platforms ?? Object.keys(receipt?.platforms ?? {}))];
  const localPresence = selected.reduce((count, platform) => {
    const root = PLATFORMS[platform]?.skillRoot(projectRoot);
    return count + MATT_INSTALLABLE_SKILLS.filter((skill) => root && fs.existsSync(path.join(root, skill, "SKILL.md"))).length;
  }, 0);
  const base = { supported: MATT_COMPATIBILITY, installed: receipt?.compatibility?.release ?? "unknown", action: "matrix init . --with-mattpocock" };
  if (!receipt) return { ...base, status: localPresence ? "unverified" : "incomplete", platforms: [] };
  const order = releaseOrder(receipt.compatibility?.release, MATT_COMPATIBILITY.release);
  if (order !== 0 || receipt.compatibility?.commit !== MATT_COMPATIBILITY.commit || receipt.catalogDigest !== MATT_CATALOG_DIGEST) {
    return { ...base, status: order != null && order > 0 ? "unsupported-newer" : "update-required", platforms: [] };
  }
  try {
    const findings = selected.map((platform) => {
      const root = PLATFORMS[platform].skillRoot(projectRoot);
      const records = receipt.platforms?.[platform]?.skills ?? {};
      const missing = MATT_INSTALLABLE_SKILLS.filter((skill) => !fs.existsSync(path.join(root, skill, "SKILL.md")) || !records[skill]?.hash);
      const modified = MATT_INSTALLABLE_SKILLS.filter((skill) => !missing.includes(skill) && (() => {
        const actual = hashDirectory(path.join(root, skill));
        return actual !== records[skill].hash || actual !== contentHashes[skill];
      })());
      const globalRoot = PLATFORMS[platform].skillRoot(home);
      const ignoredGlobal = MATT_INSTALLABLE_SKILLS.filter((skill) => !fs.existsSync(path.join(root, skill, "SKILL.md")) && fs.existsSync(path.join(globalRoot, skill, "SKILL.md"))).length;
      return { platform, root, missing, modified, ignoredGlobal };
    });
    const status = findings.some((item) => item.missing.length) ? "incomplete"
      : findings.some((item) => item.modified.length) ? "user-modified" : "compatible";
    return { ...base, status, action: status === "compatible" ? null : base.action, platforms: findings };
  } catch (error) {
    return { ...base, status: "unknown", message: error.message, platforms: [] };
  }
}

export function buildProcessInvocation({ command, args, platform = process.platform, nodeExecutable = process.execPath, npmCliPath }) {
  if (platform !== "win32" || command !== "npx") return { executable: command, args, shell: false };
  const candidates = [npmCliPath, process.env.npm_execpath, path.join(path.dirname(nodeExecutable), "node_modules", "npm", "bin", "npm-cli.js")].filter(Boolean);
  const cli = candidates.find((candidate) => npmCliPath || fs.existsSync(candidate));
  if (!cli) throw new Error("npm CLI was not found beside the Node runtime.");
  const [yes, packageSpec, ...commandArgs] = args;
  if (yes !== "--yes" || !packageSpec) throw new Error("Windows npx invocation must use fixed npm exec arguments.");
  return { executable: nodeExecutable, args: [cli, "exec", yes, packageSpec, "--", ...commandArgs], shell: false };
}

export function defaultProcessRunner({ command, args, cwd, timeout, stdio = "inherit" }) {
  const invocation = buildProcessInvocation({ command, args });
  return execFileSync(invocation.executable, invocation.args, { cwd, stdio, timeout, shell: invocation.shell });
}

export function createMattAdapter({
  run = defaultProcessRunner,
  stdio = "inherit",
  makeTemporary = () => fs.mkdtempSync(path.join(os.tmpdir(), "matrix-matt-")),
  remove = (target) => fs.rmSync(target, { recursive: true, force: true }),
  verifyCandidate = ({ root, platforms, skills }) => {
    for (const platform of platforms) for (const skill of skills) {
      const installed = path.join(PLATFORMS[platform].skillRoot(root), skill);
      if (hashDirectory(installed) !== MATT_CONTENT_HASHES[skill]) throw new Error(`Matt candidate content did not match the reviewed release: ${platform}/${skill}`);
    }
  }
} = {}) {
  return {
    installMissing() {
      return {
        ok: false,
        code: "MATT_DIRECT_INSTALL_UNSUPPORTED",
        message: "Direct Matt installation was retired; use matrix init --with-mattpocock so Distribution owns staging, backup, and recovery.",
        recovery: "Run matrix init --with-mattpocock."
      };
    },
    prepareCandidate({ platforms, skills = MATT_INSTALLABLE_SKILLS, timeout = 300_000 }) {
      const root = makeTemporary();
      const attempted = [];
      try {
        for (const platform of platforms) {
          const args = ["--yes", MATT_COMPATIBILITY.skillsCli, "add", MATT_COMPATIBILITY.archive, "--yes", "--copy", "--agent", PLATFORMS[platform].skillsCliAgent];
          for (const skill of skills) args.push("--skill", skill);
          run({ command: "npx", args, cwd: root, timeout, stdio });
          attempted.push(platform);
        }
        verifyCandidate({ root, platforms, skills });
        return {
          ok: true,
          code: "OK",
          root,
          attempted,
          platforms: Object.fromEntries(platforms.map((platform) => [platform, PLATFORMS[platform].skillRoot(root)]))
        };
      } catch (error) {
        remove(root);
        return {
          ok: false,
          code: "MATT_INSTALL_FAILED",
          attempted,
          message: error.message,
          recovery: "Run matrix init --with-mattpocock after resolving the skills CLI error."
        };
      }
    },
    discardCandidate(candidate) {
      if (candidate?.root) remove(candidate.root);
    }
  };
}
