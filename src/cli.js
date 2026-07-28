import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PLATFORMS } from "./catalog.js";
import { createDistribution } from "./distribution.js";
import { text } from "./messages.js";
import { createUi } from "./ui.js";
import { invoke } from "./workflow.js";

const packagePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
const version = JSON.parse(fs.readFileSync(packagePath, "utf8")).version;
const HELP = `Matrix ${version}\n\nUsage: matrix init [directory] [options]\n       matrix doctor [directory] [options]\n\nOptions:\n  --language <en|zh-CN>\n  --scope <project|global>\n  --platform <claude-code|codex>  (repeatable)\n  --mode <copy|symlink>\n  --with-mattpocock | --without-mattpocock\n  --default-orchestration <prim|arch>\n  --force  --yes, -y  --dry-run  --json  --no-color`;

function parse(argv) {
  const result = { command: null, directory: null, scope: null, language: null, platforms: [], mode: "copy", matt: null, defaultOrchestration: null, matrixPolicy: "safe", yes: false, dryRun: false, json: false, color: true };
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
    else if (token === "--default-orchestration") result.defaultOrchestration = values.shift();
    else if (token === "--force") result.matrixPolicy = "replace";
    else if (["--yes", "-y"].includes(token)) result.yes = true;
    else if (token === "--dry-run") result.dryRun = true;
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
  return text(language, ({ missing: "stateMissing", matching: "stateMatching", complete: "stateComplete", "user-modified": "stateUserModified", partial: "statePartial", damaged: "statePartial", newer: "stateMatching", "outdated-unchanged": "stateOutdated" })[state] ?? state);
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
  return { projectRoot: projectRoot(options.directory), language, scope, platforms, mode: options.mode, matt, defaultOrchestration, nonInteractive: options.yes || !interactive, matrixPolicy: options.matrixPolicy, dryRun: options.dryRun };
}

function render(ui, evaluation) {
  const language = evaluation.intent?.language ?? "en";
  const actions = (evaluation.actions ?? []).map((item) => `${item.platform}: ${localizedAction(language, item.matrix)}`).join(", ");
  ui.info(actions ? `${text(language, "preview")}: ${actions}` : evaluation.code);
  if (evaluation.intent?.defaultOrchestration) ui.muted(`Default orchestration: ${evaluation.intent.defaultOrchestration}`);
  for (const item of evaluation.observations ?? []) ui.muted(`${item.name}: ${text(language, "matrix")} ${localizedState(language, item.matrix)}；${text(language, "matt")} ${localizedState(language, item.matt.state)}${item.matt.inherited ? ` (${text(language, "global")})` : ""}`);
  for (const item of evaluation.diagnostics ?? []) ui.warn(item.code === "USER_MODIFIED_BLOCKED" ? text(language, "replaceQuestion") : item.message ?? item.code);
  for (const item of evaluation.diagnosis ?? []) (item.code === "MATT_INHERITED" ? ui.muted : ui.warn)(item.message ?? item.code);
}

async function init(options) {
  const ui = createUi({ color: options.color && !options.json });
  if (!options.json) await ui.banner();
  const intent = await intentFrom(options, ui);
  const distribution = createDistribution();
  let evaluation = distribution.evaluate(intent);
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY && !options.json);
  if (!evaluation.ok && evaluation.code === "USER_MODIFIED_BLOCKED" && interactive && !options.yes && await ui.confirm(text(intent.language, "replaceQuestion"), false, labelsFor(intent.language))) evaluation = distribution.evaluate({ ...intent, matrixPolicy: "replace" });
  if (options.json) { console.log(JSON.stringify(evaluation)); return evaluation.ok ? 0 : 2; }
  render(ui, evaluation);
  if (!evaluation.ok) return 2;
  if (!options.yes && interactive && !options.dryRun && !await ui.confirm(text(intent.language, "confirm"), true, labelsFor(intent.language))) return 0;
  const result = distribution.commit(evaluation.plan);
  if (!result.ok) { ui.warn(result.error ?? result.code); return 2; }
  if (result.code === "PARTIAL") { ui.warn(result.recovery); return 1; }
  ui.success(options.dryRun ? text(intent.language, "dryRunComplete") : text(intent.language, "ready"));
  ui.muted(evaluation.intent.platforms.map((id) => `${PLATFORMS[id].name}: $matrix <request>`).join("\n"));
  return 0;
}

async function doctor(options) {
  const ui = createUi({ color: options.color && !options.json });
  const intent = await intentFrom({ ...options, yes: true }, ui);
  const evaluation = createDistribution().diagnose(intent);
  if (options.json) console.log(JSON.stringify(evaluation));
  else { await ui.banner(); ui.info(text(intent.language, "doctor")); render(ui, evaluation); }
  return evaluation.ok ? 0 : 2;
}

export async function main(argv) {
  if (argv[0] === "workflow") {
    const json = argv.includes("--json");
    const result = invoke(argv.slice(1).filter((value) => value !== "--json"));
    if (json) console.log(JSON.stringify(result));
    else console.log(result.ok ? JSON.stringify(result, null, 2) : `MATRIX ERROR [${result.code}]: ${result.message}`);
    return result.ok ? 0 : 2;
  }
  const options = parse(argv);
  if (options.version) { console.log(version); return 0; }
  if (options.help || !options.command) { console.log(HELP); return 0; }
  if (options.command === "init") return init(options);
  if (options.command === "doctor") return doctor(options);
  throw new Error(`Unknown command: ${options.command}. Run matrix --help.`);
}
