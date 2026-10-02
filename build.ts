import { spawnSync } from "node:child_process";

// Preserve the existing CI/developer command without a package.json lifecycle
// build hook, which would trigger unnecessary npm Git dependency preparation.
const result = spawnSync("bun", ["run", "bundle"], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
