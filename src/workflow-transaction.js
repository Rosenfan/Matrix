import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const JOURNAL_SCHEMA = "matrix/workflow-transaction/v1";
const RECEIPT_SCHEMA = "matrix/workflow-transaction-receipt/v1";
const LOCK_SCHEMA = "matrix/workflow-lock/v1";
const MAX_JOURNAL_BYTES = 1024 * 1024;
const MAX_TRANSACTIONS = 128;
const RECEIPT_LIMIT = 32;

const stamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const fail = (code, message, extra = {}) => ({ ok: false, code, message, ...extra });
const sha = (value) => `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
const rootFor = (cwd) => path.join(cwd, ".matrix");
const transactionsFor = (cwd) => path.join(rootFor(cwd), "transactions");
const lockPath = (cwd) => path.join(rootFor(cwd), "workflow.lock");
const journalPath = (cwd, id) => path.join(transactionsFor(cwd), id, "journal.json");

function durableWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const descriptor = fs.openSync(temporary, "wx");
  try {
    fs.writeFileSync(descriptor, value);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, file);
}

function writeJson(file, value) {
  durableWrite(file, `${JSON.stringify(value, null, 2)}\n`);
}

function safeRelative(cwd, file) {
  const relative = path.relative(cwd, file).replaceAll("\\", "/");
  if (!relative || relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)) {
    throw Object.assign(new Error(`Workflow transaction path escapes the project: ${file}.`), { code: "WORKFLOW_ENTRY_UNSUPPORTED" });
  }
  return relative;
}

function absolute(cwd, relative) {
  const resolved = path.resolve(cwd, ...relative.split("/"));
  safeRelative(cwd, resolved);
  return resolved;
}

function ordinaryStat(file) {
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
      throw Object.assign(new Error(`Workflow transaction path is not an ordinary file or directory: ${file}.`), { code: "WORKFLOW_ENTRY_UNSUPPORTED" });
    }
    return stat;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function directoryDigest(root, relative = "") {
  const hash = crypto.createHash("sha256");
  hash.update("matrix/workflow-tree/v1\0");
  const visit = (currentRelative) => {
    const current = path.join(root, currentRelative);
    const names = fs.readdirSync(current).sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
    for (const name of names) {
      const childRelative = currentRelative ? `${currentRelative}/${name}` : name;
      const child = path.join(root, ...childRelative.split("/"));
      const stat = ordinaryStat(child);
      if (!stat) throw Object.assign(new Error(`Workflow transaction entry disappeared: ${child}.`), { code: "WORKFLOW_RECOVERY_CONFLICT" });
      hash.update(Buffer.from(`${stat.isDirectory() ? "d" : "f"}\0${childRelative}\0`, "utf8"));
      if (stat.isDirectory()) visit(childRelative);
      else hash.update(fs.readFileSync(child));
    }
  };
  visit(relative);
  return `sha256:${hash.digest("hex")}`;
}

export function captureWorkflowEntry(file) {
  const stat = ordinaryStat(file);
  if (!stat) return { kind: "absent", hash: sha("absent") };
  if (stat.isDirectory()) return { kind: "directory", hash: directoryDigest(file) };
  const bytes = fs.readFileSync(file);
  return { kind: "file", hash: sha(bytes), bytes: bytes.toString("base64") };
}

function identity(state) {
  return { kind: state.kind, hash: state.hash };
}

function sameState(left, right) {
  return left?.kind === right?.kind && left?.hash === right?.hash;
}

function createdParents(cwd, file) {
  const result = [];
  let current = path.dirname(file);
  const boundary = path.resolve(cwd);
  while (current !== boundary && current.startsWith(`${boundary}${path.sep}`)) {
    if (fs.existsSync(current)) break;
    result.push(safeRelative(cwd, current));
    current = path.dirname(current);
  }
  return result.reverse();
}

function parentFacts(cwd, file) {
  const facts = [];
  const boundary = path.resolve(cwd);
  let current = path.dirname(path.resolve(file));
  while (current !== boundary) {
    if (!current.startsWith(`${boundary}${path.sep}`)) {
      throw Object.assign(new Error(`Workflow transaction parent escapes the project: ${current}.`), { code: "WORKFLOW_ENTRY_UNSUPPORTED" });
    }
    let stat;
    try { stat = fs.lstatSync(current); }
    catch (error) {
      if (error.code === "ENOENT") { current = path.dirname(current); continue; }
      throw error;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw Object.assign(new Error(`Workflow transaction parent is not an ordinary directory: ${current}.`), { code: "WORKFLOW_ENTRY_UNSUPPORTED" });
    }
    facts.push({ path: safeRelative(cwd, current), dev: String(stat.dev), ino: String(stat.ino) });
    current = path.dirname(current);
  }
  return facts;
}

function verifyParentFacts(cwd, operation) {
  for (const fact of operation.parent_facts ?? []) {
    const directory = absolute(cwd, fact.path);
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory() || String(stat.dev) !== fact.dev || String(stat.ino) !== fact.ino) {
      throw Object.assign(new Error(`Workflow transaction parent identity changed: ${fact.path}.`), { code: "WORKFLOW_RECOVERY_CONFLICT" });
    }
  }
}

export function workflowWriteOperation(cwd, file, contents, { before = null } = {}) {
  const bytes = Buffer.from(contents);
  return {
    type: "write",
    path: safeRelative(cwd, file),
    before: before ?? captureWorkflowEntry(file),
    after: { kind: "file", hash: sha(bytes), bytes: bytes.toString("base64") },
    created_parents: createdParents(cwd, file),
    parent_facts: parentFacts(cwd, file)
  };
}

export function workflowMkdirOperation(cwd, directory) {
  const emptyHash = (() => {
    const hash = crypto.createHash("sha256");
    hash.update("matrix/workflow-tree/v1\0");
    return `sha256:${hash.digest("hex")}`;
  })();
  return {
    type: "mkdir",
    path: safeRelative(cwd, directory),
    before: captureWorkflowEntry(directory),
    after: { kind: "directory", hash: emptyHash },
    created_parents: createdParents(cwd, directory),
    parent_facts: parentFacts(cwd, directory)
  };
}

export function workflowMoveOperation(cwd, source, target) {
  return {
    type: "move",
    source: safeRelative(cwd, source),
    target: safeRelative(cwd, target),
    source_before: captureWorkflowEntry(source),
    target_before: captureWorkflowEntry(target),
    created_parents: createdParents(cwd, target),
    parent_facts: [...parentFacts(cwd, source), ...parentFacts(cwd, target)]
  };
}

export function workflowRemoveOperation(cwd, file) {
  return {
    type: "remove",
    path: safeRelative(cwd, file),
    before: captureWorkflowEntry(file),
    after: { kind: "absent", hash: sha("absent") },
    parent_facts: parentFacts(cwd, file)
  };
}

function operationSummary(operation) {
  if (operation.type === "move") {
    return {
      id: operation.id,
      type: operation.type,
      source: operation.source,
      target: operation.target,
      pre_hash: operation.source_before.hash,
      post_hash: operation.source_before.hash
    };
  }
  return { id: operation.id, type: operation.type, path: operation.path, pre_hash: operation.before.hash, post_hash: operation.after.hash };
}

function operationDisposition(cwd, operation) {
  if (operation.type === "move") {
    const source = captureWorkflowEntry(absolute(cwd, operation.source));
    const target = captureWorkflowEntry(absolute(cwd, operation.target));
    if (sameState(source, operation.source_before) && sameState(target, operation.target_before)) return "before";
    if (source.kind === "absent" && sameState(target, operation.source_before)) return "after";
    return "conflict";
  }
  const current = captureWorkflowEntry(absolute(cwd, operation.path));
  if (sameState(current, operation.before)) return "before";
  if (sameState(current, operation.after)) return "after";
  return "conflict";
}

function ensureParents(cwd, operation) {
  for (const relative of operation.created_parents ?? []) {
    const directory = absolute(cwd, relative);
    const current = ordinaryStat(directory);
    if (current && !current.isDirectory()) throw Object.assign(new Error(`Workflow transaction parent is not a directory: ${relative}.`), { code: "WORKFLOW_RECOVERY_CONFLICT" });
    if (!current) fs.mkdirSync(directory);
  }
}

function removeCreatedParents(cwd, operation) {
  for (const relative of [...(operation.created_parents ?? [])].reverse()) {
    const directory = absolute(cwd, relative);
    try { fs.rmdirSync(directory); }
    catch (error) { if (!["ENOENT", "ENOTEMPTY"].includes(error.code)) throw error; }
  }
}

function applyOperation(cwd, operation) {
  verifyParentFacts(cwd, operation);
  const disposition = operationDisposition(cwd, operation);
  if (disposition === "after") return;
  if (disposition !== "before") throw Object.assign(new Error(`Workflow operation ${operation.id} no longer matches its pre-state.`), { code: "WORKFLOW_RECOVERY_CONFLICT" });
  ensureParents(cwd, operation);
  if (operation.type === "write") durableWrite(absolute(cwd, operation.path), Buffer.from(operation.after.bytes, "base64"));
  else if (operation.type === "mkdir") fs.mkdirSync(absolute(cwd, operation.path));
  else if (operation.type === "remove") fs.rmSync(absolute(cwd, operation.path));
  else if (operation.type === "move") fs.renameSync(absolute(cwd, operation.source), absolute(cwd, operation.target));
  if (operationDisposition(cwd, operation) !== "after") throw Object.assign(new Error(`Workflow operation ${operation.id} post-state could not be proven.`), { code: "WORKFLOW_RECOVERY_CONFLICT" });
}

function rollbackOperation(cwd, operation) {
  verifyParentFacts(cwd, operation);
  const disposition = operationDisposition(cwd, operation);
  if (disposition === "before") return;
  if (disposition !== "after") throw Object.assign(new Error(`Workflow operation ${operation.id} no longer matches its post-state.`), { code: "WORKFLOW_RECOVERY_CONFLICT" });
  if (operation.type === "write") {
    const file = absolute(cwd, operation.path);
    if (operation.before.kind === "absent") fs.rmSync(file);
    else durableWrite(file, Buffer.from(operation.before.bytes, "base64"));
  } else if (operation.type === "mkdir") {
    fs.rmdirSync(absolute(cwd, operation.path));
  } else if (operation.type === "remove") {
    const file = absolute(cwd, operation.path);
    ensureParents(cwd, operation);
    durableWrite(file, Buffer.from(operation.before.bytes, "base64"));
  } else if (operation.type === "move") {
    fs.renameSync(absolute(cwd, operation.target), absolute(cwd, operation.source));
  }
  removeCreatedParents(cwd, operation);
  if (operationDisposition(cwd, operation) !== "before") throw Object.assign(new Error(`Workflow operation ${operation.id} rollback could not be proven.`), { code: "WORKFLOW_RECOVERY_CONFLICT" });
}

function readBoundedJson(file) {
  const stat = ordinaryStat(file);
  if (!stat || !stat.isFile() || stat.size > MAX_JOURNAL_BYTES) {
    throw Object.assign(new Error(`Workflow transaction journal is missing, invalid or exceeds ${MAX_JOURNAL_BYTES} bytes.`), { code: "WORKFLOW_TRANSACTION_CORRUPT" });
  }
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { throw Object.assign(new Error(`Workflow transaction journal is not valid JSON: ${error.message}`), { code: "WORKFLOW_TRANSACTION_CORRUPT" }); }
}

function validateJournal(journal, id) {
  if (
    !journal || journal.schema !== JOURNAL_SCHEMA || journal.id !== id ||
    !["prepared", "applying", "finalizing", "committed", "rolled-back"].includes(journal.status) ||
    !Array.isArray(journal.operations) || journal.operations.length > 128 ||
    journal.integrity !== journalIntegrity(journal)
  ) throw Object.assign(new Error(`Workflow transaction ${id} has an invalid journal.`), { code: "WORKFLOW_TRANSACTION_CORRUPT" });
  return journal;
}

function readJournal(cwd, id) {
  return validateJournal(readBoundedJson(journalPath(cwd, id)), id);
}

function persistJournal(cwd, journal) {
  journal.updated_at = stamp();
  journal.integrity = journalIntegrity(journal);
  const serialized = `${JSON.stringify(journal, null, 2)}\n`;
  if (Buffer.byteLength(serialized) > MAX_JOURNAL_BYTES) {
    throw Object.assign(new Error(`Workflow transaction journal exceeds ${MAX_JOURNAL_BYTES} bytes.`), { code: "WORKFLOW_TRANSACTION_CORRUPT" });
  }
  durableWrite(journalPath(cwd, journal.id), serialized);
}

function journalIntegrity(journal) {
  const protectedJournal = { ...journal };
  delete protectedJournal.integrity;
  return sha(Buffer.from(JSON.stringify(protectedJournal), "utf8"));
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === "ESRCH" ? false : null; }
}

function readLock(cwd) {
  const file = lockPath(cwd);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file);
  if (raw.length > 16 * 1024) return { corrupt: true, id: sha(raw), raw };
  try {
    const value = JSON.parse(raw.toString("utf8"));
    if (value.schema !== LOCK_SCHEMA || typeof value.nonce !== "string" || typeof value.transaction_id !== "string") return { corrupt: true, id: sha(raw), raw };
    return { ...value, id: sha(raw), raw };
  } catch {
    return { corrupt: true, id: sha(raw), raw };
  }
}

function lockOwner(lock) {
  if (lock.corrupt || lock.hostname !== os.hostname()) return "unknown";
  const exists = processExists(lock.pid);
  return exists === true ? "active" : exists === false ? "absent" : "unknown";
}

function acquireLock(cwd, transactionId) {
  fs.mkdirSync(rootFor(cwd), { recursive: true });
  const file = lockPath(cwd);
  const lock = {
    schema: LOCK_SCHEMA,
    transaction_id: transactionId,
    pid: process.pid,
    hostname: os.hostname(),
    nonce: crypto.randomUUID(),
    created_at: stamp()
  };
  try {
    const descriptor = fs.openSync(file, "wx");
    try {
      fs.writeFileSync(descriptor, `${JSON.stringify(lock)}\n`);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    return { ok: true, lock: readLock(cwd) };
  } catch (error) {
    if (error.code !== "EEXIST") return fail("WORKFLOW_PERSISTENCE_FAILED", `Workflow boundary could not be acquired: ${error.message}`);
    const existing = readLock(cwd);
    const owner = existing ? lockOwner(existing) : "unknown";
    return fail(owner === "active" ? "WORKFLOW_BUSY" : "WORKFLOW_RECOVERY_REQUIRED", owner === "active" ? "An active Workflow mutation owns the project boundary." : "A Workflow lock requires explicit doctor recovery.", { lock_id: existing?.id ?? null });
  }
}

function acquireRecoveryLock(cwd, transactionId) {
  const existing = readLock(cwd);
  if (existing) {
    const owner = lockOwner(existing);
    if (existing.transaction_id !== transactionId) {
      return fail("WORKFLOW_LOCK_CONFLICT", "Workflow lock belongs to a different transaction.", { lock_id: existing.id, transaction_id: existing.transaction_id });
    }
    if (owner === "active") return fail("WORKFLOW_BUSY", "An active Workflow mutation still owns this transaction boundary.", { lock_id: existing.id });
    if (owner !== "absent") return fail("WORKFLOW_LOCK_CONFLICT", "Workflow lock owner cannot be proven absent.", { lock_id: existing.id });
    const confirmed = readLock(cwd);
    if (!confirmed || confirmed.id !== existing.id) return fail("WORKFLOW_LOCK_CONFLICT", "Workflow lock identity changed before recovery.");
    fs.rmSync(lockPath(cwd));
  }
  return acquireLock(cwd, transactionId);
}

function releaseLock(cwd, expected) {
  const current = readLock(cwd);
  if (!current) return;
  if (!expected || current.id !== expected.id) throw Object.assign(new Error("Workflow lock identity changed before release."), { code: "WORKFLOW_LOCK_CONFLICT" });
  fs.rmSync(lockPath(cwd));
}

function transactionDirectories(cwd) {
  const root = transactionsFor(cwd);
  if (!fs.existsSync(root)) return [];
  const stat = ordinaryStat(root);
  if (!stat?.isDirectory()) throw Object.assign(new Error("Workflow transaction root is not an ordinary directory."), { code: "WORKFLOW_ENTRY_UNSUPPORTED" });
  const names = fs.readdirSync(root);
  if (names.length > MAX_TRANSACTIONS) throw Object.assign(new Error(`Workflow transaction root exceeds ${MAX_TRANSACTIONS} entries.`), { code: "WORKFLOW_TRANSACTION_CORRUPT" });
  return names.sort();
}

function inspectTransactions(cwd) {
  const transactions = [];
  for (const id of transactionDirectories(cwd)) {
    try {
      const loaded = readReceiptOrJournal(cwd, id);
      const journal = loaded.value;
      transactions.push({
        id,
        kind: journal.kind,
        change_id: journal.change_id,
        status: journal.status,
        strategies: ["committed", "rolled-back"].includes(journal.status) ? [] : journal.status === "finalizing" ? ["continue"] : ["continue", "rollback"],
        corrupt: false,
        receipt: loaded.receipt,
        journal
      });
    } catch (error) {
      transactions.push({ id, status: "corrupt", strategies: [], corrupt: true, error: error.message });
    }
  }
  return transactions;
}

function pendingTransactions(cwd) {
  return inspectTransactions(cwd).filter((item) => item.corrupt || !["committed", "rolled-back"].includes(item.status));
}

export function workflowMutationGate(cwd) {
  let pending;
  try { pending = pendingTransactions(cwd); }
  catch (error) { return recoverError(error, null); }
  if (pending.length) return fail("WORKFLOW_RECOVERY_REQUIRED", "An unfinished Workflow transaction must be resolved before starting another mutation.", { transactions: pending.map(({ id }) => id), recovery_command: "matrix workflow doctor" });
  const currentLock = readLock(cwd);
  if (!currentLock) return null;
  const owner = lockOwner(currentLock);
  return fail(owner === "active" ? "WORKFLOW_BUSY" : owner === "absent" ? "WORKFLOW_RECOVERY_REQUIRED" : "WORKFLOW_LOCK_CONFLICT", owner === "active" ? "An active Workflow mutation owns the project boundary." : "A Workflow lock requires explicit doctor recovery.", { lock_id: currentLock.id, transaction_id: currentLock.transaction_id, recovery_command: "matrix workflow doctor" });
}

function compactReceipt(cwd, journal, disposition) {
  journal.schema = RECEIPT_SCHEMA;
  journal.status = disposition;
  journal.operations = journal.operations.map(operationSummary);
  delete journal.result;
  persistJournal(cwd, journal);
  pruneReceipts(cwd);
}

function readReceiptOrJournal(cwd, id) {
  const file = journalPath(cwd, id);
  const value = readBoundedJson(file);
  if (
    value.schema === RECEIPT_SCHEMA && value.id === id &&
    ["committed", "rolled-back"].includes(value.status) &&
    value.integrity === journalIntegrity(value)
  ) return { receipt: true, value };
  if (value.schema === RECEIPT_SCHEMA) throw Object.assign(new Error(`Workflow transaction receipt ${id} has invalid integrity.`), { code: "WORKFLOW_TRANSACTION_CORRUPT" });
  return { receipt: false, value: validateJournal(value, id) };
}

function pruneReceipts(cwd) {
  const receipts = [];
  for (const id of transactionDirectories(cwd)) {
    try {
      const parsed = readBoundedJson(journalPath(cwd, id));
      if (parsed.schema === RECEIPT_SCHEMA && ["committed", "rolled-back"].includes(parsed.status) && parsed.integrity === journalIntegrity(parsed)) receipts.push(parsed);
    } catch {}
  }
  receipts.sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)) || right.id.localeCompare(left.id));
  for (const receipt of receipts.slice(RECEIPT_LIMIT)) fs.rmSync(path.dirname(journalPath(cwd, receipt.id)), { recursive: true });
}

function recoverError(error, transactionId) {
  const code = error.code && String(error.code).startsWith("WORKFLOW_") ? error.code : "WORKFLOW_PERSISTENCE_FAILED";
  return fail(code, error.message, {
    transaction_id: transactionId,
    recovery_command: `matrix workflow doctor --repair --transaction ${transactionId} --strategy continue`
  });
}

export function runWorkflowTransaction({ cwd, kind, changeId = null, operations, result, failAfterOperation = null }) {
  const blocked = workflowMutationGate(cwd);
  if (blocked) return blocked;
  const transactionId = crypto.randomUUID();
  const acquired = acquireLock(cwd, transactionId);
  if (!acquired.ok) return acquired;
  const journal = {
    schema: JOURNAL_SCHEMA,
    id: transactionId,
    kind,
    change_id: changeId,
    status: "prepared",
    created_at: stamp(),
    updated_at: stamp(),
    operations: operations.map((operation, index) => ({ ...operation, id: `${kind}:${index + 1}`, status: "pending" })),
    result
  };
  try {
    persistJournal(cwd, journal);
    journal.status = "applying";
    persistJournal(cwd, journal);
    for (let index = 0; index < journal.operations.length; index += 1) {
      const operation = journal.operations[index];
      applyOperation(cwd, operation);
      if (failAfterOperation === index) throw Object.assign(new Error(`Injected interruption after operation ${index}.`), { code: "WORKFLOW_PERSISTENCE_FAILED" });
      operation.status = "applied";
      persistJournal(cwd, journal);
    }
    journal.status = "finalizing";
    persistJournal(cwd, journal);
    compactReceipt(cwd, journal, "committed");
    releaseLock(cwd, acquired.lock);
    return { ...result, transaction_id: transactionId };
  } catch (error) {
    try { releaseLock(cwd, acquired.lock); }
    catch {}
    return recoverError(error, transactionId);
  }
}

function repairTransaction(cwd, id, strategy) {
  let loaded;
  try { loaded = readReceiptOrJournal(cwd, id); }
  catch (error) { return recoverError(error, id); }
  if (loaded.receipt) return { ok: true, code: "OK", transaction_id: id, disposition: loaded.value.status, repaired: false };
  const journal = loaded.value;
  const available = journal.status === "finalizing" ? ["continue"] : ["continue", "rollback"];
  if (!available.includes(strategy)) return fail("WORKFLOW_STRATEGY_UNAVAILABLE", `Strategy ${strategy} is not safe for transaction ${id}.`, { transaction_id: id, strategies: available });
  const acquired = acquireRecoveryLock(cwd, id);
  if (!acquired.ok) return acquired;
  try {
    if (strategy === "continue") {
      for (const operation of journal.operations) {
        if (operation.status === "applied") continue;
        applyOperation(cwd, operation);
        operation.status = "applied";
        persistJournal(cwd, journal);
      }
      journal.status = "finalizing";
      persistJournal(cwd, journal);
      const result = journal.result;
      compactReceipt(cwd, journal, "committed");
      releaseLock(cwd, acquired.lock);
      return { ...result, transaction_id: id, disposition: "committed", repaired: true };
    }
    for (const operation of [...journal.operations].reverse()) {
      rollbackOperation(cwd, operation);
      operation.status = "rolled-back";
      persistJournal(cwd, journal);
    }
    compactReceipt(cwd, journal, "rolled-back");
    releaseLock(cwd, acquired.lock);
    return { ok: true, code: "OK", transaction_id: id, disposition: "rolled-back", repaired: true };
  } catch (error) {
    try { releaseLock(cwd, acquired.lock); }
    catch {}
    return recoverError(error, id);
  }
}

function exactCommands(transaction) {
  return transaction.strategies.map((strategy) => `matrix workflow doctor --repair --transaction ${transaction.id} --strategy ${strategy}`);
}

export function workflowDoctor(cwd, { repair = false, transaction = null, strategy = null, lock = null } = {}) {
  if (!repair && (transaction || strategy || lock)) return fail("INVALID_INTENT", "Workflow doctor targets require --repair.");
  let transactions;
  try { transactions = inspectTransactions(cwd); }
  catch (error) { return recoverError(error, null); }
  const currentLock = readLock(cwd);
  const owner = currentLock ? lockOwner(currentLock) : null;
  if (!repair) {
    const findings = [
      ...transactions.filter((item) => item.corrupt).map((item) => ({ code: "WORKFLOW_TRANSACTION_CORRUPT", transaction_id: item.id, message: item.error })),
      ...transactions.filter((item) => !item.corrupt && !["committed", "rolled-back"].includes(item.status)).map((item) => ({
        code: "WORKFLOW_RECOVERY_REQUIRED",
        transaction_id: item.id,
        status: item.status,
        strategies: item.strategies,
        commands: exactCommands(item)
      })),
      ...(currentLock ? [{
        code: owner === "active" ? "WORKFLOW_BUSY" : owner === "absent" ? "WORKFLOW_RECOVERY_REQUIRED" : "WORKFLOW_LOCK_CONFLICT",
        lock_id: currentLock.id,
        transaction_id: currentLock.transaction_id,
        owner,
        commands: owner === "absent" && !transactions.some((item) => item.id === currentLock.transaction_id && (item.corrupt || !["committed", "rolled-back"].includes(item.status)))
          ? [`matrix workflow doctor --repair --lock ${currentLock.id}`]
          : []
      }] : [])
    ];
    return {
      ok: true,
      code: "OK",
      health: findings.some((item) => item.code === "WORKFLOW_TRANSACTION_CORRUPT" || item.code === "WORKFLOW_LOCK_CONFLICT") ? "conflict" : findings.length ? "recovery-required" : "healthy",
      findings,
      transactions: transactions.map(({ journal, error, ...item }) => ({ ...item, commands: item.corrupt ? [] : exactCommands(item) })),
      lock: currentLock ? { id: currentLock.id, transaction_id: currentLock.transaction_id, owner } : null,
      repaired: false
    };
  }
  if (lock) {
    if (transaction || strategy) return fail("INVALID_INTENT", "Standalone lock repair cannot include transaction or strategy.");
    if (!currentLock || currentLock.id !== lock) return fail("WORKFLOW_LOCK_CONFLICT", "The requested Workflow lock identity is missing or changed.");
    if (currentLock.transaction_id && transactions.some((item) => item.id === currentLock.transaction_id && (item.corrupt || !["committed", "rolled-back"].includes(item.status)))) {
      return fail("WORKFLOW_RECOVERY_REQUIRED", "This lock belongs to an unfinished transaction and cannot be cleaned independently.", { transaction_id: currentLock.transaction_id });
    }
    if (owner !== "absent") return fail(owner === "active" ? "WORKFLOW_BUSY" : "WORKFLOW_LOCK_CONFLICT", "Workflow lock owner cannot be proven absent.");
    const confirmed = readLock(cwd);
    if (!confirmed || confirmed.id !== lock) return fail("WORKFLOW_LOCK_CONFLICT", "Workflow lock identity changed before cleanup.");
    fs.rmSync(lockPath(cwd));
    return { ok: true, code: "OK", repaired: true, disposition: "lock-removed", lock_id: lock };
  }
  if (!transaction) {
    const standaloneStaleLock = currentLock && owner === "absent" && !transactions.some((item) => item.id === currentLock.transaction_id && (item.corrupt || !["committed", "rolled-back"].includes(item.status)));
    if (standaloneStaleLock) return fail("WORKFLOW_LOCK_REQUIRED", "Standalone lock repair requires --lock <id>.", { lock_id: currentLock.id });
    return fail("WORKFLOW_TRANSACTION_REQUIRED", "Transaction repair requires --transaction <id>.");
  }
  if (!strategy) return fail("WORKFLOW_STRATEGY_REQUIRED", "Transaction repair requires --strategy continue|rollback.");
  if (!["continue", "rollback"].includes(strategy)) return fail("WORKFLOW_STRATEGY_UNAVAILABLE", `Unsupported transaction repair strategy: ${strategy}.`);
  return repairTransaction(cwd, transaction, strategy);
}
