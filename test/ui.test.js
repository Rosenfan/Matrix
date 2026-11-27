import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createUi } from "../src/ui.js";

function mockTty(columns = 100) {
  const input = new EventEmitter();
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = (flag) => { input.isRaw = flag; };
  input.resume = () => {};
  input.pause = () => {};

  const chunks = [];
  const output = new EventEmitter();
  output.isTTY = true;
  output.columns = columns;
  output.write = (chunk) => { chunks.push(String(chunk)); return true; };
  return { input, output, chunks, press(name, extra = {}) { input.emit("keypress", "", { name, ...extra }); } };
}

test("banner renders a large Matrix identity without a redundant subtitle", async () => {
  const lines = [];
  const original = console.log;
  console.log = (line = "") => lines.push(line);
  try { await createUi({ color: false }).banner(); } finally { console.log = original; }
  assert.ok(lines[0].split("\n").length >= 6);
  assert.match(lines[1], /Evidence-driven workflow/);
  assert.equal(lines.some((line) => line.includes("NEON WORKFLOW MATRIX")), false);
});

test("interactive select navigates choices and collapses to a single summary line", async () => {
  const tty = mockTty();
  const ui = createUi({ color: false, animate: false, input: tty.input, output: tty.output });
  const pending = ui.select("Default workflow", [
    { label: "Auto (recommended)", value: "auto", badge: "AUTO", detail: "Autonomous run workflow" },
    { label: "Classic", value: "classic", badge: "CLASSIC", detail: "Five-phase workflow" }
  ]);
  assert.ok(tty.chunks.join("").includes("❯ ● Auto (recommended) [AUTO]"));
  tty.press("down");
  assert.ok(tty.chunks.join("").includes("❯ ● Classic [CLASSIC]"));
  tty.press("return");
  const value = await pending;
  assert.equal(value, "classic");
  assert.match(tty.chunks.at(-2) ?? "", /◇\s+Default workflow › Classic/);
  assert.equal(tty.input.isRaw, false);
});

test("interactive selectMany guards against empty selection and supports toggle-all", async () => {
  const tty = mockTty();
  const ui = createUi({ color: false, animate: false, input: tty.input, output: tty.output });
  const pending = ui.selectMany("Platforms", [
    { label: "Claude Code", value: "claude-code", hint: ".claude/skills" },
    { label: "ZCode", value: "zcode", hint: ".zcode/skills" }
  ], { emptyHint: "Pick at least one" });
  // Toggle all off with 'a', then attempt return -> must stay open and show warning
  tty.press("a");
  tty.press("return");
  assert.ok(tty.chunks.join("").includes("Pick at least one"));
  // Move down to ZCode, toggle with space, then confirm
  tty.press("down");
  tty.press("space");
  tty.press("return");
  const selected = await pending;
  assert.deepEqual(selected, ["zcode"]);
  assert.match(tty.chunks.at(-2) ?? "", /◇\s+Platforms › ZCode/);
});

test("interactive confirm supports horizontal toggle and Y/N hotkeys", async () => {
  const tty = mockTty();
  const ui = createUi({ color: false, animate: false, input: tty.input, output: tty.output });
  const first = ui.confirm("Apply changes?", true, { yes: "是", no: "否" });
  tty.press("right");
  tty.press("return");
  assert.equal(await first, false);
  assert.match(tty.chunks.at(-2) ?? "", /◇\s+Apply changes\? › 否/);

  const second = ui.confirm("Repair Matt?", false, { yes: "Yes", no: "No" });
  tty.press("y");
  assert.equal(await second, true);
});

test("task spinner executes action cleanly and restores cursor", async () => {
  const tty = mockTty();
  const ui = createUi({ color: true, animate: true, input: tty.input, output: tty.output });
  const result = await ui.task("Synchronizing Matrix assets...", async () => 42);
  assert.equal(result, 42);
  assert.equal(tty.chunks.at(-1), "\u001b[?25h");
});
