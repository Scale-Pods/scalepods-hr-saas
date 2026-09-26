const { execSync } = require("child_process");
try {
  console.log(execSync("git status").toString());
  console.log(execSync("git add .").toString());
  console.log(
    execSync(
      'git commit -m "Fix billing plan layout, update dashboard metrics, display interviewer in pipeline, and fix view report button"',
    ).toString(),
  );
  console.log(execSync("git push").toString());
} catch (e) {
  console.error("Error:", e.stdout ? e.stdout.toString() : e.message);
  console.error(e.stderr ? e.stderr.toString() : "");
}
