import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { hashDirectory, sourceSkillsRoot } from "../src/catalog.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function makeTree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-hash-"));
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  return root;
}

test("hashDirectory is stable across CRLF, CR and LF encodings of the same content", () => {
  const lf = makeTree({ "a.md": "line1\nline2\n", "nested/b.txt": "value1\nvalue2\n" });
  const crlf = makeTree({ "a.md": "line1\r\nline2\r\n", "nested/b.txt": "value1\r\nvalue2\r\n" });
  const cr = makeTree({ "a.md": "line1\rline2\r", "nested/b.txt": "value1\rvalue2\r" });
  const mixed = makeTree({ "a.md": "line1\r\nline2\n", "nested/b.txt": "value1\rvalue2\r\n" });
  const baseline = hashDirectory(lf);
  assert.equal(hashDirectory(crlf), baseline);
  assert.equal(hashDirectory(cr), baseline);
  assert.equal(hashDirectory(mixed), baseline);
});

test("hashDirectory matches the documented path-and-content digest algorithm", () => {
  const root = makeTree({ "a.md": "line1\nline2\n" });
  const expected = crypto.createHash("sha256").update("a.md\0").update("line1\nline2\n").digest("hex");
  assert.equal(hashDirectory(root), expected);
});

test("hashDirectory still distinguishes different content and honors extraFiles", () => {
  const left = makeTree({ "a.md": "one\n" });
  const right = makeTree({ "a.md": "two\n" });
  assert.notEqual(hashDirectory(left), hashDirectory(right));
  const withExtra = hashDirectory(left, [{ path: "extra.txt", contents: "extra\n" }]);
  const expectedExtra = crypto.createHash("sha256").update("a.md\0").update("one\n").update("extra.txt\0").update("extra\n").digest("hex");
  assert.equal(withExtra, expectedExtra);
  assert.notEqual(withExtra, hashDirectory(left));
});

test("hashDirectory ignores generated cache directories", () => {
  const clean = makeTree({ "scripts/tool.py": "print(1)\n" });
  const dirty = makeTree({ "scripts/tool.py": "print(1)\n", "scripts/__pycache__/tool.cpython-313.pyc": "bytes" });
  assert.equal(hashDirectory(dirty), hashDirectory(clean));
});

test("English release skills live in the platform-neutral assets source directory", () => {
  assert.equal(sourceSkillsRoot("en"), path.join(repoRoot, "assets", "skills"));
  assert.equal(sourceSkillsRoot("zh-CN"), path.join(repoRoot, "assets", "skills-zh-CN"));
  assert.equal(fs.existsSync(path.join(repoRoot, ".claude", "skills")), false);
});
