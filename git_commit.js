const { execSync } = require("node:child_process");
try {
  console.log(execSync("git status").toString());
  console.log(execSync("git add .").toString());
  console.log(
    execSync(
      'git commit -m "fix(offers): embed template letterhead, fix intern duration and stipend words input"',
    ).toString(),
  );
  console.log(execSync("git push origin main").toString());
} catch (e) {
  console.error("Error:", e.stdout ? e.stdout.toString() : e.message);
  console.error(e.stderr ? e.stderr.toString() : "");
}
