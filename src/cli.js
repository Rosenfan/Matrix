import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PLATFORMS } from "./catalog.js";
import { createDistribution, installedIntent } from "./distribution.js";
import { createMattAdapter, inspectMattInstallation } from "./matt.js";
import { text } from "./messages.js";
import { createUi } from "./ui.js";
import { invoke } from "./workflow.js";
import { compareVersions, globalBinPath, latestVersion, selfUpdate } from "./self-update.js";
import { resolveProjectRuntime } from "./runtime-resolver.js";
import { MATT_COMPATIBILITY } from "./matt-catalog.mjs";

const packagePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
const version = JSON.parse(fs.readFileSync(packagePath, "utf8")).version;
const HELP = `Matrix ${version}\n\nUsage: matrix init [directory] [options]\n       matrix update [directory] [options]\n       matrix doctor [directory] [options]\n\nOptions:\n  --language <en|zh-CN>\n  --scope <project|global>\n  --platform <claude-code|codex>  (repeatable)\n  --mode <copy|symlink>\n  --with-mattpocock | --without-mattpocock\n  --force-matt\n  --default-orchestration <prim|arch>\n  --skip-self-update  --force  --yes, -y  --dry-run  --json  --no-color`;

function parse(argv) {
  const result = { command: null, directory: null, scope: null, language: null, platforms: [], mode: "copy", matt: null, mattPolicy: "preserve", defaultOrchestration: null, matrixPolicy: "safe", yes: false, dryRun: false, json: false, color: true, skipSelfUpdate: false, reexec: false };
  const values = [...argv];
  if (values[0] && !values[0].startsWith("-")) result.command = values.shift();
  while (values.length) {
    const token = values.shift();
    if (!token.startsWith("-") && !result.directory) result.directory = token;
    else if (token === "--scope") result.scope = values.shift();
    else if (token === "--language") result.language = values.shift();
    else if (token === "--platform") result.platforms.push(values.shift());
    else if (token === "--mode") result.mode = values.shift();
    else if (token === "--with-mattpocock") result.matt = "missing";
    else if (token === "--without-mattpocock") result.matt = "none";
    else if (token === "--force-matt") result.mattPolicy = "replace";
    else if (token === "--default-orchestration") result.defaultOrchestration = values.shift();
    else if (token === "--force") result.matrixPolicy = "replace";
    else if (["--yes", "-y"].includes(token)) result.yes = true;
    else if (token === "--dry-run") result.dryRun = true;
    else if (token === "--skip-self-update") result.skipSelfUpdate = true;
    else if (token === "--_reexec") result.reexec = true;
    else if (token === "--json") result.json = true;
    else if (token === "--no-color") result.color = false;
    else if (["--help", "-h"].includes(token)) result.help = true;
    else if (["--version", "-v"].includes(token)) result.version = true;
    else throw new Error(`Unknown option: ${token}`);
  }
  return result;
}

function projectRoot(directory) {
  const value = path.resolve(directory ?? process.cwd());
  if (!fs.existsSync(value) || !fs.statSync(value).isDirectory()) throw new Error(`Not a directory: ${value}`);
  return value;
}

function labelsFor(language) { return { yes: text(language, "yes"), no: text(language, "no") }; }

function localizedState(language, state) {
  return text(language, ({ missing: "stateMissing", matching: "stateMatching", complete: "stateComplete", "user-modified": "stateUserModified", partial: "statePartial", damaged: "statePartial", newer: "stateMatching", "outdated-unchanged": "stateOutdated", "safe-update": "stateSafeUpdate", adoptable: "stateAdoptable", unreadable: "stateUnreadable", compatible: "stateCompatible", "update-required": "stateUpdateRequired", "unsupported-newer": "stateUnsupportedNewer", unverified: "stateUnverified", unknown: "stateUnknown", incomplete: "statePartial" })[state] ?? state);
}

function localizedAction(language, action) {
  return text(language, ({ install: "actionInstall", keep: "actionKeep", "backup-replace": "actionBackupReplace", repair: "actionRepair", blocked: "actionBlocked" })[action] ?? action);
}

async function intentFrom(options, ui) {
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY && !options.json);
  const language = options.language ?? (options.yes ? "en" : await ui.select("Language / 语言", [{ label: "English", value: "en" }, { label: "中文", value: "zh-CN" }]));
  const scope = options.scope ?? (options.yes ? "project" : await ui.select(text(language, "scopeQuestion"), [{ label: text(language, "project"), value: "project" }, { label: text(language, "global"), value: "global" }]));
  let platforms = options.platforms;
  if (!platforms.length && interactive && !options.yes) platforms = await ui.selectMany(text(language, "platformsQuestion"), [{ label: "Claude Code", value: "claude-code" }, { label: "Codex", value: "codex" }]);
  const matt = options.matt ?? (interactive && !options.yes ? (await ui.confirm(text(language, "mattQuestion"), true, labelsFor(language)) ? "missing" : "none") : "missing");
  const defaultOrchestration = options.defaultOrchestration ?? (interactive && !options.yes && matt === "missing"
    ? await ui.select(text(language, "orchestrationQuestion"), [{ label: "Arch", value: "arch" }, { label: "Prim", value: "prim" }])
    : null);
  return { projectRoot: projectRoot(options.directory), language, scope, platforms, mode: options.mode, matt, mattPolicy: options.mattPolicy, defaultOrchestration, nonInteractive: options.yes || !interactive, matrixPolicy: options.matrixPolicy, dryRun: options.dryRun };
}

function render(ui, evaluation) {
  const language = evaluation.intent?.language ?? "en";
  const actions = (evaluation.actions ?? []).map((item) => `${item.platform}: ${localizedAction(language, item.matrix)}`).join(", ");
  ui.info(actions ? `${text(language, "preview")}: ${actions}` : evaluation.code);
  if (evaluation.intent?.defaultOrchestration) ui.muted(`${text(language, "defaultOrchestration")}: ${evaluation.intent.defaultOrchestration}`);
  for (const item of evaluation.observations ?? []) {
    const mattStates = Object.entries(item.matt.classificationCounts ?? {}).map(([state, count]) => `${localizedState(language, state)}=${count}`).join(", ");
    ui.muted(`${item.name}: ${text(language, "matrix")} ${localizedState(language, item.matrix)}；${text(language, "matt")} ${localizedState(language, item.matt.state)}${mattStates ? ` (${mattStates})` : ""}`);
  }
  for (const item of evaluation.diagnostics ?? []) ui.warn(item.code === "USER_MODIFIED_BLOCKED" ? text(language, "replaceQuestion") : item.message ?? item.code);
  for (const item of evaluation.diagnosis ?? []) (item.code === "MATT_GLOBAL_IGNORED" ? ui.muted : ui.warn)(item.message ?? item.code);
}

async function init(options) {
  const ui = createUi({ color: options.color && !options.json });
  if (!options.json) await ui.banner();
  const intent = await intentFrom(options, ui);
  return refresh(intent, options, ui);
}

async function refresh(intent, options, ui) {
  const distribution = createDistribution({ mattAdapter: createMattAdapter({ stdio: options.json ? "pipe" : "inherit" }) });
  let evaluation = distribution.evaluate(intent);
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY && !options.json);
  let reevaluated = false;
  if (!options.json) render(ui, evaluation);
  if (!evaluation.ok && evaluation.code === "USER_MODIFIED_BLOCKED" && interactive && !options.yes && await ui.confirm(text(intent.language, "replaceQuestion"), false, labelsFor(intent.language))) {
    evaluation = distribution.evaluate({ ...intent, matrixPolicy: "replace" }); reevaluated = true;
  }
  if (!evaluation.ok && evaluation.code === "MATT_USER_MODIFIED" && interactive && !options.yes
    && await ui.confirm(text(intent.language, "mattReplaceQuestion"), false, labelsFor(intent.language))) {
    evaluation = distribution.evaluate({ ...intent, mattPolicy: "replace" }); reevaluated = true;
  }
  if (options.json) {
    if (!evaluation.ok || options.dryRun) {
      const output = options.updateMode ? { ...evaluation, matt: inspectMattInstallation({ projectRoot: intent.projectRoot, home: intent.home, platforms: intent.platforms }) } : evaluation;
      console.log(JSON.stringify(output)); return evaluation.ok ? 0 : 2;
    }
    const result = distribution.commit(evaluation.plan);
    const output = { ...evaluation, ...result, intent: evaluation.intent, observations: evaluation.observations, actions: evaluation.actions,
      ...(options.updateMode ? { matt: inspectMattInstallation({ projectRoot: intent.projectRoot, home: intent.home, platforms: intent.platforms }) } : {}) };
    console.log(JSON.stringify(output));
    return !result.ok ? 2 : result.code === "PARTIAL" ? 1 : 0;
  }
  if (reevaluated) render(ui, evaluation);
  if (!evaluation.ok) return 2;
  if (!options.yes && interactive && !options.dryRun && !await ui.confirm(text(intent.language, "confirm"), true, labelsFor(intent.language))) return 0;
  const result = distribution.commit(evaluation.plan);
  if (!result.ok) { ui.warn(result.error ?? result.code); return 2; }
  if (result.code === "PARTIAL") { ui.warn(result.recovery); return 1; }
  ui.success(options.dryRun ? text(intent.language, "dryRunComplete") : text(intent.language, "ready"));
  if (!options.updateMode && intent.matt === "missing" && !options.dryRun) ui.muted(text(intent.language, "mattSetupHint").replace("{release}", MATT_COMPATIBILITY.release));
  if (options.updateMode) {
    const matt = inspectMattInstallation({ projectRoot: intent.projectRoot, home: intent.home, platforms: intent.platforms });
    ui.muted(`${text(intent.language, "mattCompatibilityStatus").replace("{release}", matt.supported.release).replace("{status}", localizedState(intent.language, matt.status))}${matt.action ? `; ${matt.action}` : ""}`);
  }
  ui.muted(evaluation.intent.platforms.map((id) => `${PLATFORMS[id].name}: $matrix <request>`).join("\n"));
  return 0;
}

async function update(options) {
  const ui = createUi({ color: options.color && !options.json });
  const root = projectRoot(options.directory);
  const installed = installedIntent({ projectRoot: root });
  if (!installed.ok) {
    const result = { ok: false, code: installed.code, message: "No trusted Matrix installation manifest was found. Run matrix init first." };
    if (options.json) console.log(JSON.stringify(result)); else ui.warn(result.message);
    return 2;
  }
  const forbidden = options.language || options.scope || options.platforms.length || options.matt || options.mattPolicy === "replace" || options.defaultOrchestration || options.mode !== "copy";
  if (forbidden) throw new Error("matrix update inherits installation settings. Use matrix init to change language, scope, platform, mode, Matt skills, or orchestration.");
  const intent = { ...installed.intent, dryRun: options.dryRun };
  let npm = { status: "skipped", current: version, target: version, reason: options.skipSelfUpdate ? "disabled by --skip-self-update" : null };
  if (!options.skipSelfUpdate && !options.reexec) {
    try {
      const target = await latestVersion(); const comparison = compareVersions(target, version);
      if (comparison === null) throw new Error("unable to compare registry version");
      npm = comparison > 0 ? { status: "available", current: version, target } : { status: "skipped", current: version, target, reason: comparison === 0 ? "already latest" : "registry version is older" };
    } catch (error) {
      const result = { ok: false, code: "SELF_UPDATE_CHECK_FAILED", npm: { status: "failed", current: version, reason: error.message }, recovery_command: "matrix update --skip-self-update" };
      if (options.json) console.log(JSON.stringify(result)); else ui.warn(`${result.code}: ${error.message}\nRun ${result.recovery_command} to refresh assets without npm.`);
      return 2;
    }
  }
  if (options.json && options.dryRun) { console.log(JSON.stringify({ ok: true, code: "DRY_RUN", npm, intent, matt: inspectMattInstallation({ projectRoot: root, home: intent.home, platforms: intent.platforms }) })); return 0; }
  if (!options.json) {
    await ui.banner(); ui.info(`Matrix update: CLI ${npm.current}${npm.status === "available" ? ` → ${npm.target}` : ""}`);
    ui.muted(`Assets: ${intent.scope}, ${intent.language}, ${intent.platforms.join(", ")}`);
  }
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY && !options.json);
  if (npm.status === "available") {
    if (!options.yes && interactive && !await ui.confirm(`Upgrade Matrix CLI ${npm.current} → ${npm.target} and then refresh these assets?`, true, labelsFor(intent.language))) return 0;
    if (options.dryRun) { if (options.json) console.log(JSON.stringify({ ok: true, code: "DRY_RUN", npm, intent, matt: inspectMattInstallation({ projectRoot: root, home: intent.home, platforms: intent.platforms }) })); else ui.success(text(intent.language, "dryRunComplete")); return 0; }
    const updated = selfUpdate(version, npm.target);
    if (!updated.ok) { const result = { ok: false, code: "SELF_UPDATE_FAILED", npm: { ...npm, status: "failed", reason: updated.reason }, recovery_command: "matrix update --skip-self-update" }; if (options.json) console.log(JSON.stringify(result)); else ui.warn(`${result.code}: ${updated.reason}`); return 2; }
    const args = [globalBinPath(), "update", root, "--skip-self-update", "--_reexec", "--yes"];
    if (options.matrixPolicy === "replace") args.push("--force"); if (options.json) args.push("--json"); if (!options.color) args.push("--no-color");
    const rerun = spawnSync(process.execPath, args, { stdio: "inherit" });
    return Number.isInteger(rerun.status) ? rerun.status : 2;
  }
  if (options.json) return refresh(intent, { ...options, yes: true, updateMode: true }, ui);
  return refresh(intent, { ...options, updateMode: true }, ui);
}

function recoveryArgument(value) {
  const argument = String(value);
  if (/^[A-Za-z0-9_./:@=-]+$/.test(argument)) return argument;
  if (process.platform === "win32") return `"${argument.replaceAll('"', '\\"')}"`;
  return `'${argument.replaceAll("'", "'\\''")}'`;
}

function runtimeRecovery(projectRuntime, argv) {
  const argumentsWithoutJson = argv.slice(1).filter((value) => value !== "--json");
  return { ...projectRuntime, recovery_command: [projectRuntime.recovery_command, ...argumentsWithoutJson.map(recoveryArgument)].join(" ") };
}

async function doctor(options) {
  const ui = createUi({ color: options.color && !options.json });
  const root = projectRoot(options.directory);
  const installed = installedIntent({ projectRoot: root });
  const intent = installed.ok
    ? { ...installed.intent, dryRun: true }
    : await intentFrom({ ...options, directory: root, yes: true }, ui);
  const evaluation = createDistribution().diagnose(intent);
  const matt = inspectMattInstallation({ projectRoot: intent.projectRoot, home: intent.home, platforms: intent.platforms });
  if (options.json) console.log(JSON.stringify({ ...evaluation, matt }));
  else { await ui.banner(); ui.info(text(intent.language, "doctor")); render(ui, evaluation); ui.muted(`${text(intent.language, "mattCompatibilityStatus").replace("{release}", matt.supported.release).replace("{status}", localizedState(intent.language, matt.status))}${matt.action ? `; ${matt.action}` : ""}`); }
  return evaluation.ok ? 0 : 2;
}

export async function main(argv) {
  if (argv[0] === "workflow") {
    const json = argv.includes("--json");
    const projectRuntime = resolveProjectRuntime({ projectRoot: process.cwd() });
    if (!projectRuntime.ok) {
      const failure = projectRuntime.recovery_command ? runtimeRecovery(projectRuntime, argv) : projectRuntime;
      if (json) console.log(JSON.stringify(failure));
      else console.log(`MATRIX ERROR [${failure.code}]: ${failure.message}${failure.recovery_command ? `\nRun ${failure.recovery_command}` : ""}`);
      return 2;
    }
    if (projectRuntime.runtime) {
      const delegated = spawnSync(process.execPath, [projectRuntime.runtime, ...argv.slice(1).filter((value) => value !== "--json")], { stdio: "inherit" });
      return Number.isInteger(delegated.status) ? delegated.status : 2;
    }
    const result = invoke(argv.slice(1).filter((value) => value !== "--json"));
    if (json) console.log(JSON.stringify(result));
    else console.log(result.ok ? JSON.stringify(result, null, 2) : `MATRIX ERROR [${result.code}]: ${result.message}`);
    return result.ok ? 0 : 2;
  }
  const options = parse(argv);
  if (options.version) { console.log(version); return 0; }
  if (options.help || !options.command) { console.log(HELP); return 0; }
  if (options.command === "init") return init(options);
  if (options.command === "update") return update(options);
  if (options.command === "doctor") return doctor(options);
  throw new Error(`Unknown command: ${options.command}. Run matrix --help.`);
}
