import {
    createHash,
} from "node:crypto";

import {
    assertJsonValue,
    canonicalJson,
    WorkflowValueIntegrityError,
    WorkflowValueNotFoundError,
    type JsonValue,
    type ValueRef,
    type ValueStore,
} from "@notnotype/nb-workflow";

import {
    FileBlobStore,
} from "./index.js";

export class BlobWorkflowValueStore implements ValueStore {
    constructor(private readonly blobs: FileBlobStore) {}

    async put(value: JsonValue): Promise<ValueRef> {
        const encoded = new TextEncoder().encode(canonicalJson(value));
        const stored = await this.blobs.put(encoded, {
            mimeType: "application/json",
        });
        const digest = `sha256:${createHash("sha256").update(encoded).digest("hex")}`;
        return {
            key: stored.key,
            hash: digest,
            byteSize: encoded.byteLength,
            mediaType: "application/json",
        };
    }

    async get(reference: ValueRef): Promise<JsonValue> {
        let content: Uint8Array;
        try {
            content = await this.blobs.read(reference.key);
        } catch (error) {
            if (isMissingFile(error)) {
                throw new WorkflowValueNotFoundError(reference);
            }
            throw error;
        }

        const digest = `sha256:${createHash("sha256").update(content).digest("hex")}`;
        if (
            reference.mediaType !== "application/json" ||
            reference.hash !== digest ||
            reference.byteSize !== content.byteLength ||
            !keyMatchesDigest(reference.key, digest)
        ) {
            throw new WorkflowValueIntegrityError(reference);
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(new TextDecoder().decode(content)) as unknown;
            assertJsonValue(parsed);
        } catch {
            throw new WorkflowValueIntegrityError(reference);
        }
        return structuredClone(parsed);
    }
}

function keyMatchesDigest(key: string, digest: string): boolean {
    const hex = digest.slice("sha256:".length);
    return key === `sha256/${hex.slice(0, 2)}/${hex.slice(2)}`;
}

function isMissingFile(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}
