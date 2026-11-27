import readline from "node:readline";
import { stdin, stdout } from "node:process";

const codes = {
  neon: "\u001b[92m",
  emerald: "\u001b[32m",
  cyan: "\u001b[96m",
  yellow: "\u001b[93m",
  red: "\u001b[91m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  inverse: "\u001b[7m",
  reset: "\u001b[0m"
};

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const logo = String.raw`███╗   ███╗ █████╗ ████████╗██████╗ ██╗██╗  ██╗
████╗ ████║██╔══██╗╚══██╔══╝██╔══██╗██║╚██╗██╔╝
██╔████╔██║███████║   ██║   ██████╔╝██║ ╚███╔╝
██║╚██╔╝██║██╔══██║   ██║   ██╔══██╗██║ ██╔██╗
██║ ╚═╝ ██║██║  ██║   ██║   ██║  ██║██║██╔╝ ██╗
╚═╝     ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝`;

const GLYPHS = "01ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ";
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const bannerLines = 9;

function cancelled() {
  const error = new Error("Cancelled.");
  error.code = "CANCELLED";
  return error;
}

function charWidth(char) {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  ) ? 2 : 1;
}

function clampSingleLine(value, maxColumns) {
  const limit = Math.max(24, maxColumns);
  let width = 0;
  let result = "";
  for (const char of String(value ?? "")) {
    const w = charWidth(char);
    if (width + w > limit - 1) return `${result}…`;
    result += char;
    width += w;
  }
  return result;
}

function colorizeLogo(paint, color) {
  if (!color) return logo;
  const rows = logo.split("\n");
  return rows.map((line, index) => paint(index < 3 ? "neon" : "cyan", line)).join("\n");
}

function matrixNoise(length, seed) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += GLYPHS[(i * 7 + seed * 13) % GLYPHS.length];
  }
  return out;
}

export function createUi({ color = Boolean(stdout.isTTY), animate = true, input = stdin, output = stdout } = {}) {
  const paint = (name, value) => color && codes[name] ? `${codes[name]}${value}${codes.reset}` : String(value);
  const compose = (names, value) => {
    if (!color) return String(value);
    const prefix = names.map((n) => codes[n] ?? "").join("");
    return prefix ? `${prefix}${value}${codes.reset}` : String(value);
  };
  const interactiveTty = () => Boolean(input.isTTY && output.isTTY);
  const shouldAnimate = animate && color && Boolean(output.isTTY);
  const termCols = () => Math.max(48, (output.columns || 100) - 8);

  const writeFrame = (stage, status, seed, clearPrevious = false) => {
    if (clearPrevious) output.write(`\u001b[${bannerLines}A`);
    const barWidth = 18;
    const filled = Math.round(barWidth * stage);
    const bar = `${"█".repeat(filled)}${"░".repeat(barWidth - filled)}`;
    output.write(`\u001b[2K${paint("emerald", "┌─")} ${compose(["neon", "bold"], "MATRIX KERNEL")} ${paint("dim", "//")} ${paint("cyan", status)}\n`);
    const rows = logo.split("\n");
    for (let r = 0; r < rows.length; r += 1) {
      const line = rows[r];
      const reveal = Math.floor(line.length * stage);
      const stable = line.slice(0, reveal);
      const tailLen = Math.max(0, line.length - reveal);
      const glitch = stage >= 1 ? "" : matrixNoise(tailLen, seed + r);
      const locked = paint(r < 3 ? "neon" : "cyan", stable);
      const decoding = glitch ? paint("emerald", glitch.slice(0, 3)) + paint("dim", glitch.slice(3)) : "";
      output.write(`\u001b[2K${locked}${decoding}\n`);
    }
    output.write(`\u001b[2K${paint("emerald", "└─")} ${paint("neon", `[${bar}]`)} ${paint("cyan", `${String(Math.round(stage * 100)).padStart(3, " ")}%`)}\n\n`);
  };

  const clearBlock = (lineCount) => {
    if (lineCount > 0) {
      output.write(`\u001b[${lineCount}A\r\u001b[J`);
    }
  };

  const renderCollapsed = (question, summary) => {
    output.write(`${paint("emerald", "◇")}  ${paint("dim", question)} ${paint("emerald", "›")} ${compose(["cyan", "bold"], summary)}\n`);
  };

  return {
    paint,
    badge(label, tone = "neon") {
      if (!color) return `[${label}]`;
      return tone === "outline"
        ? `${codes.emerald}[${codes.cyan}${label}${codes.emerald}]${codes.reset}`
        : `${codes.inverse}${codes[tone] ?? codes.neon}${codes.bold} ${label} ${codes.reset}`;
    },
    async banner() {
      if (shouldAnimate) {
        const sequence = [
          [0.18, "DECODING GLYPHS", 1, 85],
          [0.48, "LINKING RUNTIME", 2, 95],
          [0.82, "VERIFYING GATES", 3, 95],
          [1.0, "SYSTEM ONLINE", 4, 110]
        ];
        output.write("\u001b[?25l");
        try {
          for (let index = 0; index < sequence.length; index += 1) {
            const [stage, status, seed, duration] = sequence[index];
            writeFrame(stage, status, seed, index > 0);
            await pause(duration);
          }
        } finally {
          output.write("\u001b[?25h");
        }
        output.write(`\u001b[${bannerLines}A\r\u001b[J`);
      }
      console.log(colorizeLogo(paint, color));
      console.log(`${paint("emerald", "◈")} ${paint("cyan", "Evidence-driven workflow — Auto runs & Classic gates")}`);
      console.log();
    },
    section(title, subtitle = "") {
      const tail = subtitle ? ` ${paint("dim", `· ${subtitle}`)}` : "";
      console.log(`${paint("emerald", "┌─")} ${compose(["neon", "bold"], title)}${tail}`);
    },
    rail(message) {
      console.log(`${paint("emerald", "│")}  ${message}`);
    },
    railWarn(message) {
      console.log(`${paint("emerald", "│")}  ${paint("yellow", "▲")} ${paint("yellow", message)}`);
    },
    railMuted(message) {
      console.log(`${paint("emerald", "│")}  ${paint("dim", message)}`);
    },
    endSection(message = "") {
      if (message) console.log(`${paint("emerald", "└─")} ${message}`);
      else console.log(paint("emerald", "└─"));
    },
    info(message) { console.log(`${paint("neon", "◆")}  ${message}`); },
    success(message) { console.log(`${compose(["neon", "bold"], "✔ OK")} ${message}`); },
    warn(message) { console.log(`${paint("yellow", "▲ !")} ${message}`); },
    error(message) { console.log(`${paint("red", "✖")}  ${message}`); },
    muted(message) { console.log(`   ${paint("dim", message)}`); },
    box(title, lines = []) {
      console.log(`${paint("emerald", "┌─")} ${compose(["neon", "bold"], `✔ ${title}`)}`);
      for (let i = 0; i < lines.length; i += 1) {
        const prefix = i === lines.length - 1 ? "└─" : "│ ";
        console.log(`${paint("emerald", prefix)} ${lines[i]}`);
      }
    },
    async task(label, action) {
      if (!shouldAnimate) return action();
      let frame = 0;
      output.write("\u001b[?25l");
      const draw = () => {
        const glyph = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
        frame += 1;
        output.write(`\r\u001b[2K${paint("emerald", "│")}  ${paint("cyan", glyph)} ${paint("dim", clampSingleLine(label, termCols()))}`);
      };
      draw();
      const timer = setInterval(draw, 80);
      try {
        const result = await action();
        clearInterval(timer);
        output.write("\r\u001b[2K");
        return result;
      } catch (err) {
        clearInterval(timer);
        output.write("\r\u001b[2K");
        throw err;
      } finally {
        clearInterval(timer);
        output.write("\u001b[?25h");
      }
    },
    async select(question, choices, initial = 0, { hint = "↑/↓ Navigate · Enter Confirm · Ctrl+C Cancel" } = {}) {
      if (!interactiveTty()) return choices[initial].value;
      let selected = initial;
      let renderedLines = 0;
      readline.emitKeypressEvents(input);
      const wasRaw = input.isRaw;
      input.setRawMode(true);
      input.resume();
      output.write("\u001b[?25l");

      const render = (clear = false) => {
        if (clear) clearBlock(renderedLines);
        renderedLines = 0;
        const maxCols = termCols();
        output.write(`${paint("emerald", "│")}\n`); renderedLines += 1;
        output.write(`${paint("neon", "◆")}  ${compose(["bold"], question)}\n`); renderedLines += 1;
        choices.forEach((choice, index) => {
          const active = index === selected;
          const pointer = active ? paint("neon", "❯ ●") : paint("dim", "  ○");
          const label = active ? compose(["neon", "bold"], choice.label) : choice.label;
          const badge = choice.badge ? ` ${paint("cyan", `[${choice.badge}]`)}` : "";
          output.write(`${paint("emerald", "│")}  ${pointer} ${label}${badge}\n`);
          renderedLines += 1;
          if (choice.detail) {
            const detailText = clampSingleLine(choice.detail, maxCols - 4);
            output.write(`${paint("emerald", "│")}      ${active ? paint("cyan", detailText) : paint("dim", detailText)}\n`);
            renderedLines += 1;
          }
        });
        output.write(`${paint("emerald", "└")}  ${paint("dim", clampSingleLine(hint, maxCols))}\n`);
        renderedLines += 1;
      };

      render();
      return new Promise((resolve, reject) => {
        const cleanup = () => {
          input.off("keypress", onKeypress);
          input.setRawMode(Boolean(wasRaw));
          input.pause();
          output.write("\u001b[?25h");
        };
        const onKeypress = (_value, key = {}) => {
          if (key.ctrl && key.name === "c") {
            clearBlock(renderedLines);
            cleanup();
            reject(cancelled());
          } else if (["up", "k"].includes(key.name)) {
            selected = (selected - 1 + choices.length) % choices.length;
            render(true);
          } else if (["down", "j"].includes(key.name)) {
            selected = (selected + 1) % choices.length;
            render(true);
          } else if (key.name === "return") {
            const chosen = choices[selected];
            clearBlock(renderedLines);
            renderCollapsed(question, chosen.label);
            cleanup();
            resolve(chosen.value);
          }
        };
        input.on("keypress", onKeypress);
      });
    },
    async selectMany(question, choices, { hint = "↑/↓ Move · Space Toggle · A All · Enter Confirm", emptyHint = "Select at least one option." } = {}) {
      if (!interactiveTty()) return choices.map((choice) => choice.value);
      let selected = 0;
      let warning = "";
      const checked = new Set(choices.filter((c) => c.checked !== false).map((choice) => choice.value));
      let renderedLines = 0;
      readline.emitKeypressEvents(input);
      const wasRaw = input.isRaw;
      input.setRawMode(true);
      input.resume();
      output.write("\u001b[?25l");

      const render = (clear = false) => {
        if (clear) clearBlock(renderedLines);
        renderedLines = 0;
        const maxCols = termCols();
        output.write(`${paint("emerald", "│")}\n`); renderedLines += 1;
        output.write(`${paint("neon", "◆")}  ${compose(["bold"], question)}\n`); renderedLines += 1;
        choices.forEach((choice, index) => {
          const active = index === selected;
          const isChecked = checked.has(choice.value);
          const cursor = active ? paint("neon", "❯") : " ";
          const box = isChecked ? paint("neon", "◼") : paint("dim", "◻");
          const label = active ? compose(["neon", "bold"], choice.label) : (isChecked ? choice.label : paint("dim", choice.label));
          const meta = choice.hint ? `  ${paint("dim", clampSingleLine(choice.hint, maxCols - 22))}` : "";
          output.write(`${paint("emerald", "│")}  ${cursor} ${box} ${label}${meta}\n`);
          renderedLines += 1;
        });
        const footer = warning ? paint("yellow", `▲ ${clampSingleLine(warning, maxCols)}`) : paint("dim", clampSingleLine(hint, maxCols));
        output.write(`${paint("emerald", "└")}  ${footer}\n`);
        renderedLines += 1;
      };

      render();
      return new Promise((resolve, reject) => {
        const cleanup = () => {
          input.off("keypress", onKeypress);
          input.setRawMode(Boolean(wasRaw));
          input.pause();
          output.write("\u001b[?25h");
        };
        const onKeypress = (_value, key = {}) => {
          if (key.ctrl && key.name === "c") {
            clearBlock(renderedLines);
            cleanup();
            reject(cancelled());
          } else if (["up", "k"].includes(key.name)) {
            warning = "";
            selected = (selected - 1 + choices.length) % choices.length;
            render(true);
          } else if (["down", "j"].includes(key.name)) {
            warning = "";
            selected = (selected + 1) % choices.length;
            render(true);
          } else if (key.name === "space") {
            warning = "";
            const value = choices[selected].value;
            if (checked.has(value)) checked.delete(value);
            else checked.add(value);
            render(true);
          } else if (key.name === "a" && !key.ctrl && !key.meta) {
            warning = "";
            if (checked.size === choices.length) checked.clear();
            else choices.forEach((c) => checked.add(c.value));
            render(true);
          } else if (key.name === "return") {
            const picked = choices.filter((choice) => checked.has(choice.value));
            if (!picked.length) {
              warning = emptyHint;
              render(true);
              return;
            }
            clearBlock(renderedLines);
            renderCollapsed(question, picked.map((c) => c.label).join(", "));
            cleanup();
            resolve(picked.map((c) => c.value));
          }
        };
        input.on("keypress", onKeypress);
      });
    },
    async confirm(question, defaultValue = true, labels = { yes: "Yes", no: "No" }, { hint = "←/→ Switch · Y/N Quick · Enter Confirm" } = {}) {
      if (!interactiveTty()) return defaultValue;
      let current = Boolean(defaultValue);
      let renderedLines = 0;
      readline.emitKeypressEvents(input);
      const wasRaw = input.isRaw;
      input.setRawMode(true);
      input.resume();
      output.write("\u001b[?25l");

      const render = (clear = false) => {
        if (clear) clearBlock(renderedLines);
        renderedLines = 0;
        const maxCols = termCols();
        const yesPill = current
          ? `${paint("neon", "❯")} ${compose(["inverse", "neon", "bold"], ` ● ${labels.yes} `)}`
          : `  ${paint("dim", `○ ${labels.yes}`)}`;
        const noPill = !current
          ? `${paint("cyan", "❯")} ${compose(["inverse", "cyan", "bold"], ` ● ${labels.no} `)}`
          : `  ${paint("dim", `○ ${labels.no}`)}`;
        output.write(`${paint("emerald", "│")}\n`); renderedLines += 1;
        output.write(`${paint("neon", "◆")}  ${compose(["bold"], question)}\n`); renderedLines += 1;
        output.write(`${paint("emerald", "│")}    ${yesPill}     ${noPill}\n`); renderedLines += 1;
        output.write(`${paint("emerald", "└")}  ${paint("dim", clampSingleLine(hint, maxCols))}\n`); renderedLines += 1;
      };

      render();
      return new Promise((resolve, reject) => {
        const cleanup = () => {
          input.off("keypress", onKeypress);
          input.setRawMode(Boolean(wasRaw));
          input.pause();
          output.write("\u001b[?25h");
        };
        const finish = (value) => {
          clearBlock(renderedLines);
          renderCollapsed(question, value ? labels.yes : labels.no);
          cleanup();
          resolve(value);
        };
        const onKeypress = (_value, key = {}) => {
          if (key.ctrl && key.name === "c") {
            clearBlock(renderedLines);
            cleanup();
            reject(cancelled());
          } else if (["left", "right", "up", "down", "h", "l", "j", "k", "tab"].includes(key.name)) {
            current = !current;
            render(true);
          } else if (key.name === "y") {
            finish(true);
          } else if (key.name === "n") {
            finish(false);
          } else if (key.name === "return") {
            finish(current);
          }
        };
        input.on("keypress", onKeypress);
      });
    }
  };
}
