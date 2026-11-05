import { expect, it } from "vitest";
import { main } from "./real-source-ingest-acceptance.js";

it("requires explicit real-network permission before checking the workspace", async () => {
    const previous = process.env.COSMOS_ALLOW_REAL_NETWORK;
    delete process.env.COSMOS_ALLOW_REAL_NETWORK;
    try {
        await expect(main([])).rejects.toThrow("COSMOS_ALLOW_REAL_NETWORK=true");
    } finally {
        if (previous === undefined) delete process.env.COSMOS_ALLOW_REAL_NETWORK;
        else process.env.COSMOS_ALLOW_REAL_NETWORK = previous;
    }
});
