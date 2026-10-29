import { execFileSync } from "node:child_process";
import { findAvailablePort, repositoryRoot, spawnService, stopManagedProcess, waitForHttp } from "../e2e/helpers.js";
import type { startBodyApi } from "./story-body-api.js";

export async function startBodyWeb(api: Awaited<ReturnType<typeof startBodyApi>>) {
    const port = await findAvailablePort(14910);
    const command = process.env.BUN_BINARY?.trim() || "bun";
    const env = { ...api.env, COSMOS_API_URL: api.origin, NEXT_PUBLIC_COSMOS_API_URL: "", NEXT_TELEMETRY_DISABLED: "1" };
    execFileSync(command, ["run", "build:web"], { cwd: repositoryRoot, env, stdio: "ignore" });
    const web = spawnService({ name: "task40-body-web", command,
        args: ["run", "--cwd", "apps/web", "start", "--", "-H", "127.0.0.1", "-p", String(port)], cwd: repositoryRoot, env });
    const origin = `http://127.0.0.1:${port}`;
    try { await waitForHttp(origin, 200, 60_000); }
    catch { await stopManagedProcess(web, "force"); throw new Error("Isolated Web startup failed; raw logs suppressed"); }
    return { origin, stop: () => stopManagedProcess(web, "force") };
}
