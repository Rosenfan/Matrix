import assert from "node:assert/strict";
import test from "node:test";
import { installMattSkills } from "../src/installer.js";

test("legacy Matt-only installer fails closed without expanding into Matrix side effects", () => {
  assert.throws(
    () => installMattSkills({ projectRoot: "C:/user-project", platforms: ["codex"], timeout: 1 }),
    (error) => error.code === "MATT_DIRECT_INSTALL_UNSUPPORTED" && /matrix init --with-mattpocock/.test(error.message)
  );
});
