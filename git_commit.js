const { execSync } = require("node:child_process");
try {
  console.log(execSync("git stash").toString());
  console.log(execSync("git pull --rebase origin main").toString());
  try {
    console.log(execSync("git stash pop").toString());
  } catch (se) {
    console.log("No stash to pop or applied cleanly");
  }
  console.log(execSync("git add .").toString());
  try {
    console.log(execSync('git commit -m "chore: format test files"').toString());
  } catch {
    console.log("Nothing additional to commit");
  }
  console.log(execSync("git push origin main").toString());
} catch (e) {
  console.error("Error:", e.stdout ? e.stdout.toString() : e.message);
  console.error(e.stderr ? e.stderr.toString() : "");
}
