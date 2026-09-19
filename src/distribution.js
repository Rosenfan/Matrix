import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MATRIX_SKILLS, MATT_SKILLS, UNMANAGED_MATT_SKILLS, PLATFORM_IDS, PLATFORMS, hashDirectory,
  installationRoot, manifestPath, mattCatalogSource, releaseCatalog, scopeBase, sourceSkillsRoot, workflowRuntimeSource, workflowTransactionSource
} from "./catalog.js";
import { createMattAdapter, mattReceiptPath } from "./matt.js";
import { MATT_CATALOG_DIGEST, MATT_COMPATIBILITY, MATT_CONTENT_HASHES } from "./matt-catalog.mjs";
import { text } from "./messages.js";

// Manifest v4 records content digests computed over EOL-normalized bytes and the
// assets/skills source layout; v3 manifests (raw-byte hashes, .claude/skills era)
// stay readable and are refreshed to v4 by the next update.
const VERSION = 4;
const MATT_OPERATIONS = new Set(["none", "missing", "readonly"]);
const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const exists = (value) => fs.existsSync(value);
const pathExists = (value) => { try { fs.lstatSync(value); return true; } catch { return false; } };
const nowStamp = () => new Date().toISOString().replace(/[:.]/g, "-");
const transactionPath = (intent) => path.join(installationRoot(intent.scope, intent.projectRoot, intent.home), "transaction.json");
const configPath = (intent) => path.join(intent.projectRoot, ".matrix", "config.yaml");
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
};
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } };
const readConfig = (file) => {
  try {
    return Object.fromEntries(fs.readFileSync(file, "utf8").split(/\r?\n/).filter((line) => line.includes(":") && !line.startsWith(" ")).map((line) => {
      const [key, ...value] = line.split(":");
      return [key.trim(), value.join(":").trim()];
    }));
  } catch { return {}; }
};
const configContent = (existing, defaultOrchestration, scope, language) => {
  const values = {
    ...existing,
    schema: "matrix/config/v1",
    auto_transition: existing.auto_transition === "false" ? "false" : "true",
    default_orchestration: defaultOrchestration,
    installation_scope: scope,
    language
  };
  const preferred = ["schema", "auto_transition", "default_orchestration", "installation_scope", "language"];
  const keys = [...preferred, ...Object.keys(values).filter((key) => !preferred.includes(key)).sort()];
  return `${keys.map((key) => `${key}: ${values[key]}`).join("\n")}\n`;
};
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
const mattObservationMatchesRelease = (observation, contentHashes) => MATT_SKILLS.every((skill) => observation.matt.skills?.[skill]?.hash === contentHashes[skill]);
const mattObservationMatchesReceipt = (observation) => MATT_SKILLS.every((skill) => observation.matt.classifications?.[skill]?.state === "matching");
const verifyMattCandidate = (candidate, actions, contentHashes) => {
  for (const action of actions) for (const skill of action.matt.skills) {
    const source = path.join(candidate.platforms[action.platform], skill);
    if (!exists(path.join(source, "SKILL.md")) || hashDirectory(source) !== contentHashes[skill]) {
      throw new Error(`Matt candidate content did not match the reviewed release: ${action.platform}/${skill}`);
    }
  }
};
const localizedState = (language, state) => text(language, ({
  missing: "stateMissing", matching: "stateMatching", complete: "stateComplete", "user-modified": "stateUserModified",
  partial: "statePartial", damaged: "statePartial", newer: "stateMatching", "outdated-unchanged": "stateOutdated",
  "safe-update": "stateSafeUpdate", adoptable: "stateAdoptable", unreadable: "stateUnreadable"
})[state] ?? state);
const localizedAction = (language, action) => text(language, ({
  install: "actionInstall", keep: "actionKeep", "backup-replace": "actionBackupReplace", repair: "actionRepair", blocked: "actionBlocked"
})[action] ?? action);

function readManifest(intent) { return readJson(manifestPath(intent.scope, intent.projectRoot, intent.home)); }

export function installedIntent({ projectRoot = process.cwd(), home = os.homedir() } = {}) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const config = readConfig(path.join(resolvedProjectRoot, ".matrix", "config.yaml"));
  const projectManifest = readJson(manifestPath("project", resolvedProjectRoot, home));
  const scope = projectManifest ? "project" : config.installation_scope === "global" ? "global" : "project";
  const manifest = projectManifest ?? readJson(manifestPath(scope, resolvedProjectRoot, home));
  const platforms = Object.keys(manifest?.platforms ?? {}).filter((id) => PLATFORM_IDS.includes(id));
  if (!manifest || !platforms.length) return { ok: false, code: "MANIFEST_MISSING", scope, config };
  const language = ["en", "zh-CN"].includes(manifest.language) ? manifest.language : (["en", "zh-CN"].includes(config.language) ? config.language : "en");
  const defaultOrchestration = ["prim", "arch"].includes(manifest.orchestration?.default) ? manifest.orchestration.default : "prim";
  const matt = "readonly";
  return {
    ok: true,
    intent: {
      projectRoot: resolvedProjectRoot, home, scope, platforms, language,
      mode: ["copy", "symlink"].includes(manifest.mode) ? manifest.mode : "copy",
      matt, defaultOrchestration, nonInteractive: true, matrixPolicy: "safe", dryRun: false
    },
    manifest,
    config
  };
}

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
  if (raw.defaultOrchestration != null && !["prim", "arch"].includes(raw.defaultOrchestration)) return { error: "INVALID_INTENT", detail: "default-orchestration" };
  if (!MATT_OPERATIONS.has(raw.matt ?? "none")) return { error: "INVALID_INTENT", detail: "matt" };
  if (raw.mattPolicy != null && !["preserve", "replace"].includes(raw.mattPolicy)) return { error: "INVALID_INTENT", detail: "matt-policy" };
  if (platforms.some((id) => !PLATFORM_IDS.includes(id))) return { error: "UNVERIFIED_PLATFORM" };
  return { projectRoot: path.resolve(raw.projectRoot ?? process.cwd()), home: raw.home ?? os.homedir(), scope, platforms,
    language: raw.language ?? "en", mode: raw.mode ?? "copy", matrixPolicy: raw.matrixPolicy ?? "safe",
    matt: raw.matt ?? "none", mattPolicy: raw.mattPolicy ?? "preserve", defaultOrchestration: raw.defaultOrchestration ?? null,
    nonInteractive: Boolean(raw.nonInteractive), dryRun: Boolean(raw.dryRun) };
}

export function classifyMattTarget({ present, readable = true, actual, expected, recorded, receiptTrusted = false }) {
  if (!present) return "missing";
  if (!readable || !actual) return "unreadable";
  if (expected && actual === expected) return receiptTrusted && recorded === actual ? "matching" : "adoptable";
  if (recorded && actual === recorded) return "safe-update";
  return "user-modified";
}

function trustedMattReceipt(receipt) {
  return Boolean(receipt
    && receipt.compatibility?.release === MATT_COMPATIBILITY.release
    && receipt.compatibility?.commit === MATT_COMPATIBILITY.commit
    && receipt.catalogDigest === MATT_CATALOG_DIGEST);
}

function observePlatform(intent, catalog, manifest, mattReceipt, platformId, contentHashes) {
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
  const mattRoot = platform.skillRoot(intent.projectRoot);
  const globalRoot = platform.skillRoot(intent.home);
  const mattPresent = MATT_SKILLS.filter((skill) => skillPresent(mattRoot, skill));
  const globalMatt = MATT_SKILLS.filter((skill) => skillPresent(globalRoot, skill));
  const missing = MATT_SKILLS.filter((skill) => !mattPresent.includes(skill));
  const ignoredGlobal = globalMatt.filter((skill) => !mattPresent.includes(skill)).length;
  const receiptRecords = mattReceipt?.platforms?.[platformId]?.skills ?? {};
  const legacyRecords = manifest?.platforms?.[platformId]?.matt?.skills ?? {};
  const receiptIsTrusted = trustedMattReceipt(mattReceipt);
  const classifications = Object.fromEntries(MATT_SKILLS.map((skill) => {
    const target = path.join(mattRoot, skill);
    const present = pathExists(target);
    let actual = null; let readable = true;
    if (present) {
      try { actual = hashDirectory(target); } catch { readable = false; }
    }
    const recorded = receiptRecords[skill]?.hash ?? legacyRecords[skill]?.hash ?? null;
    const state = classifyMattTarget({ present, readable, actual, expected: contentHashes[skill], recorded, receiptTrusted: receiptIsTrusted });
    return [skill, { state, actual, expected: contentHashes[skill], recorded }];
  }));
  const managedSkills = Object.fromEntries(Object.entries(classifications).filter(([, item]) => item.actual).map(([skill, item]) => [skill, { root: path.join(mattRoot, skill), hash: item.actual }]));
  const classificationCounts = Object.values(classifications).reduce((counts, item) => ({ ...counts, [item.state]: (counts[item.state] ?? 0) + 1 }), {});
  const unmanaged = UNMANAGED_MATT_SKILLS.filter((skill) => skillPresent(mattRoot, skill));
  return { id: platformId, name: platform.name, root, skills, matrix, matt: { root: mattRoot, present: mattPresent.length, missing, total: MATT_SKILLS.length, inherited: 0, ignoredGlobal,
    state: mattPresent.length === MATT_SKILLS.length ? "complete" : mattPresent.length ? "partial" : "missing", skills: managedSkills, classifications, classificationCounts, unmanaged } };
}

function actionFor(observation, policy) {
  if (observation.matrix === "matching" || observation.matrix === "newer") return "keep";
  if (observation.matrix === "missing") return "install";
  if (observation.matrix === "outdated-unchanged") return "backup-replace";
  if (["damaged", "user-modified"].includes(observation.matrix)) return policy === "replace" ? "backup-replace" : "blocked";
  return "repair";
}

export function recoverPendingTransaction(intent, { allowMattWrites = true } = {}) {
  const file = transactionPath(intent); const journal = readJson(file);
  if (!journal) return { ok: true, recovered: false };
  if (!allowMattWrites && ((journal.operations ?? []).some((operation) => operation.kind === "matt") || journal.mattReceipt?.written || journal.mattReceipt?.backup)) {
    return { ok: false, code: "RECOVERY_REQUIRED", recovery: `A pending Matt transaction must be recovered before Matrix update can continue. Run matrix init --with-mattpocock, or matrix update --with-mattpocock on an installed project. Keep ${file}.` };
  }
  const restoreMetadata = (entry) => {
    if (!entry) return;
    if (entry.backup && pathExists(entry.backup)) {
      removeEntry(entry.path);
      fs.mkdirSync(path.dirname(entry.path), { recursive: true });
      fs.renameSync(entry.backup, entry.path);
    } else if (entry.written && !entry.existed) removeEntry(entry.path);
  };
  try {
    if (journal.state === "committed") {
      removeStaging(journal.stagingRoot);
      for (const operation of journal.operations ?? []) removeEntry(operation.backup);
      removeEntry(journal.manifest?.backup); removeEntry(journal.config?.backup); removeEntry(journal.mattReceipt?.backup); removeEntry(file);
      return { ok: true, recovered: true, receipt: `Finalized completed Matrix transaction ${journal.id}.` };
    }
    for (const operation of [...(journal.operations ?? [])].reverse()) {
      if (operation.status !== "pending") removeEntry(operation.target);
      if (operation.backup && pathExists(operation.backup)) { fs.mkdirSync(path.dirname(operation.target), { recursive: true }); fs.renameSync(operation.backup, operation.target); }
    }
    restoreMetadata(journal.config);
    restoreMetadata(journal.manifest);
    restoreMetadata(journal.mattReceipt);
    removeStaging(journal.stagingRoot); removeEntry(file);
    return { ok: true, recovered: true, receipt: `Recovered interrupted Matrix transaction ${journal.id}.` };
  } catch (error) { return { ok: false, code: "RECOVERY_REQUIRED", recovery: `Keep ${file} and restore the paths recorded there before retrying.`, error: error.message }; }
}

export function createDistribution({ failAt, mattAdapter = createMattAdapter(), mattCandidateVerifier = null, mattContentHashes = MATT_CONTENT_HASHES } = {}) {
  const candidateVerifier = mattCandidateVerifier ?? ((candidate, actions) => verifyMattCandidate(candidate, actions, mattContentHashes));
  const evaluate = (rawIntent) => {
    const intent = normalizeIntent(rawIntent); const language = intent.language ?? rawIntent.language ?? "en";
    if (intent.error) return { ok: false, code: intent.error, diagnostics: [{ code: intent.error, message: text(language, "noPlatform") }] };
    if (!intent.platforms.length) { const detected = detectPlatforms(intent.projectRoot, intent.scope, intent.home); if (!detected.length) return { ok: false, code: "INPUT_REQUIRED", diagnostics: [{ code: "INPUT_REQUIRED", message: text(language, "noPlatform") }] }; intent.platforms = detected; }
    let catalog; try { catalog = releaseCatalog(intent.language); } catch (error) { return { ok: false, code: "PACKAGE_INCOMPLETE", intent, diagnostics: [{ code: "PACKAGE_INCOMPLETE", message: error.message }] }; }
    const manifest = readManifest(intent);
    const mattReceipt = readJson(mattReceiptPath(intent.projectRoot));
    intent.platforms = [...new Set([...Object.keys(manifest?.platforms ?? {}), ...intent.platforms])];
    const observations = intent.platforms.map((id) => observePlatform(intent, catalog, manifest, mattReceipt, id, mattContentHashes));
    const existingConfig = readConfig(configPath(intent));
    const existingDefault = ["prim", "arch"].includes(existingConfig.default_orchestration) ? existingConfig.default_orchestration
      : ["prim", "arch"].includes(manifest?.orchestration?.default) ? manifest.orchestration.default : null;
    intent.defaultOrchestration = intent.defaultOrchestration ?? existingDefault ?? (intent.matt === "missing" && intent.nonInteractive ? "arch" : "prim");
    const actions = observations.map((item) => ({ platform: item.id, matrix: actionFor(item, intent.matrixPolicy), matt: intent.matt === "missing" ? { kind: "reconcile", skills: [...MATT_SKILLS] } : { kind: "keep", skills: [] } }));
    const blocked = actions.filter((item) => item.matrix === "blocked");
    const blockedMatt = intent.matt === "missing" && intent.mattPolicy !== "replace"
      ? observations.filter((item) => (item.matt.classificationCounts["user-modified"] ?? 0) > 0 || (item.matt.classificationCounts.unreadable ?? 0) > 0)
      : [];
    const archMustRemainAvailable = manifest?.orchestration?.available?.includes("arch") || intent.defaultOrchestration === "arch";
    const mattReady = trustedMattReceipt(mattReceipt) && observations.every(mattObservationMatchesReceipt);
    const incompleteWithoutInstall = intent.matt !== "readonly" && intent.matt !== "missing" && archMustRemainAvailable && !mattReady;
    const plan = { version: VERSION, intent, catalogDigest: catalog.digest, manifestPath: manifestPath(intent.scope, intent.projectRoot, intent.home), configPath: configPath(intent), actions, observations, preconditionDigest: digest(observations) };
    plan.seal = digest({ intent, catalogDigest: plan.catalogDigest, actions, preconditionDigest: plan.preconditionDigest });
    const code = blocked.length ? "USER_MODIFIED_BLOCKED" : blockedMatt.length ? "MATT_USER_MODIFIED" : incompleteWithoutInstall ? "ARCH_INSTALLATION_INCOMPLETE" : "OK";
    return { ok: code === "OK", code, intent, observations, actions, plan, diagnostics: [
      ...blocked.map((item) => ({ code: "USER_MODIFIED_BLOCKED", platform: item.platform, message: text(intent.language, "matrixModifiedDiagnostic").replace("{platform}", item.platform) })),
      ...blockedMatt.map((item) => ({ code: "MATT_USER_MODIFIED", platform: item.id, states: item.matt.classificationCounts, message: text(intent.language, "mattModifiedDiagnostic").replace("{platform}", item.name) })),
      ...(incompleteWithoutInstall ? [{ code: "ARCH_INSTALLATION_INCOMPLETE", message: text(intent.language, "archIncompleteDiagnostic") }] : [])
    ], summary: `${text(intent.language, "preview")}: ${actions.map((item) => `${item.platform}: ${localizedAction(intent.language, item.matrix)}`).join(", ")}` };
  };

  return { evaluate,
    diagnose(rawIntent) {
      const evaluation = evaluate(rawIntent); if (!evaluation.intent) return evaluation;
      const diagnostics = []; const pending = readJson(transactionPath(evaluation.intent)); const manifest = readManifest(evaluation.intent);
      if (pending) diagnostics.push({ code: "RECOVERY_REQUIRED", message: text(evaluation.intent.language, "transactionPending") });
      if (!manifest) diagnostics.push({ code: "MANIFEST_MISSING", message: text(evaluation.intent.language, "manifestMissing") });
      for (const observation of evaluation.observations ?? []) {
        diagnostics.push({ code: `MATRIX_${observation.matrix.toUpperCase().replaceAll("-", "_")}`, platform: observation.id, message: text(evaluation.intent.language, "matrixStateDiagnostic").replace("{platform}", observation.name).replace("{state}", localizedState(evaluation.intent.language, observation.matrix)) });
        const matrixRoot = path.join(observation.root, "matrix");
        if (pathExists(matrixRoot) && (!exists(matrixRoot) || !exists(path.join(matrixRoot, "scripts", "matrix-runtime.mjs")) || !exists(path.join(matrixRoot, "scripts", "workflow-transaction.js")))) diagnostics.push({ code: "RUNTIME_MISSING", platform: observation.id, message: `${observation.name}: ${text(evaluation.intent.language, "runtimeMissing")}` });
        for (const skill of observation.skills.filter((entry) => isBrokenLink(entry.target))) diagnostics.push({ code: "BROKEN_LINK", platform: observation.id, path: skill.target, message: `${observation.name}: ${text(evaluation.intent.language, "brokenLink")} ${skill.target}` });
        if (observation.id === "codex" && PLATFORMS.codex.legacyRoots(scopeBase(evaluation.intent.scope, evaluation.intent.projectRoot, evaluation.intent.home)).some(exists)) diagnostics.push({ code: "CODEX_LEGACY_DETECTED", platform: observation.id, message: text(evaluation.intent.language, "codexLegacyDiagnostic") });
        diagnostics.push({ code: `MATT_${observation.matt.state.toUpperCase()}`, platform: observation.id, message: text(evaluation.intent.language, "mattStateDiagnostic").replace("{platform}", observation.name).replace("{state}", localizedState(evaluation.intent.language, observation.matt.state)) });
        if (observation.matt.ignoredGlobal) diagnostics.push({ code: "MATT_GLOBAL_IGNORED", platform: observation.id, count: observation.matt.ignoredGlobal, message: `${observation.name}: ${observation.matt.ignoredGlobal} ${text(evaluation.intent.language, "mattGlobalIgnored")}` });
        if (observation.matt.unmanaged.length) diagnostics.push({ code: "ARCH_UNMANAGED_EXTRA", platform: observation.id, skills: observation.matt.unmanaged, message: text(evaluation.intent.language, "unmanagedExtraDiagnostic").replace("{platform}", observation.name).replace("{skills}", observation.matt.unmanaged.join(", ")) });
      }
      return { ...evaluation, diagnosis: diagnostics };
    },
    commit(plan) {
      if (!plan?.seal || plan.seal !== digest({ intent: plan.intent, catalogDigest: plan.catalogDigest, actions: plan.actions, preconditionDigest: plan.preconditionDigest })) return { ok: false, code: "INVALID_INTENT" };
      const recovery = recoverPendingTransaction(plan.intent, { allowMattWrites: plan.intent.matt !== "readonly" }); if (!recovery.ok) return recovery;
      const refreshed = evaluate({ ...plan.intent, platforms: plan.intent.platforms });
      if (!refreshed.plan || refreshed.plan.preconditionDigest !== plan.preconditionDigest || refreshed.plan.catalogDigest !== plan.catalogDigest) return { ok: false, code: "PLAN_STALE" };
      if (!refreshed.ok) return { ok: false, code: refreshed.code, diagnostics: refreshed.diagnostics };
      if (plan.intent.dryRun) return { ok: true, code: "DRY_RUN", actions: plan.actions };
      const previousManifest = readManifest(plan.intent);
      const previousMattReceipt = readJson(mattReceiptPath(plan.intent.projectRoot));
      const root = installationRoot(plan.intent.scope, plan.intent.projectRoot, plan.intent.home); const id = nowStamp(); const stagingRoot = path.join(root, "staging", id); const journalFile = transactionPath(plan.intent);
      const mattActions = plan.actions.filter((item) => item.matt.kind === "reconcile");
      const journal = {
        id, state: "in-progress", stagingRoot,
        manifest: { path: plan.manifestPath, existed: pathExists(plan.manifestPath), backup: null, written: false },
        config: { path: plan.configPath, existed: pathExists(plan.configPath), backup: null, written: false },
        mattReceipt: { path: mattReceiptPath(plan.intent.projectRoot), existed: pathExists(mattReceiptPath(plan.intent.projectRoot)), backup: null, written: false },
        operations: []
      };
      for (const item of refreshed.observations) if (plan.actions.find((entry) => entry.platform === item.id).matrix !== "keep") for (const skill of MATRIX_SKILLS) journal.operations.push({ target: path.join(item.root, skill), backup: null, status: "pending" });
      for (const action of mattActions) {
        const observation = refreshed.observations.find((item) => item.id === action.platform);
        for (const skill of action.matt.skills) journal.operations.push({ kind: "matt", platform: action.platform, skill, target: path.join(observation.matt.root, skill), backup: null, status: "pending" });
      }
      const persist = () => writeJson(journalFile, journal);
      let mattCandidate = null;
      try {
        persist(); const catalog = releaseCatalog(plan.intent.language); const stagedPlatforms = new Map();
        for (const item of refreshed.observations) {
          if (plan.actions.find((entry) => entry.platform === item.id).matrix === "keep") continue;
          const platformStage = path.join(stagingRoot, item.id);
          for (const skill of MATRIX_SKILLS) { const staged = path.join(platformStage, skill); fs.mkdirSync(path.dirname(staged), { recursive: true }); fs.cpSync(path.join(catalog.root, skill), staged, { recursive: true }); fs.mkdirSync(path.join(staged, "scripts"), { recursive: true }); fs.writeFileSync(path.join(staged, "scripts", "package.json"), '{"type":"module"}\n'); fs.copyFileSync(workflowRuntimeSource(), path.join(staged, "scripts", "matrix-runtime.mjs")); fs.copyFileSync(workflowTransactionSource(), path.join(staged, "scripts", "workflow-transaction.js")); fs.copyFileSync(mattCatalogSource(), path.join(staged, "scripts", "matt-catalog.mjs")); if (skill === "matrix") for (const filename of ["matrix_state.py", "matrix_claude.py"]) fs.copyFileSync(path.join(sourceSkillsRoot("en"), "matrix", "scripts", filename), path.join(staged, "scripts", filename)); if (!exists(path.join(staged, "SKILL.md"))) throw new Error(`Stage validation failed: ${item.id}/${skill}`); }
          stagedPlatforms.set(item.id, platformStage);
        }
        if (mattActions.length) {
          if (typeof mattAdapter.prepareCandidate !== "function") {
            const restored = recoverPendingTransaction(plan.intent);
            return { ok: true, code: "PARTIAL", committed: [], backups: [], recovery: "Matt adapter cannot provide an isolated candidate. Run matrix init --with-mattpocock with the supported Matrix CLI.", matt: [{ ok: false, code: "MATT_DIRECT_INSTALL_UNSUPPORTED" }], recoveryReceipt: restored.receipt ?? recovery.receipt };
          }
          mattCandidate = mattAdapter.prepareCandidate({ platforms: mattActions.map((item) => item.platform), skills: MATT_SKILLS });
          if (!mattCandidate.ok) {
            const restored = recoverPendingTransaction(plan.intent);
            return { ok: true, code: "PARTIAL", committed: [], backups: [], recovery: mattCandidate.recovery, matt: [mattCandidate], recoveryReceipt: restored.receipt ?? recovery.receipt };
          }
          candidateVerifier(mattCandidate, mattActions);
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
        const mattResults = [];
        if (mattCandidate) {
          for (const operation of journal.operations.filter((item) => item.kind === "matt")) {
            const source = path.join(mattCandidate.platforms[operation.platform], operation.skill);
            if (pathExists(operation.target)) {
              const actual = hashDirectory(operation.target); const candidateHash = hashDirectory(source);
              if (actual === candidateHash) continue;
              const recorded = previousMattReceipt?.platforms?.[operation.platform]?.skills?.[operation.skill]?.hash
                ?? previousManifest?.platforms?.[operation.platform]?.matt?.skills?.[operation.skill]?.hash;
              if ((!recorded || actual !== recorded) && plan.intent.mattPolicy !== "replace") {
                const error = new Error(`Matt target is user-modified: ${operation.target}`);
                error.code = "MATT_USER_MODIFIED";
                throw error;
              }
              operation.status = "backing-up";
              operation.backup = path.join(root, "backups", id, "matt", operation.platform, operation.skill); persist();
              fs.mkdirSync(path.dirname(operation.backup), { recursive: true });
              fs.renameSync(operation.target, operation.backup);
              operation.status = "backed-up"; persist();
            }
            fs.mkdirSync(path.dirname(operation.target), { recursive: true });
            fs.cpSync(source, operation.target, { recursive: true });
            operation.status = "committed"; persist(); failAt?.("after-matt-commit", { platform: operation.platform, skill: operation.skill });
          }
          for (const action of mattActions) mattResults.push({ platform: action.platform, ok: true, code: "OK", attempted: [action.platform] });
        }
        const postObservations = plan.intent.platforms.map((platform) => observePlatform(plan.intent, catalog, readManifest(plan.intent), previousMattReceipt, platform, mattContentHashes));
        const incomplete = mattActions.length ? postObservations.filter((item) => !mattObservationMatchesRelease(item, mattContentHashes)) : [];
        const backups = journal.operations.filter((item) => item.backup).map((item) => ({ target: item.target, backup: item.backup }));
        if (mattResults.some((item) => !item.ok) || incomplete.length) {
          if (mattCandidate) mattAdapter.discardCandidate?.(mattCandidate);
          const restored = recoverPendingTransaction(plan.intent);
          return { ok: true, code: "PARTIAL", committed: [], backups: [], recovery: "The platform was not added. Repair the Arch Skill installation and rerun matrix init --with-mattpocock.", matt: mattResults, recoveryReceipt: restored.receipt ?? recovery.receipt };
        }
        if (journal.manifest.existed) { journal.manifest.backup = path.join(root, "backups", id, "installation.json"); persist(); fs.mkdirSync(path.dirname(journal.manifest.backup), { recursive: true }); fs.renameSync(plan.manifestPath, journal.manifest.backup); }
        if (journal.config.existed) { journal.config.backup = path.join(root, "backups", id, "config.yaml"); persist(); fs.mkdirSync(path.dirname(journal.config.backup), { recursive: true }); fs.renameSync(plan.configPath, journal.config.backup); }
        if (mattActions.length && journal.mattReceipt.existed) { journal.mattReceipt.backup = path.join(root, "backups", id, "matt-installation.json"); persist(); fs.mkdirSync(path.dirname(journal.mattReceipt.backup), { recursive: true }); fs.renameSync(journal.mattReceipt.path, journal.mattReceipt.backup); }
        const records = Object.fromEntries(postObservations.map((item) => {
          const legacyMatt = previousManifest?.platforms?.[item.id]?.matt ?? null;
          return [item.id, {
            root: item.root,
            skills: Object.fromEntries(MATRIX_SKILLS.map((skill) => [skill, { hash: hashDirectory(path.join(item.root, skill)) }])),
            ...(legacyMatt ? { matt: legacyMatt } : {})
          }];
        }));
        const available = plan.intent.matt === "readonly" ? (previousManifest?.orchestration?.available ?? ["prim"])
          : mattActions.length ? (postObservations.every((observation) => mattObservationMatchesRelease(observation, mattContentHashes)) ? ["prim", "arch"] : ["prim"])
            : (previousManifest?.orchestration?.available ?? ["prim"]);
        const previousConfig = readConfig(journal.config.backup ?? plan.configPath);
        fs.mkdirSync(path.dirname(plan.configPath), { recursive: true });
        fs.writeFileSync(plan.configPath, configContent(previousConfig, plan.intent.defaultOrchestration, plan.intent.scope, plan.intent.language)); journal.config.written = true; persist();
        if (mattActions.length && available.includes("arch")) {
          writeJson(journal.mattReceipt.path, {
            version: 1,
            compatibility: MATT_COMPATIBILITY,
            catalogDigest: MATT_CATALOG_DIGEST,
            platforms: Object.fromEntries(postObservations.map((item) => [item.id, { root: item.matt.root, skills: item.matt.skills }]))
          });
          journal.mattReceipt.written = true; persist();
        }
        writeJson(plan.manifestPath, {
          version: VERSION, catalogVersion: catalog.version, language: plan.intent.language, mode: plan.intent.mode, scope: plan.intent.scope,
          catalogDigest: catalog.digest, orchestration: { default: plan.intent.defaultOrchestration, available }, platforms: records
        });
        journal.manifest.written = true; persist(); failAt?.("after-manifest"); journal.state = "committed"; persist();
        if (mattCandidate) mattAdapter.discardCandidate?.(mattCandidate);
        removeStaging(stagingRoot); removeEntry(journal.manifest.backup); removeEntry(journal.config.backup); removeEntry(journal.mattReceipt.backup); removeEntry(journalFile);
        return { ok: true, code: "OK", committed: journal.operations.map((item) => item.target), backups, matt: mattResults, recoveryReceipt: recovery.receipt };
      } catch (error) { if (mattCandidate) mattAdapter.discardCandidate?.(mattCandidate); const restored = recoverPendingTransaction(plan.intent); return { ok: false, code: error.code === "MATT_USER_MODIFIED" ? error.code : "MATRIX_COMMIT_FAILED", error: error.message, recovery: restored.ok ? "Matrix targets and installation manifest were restored." : restored.recovery }; }
    }
  };
}
