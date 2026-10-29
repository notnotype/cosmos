import { join } from "node:path";
import { findAvailablePort, repositoryRoot, spawnService, stopManagedProcess, waitForHttp } from "../e2e/helpers.js";

export async function startBodyApi(root: string) {
    const port = await findAvailablePort(14710);
    const origin = `http://127.0.0.1:${port}`;
    // Do not inherit user roots, proxies, model credentials or debugging flags into the API.
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP, TMP: process.env.TMP, NODE_ENV: "test", COSMOS_WORKSPACE_ROOT: repositoryRoot,
        COSMOS_DATA_ROOT: join(root, "data"), COSMOS_BLOB_ROOT: join(root, "data", "blobs"),
        COSMOS_LOG_ROOT: join(root, "logs"), COSMOS_LOG_OUTPUT: "console", COSMOS_LOG_LEVEL: "error",
        DATABASE_URL: `file:${join(root, "data", "cosmos.sqlite").replaceAll("\\", "/")}`,
        COSMOS_API_HOST: "127.0.0.1", COSMOS_API_PORT: String(port), COSMOS_ALLOWED_ORIGIN: origin,
        COSMOS_MODEL_CONFIGURATION_AUTHORITIES: `127.0.0.1:${port}` };
    const api = spawnService({ name: "task40-body-api", command: process.env.NODE_BINARY?.trim() || "node",
        args: ["apps/api/dist/main.js"], cwd: repositoryRoot, env });
    try { await waitForHttp(`${origin}/readyz`, 200, 30_000); }
    catch { await stopManagedProcess(api, "force"); throw new Error("Isolated API failed to start; raw logs suppressed"); }
    return { origin, env, stop: () => stopManagedProcess(api, "force") };
}
