import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PLATFORMS, MATT_SKILLS } from "./catalog.js";

export function buildProcessInvocation({ command, args, platform = process.platform, nodeExecutable = process.execPath, npmCliPath }) {
  if (platform !== "win32" || command !== "npx") return { executable: command, args, shell: false };
  const candidates = [npmCliPath, process.env.npm_execpath, path.join(path.dirname(nodeExecutable), "node_modules", "npm", "bin", "npm-cli.js")].filter(Boolean);
  const cli = candidates.find((candidate) => npmCliPath || fs.existsSync(candidate));
  if (!cli) throw new Error("npm CLI was not found beside the Node runtime.");
  const [yes, packageSpec, ...commandArgs] = args;
  if (yes !== "--yes" || !packageSpec) throw new Error("Windows npx invocation must use fixed npm exec arguments.");
  return { executable: nodeExecutable, args: [cli, "exec", yes, packageSpec, "--", ...commandArgs], shell: false };
}

export function defaultProcessRunner({ command, args, cwd, timeout }) {
  const invocation = buildProcessInvocation({ command, args });
  return execFileSync(invocation.executable, invocation.args, { cwd, stdio: "inherit", timeout, shell: invocation.shell });
}

export function createMattAdapter({ run = defaultProcessRunner } = {}) {
  return {
    installMissing({ projectRoot, platforms, skills = MATT_SKILLS, global = false, timeout = 300_000 }) {
      const attempted = [];
      try {
        for (const platform of platforms) {
          const args = ["--yes", "skills@latest", "add", "mattpocock/skills", "--yes", "--agent", PLATFORMS[platform].skillsCliAgent];
          for (const skill of skills) args.push("--skill", skill);
          if (global) args.push("--global");
          run({ command: "npx", args, cwd: projectRoot, timeout });
          attempted.push(platform);
        }
        return { ok: true, code: "OK", attempted };
      } catch (error) {
        return {
          ok: false,
          code: "MATT_INSTALL_FAILED",
          attempted,
          message: error.message,
          recovery: "Run matrix init --with-mattpocock after resolving the skills CLI error."
        };
      }
    }
  };
}
