const { execSync } = require("child_process");
try {
  execSync("mkdir resumes_test");
  execSync('tar -xf "BD SP 25 Sept.zip" -C resumes_test');
  console.log("Extracted successfully");
} catch (e) {
  console.error("Extraction failed", e.message);
}
