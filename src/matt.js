import { execFileSync } from "node:child_process";
import { PLATFORMS, MATT_SKILLS } from "./catalog.js";

export function defaultProcessRunner({ command, args, cwd, timeout }) {
  const executable = process.platform === "win32" && command === "npx" ? "npx.cmd" : command;
  // The only shell-enabled case is the Windows npm shim; all inputs are catalog values.
  return execFileSync(executable, args, { cwd, stdio: "inherit", timeout, shell: process.platform === "win32" && command === "npx" });
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
