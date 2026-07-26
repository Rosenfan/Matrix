#!/usr/bin/env node

import { main } from "../src/cli.js";

main(process.argv.slice(2)).then((exitCode) => {
  if (Number.isInteger(exitCode) && exitCode !== 0) process.exitCode = exitCode;
}).catch((error) => {
  if (error.code === "CANCELLED") {
    console.log("\nCancelled.");
    process.exitCode = 0;
  } else {
    console.error(`\nMatrix error: ${error.message}`);
    process.exitCode = 1;
  }
});
