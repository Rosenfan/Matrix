import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

STATE = Path(__file__).with_name("matrix_state.py")
CLAUDE = Path(__file__).with_name("matrix_claude.py")


class MatrixClaudeTests(unittest.TestCase):
    def invoke(self, script, *args, cwd, agent=None):
        """Run *script* with *args*."""
        env = {**{k: v for k, v in __import__("os").environ.items()}}
        if agent:
            env["MATRIX_AGENT"] = agent
        cmd = [sys.executable, str(script)] + list(args)
        return subprocess.run(cmd, cwd=cwd, text=True, capture_output=True, env=env)

    def make_design_change(self, cwd):
        """Create a Matrix state in the design phase under .matrix/."""
        self.assertEqual(
            self.invoke(STATE, "init", "bridge", "--title", "Bridge", cwd=cwd).returncode,
            0,
        )
        p = cwd / ".matrix/state/changes/bridge/artifacts"
        (p / "proposal.md").write_text(
            "## Goal\nBuild a bounded feature.\n\n"
            "## Scope\nOne module only.\n\n"
            "## Acceptance\nA focused test passes.\n"
        )
        self.assertEqual(
            self.invoke(STATE, "transition", "design", cwd=cwd).returncode,
            0,
        )
        (p / "design.md").write_text(
            "## Decisions\nKeep one public seam.\n\n"
            "## Test seams\nUse the public interface.\n"
        )
        (p / "plan.md").write_text(
            "## Steps\n1. Add a failing test.\n\n"
            "## Validation\nRun the focused test.\n"
        )

    # ------------------------------------------------------------------ #
    # Generic export
    # ------------------------------------------------------------------ #

    def test_generic_export_does_not_change_matrix_state(self):
        """Export does not alter Matrix phase or state."""
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp)
            self.make_design_change(cwd)
            result = self.invoke(
                CLAUDE, "export", "--task-id", "GEN-001", cwd=cwd,
            )
            self.assertEqual(result.returncode, 0, result.stderr)

            task = (
                cwd
                / ".matrix/state/changes/bridge/artifacts/claude-task.md"
            )
            self.assertIn("## 禁止事项", task.read_text(encoding="utf-8"))
            self.assertIn(
                '"phase": "design"',
                self.invoke(STATE, "inspect", cwd=cwd).stdout,
            )

    def test_generic_export_ref_paths_dot_matrix(self):
        """The task package references .matrix/ paths."""
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp)
            self.make_design_change(cwd)
            result = self.invoke(
                CLAUDE, "export", "--task-id", "REF-001", cwd=cwd,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            task_text = (
                cwd
                / ".matrix/state/changes/bridge/artifacts/claude-task.md"
            ).read_text(encoding="utf-8")
            self.assertIn(".matrix/", task_text)

    # ------------------------------------------------------------------ #
    # FnSec target
    # ------------------------------------------------------------------ #

    def test_fnsec_board_refuses_existing_objective(self):
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp)
            self.make_design_change(cwd)
            tasks = cwd / "docs" / "tasks"
            tasks.mkdir(parents=True)
            (tasks / "active.md").write_text(
                "# 活跃任务看板\n\n## 当前状态\n| ID | X |\n", encoding="utf-8"
            )
            result = self.invoke(
                CLAUDE,
                "export",
                "--task-id", "FNSEC-X",
                "--target", "fnsec",
                "--apply-fnsec-board",
                cwd=cwd,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(
                (tasks / "claude-task-FNSEC-X.md").exists(),
                result.stdout + result.stderr,
            )

    def test_fnsec_export_updates_empty_board_only(self):
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp)
            self.make_design_change(cwd)
            tasks = cwd / "docs" / "tasks"
            tasks.mkdir(parents=True)
            (tasks / "active.md").write_text(
                "# NO_ACTIVE_OBJECTIVE\n", encoding="utf-8"
            )
            result = self.invoke(
                CLAUDE,
                "export",
                "--task-id", "FNSEC-Y",
                "--target", "fnsec",
                "--apply-fnsec-board",
                cwd=cwd,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(
                "## 禁止事项",
                (tasks / "claude-task-FNSEC-Y.md").read_text(encoding="utf-8"),
            )
            self.assertIn(
                "CLAUDE_QUEUED", (tasks / "active.md").read_text(encoding="utf-8")
            )
            self.assertIn(
                '"phase": "design"',
                self.invoke(STATE, "inspect", cwd=cwd).stdout,
            )


if __name__ == "__main__":
    unittest.main()
