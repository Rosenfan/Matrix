import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("matrix_state.py")
RUNTIME = Path(__file__).resolve().parents[4] / "src" / "workflow.js"
NODE_DIRECTORY = str(Path(shutil.which("node") or "").parent)
class MatrixStateTests(unittest.TestCase):
    def invoke(self, *args, cwd):
        env = {**os.environ, "PATH": NODE_DIRECTORY, "MATRIX_DEVELOPMENT_RUNTIME": str(RUNTIME)}
        return subprocess.run([sys.executable, str(SCRIPT), *args], cwd=cwd, env=env, text=True, capture_output=True)
    def test_phase_guard_and_recovery(self):
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp); result = self.invoke("init", "sample", "--title", "Sample", cwd=cwd); self.assertEqual(result.returncode, 0)
            self.assertTrue((cwd / ".matrix" / "active.json").exists())
            self.assertFalse((cwd / ".codex").exists())
            self.assertNotEqual(self.invoke("transition", "design", cwd=cwd).returncode, 0)
            p = cwd / ".matrix/changes/sample/artifacts"
            (p / "proposal.md").write_text("## Goal\nx\n\n## Scope\nx\n\n## Non-goals\nx\n\n## Acceptance\nx\n\n## Risks\nx\n" * 4)
            self.assertEqual(self.invoke("transition", "design", cwd=cwd).returncode, 0)
            self.assertEqual(json.loads(self.invoke("inspect", cwd=cwd).stdout)["phase"], "design")

    def test_full_lifecycle_requires_evidence(self):
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp); self.assertEqual(self.invoke("init", "full", "--title", "Full", cwd=cwd).returncode, 0)
            p = cwd / ".matrix/changes/full/artifacts"
            (p / "proposal.md").write_text("## Goal\nx\n\n## Scope\nx\n\n## Non-goals\nx\n\n## Acceptance\nx\n\n## Risks\nx\n" * 4)
            self.assertEqual(self.invoke("transition", "design", cwd=cwd).returncode, 0)
            self.assertNotEqual(self.invoke("transition", "build", cwd=cwd).returncode, 0)
            (p / "design.md").write_text("## Decisions\nx\n\n## Boundaries\nx\n\n## Test seams\nx\n\n## Risks\nx\n" * 4)
            (p / "plan.md").write_text("## Steps\nx\n\n## Validation\nx\n\n## Stop conditions\nx\n" * 4)
            self.assertEqual(self.invoke("transition", "build", cwd=cwd).returncode, 0)
            (p / "verification.md").write_text("## Build evidence\nThe focused implementation test command completed successfully with an expected result.\n")
            self.assertEqual(self.invoke("transition", "verify", cwd=cwd).returncode, 0)
            self.assertNotEqual(self.invoke("transition", "archive", cwd=cwd).returncode, 0)
            (p / "verification.md").write_text("## Build evidence\nThe focused implementation test command completed successfully with an expected result.\n\n## Test evidence\nThe acceptance command passed and its output was reviewed for the requested behavior.\n\n## Review evidence\nThe fixed-baseline standards and specification review found no blocking issue.\n")
            self.assertEqual(self.invoke("transition", "archive", cwd=cwd).returncode, 0)
            preflight = self.invoke("archive", "--dry-run", cwd=cwd)
            self.assertEqual(preflight.returncode, 0)
            token = json.loads(preflight.stdout)["preflight_hash"]
            self.assertEqual(self.invoke("archive", "--expect-preflight", token, cwd=cwd).returncode, 0)
            self.assertTrue((cwd / ".matrix/archive/full/matrix.yaml").exists())
if __name__ == "__main__": unittest.main()
