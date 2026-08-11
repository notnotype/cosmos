import { execFile } from "node:child_process";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LoggerPort } from "@cosmos/application";

import {
    assertOpenCliDoctor,
    assertOpenCliVersion,
    createNodeOpenCliRunner,
    openCliExecutableEnv,
} from "./index.js";

vi.mock("node:child_process", () => ({
    execFile: vi.fn(),
}));

interface ExecError {
    name: string;
    code?: unknown;
    stdout?: string;
    stderr?: string;
    killed?: boolean;
    signal?: string | null;
    message?: string;
}

type ExecFileCallback = (
    error: ExecError | null,
    result?: { stdout: string; stderr: string },
) => void;

interface ExecFileInvocation {
    file: string;
    args: readonly string[];
    options: Record<string, unknown>;
}

const execFileMock = vi.mocked(execFile) as unknown as {
    mockImplementation(impl: (
        file: string,
        args: readonly string[],
        options: Record<string, unknown>,
        callback: ExecFileCallback,
    ) => unknown): unknown;
    mock: {
        calls: unknown[][];
    };
};

function resolveExec(stdout: string, stderr = ""): void {
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
        callback(null, { stdout, stderr });
    });
}

function rejectExec(error: ExecError): void {
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
        callback(error);
    });
}

function lastCall(): ExecFileInvocation {
    const call = execFileMock.mock.calls.at(-1);
    if (!call) {
        throw new Error("execFile was never called.");
    }
    return {
        file: call[0] as string,
        args: call[1] as readonly string[],
        options: call[2] as Record<string, unknown>,
    };
}

function stubLogger(): LoggerPort & {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
} {
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: (): LoggerPort => logger,
        withContext: <T>(
            _context: never,
            callback: () => T | Promise<T>,
        ): T | Promise<T> => callback(),
    };
    return logger;
}

describe("createNodeOpenCliRunner", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.unstubAllEnvs();
    });

    it("runs the bundled OpenCLI entry and returns exit code 0", async () => {
        resolveExec("opencli v1.8.6\n");

        const result = await createNodeOpenCliRunner().run(["--version"]);

        expect(result).toEqual({
            stdout: "opencli v1.8.6\n",
            stderr: "",
            exitCode: 0,
        });
        const call = lastCall();
        expect(call.file).toBe(process.execPath);
        expect(call.args).toHaveLength(2);
        expect(call.args?.[0]).toMatch(/@jackwener[/\\]opencli/);
        expect(call.args?.[1]).toBe("--version");
        expect(call.options).toMatchObject({
            encoding: "utf8",
            shell: false,
            timeout: 120_000,
            maxBuffer: 4 * 1024 * 1024,
        });
    });

    it("passes env, timeout and maxBuffer overrides through", async () => {
        resolveExec("[]");

        await createNodeOpenCliRunner().run(["bilibili", "hot"], {
            env: { OPENCLI_PROFILE: "chrome-main" },
            timeoutMs: 5_000,
            maxBufferBytes: 1024,
        });

        const options = lastCall().options;
        expect(options.env).toMatchObject({
            OPENCLI_PROFILE: "chrome-main",
        });
        expect(options.timeout).toBe(5_000);
        expect(options.maxBuffer).toBe(1024);
    });

    it("returns exit code 66 as an empty result", async () => {
        rejectExec({
            name: "Error",
            code: 66,
            stdout: "[]",
            stderr: "",
        });

        const result = await createNodeOpenCliRunner().run(["bilibili", "hot"]);

        expect(result).toEqual({
            stdout: "[]",
            stderr: "",
            exitCode: 66,
        });
    });

    it("maps exit code 69 to a retryable dependency error", async () => {
        rejectExec({
            name: "Error",
            code: 69,
            message: "Browser Bridge unavailable",
        });

        await expect(createNodeOpenCliRunner().run(["bilibili", "hot"]))
            .rejects.toMatchObject({
                code: "dependency_unavailable",
                retryable: true,
            });
    });

    it("maps exit code 77 to authentication_required", async () => {
        rejectExec({
            name: "Error",
            code: 77,
        });

        await expect(createNodeOpenCliRunner().run(["bilibili", "feed"]))
            .rejects.toMatchObject({
                code: "authentication_required",
                retryable: false,
            });
    });

    it("maps a kill or ETIMEDOUT to a retryable timeout", async () => {
        rejectExec({
            name: "Error",
            code: "ETIMEDOUT",
        });

        await expect(createNodeOpenCliRunner().run(["bilibili", "hot"]))
            .rejects.toMatchObject({
                code: "timeout",
                retryable: true,
            });

        vi.clearAllMocks();
        rejectExec({
            name: "Error",
            killed: true,
        });

        await expect(createNodeOpenCliRunner().run(["bilibili", "hot"]))
            .rejects.toMatchObject({
                code: "timeout",
                retryable: true,
            });
    });

    it("maps any other execution failure to a retryable dependency error", async () => {
        rejectExec({
            name: "Error",
            code: "ENOENT",
            message: "spawn opencli ENOENT",
        });

        await expect(createNodeOpenCliRunner().run(["bilibili", "hot"]))
            .rejects.toMatchObject({
                code: "dependency_unavailable",
                retryable: true,
            });
    });

    it("prefers options.executable over the environment override", async () => {
        vi.stubEnv(openCliExecutableEnv, "C:\\tools\\opencli.cmd");
        resolveExec("");

        await createNodeOpenCliRunner({
            executable: "D:\\bin\\opencli.exe",
        }).run(["doctor"]);

        const call = lastCall();
        expect(call.file).toBe("D:\\bin\\opencli.exe");
        expect(call.args).toEqual(["doctor"]);
        expect(call.options.shell).toBe(false);
    });

    it("uses the environment executable override without the shell flag", async () => {
        vi.stubEnv(openCliExecutableEnv, "C:\\tools\\opencli.exe");
        resolveExec("");

        await createNodeOpenCliRunner().run(["doctor"]);

        const call = lastCall();
        expect(call.file).toBe("C:\\tools\\opencli.exe");
        expect(call.args).toEqual(["doctor"]);
        expect(call.options.shell).toBe(false);
    });

    it("uses the shell for a .cmd or .bat external executable", async () => {
        vi.stubEnv(openCliExecutableEnv, "C:\\tools\\opencli.cmd");
        resolveExec("");

        await createNodeOpenCliRunner().run(["doctor"]);

        const call = lastCall();
        expect(call.file).toBe("C:\\tools\\opencli.cmd");
        expect(call.args).toEqual(["doctor"]);
        expect(call.options.shell).toBe(true);
    });

    it("logs structured start, completion and failure events", async () => {
        const logger = stubLogger();
        resolveExec("opencli v1.8.6");
        await createNodeOpenCliRunner({ logger }).run(["--version"]);

        expect(logger.debug).toHaveBeenCalledWith("connector.opencli.started", {
            operation: "--version",
            argumentCount: 1,
        });
        expect(logger.info).toHaveBeenCalledWith(
            "connector.opencli.completed",
            expect.objectContaining({
                operation: "--version",
                exitCode: 0,
            }),
        );

        vi.clearAllMocks();
        rejectExec({
            name: "Error",
            code: 69,
        });
        await expect(createNodeOpenCliRunner({ logger }).run(["doctor"]))
            .rejects.toMatchObject({ code: "dependency_unavailable" });
        expect(logger.warn).toHaveBeenCalledWith(
            "connector.opencli.failed",
            expect.objectContaining({
                operation: "doctor",
                exitCode: 69,
            }),
        );
    });
});

describe("assertOpenCliDoctor", () => {
    it("accepts a connected extension", () => {
        expect(() => assertOpenCliDoctor(
            "[OK] Extension: connected\n[OK] Connectivity: passed",
        )).not.toThrow();
    });

    it("rejects a disconnected extension", () => {
        expect(() => assertOpenCliDoctor(
            "[MISSING] Extension: not connected",
        )).toThrowError(expect.objectContaining({
            code: "dependency_unavailable",
            retryable: true,
        }));
    });

    it("rejects failed connectivity", () => {
        expect(() => assertOpenCliDoctor("Connectivity: failed")).toThrowError(
            expect.objectContaining({ code: "dependency_unavailable" }),
        );
    });
});

describe("assertOpenCliVersion", () => {
    it("accepts the supported major version", () => {
        expect(() => assertOpenCliVersion("1.8.6", 0)).not.toThrow();
    });

    it("rejects an unsupported major version", () => {
        expect(() => assertOpenCliVersion("opencli v2.0.0", 0)).toThrowError(
            expect.objectContaining({
                code: "unsupported_version",
                retryable: false,
            }),
        );
    });

    it("rejects a failed version call or missing version output", () => {
        expect(() => assertOpenCliVersion("", 1)).toThrowError(
            expect.objectContaining({ code: "unsupported_version" }),
        );
        expect(() => assertOpenCliVersion("no version here", 0)).toThrowError(
            expect.objectContaining({ code: "unsupported_version" }),
        );
    });
});
