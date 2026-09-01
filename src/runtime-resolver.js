import fs from "node:fs";
import path from "node:path";
import { MATRIX_VERSION, PLATFORMS, hashDirectory, releaseCatalog } from "./catalog.js";

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function installationScope(projectRoot) {
  try {
    const line = fs.readFileSync(path.join(projectRoot, ".matrix", "config.yaml"), "utf8").split(/\r?\n/).find((value) => value.startsWith("installation_scope:"));
    return line?.split(":").slice(1).join(":").trim() === "global" ? "global" : "project";
  } catch { return "project"; }
}

function runtimeCommand(runtime) {
  const quoted = process.platform === "win32" ? `"${runtime}"` : `'${runtime.replaceAll("'", "'\\''")}'`;
  return `node ${quoted}`;
}

export function resolveProjectRuntime({ projectRoot = process.cwd() } = {}) {
  const root = path.resolve(projectRoot);
  const manifest = readJson(path.join(root, ".matrix", "installation.json"));
  if (!manifest) return installationScope(root) === "global"
    ? { ok: true, code: "GLOBAL_INSTALLATION", runtime: null }
    : { ok: true, code: "PROJECT_INSTALLATION_ABSENT", runtime: null };
  const candidates = [];
  let currentCatalog = null;
  let catalogUnavailable = false;
  try { currentCatalog = releaseCatalog(manifest.language ?? "en"); } catch { catalogUnavailable = true; }
  for (const platform of ["codex", "claude-code"]) {
    const expected = manifest.platforms?.[platform]?.skills?.matrix?.hash;
    if (!expected) continue;
    const matrixRoot = path.join(PLATFORMS[platform].skillRoot(root), "matrix");
    const runtime = path.join(matrixRoot, "scripts", "matrix-runtime.mjs");
    if (!fs.existsSync(runtime)) { candidates.push({ platform, matrixRoot, runtime, reason: "missing" }); continue; }
    try {
      const actual = hashDirectory(matrixRoot);
      if (actual === expected) {
        if (manifest.catalogVersion !== MATRIX_VERSION) {
          const catalogVersion = manifest.catalogVersion ?? null;
          return {
            ok: false,
            code: catalogVersion ? "PROJECT_RUNTIME_VERSION_MISMATCH" : "PROJECT_RUNTIME_VERSION_UNKNOWN",
            message: catalogVersion
              ? `The project Matrix Runtime is ${catalogVersion}, while this launcher is ${MATRIX_VERSION}. The project remains authoritative, but a different-release Runtime requires explicit invocation.`
              : `The project Matrix Runtime has no release identity. The project remains authoritative, but an unidentified Runtime requires explicit invocation.`,
            platform,
            runtime,
            catalogVersion,
            launcherVersion: MATRIX_VERSION,
            recovery_command: runtimeCommand(runtime)
          };
        }
        if (catalogUnavailable
          || manifest.catalogDigest !== currentCatalog.digest || expected !== currentCatalog.skills.matrix) {
          return {
            ok: false,
            code: "PROJECT_RUNTIME_RELEASE_MISMATCH",
            message: `The project Matrix Runtime claims ${MATRIX_VERSION} but does not match that release catalog. Run matrix update.`,
            platform,
            runtime,
            catalogVersion: manifest.catalogVersion,
            expected: currentCatalog?.skills.matrix ?? null,
            actual
          };
        }
        return { ok: true, code: "PROJECT_RUNTIME", platform, runtime, catalogVersion: manifest.catalogVersion };
      }
      candidates.push({ platform, matrixRoot, runtime, reason: "modified" });
    } catch { candidates.push({ platform, matrixRoot, runtime, reason: "unreadable" }); }
  }
  return candidates.length
    ? { ok: false, code: "PROJECT_RUNTIME_UNTRUSTED", message: "The project Matrix Runtime does not match its installation manifest.", findings: candidates }
    : { ok: true, code: "PROJECT_RUNTIME_ABSENT", runtime: null };
}
