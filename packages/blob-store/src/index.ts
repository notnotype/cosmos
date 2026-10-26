import { constants as bufferConstants } from "node:buffer";
import { createHash } from "node:crypto";
import {
    mkdir,
    open,
    readFile,
    stat,
    unlink,
    writeFile,
} from "node:fs/promises";
import {
    relative,
    resolve,
    sep,
} from "node:path";

export interface BlobStoreConfig {
    root: string;
}

export interface StoredBlob {
    key: string;
    hash: string;
    byteSize: number;
    mimeType: string | null;
}

export function createBlobStoreConfig(root = process.env.COSMOS_BLOB_ROOT ?? ".cosmos/blobs"): BlobStoreConfig {
    return {
        root: resolve(root),
    };
}

export function resolveBlobKey(config: BlobStoreConfig, key: string): string {
    const resolvedRoot = resolve(config.root);
    const resolvedPath = resolve(resolvedRoot, key);
    const relativePath = relative(resolvedRoot, resolvedPath);

    if (
        relativePath.startsWith("..") ||
        relativePath.includes(`..${sep}`) ||
        relativePath.includes(":") ||
        resolve(resolvedRoot, relativePath) !== resolvedPath
    ) {
        throw new Error("Blob key escapes the configured Blob Root.");
    }

    return resolvedPath;
}

export class FileBlobStore {
    constructor(private readonly config: BlobStoreConfig) {}

    async put(
        content: Uint8Array,
        options: {
            mimeType?: string | null;
        } = {},
    ): Promise<StoredBlob> {
        const digest = createHash("sha256").update(content).digest("hex");
        const hash = `sha256:${digest}`;
        const key = `sha256/${digest.slice(0, 2)}/${digest.slice(2)}`;
        const path = resolveBlobKey(this.config, key);

        await mkdir(resolve(this.config.root, "sha256", digest.slice(0, 2)), {
            recursive: true,
        });
        try {
            await writeFile(path, content, { flag: "wx" });
        } catch (error) {
            if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") {
                throw error;
            }
        }

        return {
            key,
            hash,
            byteSize: content.byteLength,
            mimeType: options.mimeType ?? null,
        };
    }

    async read(key: string): Promise<Uint8Array> {
        return readFile(resolveBlobKey(this.config, key));
    }

    async readBounded(key: string, maxBytes: number): Promise<Uint8Array> {
        if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes >= bufferConstants.MAX_LENGTH) {
            throw new Error("Invalid Blob byte budget");
        }
        const handle = await open(resolveBlobKey(this.config, key), "r");
        try {
            const chunks: Buffer[] = [];
            let total = 0;
            while (true) {
                // The extra byte detects growth on the same handle without an unbounded read.
                const chunk = Buffer.alloc(Math.min(64 * 1024, maxBytes - total + 1));
                const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
                if (bytesRead === 0) return Buffer.concat(chunks, total);
                total += bytesRead;
                if (total > maxBytes) throw new Error("Blob byte budget exceeded");
                chunks.push(chunk.subarray(0, bytesRead));
            }
        } finally {
            await handle.close();
        }
    }

    async exists(key: string): Promise<boolean> {
        try {
            await stat(resolveBlobKey(this.config, key));
            return true;
        } catch (error) {
            if (error instanceof Error && "code" in error && error.code === "ENOENT") {
                return false;
            }
            throw error;
        }
    }

    /**
     * Remove one content-addressed blob. Callers must have already proved the
     * key is unreferenced: the same key can back several Asset rows (ADR-0015
     * decision 9). Missing keys are a no-op so retried cleanups stay idempotent.
     */
    async delete(key: string): Promise<void> {
        try {
            await unlink(resolveBlobKey(this.config, key));
        } catch (error) {
            if (error instanceof Error && "code" in error && error.code === "ENOENT") {
                return;
            }
            throw error;
        }
    }
}

export { BlobWorkflowValueStore } from "./workflow-value-store.js";
export {
    BlobIntegrityError,
    BlobRefNotFoundError,
    readVerifiedBlob,
    type BlobRefLike,
} from "./verify-blob-ref.js";
