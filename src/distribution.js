import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MATRIX_SKILLS, MATT_SKILLS, PLATFORM_IDS, PLATFORMS, hashDirectory,
  installationRoot, manifestPath, releaseCatalog, scopeBase, sourceSkillsRoot, workflowRuntimeSource
} from "./catalog.js";
import { createMattAdapter } from "./matt.js";
import { text } from "./messages.js";

const VERSION = 1;
const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const exists = (value) => fs.existsSync(value);
const pathExists = (value) => { try { fs.lstatSync(value); return true; } catch { return false; } };
const nowStamp = () => new Date().toISOString().replace(/[:.]/g, "-");
const transactionPath = (intent) => path.join(installationRoot(intent.scope, intent.projectRoot, intent.home), "transaction.json");
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
};
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } };
const removeEntry = (value) => { if (pathExists(value)) fs.rmSync(value, { recursive: true, force: true }); };
const removeStaging = (stagingRoot) => {
  removeEntry(stagingRoot);
  const parent = path.dirname(stagingRoot);
  if (exists(parent) && fs.readdirSync(parent).length === 0) fs.rmdirSync(parent);
};
const compareVersions = (left, right) => {
  const parse = (value) => String(value ?? "0.0.0").split("-")[0].split(".").map((part) => Number(part) || 0);
  const a = parse(left); const b = parse(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) > (b[index] ?? 0) ? 1 : -1;
  return 0;
};
const skillPresent = (root, skill) => exists(path.join(root, skill, "SKILL.md"));
const isBrokenLink = (value) => { try { return fs.lstatSync(value).isSymbolicLink() && !exists(value); } catch { return false; } };

function readManifest(intent) { return readJson(manifestPath(intent.scope, intent.projectRoot, intent.home)); }

function detectPlatforms(projectRoot, scope, home) {
  const bases = [scopeBase(scope, projectRoot, home)];
  if (scope === "project") bases.push(home);
  return PLATFORM_IDS.filter((id) => bases.some((base) => exists(PLATFORMS[id].skillRoot(base))));
}

function normalizeIntent(raw) {
  const scope = raw.scope ?? "project";
  const platforms = [...new Set(raw.platforms ?? [])];
  if (!["project", "global"].includes(scope)) return { error: "INVALID_INTENT", detail: "scope" };
  if (!["copy", "symlink"].includes(raw.mode ?? "copy")) return { error: "INVALID_INTENT", detail: "mode" };
  if (!["en", "zh-CN"].includes(raw.language ?? "en")) return { error: "INVALID_INTENT", detail: "language" };
  if (platforms.some((id) => !PLATFORM_IDS.includes(id))) return { error: "UNVERIFIED_PLATFORM" };
  return { projectRoot: path.resolve(raw.projectRoot ?? process.cwd()), home: raw.home ?? os.homedir(), scope, platforms,
    language: raw.language ?? "en", mode: raw.mode ?? "copy", matrixPolicy: raw.matrixPolicy ?? "safe",
    matt: raw.matt ?? "none", dryRun: Boolean(raw.dryRun) };
}

function observePlatform(intent, catalog, manifest, platformId) {
  const platform = PLATFORMS[platformId]; const base = scopeBase(intent.scope, intent.projectRoot, intent.home);
  const root = platform.skillRoot(base); const records = manifest?.platforms?.[platformId]?.skills ?? {};
  const skills = MATRIX_SKILLS.map((skill) => {
    const target = path.join(root, skill);
    if (!pathExists(target)) return { skill, target, state: "missing" };
    if (isBrokenLink(target) || !exists(path.join(target, "SKILL.md"))) return { skill, target, state: "damaged" };
    const actual = hashDirectory(target); const recorded = records[skill]?.hash; const expected = catalog.skills[skill];
    if (!recorded) return { skill, target, state: "user-modified", actual };
    if (actual === expected) return { skill, target, state: "matching", actual };
    if (actual === recorded) return { skill, target, state: compareVersions(manifest?.catalogVersion, catalog.version) > 0 ? "newer" : "outdated-unchanged", actual };
    return { skill, target, state: "user-modified", actual };
  });
  const states = new Set(skills.map((item) => item.state));
  const matrix = states.size === 1 && states.has("matching") ? "matching" : states.has("user-modified") ? "user-modified"
    : states.has("missing") && states.size === 1 ? "missing" : states.has("newer") ? "newer"
      : states.has("damaged") ? "damaged" : states.has("outdated-unchanged") ? "outdated-unchanged" : "partial";
  const globalRoot = platform.skillRoot(intent.home);
  const mattPresent = MATT_SKILLS.filter((skill) => skillPresent(root, skill));
  const globalMatt = intent.scope === "project" ? MATT_SKILLS.filter((skill) => skillPresent(globalRoot, skill)) : [];
  const availableMatt = new Set([...mattPresent, ...globalMatt]); const missing = MATT_SKILLS.filter((skill) => !availableMatt.has(skill));
  const inherited = globalMatt.filter((skill) => !mattPresent.includes(skill)).length;
  return { id: platformId, name: platform.name, root, skills, matrix, matt: { present: mattPresent.length, missing, total: MATT_SKILLS.length, inherited,
    state: availableMatt.size === MATT_SKILLS.length ? "complete" : availableMatt.size ? "partial" : "missing" } };
}

function actionFor(observation, policy) {
  if (observation.matrix === "matching" || observation.matrix === "newer") return "keep";
  if (observation.matrix === "missing") return "install";
  if (observation.matrix === "outdated-unchanged") return "backup-replace";
  if (["damaged", "user-modified"].includes(observation.matrix)) return policy === "replace" ? "backup-replace" : "blocked";
  return "repair";
}

export function recoverPendingTransaction(intent) {
  const file = transactionPath(intent); const journal = readJson(file);
  if (!journal) return { ok: true, recovered: false };
  try {
    if (journal.state === "committed") {
      removeStaging(journal.stagingRoot);
      for (const operation of journal.operations ?? []) removeEntry(operation.backup);
      removeEntry(journal.manifest?.backup); removeEntry(file);
      return { ok: true, recovered: true, receipt: `Finalized completed Matrix transaction ${journal.id}.` };
    }
    for (const operation of [...(journal.operations ?? [])].reverse()) {
      if (operation.status !== "pending") removeEntry(operation.target);
      if (operation.backup && pathExists(operation.backup)) { fs.mkdirSync(path.dirname(operation.target), { recursive: true }); fs.renameSync(operation.backup, operation.target); }
    }
    if (journal.manifest?.backup && pathExists(journal.manifest.backup)) {
      removeEntry(journal.manifest.path); fs.mkdirSync(path.dirname(journal.manifest.path), { recursive: true }); fs.renameSync(journal.manifest.backup, journal.manifest.path);
    } else if (journal.manifest?.written && !journal.manifest?.existed) removeEntry(journal.manifest.path);
    removeStaging(journal.stagingRoot); removeEntry(file);
    return { ok: true, recovered: true, receipt: `Recovered interrupted Matrix transaction ${journal.id}.` };
  } catch (error) { return { ok: false, code: "RECOVERY_REQUIRED", recovery: `Keep ${file} and restore the paths recorded there before retrying.`, error: error.message }; }
}

export function createDistribution({ failAt, mattAdapter = createMattAdapter() } = {}) {
  const evaluate = (rawIntent) => {
    const intent = normalizeIntent(rawIntent); const language = intent.language ?? rawIntent.language ?? "en";
    if (intent.error) return { ok: false, code: intent.error, diagnostics: [{ code: intent.error, message: text(language, "noPlatform") }] };
    if (!intent.platforms.length) { const detected = detectPlatforms(intent.projectRoot, intent.scope, intent.home); if (!detected.length) return { ok: false, code: "INPUT_REQUIRED", diagnostics: [{ code: "INPUT_REQUIRED", message: text(language, "noPlatform") }] }; intent.platforms = detected; }
    let catalog; try { catalog = releaseCatalog(intent.language); } catch (error) { return { ok: false, code: "PACKAGE_INCOMPLETE", intent, diagnostics: [{ code: "PACKAGE_INCOMPLETE", message: error.message }] }; }
    const manifest = readManifest(intent); const observations = intent.platforms.map((id) => observePlatform(intent, catalog, manifest, id));
    const actions = observations.map((item) => ({ platform: item.id, matrix: actionFor(item, intent.matrixPolicy), matt: item.matt.state === "complete" || intent.matt === "none" ? { kind: "keep", skills: [] } : { kind: "install-missing", skills: item.matt.missing } }));
    const blocked = actions.filter((item) => item.matrix === "blocked"); const plan = { version: VERSION, intent, catalogDigest: catalog.digest, manifestPath: manifestPath(intent.scope, intent.projectRoot, intent.home), actions, observations, preconditionDigest: digest(observations) };
    plan.seal = digest({ intent, catalogDigest: plan.catalogDigest, actions, preconditionDigest: plan.preconditionDigest });
    return { ok: blocked.length === 0, code: blocked.length ? "USER_MODIFIED_BLOCKED" : "OK", intent, observations, actions, plan, diagnostics: blocked.map((item) => ({ code: "USER_MODIFIED_BLOCKED", platform: item.platform, message: `${item.platform}: existing Matrix assets are not proven managed.` })), summary: `${text(intent.language, "preview")}: ${actions.map((item) => `${item.platform}: ${item.matrix}`).join(", ")}` };
  };

  return { evaluate,
    diagnose(rawIntent) {
      const evaluation = evaluate(rawIntent); if (!evaluation.intent) return evaluation;
      const diagnostics = []; const pending = readJson(transactionPath(evaluation.intent)); const manifest = readManifest(evaluation.intent);
      if (pending) diagnostics.push({ code: "RECOVERY_REQUIRED", message: text(evaluation.intent.language, "transactionPending") });
      if (!manifest) diagnostics.push({ code: "MANIFEST_MISSING", message: text(evaluation.intent.language, "manifestMissing") });
      for (const observation of evaluation.observations ?? []) {
        diagnostics.push({ code: `MATRIX_${observation.matrix.toUpperCase().replaceAll("-", "_")}`, platform: observation.id, message: `${observation.name}: Matrix is ${observation.matrix}.` });
        const matrixRoot = path.join(observation.root, "matrix");
        if (pathExists(matrixRoot) && (!exists(matrixRoot) || !exists(path.join(matrixRoot, "scripts", "matrix-runtime.mjs")))) diagnostics.push({ code: "RUNTIME_MISSING", platform: observation.id, message: `${observation.name}: ${text(evaluation.intent.language, "runtimeMissing")}` });
        for (const skill of observation.skills.filter((entry) => isBrokenLink(entry.target))) diagnostics.push({ code: "BROKEN_LINK", platform: observation.id, path: skill.target, message: `${observation.name}: ${text(evaluation.intent.language, "brokenLink")} ${skill.target}` });
        if (observation.id === "codex" && PLATFORMS.codex.legacyRoots(scopeBase(evaluation.intent.scope, evaluation.intent.projectRoot, evaluation.intent.home)).some(exists)) diagnostics.push({ code: "CODEX_LEGACY_DETECTED", platform: observation.id, message: "Codex legacy .codex/skills was detected; Matrix will not write there." });
        diagnostics.push({ code: `MATT_${observation.matt.state.toUpperCase()}`, platform: observation.id, message: `${observation.name}: Matt Pocock skills are ${observation.matt.state}.` });
        if (observation.matt.inherited) diagnostics.push({ code: "MATT_INHERITED", platform: observation.id, message: `${observation.name}: ${observation.matt.inherited} ${text(evaluation.intent.language, "mattInherited")}` });
      }
      return { ...evaluation, diagnosis: diagnostics };
    },
    commit(plan) {
      if (!plan?.seal || plan.seal !== digest({ intent: plan.intent, catalogDigest: plan.catalogDigest, actions: plan.actions, preconditionDigest: plan.preconditionDigest })) return { ok: false, code: "INVALID_INTENT" };
      const recovery = recoverPendingTransaction(plan.intent); if (!recovery.ok) return recovery;
      const refreshed = evaluate({ ...plan.intent, platforms: plan.intent.platforms });
      if (!refreshed.plan || refreshed.plan.preconditionDigest !== plan.preconditionDigest || refreshed.plan.catalogDigest !== plan.catalogDigest) return { ok: false, code: "PLAN_STALE" };
      if (!refreshed.ok) return { ok: false, code: refreshed.code, diagnostics: refreshed.diagnostics };
      if (plan.intent.dryRun) return { ok: true, code: "DRY_RUN", actions: plan.actions };
      const root = installationRoot(plan.intent.scope, plan.intent.projectRoot, plan.intent.home); const id = nowStamp(); const stagingRoot = path.join(root, "staging", id); const journalFile = transactionPath(plan.intent);
      const journal = { id, state: "in-progress", stagingRoot, manifest: { path: plan.manifestPath, existed: pathExists(plan.manifestPath), backup: null, written: false }, operations: [] };
      for (const item of refreshed.observations) if (plan.actions.find((entry) => entry.platform === item.id).matrix !== "keep") for (const skill of MATRIX_SKILLS) journal.operations.push({ target: path.join(item.root, skill), backup: null, status: "pending" });
      const persist = () => writeJson(journalFile, journal);
      try {
        persist(); const catalog = releaseCatalog(plan.intent.language); const stagedPlatforms = new Map();
        for (const item of refreshed.observations) {
          if (plan.actions.find((entry) => entry.platform === item.id).matrix === "keep") continue;
          const platformStage = path.join(stagingRoot, item.id);
          for (const skill of MATRIX_SKILLS) { const staged = path.join(platformStage, skill); fs.mkdirSync(path.dirname(staged), { recursive: true }); fs.cpSync(path.join(catalog.root, skill), staged, { recursive: true }); fs.mkdirSync(path.join(staged, "scripts"), { recursive: true }); fs.copyFileSync(workflowRuntimeSource(), path.join(staged, "scripts", "matrix-runtime.mjs")); if (skill === "matrix") for (const filename of ["matrix_state.py", "matrix_claude.py"]) fs.copyFileSync(path.join(sourceSkillsRoot("en"), "matrix", "scripts", filename), path.join(staged, "scripts", filename)); if (!exists(path.join(staged, "SKILL.md"))) throw new Error(`Stage validation failed: ${item.id}/${skill}`); }
          stagedPlatforms.set(item.id, platformStage);
        }
        failAt?.("after-stage"); let operationIndex = 0;
        for (const item of refreshed.observations) {
          if (plan.actions.find((entry) => entry.platform === item.id).matrix === "keep") continue;
          fs.mkdirSync(item.root, { recursive: true });
          for (const skill of MATRIX_SKILLS) {
            const operation = journal.operations[operationIndex++]; const target = operation.target; operation.status = "backing-up";
            if (pathExists(target)) operation.backup = path.join(root, "backups", id, item.id, skill); persist();
            if (operation.backup) { fs.mkdirSync(path.dirname(operation.backup), { recursive: true }); fs.renameSync(target, operation.backup); }
            operation.status = "backed-up"; persist(); failAt?.("after-backup", { platform: item.id, skill });
            const staged = path.join(stagedPlatforms.get(item.id), skill);
            if (plan.intent.mode === "symlink") { const store = path.join(root, "skills", catalog.digest, skill); if (!pathExists(store)) { fs.mkdirSync(path.dirname(store), { recursive: true }); fs.renameSync(staged, store); } fs.symlinkSync(store, target, process.platform === "win32" ? "junction" : "dir"); } else fs.renameSync(staged, target);
            operation.status = "committed"; persist(); failAt?.("after-commit", { platform: item.id, skill });
          }
        }
        if (journal.manifest.existed) { journal.manifest.backup = path.join(root, "backups", id, "installation.json"); persist(); fs.mkdirSync(path.dirname(journal.manifest.backup), { recursive: true }); fs.renameSync(plan.manifestPath, journal.manifest.backup); }
        const records = Object.fromEntries(refreshed.observations.map((item) => [item.id, { root: item.root, skills: Object.fromEntries(MATRIX_SKILLS.map((skill) => [skill, { hash: catalog.skills[skill] }])) }]));
        writeJson(plan.manifestPath, { version: VERSION, catalogVersion: catalog.version, language: plan.intent.language, mode: plan.intent.mode, catalogDigest: catalog.digest, platforms: records }); journal.manifest.written = true; persist(); failAt?.("after-manifest"); journal.state = "committed"; persist();
        removeStaging(stagingRoot); removeEntry(journal.manifest.backup); removeEntry(journalFile);
        const mattActions = plan.actions.filter((item) => item.matt.kind === "install-missing"); const mattResults = [];
        for (const action of mattActions) { const result = mattAdapter.installMissing({ projectRoot: plan.intent.projectRoot, platforms: [action.platform], skills: action.matt.skills, global: plan.intent.scope === "global" }); mattResults.push({ platform: action.platform, ...result }); }
        const postcondition = evaluate({ ...plan.intent, platforms: plan.intent.platforms }); const incomplete = mattActions.length ? postcondition.observations.filter((item) => item.matt.state !== "complete") : [];
        const backups = journal.operations.filter((item) => item.backup).map((item) => ({ target: item.target, backup: item.backup }));
        if (mattResults.some((item) => !item.ok) || incomplete.length) return { ok: true, code: "PARTIAL", committed: journal.operations.map((item) => item.target), backups, recovery: "Matrix is installed. Run matrix init --with-mattpocock after resolving the Matt skills installation.", matt: mattResults, recoveryReceipt: recovery.receipt };
        return { ok: true, code: "OK", committed: journal.operations.map((item) => item.target), backups, matt: mattResults, recoveryReceipt: recovery.receipt };
      } catch (error) { const restored = recoverPendingTransaction(plan.intent); return { ok: false, code: "MATRIX_COMMIT_FAILED", error: error.message, recovery: restored.ok ? "Matrix targets and installation manifest were restored." : restored.recovery }; }
    }
  };
}
