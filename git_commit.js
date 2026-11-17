const { execSync } = require("node:child_process");
try {
  console.log(execSync("git status").toString());
  console.log(execSync("git add .").toString());
  console.log(
    execSync(
      'git commit -m "feat(offers): high-fidelity styled pdf engine and word docx dual delivery without third-party tools"',
    ).toString(),
  );
  console.log(execSync("git push origin main").toString());
} catch (e) {
  console.error("Error:", e.stdout ? e.stdout.toString() : e.message);
  console.error(e.stderr ? e.stderr.toString() : "");
}
