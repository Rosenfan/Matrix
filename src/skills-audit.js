import fs from "node:fs";
import path from "node:path";

// Read-only conflict scanner for external Skills (`matrix skills audit <path-or-name>`).
// It inspects text files only and never executes anything from the audited skill.
const FILE_LIMIT = 256;
const BYTES_LIMIT = 512 * 1024;
const TEXT_EXTENSIONS = new Set([".md", ".mjs", ".js", ".cjs", ".py", ".sh", ".ps1", ".json", ".yaml", ".yml", ".txt", ".toml"]);

const RULES = [
  { id: "lifecycle-git", pattern: /\bgit\s+(commit|push|rebase|reset\s+--hard)/i, severity: "high", message: "runs git lifecycle commands on its own" },
  { id: "destructive", pattern: /rm\s+-rf|Remove-Item\s+-Recurse\s+-Force|del\s+\/[sq]/i, severity: "high", message: "contains destructive delete commands" },
  { id: "state-write", pattern: /\.matrix[\\/](?:changes|runs|archive|current-run|active)/i, severity: "high", message: "touches Matrix state paths; Matrix state may only change through matrix-runtime.mjs" },
  { id: "skip-verification", pattern: /skip\s+(?:the\s+)?(?:verification|verify|tests?)|跳过（?:验证|检查）|无需(?:验证|测试)/i, severity: "high", message: "suggests skipping verification" },
  { id: "self-approve", pattern: /(?:mark|declare|claim)\s+(?:this\s+)?(?:as\s+)?(?:complete|done|passed)\s+(?:without|skip)/i, severity: "medium", message: "may encourage self-approving completion" },
  { id: "network-exec", pattern: /curl[^|]*\|\s*(?:ba)?sh|wget[^|]*\|\s*(?:ba)?sh|Invoke-Expression|iex\s/i, severity: "high", message: "pipes downloads straight into a shell" },
  { id: "env-secrets", pattern: /\b(?:api[_-]?key|token|password|secret)\s*[:=]\s*["'][A-Za-z0-9+/_-]{16,}["']/i, severity: "medium", message: "contains a hardcoded credential-looking literal" }
];

function textFiles(root) {
  const files = [];
  const visit = (directory, relative = "") => {
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (files.length >= FILE_LIMIT) return;
      const child = path.join(directory, entry.name);
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(child, childRelative);
      else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push({ absolute: child, relative: childRelative });
    }
  };
  visit(root);
  return files;
}

export function auditSkillDirectory(root) {
  const skillFile = path.join(root, "SKILL.md");
  if (!fs.existsSync(skillFile)) {
    return { ok: false, code: "SKILL_NOT_FOUND", message: `No SKILL.md found under ${root}.` };
  }
  const findings = [];
  let scanned = 0;
  for (const file of textFiles(root)) {
    let contents;
    try { contents = fs.readFileSync(file.absolute, "utf8"); }
    catch { continue; }
    if (contents.length > BYTES_LIMIT) contents = contents.slice(0, BYTES_LIMIT);
    scanned += 1;
    const lines = contents.split(/\r?\n/);
    for (const rule of RULES) {
      lines.forEach((line, index) => {
        if (rule.pattern.test(line)) findings.push({ rule: rule.id, severity: rule.severity, message: rule.message, file: file.relative, line: index + 1, excerpt: line.trim().slice(0, 160) });
      });
    }
  }
  const blocked = findings.some((finding) => finding.severity === "high");
  return {
    ok: true, code: "OK", root, files_scanned: scanned, findings,
    verdict: blocked ? "review-required" : findings.length ? "review-suggested" : "clean",
    guidance: blocked
      ? "Do not mount this skill as-is. Distill the useful methodology into your own references, or sandbox it for a manual review first."
      : findings.length
        ? "Low-severity patterns found. Skim the excerpts before mounting; distilling the methodology is always safe."
        : "No conflict patterns found. Mounting is reasonable; keep the skill out of Matrix state regardless."
  };
}

export function resolveSkillTarget(candidate, { projectRoot = process.cwd(), home = os.homedir() } = {}) {
  const direct = path.resolve(candidate);
  if (fs.existsSync(path.join(direct, "SKILL.md"))) return direct;
  const roots = [path.join(projectRoot, ".agents", "skills"), path.join(projectRoot, ".claude", "skills"), path.join(projectRoot, ".zcode", "skills"), path.join(home, ".agents", "skills"), path.join(home, ".claude", "skills"), path.join(home, ".zcode", "skills")];
  for (const skillRoot of roots) {
    const target = path.join(skillRoot, candidate);
    if (fs.existsSync(path.join(target, "SKILL.md"))) return target;
  }
  return null;
}
