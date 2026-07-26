import assert from "node:assert/strict";
import test from "node:test";
import { createUi } from "../src/ui.js";

test("banner renders a large Matrix identity without a redundant subtitle", async () => {
  const lines = [];
  const original = console.log;
  console.log = (line = "") => lines.push(line);
  try { await createUi({ color: false }).banner(); } finally { console.log = original; }
  assert.ok(lines[0].split("\n").length >= 6);
  assert.match(lines[1], /Evidence-driven workflow/);
  assert.equal(lines.some((line) => line.includes("NEON WORKFLOW MATRIX")), false);
});
