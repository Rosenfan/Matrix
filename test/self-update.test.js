import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions } from "../src/self-update.js";

test("self-update version comparison handles stable and prerelease ordering", () => {
  assert.equal(compareVersions("0.1.3", "0.1.2") > 0, true);
  assert.equal(compareVersions("0.1.2", "0.1.2"), 0);
  assert.equal(compareVersions("0.1.2-beta.1", "0.1.2") < 0, true);
  assert.equal(compareVersions("not-a-version", "0.1.2"), null);
});
