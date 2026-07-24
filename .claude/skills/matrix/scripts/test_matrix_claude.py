import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

STATE = Path(__file__).with_name("matrix_state.py")
CLAUDE = Path(__file__).with_name("matrix_claude.py")

class MatrixClaudeTests(unittest.TestCase):
    def invoke(self, script, *args, cwd):
        return subprocess.run([sys.executable, str(script), *args], cwd=cwd, text=True, capture_output=True)

    def make_design_change(self, cwd):
        self.assertEqual(self.invoke(STATE, "init", "bridge", "--title", "Bridge", cwd=cwd).returncode, 0)
        p = cwd / ".codex/matrix/changes/bridge/artifacts"
        (p / "proposal.md").write_text("## Goal\nBuild a bounded feature.\n\n## Scope\nOne module only.\n\n## Acceptance\nA focused test passes.\n")
        self.assertEqual(self.invoke(STATE, "transition", "design", cwd=cwd).returncode, 0)
        (p / "design.md").write_text("## Decisions\nKeep one public seam.\n\n## Test seams\nUse the public interface.\n")
        (p / "plan.md").write_text("## Steps\n1. Add a failing test.\n\n## Validation\nRun the focused test.\n")

    def test_generic_export_does_not_change_matrix_state(self):
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp); self.make_design_change(cwd)
            result = self.invoke(CLAUDE, "export", "--task-id", "GEN-001", cwd=cwd)
            self.assertEqual(result.returncode, 0, result.stderr)
            task = cwd / ".codex/matrix/changes/bridge/artifacts/claude-task.md"
            self.assertIn("## 禁止事项", task.read_text(encoding="utf-8"))
            self.assertIn('"phase": "design"', self.invoke(STATE, "inspect", cwd=cwd).stdout)

    def test_fnsec_board_refuses_existing_objective(self):
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp); self.make_design_change(cwd)
            tasks = cwd / "docs/tasks"; tasks.mkdir(parents=True)
            (tasks / "active.md").write_text("# 活跃任务看板\n\n## 当前状态\n| ID | X |\n", encoding="utf-8")
            result = self.invoke(CLAUDE, "export", "--task-id", "FNSEC-X", "--target", "fnsec", "--apply-fnsec-board", cwd=cwd)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((tasks / "claude-task-FNSEC-X.md").exists(), result.stdout + result.stderr)

    def test_fnsec_export_updates_empty_board_only(self):
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp); self.make_design_change(cwd)
            tasks = cwd / "docs/tasks"; tasks.mkdir(parents=True)
            (tasks / "active.md").write_text("# NO_ACTIVE_OBJECTIVE\n", encoding="utf-8")
            result = self.invoke(CLAUDE, "export", "--task-id", "FNSEC-Y", "--target", "fnsec", "--apply-fnsec-board", cwd=cwd)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("## 禁止事项", (tasks / "claude-task-FNSEC-Y.md").read_text(encoding="utf-8"))
            self.assertIn("CLAUDE_QUEUED", (tasks / "active.md").read_text(encoding="utf-8"))
            self.assertIn('"phase": "design"', self.invoke(STATE, "inspect", cwd=cwd).stdout)

if __name__ == "__main__": unittest.main()
