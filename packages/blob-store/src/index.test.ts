import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
    BlobIntegrityError,
    createBlobStoreConfig,
    FileBlobStore,
    readVerifiedBlob,
    resolveBlobKey,
} from "./index.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
        recursive: true,
        force: true,
    })));
});

describe("FileBlobStore", () => {
    it("stores content under a content-addressed key and reads it back", async () => {
        const root = await mkdtemp(join(tmpdir(), "cosmos-blob-test-"));
        temporaryRoots.push(root);
        const store = new FileBlobStore(createBlobStoreConfig(root));

        const content = new TextEncoder().encode("hello");
        const stored = await store.put(content, {
            mimeType: "text/plain",
        });

        expect(stored.key).toMatch(/^sha256\/[a-f0-9]{2}\/[a-f0-9]{62}$/);
        expect(stored.hash).toBe("sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
        expect(new TextDecoder().decode(await store.read(stored.key))).toBe("hello");
        expect(await store.exists(stored.key)).toBe(true);
        expect(new TextDecoder().decode(await readVerifiedBlob(store, {
            key: stored.key,
            hash: stored.hash,
            byteSize: stored.byteSize,
            mediaType: stored.mimeType ?? "application/octet-stream",
        }))).toBe("hello");

        await expect(readVerifiedBlob(store, {
            key: stored.key,
            hash: "sha256:bad",
            byteSize: stored.byteSize,
            mediaType: "text/plain",
        })).rejects.toBeInstanceOf(BlobIntegrityError);
    });

    it("bounds reads before exposing bytes and keeps unrestricted reads unchanged", async () => {
        const root = await mkdtemp(join(tmpdir(), "cosmos-bounded-blob-"));
        temporaryRoots.push(root);
        const store = new FileBlobStore(createBlobStoreConfig(root));
        const stored = await store.put(new Uint8Array(131_073).fill(97));
        expect(await store.readBounded(stored.key, 131_073)).toHaveLength(131_073);
        await expect(store.readBounded(stored.key, 131_072)).rejects.toThrow("Blob byte budget exceeded");
        for (const limit of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER]) {
            await expect(store.readBounded(stored.key, limit)).rejects.toThrow("Invalid Blob byte budget");
        }
        const empty = await store.put(new Uint8Array());
        expect(await store.readBounded(empty.key, 0)).toHaveLength(0);
        expect(await store.read(stored.key)).toHaveLength(131_073);
        await expect(store.readBounded("../outside", 10)).rejects.toThrow("Blob key escapes");
        await store.delete(stored.key);
        expect(await store.exists(stored.key)).toBe(false);
    });

    it("rejects blob keys outside the configured root", () => {
        const config = createBlobStoreConfig("C:/cosmos-test/blobs");

        expect(() => resolveBlobKey(config, "../secrets.txt")).toThrow(
            "Blob key escapes",
        );
    });
});
