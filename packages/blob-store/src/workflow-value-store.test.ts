import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import {
    valueStoreConformanceCases,
    WorkflowValueIntegrityError,
    WorkflowValueNotFoundError,
} from "@notnotype/nb-workflow";

import {
    BlobWorkflowValueStore,
    createBlobStoreConfig,
    FileBlobStore,
} from "./index.js";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, {
        recursive: true,
        force: true,
    })));
});

describe("BlobWorkflowValueStore", () => {
    for (const testCase of valueStoreConformanceCases) {
        it(`conformance: ${testCase.name}`, async () => {
            const root = await mkdtemp(join(tmpdir(), "cosmos-workflow-value-"));
            roots.push(root);
            await testCase.run(() => new BlobWorkflowValueStore(
                new FileBlobStore(createBlobStoreConfig(root)),
            ));
        });
    }

    it("rejects tampered bytes and malformed references", async () => {
        const root = await mkdtemp(join(tmpdir(), "cosmos-workflow-value-"));
        roots.push(root);
        const blobs = new FileBlobStore(createBlobStoreConfig(root));
        const store = new BlobWorkflowValueStore(blobs);
        const reference = await store.put({ nested: ["safe", 1] });
        await writeFile(join(root, reference.key), new TextEncoder().encode("tampered"));

        await expect(store.get(reference)).rejects.toBeInstanceOf(WorkflowValueIntegrityError);
        await expect(store.get({
            ...reference,
            key: "sha256/00/missing",
        })).rejects.toBeInstanceOf(WorkflowValueNotFoundError);
    });

    it("writes canonical JSON and returns the exact stored byte count", async () => {
        const root = await mkdtemp(join(tmpdir(), "cosmos-workflow-value-"));
        roots.push(root);
        const store = new BlobWorkflowValueStore(
            new FileBlobStore(createBlobStoreConfig(root)),
        );
        const reference = await store.put({ b: 1, a: "two" });
        const bytes = await readFile(join(root, reference.key));
        expect(new TextDecoder().decode(bytes)).toBe('{"a":"two","b":1}');
        expect(reference.byteSize).toBe(bytes.byteLength);
    });
});
