import readline from "node:readline";
import { stdin, stdout } from "node:process";

const codes = { cyan: "\u001b[96m", blue: "\u001b[94m", green: "\u001b[92m", yellow: "\u001b[93m", magenta: "\u001b[95m", dim: "\u001b[2m", reset: "\u001b[0m" };
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const logo = String.raw`███╗   ███╗ █████╗ ████████╗██████╗ ██╗██╗  ██╗
████╗ ████║██╔══██╗╚══██╔══╝██╔══██╗██║╚██╗██╔╝
██╔████╔██║███████║   ██║   ██████╔╝██║ ╚███╔╝
██║╚██╔╝██║██╔══██║   ██║   ██╔══██╗██║ ██╔██╗
██║ ╚═╝ ██║██║  ██║   ██║   ██║  ██║██║██╔╝ ██╗
╚═╝     ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝`;
const bannerLines = 9;

function cancelled() {
  const error = new Error("Cancelled.");
  error.code = "CANCELLED";
  return error;
}

export function createUi({ color = stdout.isTTY, animate = true } = {}) {
  const paint = (name, value) => color ? `${codes[name]}${value}${codes.reset}` : value;
  const shouldAnimate = animate && color && stdout.isTTY;
  const writeFrame = (stage, status, clearPrevious = false) => {
    if (clearPrevious) stdout.write(`\u001b[${bannerLines}A`);
    stdout.write("\u001b[2K" + paint("green", `[ MATRIX BOOT // ${status} ]`) + "\n");
    for (const line of logo.split("\n")) {
      const reveal = Math.floor(line.length * stage);
      const stable = line.slice(0, reveal);
      const interference = stage === 1 ? "" : "#@%/\\|~".repeat(Math.ceil((line.length - reveal) / 7)).slice(0, line.length - reveal);
      stdout.write("\u001b[2K" + paint(stage < 0.7 ? "green" : "cyan", stable + interference) + "\n");
    }
    stdout.write("\u001b[2K" + paint("yellow", `    ${Math.round(stage * 100)}%  ${status}`) + "\n\n");
  };
  return {
    async banner() {
      if (shouldAnimate) {
        const sequence = [
          [0.04, "SIGNAL LOST", 260],
          [0.28, "MAGNETIC INTERFERENCE", 320],
          [0.62, "NEURAL LINK FORMING", 360],
          [1, "SIGNAL LOCKED", 420]
        ];
        stdout.write("\u001b[?25l");
        try {
          for (let index = 0; index < sequence.length; index += 1) {
            const [stage, status, duration] = sequence[index];
            writeFrame(stage, status, index > 0);
            await pause(duration);
          }
        } finally {
          stdout.write("\u001b[?25h");
        }
        stdout.write(`\u001b[${bannerLines}A`);
      }
      console.log(paint("cyan", logo));
      console.log(paint("yellow", "Evidence-driven workflow for Matt Pocock's agent skills"));
      console.log();
    },
    info(message) { console.log(`${paint("blue", "> ")} ${message}`); },
    success(message) { console.log(`${paint("green", "OK")} ${message}`); },
    warn(message) { console.log(`${paint("yellow", "!")} ${message}`); },
    muted(message) { console.log(paint("dim", message)); },
    async select(question, choices, initial = 0) {
      if (!stdin.isTTY || !stdout.isTTY) return choices[initial].value;
      let selected = initial;
      readline.emitKeypressEvents(stdin); const wasRaw = stdin.isRaw; stdin.setRawMode(true); stdin.resume(); stdout.write(`? ${question}\n`);
      const render = (clear = false) => { if (clear) stdout.write(`\u001b[${choices.length}A`); choices.forEach((choice, index) => { stdout.write("\u001b[2K"); stdout.write(`${index === selected ? paint("blue", ">") : " "} ${index === selected ? paint("blue", choice.label) : choice.label}\n`); }); };
      render();
      return new Promise((resolve, reject) => {
        const cleanup = () => { stdin.off("keypress", onKeypress); stdin.setRawMode(Boolean(wasRaw)); stdin.pause(); };
        const onKeypress = (_value, key = {}) => { if (key.ctrl && key.name === "c") { cleanup(); reject(cancelled()); } else if (["up", "k"].includes(key.name)) { selected = (selected - 1 + choices.length) % choices.length; render(true); } else if (["down", "j"].includes(key.name)) { selected = (selected + 1) % choices.length; render(true); } else if (key.name === "return") { cleanup(); resolve(choices[selected].value); } };
        stdin.on("keypress", onKeypress);
      });
    },
    async selectMany(question, choices) {
      if (!stdin.isTTY || !stdout.isTTY) return choices.map((choice) => choice.value);
      let selected = 0; const checked = new Set(choices.map((choice) => choice.value));
      readline.emitKeypressEvents(stdin); const wasRaw = stdin.isRaw; stdin.setRawMode(true); stdin.resume(); stdout.write(`? ${question}\n`);
      const render = (clear = false) => { if (clear) stdout.write(`\u001b[${choices.length}A`); choices.forEach((choice, index) => { stdout.write("\u001b[2K"); const marker = checked.has(choice.value) ? "[x]" : "[ ]"; stdout.write(`${index === selected ? paint("blue", ">") : " "} ${marker} ${index === selected ? paint("blue", choice.label) : choice.label}\n`); }); };
      render();
      return new Promise((resolve, reject) => {
        const cleanup = () => { stdin.off("keypress", onKeypress); stdin.setRawMode(Boolean(wasRaw)); stdin.pause(); };
        const onKeypress = (_value, key = {}) => { if (key.ctrl && key.name === "c") { cleanup(); reject(cancelled()); } else if (["up", "k"].includes(key.name)) { selected = (selected - 1 + choices.length) % choices.length; render(true); } else if (["down", "j"].includes(key.name)) { selected = (selected + 1) % choices.length; render(true); } else if (key.name === "space") { const value = choices[selected].value; checked.has(value) ? checked.delete(value) : checked.add(value); render(true); } else if (key.name === "return") { cleanup(); resolve(choices.filter((choice) => checked.has(choice.value)).map((choice) => choice.value)); } };
        stdin.on("keypress", onKeypress);
      });
    },
    async confirm(question, defaultValue = true, labels = { yes: "Yes", no: "No" }) { return this.select(question, [{ label: defaultValue ? labels.yes : labels.no, value: defaultValue }, { label: defaultValue ? labels.no : labels.yes, value: !defaultValue }]); }
  };
}
