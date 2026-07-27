import assert from "node:assert/strict";
import test from "node:test";
import { buildProcessInvocation, createMattAdapter } from "../src/matt.js";

test("Matt adapter uses fixed selected-platform arguments and a bounded timeout", () => {
  const calls = [];
  const adapter = createMattAdapter({ run: (request) => calls.push(request) });
  const result = adapter.installMissing({ projectRoot: "C:/project", platforms: ["claude-code", "codex"], skills: ["tdd"], global: true, timeout: 1234 });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].args, ["--yes", "skills@latest", "add", "mattpocock/skills", "--yes", "--agent", "claude-code", "--skill", "tdd", "--global"]);
  assert.equal(calls[1].args[6], "codex");
  assert.equal(calls[0].timeout, 1234);
});

test("Matt adapter returns a recovery diagnostic for launch or command failure", () => {
  const adapter = createMattAdapter({ run: () => { throw new Error("spawn npx ENOENT"); } });
  const result = adapter.installMissing({ projectRoot: "C:/project", platforms: ["codex"] });
  assert.equal(result.ok, false);
  assert.equal(result.code, "MATT_INSTALL_FAILED");
  assert.match(result.recovery, /matrix init/);
});

test("Matt adapter requests grilling when installing the default companion cohort", () => {
  const calls = [];
  const adapter = createMattAdapter({ run: (request) => calls.push(request) });
  assert.equal(adapter.installMissing({ projectRoot: "C:/project", platforms: ["codex"] }).ok, true);
  assert.ok(calls[0].args.includes("grilling"));
});

test("Windows npx invocation runs npm's Node CLI without a shell", () => {
  const invocation = buildProcessInvocation({
    command: "npx", args: ["--yes", "skills@latest", "add", "mattpocock/skills"], platform: "win32",
    nodeExecutable: "C:/node/node.exe", npmCliPath: "C:/node/node_modules/npm/bin/npm-cli.js"
  });
  assert.equal(invocation.executable, "C:/node/node.exe");
  assert.deepEqual(invocation.args, ["C:/node/node_modules/npm/bin/npm-cli.js", "exec", "--yes", "skills@latest", "--", "add", "mattpocock/skills"]);
  assert.equal(invocation.shell, false);
});
