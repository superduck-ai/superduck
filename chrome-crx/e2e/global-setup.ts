import { execSync } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function globalSetup() {
  const projectRoot = path.resolve(__dirname, "..");
  const distManifest = path.join(projectRoot, "dist", "manifest.json");

  if (!process.env.SKIP_BUILD) {
    console.log("[e2e] Building extension...");
    execSync("bun run build", { cwd: projectRoot, stdio: "inherit" });
  }

  if (!existsSync(distManifest)) {
    throw new Error(
      `[e2e] dist/manifest.json not found. Run "bun run build" first or remove SKIP_BUILD.`
    );
  }
}
