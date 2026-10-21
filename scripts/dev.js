// Sets --max-http-header-size so Node's HTTP parser never throws HTTP 431 on large cookies
const maxHeaderSize = 65536;
const currentOptions = process.env.NODE_OPTIONS || "";
if (!currentOptions.includes("--max-http-header-size")) {
  process.env.NODE_OPTIONS = `${currentOptions} --max-http-header-size=${maxHeaderSize}`.trim();
}

const { spawn } = require("node:child_process");
const path = require("node:path");

const webDir = path.resolve(__dirname, "../apps/web");
const nextBin = require.resolve("next/dist/bin/next", { paths: [webDir, __dirname] });

const child = spawn(
  process.execPath,
  [`--max-http-header-size=${maxHeaderSize}`, nextBin, "dev", ...process.argv.slice(2)],
  {
    cwd: webDir,
    stdio: "inherit",
    env: process.env,
  },
);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
