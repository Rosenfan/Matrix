import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("matrix_state.py")


class MatrixStateTests(unittest.TestCase):
    def invoke(self, *args, cwd, env_override=None):
        """Run matrix_state.py with *args* in *cwd*."""
        cmd = [sys.executable, str(SCRIPT)] + list(args)
        env = {**os.environ, **(env_override or {})}
        return subprocess.run(cmd, cwd=cwd, text=True, capture_output=True, env=env)

    # ============================================================== #
    # Basic lifecycle through new .matrix/ paths
    # ============================================================== #

    def test_init_creates_dot_matrix(self):
        """init creates state under .matrix/state/, not .claude/ or .codex/."""
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp)
            result = self.invoke("init", "demo", "--title", "Demo", cwd=cwd)
            self.assertEqual(result.returncode, 0, result.stderr)
            # Core paths
            self.assertTrue((cwd / ".matrix" / "config.yaml").is_file())
            self.assertTrue((cwd / ".matrix" / ".gitignore").is_file())
            self.assertTrue((cwd / ".matrix" / "state" / "active.json").is_file())
            self.assertTrue(
                (cwd / ".matrix" / "state" / "changes" / "demo" / "matrix.yaml").is_file()
            )
            self.assertTrue((cwd / ".matrix" / "archive").is_dir())
            # No agent-specific matrix dirs
            self.assertFalse((cwd / ".claude" / "matrix").exists())
            self.assertFalse((cwd / ".codex" / "matrix").exists())

    def test_phase_guard_and_recovery(self):
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp)
            result = self.invoke("init", "sample", "--title", "Sample", cwd=cwd)
            self.assertEqual(result.returncode, 0)
            p = cwd / ".matrix/state/changes/sample/artifacts"
            self.assertNotEqual(
                self.invoke("transition", "design", cwd=cwd).returncode, 0
            )
            (p / "proposal.md").write_text(
                "## Goal\nx\n\n## Scope\nx\n\n## Acceptance\nx\n" * 4
            )
            self.assertEqual(
                self.invoke("transition", "design", cwd=cwd).returncode, 0
            )
            self.assertIn(
                '"phase": "design"',
                self.invoke("inspect", cwd=cwd).stdout,
            )

    def test_full_lifecycle_requires_evidence(self):
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp)
            self.assertEqual(
                self.invoke("init", "full", "--title", "Full", cwd=cwd).returncode, 0
            )
            p = cwd / ".matrix/state/changes/full/artifacts"
            (p / "proposal.md").write_text(
                "## Goal\nx\n\n## Scope\nx\n\n## Acceptance\nx\n" * 4
            )
            self.assertEqual(
                self.invoke("transition", "design", cwd=cwd).returncode, 0
            )
            self.assertNotEqual(
                self.invoke("transition", "build", cwd=cwd).returncode, 0
            )
            (p / "design.md").write_text("## Decisions\nx\n\n## Test seams\nx\n" * 4)
            (p / "plan.md").write_text("## Steps\nx\n\n## Validation\nx\n" * 4)
            self.assertEqual(
                self.invoke("transition", "build", cwd=cwd).returncode, 0
            )
            (p / "verification.md").write_text(
                "## Build evidence\nThe focused implementation test "
                "completed successfully.\n"
            )
            self.assertEqual(
                self.invoke("transition", "verify", cwd=cwd).returncode, 0
            )
            self.assertNotEqual(
                self.invoke("transition", "archive", cwd=cwd).returncode, 0
            )
            (p / "verification.md").write_text(
                "## Build evidence\nTests passed.\n\n"
                "## Test evidence\nAll acceptance commands passed.\n\n"
                "## Review evidence\nNo blocking issues found.\n"
            )
            self.assertEqual(
                self.invoke("transition", "archive", cwd=cwd).returncode, 0
            )
            self.assertEqual(self.invoke("archive", cwd=cwd).returncode, 0)
            self.assertTrue(
                (cwd / ".matrix/archive/full/matrix.yaml").exists()
            )

    # ============================================================== #
    # Project root detection from subdirectory
    # ============================================================== #

    def test_inspect_from_subdirectory(self):
        """Running inspect from a nested directory still finds .matrix/."""
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp)
            self.invoke("init", "sub", "--title", "Subdir", cwd=cwd)
            # Create artifacts so guard passes
            p = cwd / ".matrix/state/changes/sub/artifacts"
            p.mkdir(parents=True, exist_ok=True)
            (p / "proposal.md").write_text(
                "## Goal\nx\n\n## Scope\nx\n\n## Acceptance\nx\n" * 4
            )
            self.invoke("transition", "design", cwd=cwd)

            # Run from a subdirectory
            sub = cwd / "deeply" / "nested" / "path"
            sub.mkdir(parents=True)
            result = self.invoke("inspect", cwd=sub)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('"change_id": "sub"', result.stdout)

    def test_init_outside_git_no_parent_matrix(self):
        """init in non-git dir without .matrix/ creates .matrix/ there."""
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp)
            result = self.invoke("init", "new", "--title", "New", cwd=cwd)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue((cwd / ".matrix" / "state" / "active.json").is_file())

    def test_inspect_fails_without_dot_matrix(self):
        """inspect errors when .matrix/ does not exist and no legacy state."""
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp)
            result = self.invoke("inspect", cwd=cwd)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(".matrix", result.stderr)

    def test_transition_fails_without_dot_matrix(self):
        """transition errors when .matrix/ does not exist."""
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp)
            result = self.invoke("transition", "design", cwd=cwd)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(".matrix", result.stderr)

    def test_guard_fails_without_dot_matrix(self):
        """guard errors when .matrix/ does not exist."""
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp)
            result = self.invoke("guard", "open", cwd=cwd)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(".matrix", result.stderr)

    def test_archive_fails_without_dot_matrix(self):
        """archive errors when .matrix/ does not exist."""
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp)
            result = self.invoke("archive", cwd=cwd)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(".matrix", result.stderr)

    def test_handoff_fails_without_dot_matrix(self):
        """handoff errors when .matrix/ does not exist."""
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp)
            result = self.invoke("handoff", cwd=cwd)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(".matrix", result.stderr)

    # ============================================================== #
    # Migration from legacy locations
    # ============================================================== #

    def _make_legacy_state(self, cwd, leaf, change_id="legacy_change"):
        """Create a legacy Matrix state directory (e.g. .codex/matrix/)."""
        legacy = cwd / leaf / "matrix"
        (legacy / "changes" / change_id / "artifacts").mkdir(parents=True)
        (legacy / "archive").mkdir(parents=True)
        (legacy / "active.json").write_text(
            f'{{"change_id": "{change_id}"}}\n', encoding="utf-8"
        )
        (legacy / "changes" / change_id / "matrix.yaml").write_text(
            f"id: {change_id}\nphase: open\n", encoding="utf-8"
        )
        return legacy

    def test_migrate_from_codex_legacy(self):
        """inspect auto-migrates .codex/matrix/ → .matrix/."""
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp)
            self._make_legacy_state(cwd, ".codex")
            result = self.invoke("inspect", cwd=cwd)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("legacy_change", result.stdout)
            # State should now be in .matrix/
            self.assertTrue(
                (cwd / ".matrix" / "state" / "active.json").is_file()
            )
            # Legacy backup should exist
            self.assertTrue(
                any((cwd / ".codex").glob("matrix.bak.*"))
            )

    def test_migrate_from_claude_legacy(self):
        """inspect auto-migrates .claude/matrix/ → .matrix/."""
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp)
            self._make_legacy_state(cwd, ".claude")
            result = self.invoke("inspect", cwd=cwd)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("legacy_change", result.stdout)
            self.assertTrue(
                (cwd / ".matrix" / "state" / "active.json").is_file()
            )

    def test_migrate_refuses_dual_legacy_conflict(self):
        """Two legacy dirs with different active changes → error."""
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp)
            self._make_legacy_state(cwd, ".codex", "change_a")
            self._make_legacy_state(cwd, ".claude", "change_b")
            result = self.invoke("inspect", cwd=cwd)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Multiple legacy", result.stderr)

    def test_migration_idempotent(self):
        """Running migration twice produces identical result with no error."""
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp)
            self._make_legacy_state(cwd, ".codex")
            # First migration
            r1 = self.invoke("inspect", cwd=cwd)
            self.assertEqual(r1.returncode, 0, r1.stderr)
            self.assertTrue((cwd / ".matrix" / "state" / "active.json").is_file())
            first_active = (cwd / ".matrix" / "state" / "active.json").read_text()
            # Second migration — same legacy dir still exists
            r2 = self.invoke("inspect", cwd=cwd)
            self.assertEqual(r2.returncode, 0, r2.stderr)
            # State is unchanged
            second_active = (cwd / ".matrix" / "state" / "active.json").read_text()
            self.assertEqual(first_active, second_active)
            # No duplicate backup created
            backups = list((cwd / ".codex").glob("matrix.bak.*"))
            self.assertEqual(len(backups), 1)

    def test_legacy_does_not_overwrite_existing(self):
        """Existing .matrix/ state is NOT overwritten by legacy migration."""
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp)
            # Create .matrix/ with a change
            self.invoke("init", "primary", "--title", "Primary", cwd=cwd)
            p = cwd / ".matrix/state/changes/primary/artifacts"
            (p / "proposal.md").write_text(
                "## Goal\nx\n\n## Scope\nx\n\n## Acceptance\nx\n" * 4
            )
            # Create legacy state with DIFFERENT change
            self._make_legacy_state(cwd, ".codex", "legacy_only")
            # inspect should still find the primary change, not the legacy one
            result = self.invoke("inspect", cwd=cwd)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("primary", result.stdout)
            self.assertNotIn("legacy_only", result.stdout)

    def test_archive_path_under_dot_matrix(self):
        """Archive moves state under .matrix/archive/."""
        with tempfile.TemporaryDirectory() as temp:
            cwd = Path(temp)
            self.invoke("init", "arch", "--title", "Archive", cwd=cwd)
            p = cwd / ".matrix/state/changes/arch/artifacts"
            (p / "proposal.md").write_text(
                "## Goal\nx\n\n## Scope\nx\n\n## Acceptance\nx\n" * 4
            )
            self.invoke("transition", "design", cwd=cwd)
            (p / "design.md").write_text("## Decisions\nx\n\n## Test seams\nx\n" * 4)
            (p / "plan.md").write_text("## Steps\nx\n\n## Validation\nx\n" * 4)
            self.invoke("transition", "build", cwd=cwd)
            (p / "verification.md").write_text(
                "## Build evidence\nok.\n\n"
                "## Test evidence\nok.\n\n"
                "## Review evidence\nok.\n"
            )
            self.invoke("transition", "verify", cwd=cwd)
            self.invoke("transition", "archive", cwd=cwd)
            self.invoke("archive", cwd=cwd)
            self.assertTrue(
                (cwd / ".matrix/archive/arch/matrix.yaml").is_file()
            )
            # Active state should be gone
            self.assertFalse(
                (cwd / ".matrix/state/active.json").is_file()
            )


if __name__ == "__main__":
    unittest.main()
