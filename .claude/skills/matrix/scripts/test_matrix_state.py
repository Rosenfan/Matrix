import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("matrix_state.py")
class MatrixStateTests(unittest.TestCase):
    def invoke(self, *args, cwd): return subprocess.run([sys.executable, str(SCRIPT), *args], cwd=cwd, text=True, capture_output=True)
    def test_phase_guard_and_recovery(self):
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp); result = self.invoke("init", "sample", "--title", "Sample", cwd=cwd); self.assertEqual(result.returncode, 0)
            self.assertNotEqual(self.invoke("transition", "design", cwd=cwd).returncode, 0)
            p = cwd / ".codex/matrix/changes/sample/artifacts"
            (p / "proposal.md").write_text("## Goal\nx\n\n## Scope\nx\n\n## Acceptance\nx\n" * 4)
            self.assertEqual(self.invoke("transition", "design", cwd=cwd).returncode, 0)
            self.assertIn('"phase": "design"', self.invoke("inspect", cwd=cwd).stdout)

    def test_full_lifecycle_requires_evidence(self):
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp); self.assertEqual(self.invoke("init", "full", "--title", "Full", cwd=cwd).returncode, 0)
            p = cwd / ".codex/matrix/changes/full/artifacts"
            (p / "proposal.md").write_text("## Goal\nx\n\n## Scope\nx\n\n## Acceptance\nx\n" * 4)
            self.assertEqual(self.invoke("transition", "design", cwd=cwd).returncode, 0)
            self.assertNotEqual(self.invoke("transition", "build", cwd=cwd).returncode, 0)
            (p / "design.md").write_text("## Decisions\nx\n\n## Test seams\nx\n" * 4)
            (p / "plan.md").write_text("## Steps\nx\n\n## Validation\nx\n" * 4)
            self.assertEqual(self.invoke("transition", "build", cwd=cwd).returncode, 0)
            (p / "verification.md").write_text("## Build evidence\nThe focused implementation test command completed successfully with an expected result.\n")
            self.assertEqual(self.invoke("transition", "verify", cwd=cwd).returncode, 0)
            self.assertNotEqual(self.invoke("transition", "archive", cwd=cwd).returncode, 0)
            (p / "verification.md").write_text("## Build evidence\nThe focused implementation test command completed successfully with an expected result.\n\n## Test evidence\nThe acceptance command passed and its output was reviewed for the requested behavior.\n\n## Review evidence\nThe fixed-baseline standards and specification review found no blocking issue.\n")
            self.assertEqual(self.invoke("transition", "archive", cwd=cwd).returncode, 0)
            self.assertEqual(self.invoke("archive", cwd=cwd).returncode, 0)
            self.assertTrue((cwd / ".codex/matrix/archive/full/matrix.yaml").exists())
if __name__ == "__main__": unittest.main()
