import fs from "node:fs";
import path from "node:path";

// Windows CreateProcess cannot launch npm.cmd, so npm/npx must run as
// `node <npm-cli.js> ...`. Resolution order: explicit path, npm_execpath,
// the npm bundled beside the running Node. Non-Windows returns the command
// unchanged so every caller keeps its POSIX behavior.
export function resolveNpmCli({ platform = process.platform, nodeExecutable = process.execPath, npmCliPath } = {}) {
  if (platform !== "win32") return null;
  const candidates = [npmCliPath, process.env.npm_execpath, path.join(path.dirname(nodeExecutable), "node_modules", "npm", "bin", "npm-cli.js")].filter(Boolean);
  const cli = candidates.find((candidate) => npmCliPath || fs.existsSync(candidate));
  if (!cli) throw new Error("npm CLI was not found beside the Node runtime. Install the package manually with `npm i -g <package>` or reinstall Node.js so its bundled npm is present.");
  return cli;
}

export function buildNpmProcessInvocation({ command, args, platform = process.platform, nodeExecutable = process.execPath, npmCliPath }) {
  if (platform !== "win32" || (command !== "npm" && command !== "npx")) return { executable: command, args, shell: false };
  const cli = resolveNpmCli({ platform, nodeExecutable, npmCliPath });
  if (command === "npm") return { executable: nodeExecutable, args: [cli, ...args], shell: false };
  const [yes, packageSpec, ...commandArgs] = args;
  if (yes !== "--yes" || !packageSpec) throw new Error("Windows npx invocation must use fixed npm exec arguments.");
  return { executable: nodeExecutable, args: [cli, "exec", yes, packageSpec, "--", ...commandArgs], shell: false };
}
