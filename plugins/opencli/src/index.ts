import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";

import {
    ConnectorExecutionError,
    type LoggerPort,
} from "@cosmos/application";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

/**
 * OpenCLI 执行能力插件。
 *
 * 把 OpenCLI（@jackwener/opencli）子进程调用、退出码到错误合同的映射和
 * 前置检查从 Connector 中抽象出来，供 Bilibili 及后续新增 Connector 复用。
 * Cosmos 不保存 Cookie/Token，浏览器登录态由 OpenCLI/Browser Bridge 管理。
 */

/** 覆盖内置 OpenCLI 的环境变量：指向外部 opencli 可执行文件。 */
export const openCliExecutableEnv = "COSMOS_OPENCLI_PATH";

/** 内置 @jackwener/opencli 要求的受管主版本。 */
export const supportedOpenCliMajor = 1;

export interface OpenCliRunResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

export interface OpenCliRunOptions {
    env?: Record<string, string | undefined>;
    timeoutMs?: number;
    maxBufferBytes?: number;
}

export interface OpenCliRunner {
    run(
        args: readonly string[],
        options?: OpenCliRunOptions,
    ): Promise<OpenCliRunResult>;
}

export interface OpenCliRunnerOptions {
    executable?: string;
    timeoutMs?: number;
    maxBufferBytes?: number;
    logger?: LoggerPort;
}

export function createNodeOpenCliRunner(
    options: OpenCliRunnerOptions = {},
): OpenCliRunner {
    const configuredExecutable = options.executable
        ?? process.env[openCliExecutableEnv];
    const externalExecutable = configuredExecutable?.trim() || null;
    const executable = externalExecutable ?? process.execPath;
    const executableArgs = externalExecutable
        ? []
        : [require.resolve("@jackwener/opencli")];
    const timeoutMs = options.timeoutMs ?? 120_000;
    const maxBufferBytes = options.maxBufferBytes ?? 4 * 1024 * 1024;
    const logger = options.logger;

    return {
        async run(args, runOptions = {}) {
            const startedAt = Date.now();
            const operation = args[0] ?? "unknown";
            logger?.debug("connector.opencli.started", {
                operation,
                argumentCount: args.length,
            });
            try {
                const result = await execFileAsync(
                    executable,
                    [...executableArgs, ...args],
                    {
                    cwd: process.cwd(),
                    env: {
                        ...process.env,
                        ...(runOptions.env ?? {}),
                    },
                    timeout: runOptions.timeoutMs ?? timeoutMs,
                    maxBuffer: runOptions.maxBufferBytes ?? maxBufferBytes,
                    shell: Boolean(
                        externalExecutable
                        && /\.(cmd|bat)$/i.test(externalExecutable),
                    ),
                    encoding: "utf8",
                    },
                );
                const normalized = {
                    stdout: result.stdout,
                    stderr: result.stderr,
                    exitCode: 0,
                };
                logger?.info("connector.opencli.completed", {
                    operation,
                    exitCode: normalized.exitCode,
                    stdoutBytes: Buffer.byteLength(normalized.stdout, "utf8"),
                    stderrBytes: Buffer.byteLength(normalized.stderr, "utf8"),
                    durationMs: Date.now() - startedAt,
                });
                return normalized;
            } catch (error) {
                const details = error as {
                    code?: unknown;
                    stdout?: unknown;
                    stderr?: unknown;
                    killed?: unknown;
                    signal?: unknown;
                    message?: unknown;
                };
                const stdout = typeof details.stdout === "string"
                    ? details.stdout
                    : "";
                const stderr = typeof details.stderr === "string"
                    ? details.stderr
                    : "";
                const exitCode = typeof details.code === "number"
                    ? details.code
                    : null;
                logger?.warn("connector.opencli.failed", {
                    operation,
                    exitCode,
                    stdoutBytes: Buffer.byteLength(stdout, "utf8"),
                    stderrBytes: Buffer.byteLength(stderr, "utf8"),
                    durationMs: Date.now() - startedAt,
                });

                if (exitCode === 66) {
                    return { stdout, stderr, exitCode };
                }
                if (exitCode === 69) {
                    throw new ConnectorExecutionError(
                        "dependency_unavailable",
                        "OpenCLI Browser Bridge is unavailable.",
                        true,
                        { cause: error },
                    );
                }
                if (exitCode === 77) {
                    throw new ConnectorExecutionError(
                        "authentication_required",
                        "OpenCLI requires a logged-in browser profile.",
                        false,
                        { cause: error },
                    );
                }
                if (
                    details.killed === true
                    || details.signal === "SIGTERM"
                    || details.code === "ETIMEDOUT"
                ) {
                    throw new ConnectorExecutionError(
                        "timeout",
                        "OpenCLI timed out.",
                        true,
                        { cause: error },
                    );
                }
                throw new ConnectorExecutionError(
                    "dependency_unavailable",
                    typeof details.message === "string"
                        ? details.message
                        : "OpenCLI failed to execute.",
                    true,
                    { cause: error },
                );
            }
        },
    };
}

/** doctor 输出显示 Browser Bridge 未连接或连通性失败时抛出依赖错误。 */
export function assertOpenCliDoctor(output: string): void {
    if (
        /extension:\s+not connected/i.test(output)
        || /connectivity:\s+failed/i.test(output)
    ) {
        throw new ConnectorExecutionError(
            "dependency_unavailable",
            "OpenCLI Browser Bridge extension is not connected.",
            true,
        );
    }
}

/** 校验 OpenCLI 版本输出，主版本不匹配时抛出版本错误。 */
export function assertOpenCliVersion(output: string, exitCode: number): void {
    const match = output.match(/\b(\d+)\.(\d+)\.(\d+)\b/);
    if (exitCode !== 0 || !match || Number(match[1]) !== supportedOpenCliMajor) {
        throw new ConnectorExecutionError(
            "unsupported_version",
            `OpenCLI major version ${supportedOpenCliMajor} is required.`,
            false,
        );
    }
}
