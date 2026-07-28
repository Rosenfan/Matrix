import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

STATE = Path(__file__).with_name("matrix_state.py")
CLAUDE = Path(__file__).with_name("matrix_claude.py")
RUNTIME = Path(__file__).resolve().parents[4] / "src" / "workflow.js"
NODE_DIRECTORY = str(Path(shutil.which("node") or "").parent)


class MatrixClaudeTests(unittest.TestCase):
    def invoke(self, script, *args, cwd):
        env = {**os.environ, "PATH": NODE_DIRECTORY, "MATRIX_DEVELOPMENT_RUNTIME": str(RUNTIME)}
        return subprocess.run([sys.executable, str(script), *args], cwd=cwd, env=env, text=True, capture_output=True)

    def inspect(self, cwd):
        return json.loads(self.invoke(STATE, "inspect", cwd=cwd).stdout)

    def make_design_change(self, cwd):
        self.assertEqual(self.invoke(STATE, "init", "bridge", "--title", "Bridge", cwd=cwd).returncode, 0)
        artifacts = cwd / ".matrix/changes/bridge/artifacts"
        (artifacts / "proposal.md").write_text("## Goal\nBuild a bounded feature.\n\n## Scope\nOne module only.\n\n## Non-goals\nNo extra work.\n\n## Acceptance\nA focused test passes.\n\n## Risks\nKnown risk.\n")
        self.assertEqual(self.invoke(STATE, "transition", "design", cwd=cwd).returncode, 0)
        (artifacts / "design.md").write_text("## Decisions\nKeep one public seam.\n\n## Boundaries\nOne public seam only.\n\n## Test seams\nUse the public interface.\n\n## Risks\nKnown risk.\n")
        (artifacts / "plan.md").write_text("## Steps\n1. Add a failing test.\n\n## Validation\nRun the focused test.\n\n## Stop conditions\nStop on scope change.\n")
        self.assertEqual(self.invoke(STATE, "transition", "build", cwd=cwd).returncode, 0)

    def test_generic_export_does_not_change_matrix_state(self):
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp)
            self.make_design_change(cwd)
            result = self.invoke(CLAUDE, "export", "--task-id", "GEN-001", cwd=cwd)
            self.assertEqual(result.returncode, 0, result.stderr)
            task = cwd / ".matrix/changes/bridge/artifacts/claude-task.md"
            self.assertIn("## Prohibited work", task.read_text(encoding="utf-8"))
            self.assertEqual(self.inspect(cwd)["phase"], "build")

    def test_fnsec_board_refuses_existing_objective(self):
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp)
            self.make_design_change(cwd)
            tasks = cwd / "docs/tasks"
            tasks.mkdir(parents=True)
            (tasks / "active.md").write_text("# Active task\n", encoding="utf-8")
            result = self.invoke(CLAUDE, "export", "--task-id", "FNSEC-X", "--target", "fnsec", "--apply-fnsec-board", cwd=cwd)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((tasks / "claude-task-FNSEC-X.md").exists(), result.stdout + result.stderr)

    def test_fnsec_export_updates_empty_board_only(self):
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp)
            self.make_design_change(cwd)
            tasks = cwd / "docs/tasks"
            tasks.mkdir(parents=True)
            (tasks / "active.md").write_text("# NO_ACTIVE_OBJECTIVE\n", encoding="utf-8")
            result = self.invoke(CLAUDE, "export", "--task-id", "FNSEC-Y", "--target", "fnsec", "--apply-fnsec-board", cwd=cwd)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("## Prohibited work", (tasks / "claude-task-FNSEC-Y.md").read_text(encoding="utf-8"))
            self.assertIn("CLAUDE_QUEUED", (tasks / "active.md").read_text(encoding="utf-8"))
            self.assertEqual(self.inspect(cwd)["phase"], "build")


if __name__ == "__main__":
    unittest.main()
