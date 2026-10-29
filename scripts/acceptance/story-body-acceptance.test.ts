import { afterEach, expect, it, vi } from "vitest";
import { main } from "./story-body-acceptance.js";
import { bodyAcceptancePlan, sourceText } from "./story-body-plan.js";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("discloses the full fixed body request without credentials, a database or network", async () => {
    const network = vi.fn(() => { throw new Error("No network in plan mode"); });
    vi.stubGlobal("fetch", network);
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await main(["--plan"]);
    const plan = JSON.parse(String(output.mock.calls[0]?.[0]));
    expect(plan).toMatchObject({ ...(JSON.parse(JSON.stringify(await bodyAcceptancePlan()))), provider: "jijiapi", model: "gpt-6-luna", sourceText,
        maxProviderPosts: 1, maxDurationMs: 60_000, maxOutputTokens: 512, tools: [] });
    expect(plan.messages[1].content).toContain("block-1");
    expect(network).not.toHaveBeenCalled();
});

it("rejects unknown arguments before reading a credential or creating a session", async () => {
    await expect(main(["--api-key=forbidden"])).rejects.toThrow("no command-line arguments");
});

it("requires an actual interactive terminal for real execution", async () => {
    if (process.stdin.isTTY && process.stdout.isTTY) return;
    await expect(main([])).rejects.toThrow("real interactive terminal");
});
