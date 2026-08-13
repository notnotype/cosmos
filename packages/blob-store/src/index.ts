import { createHash } from "node:crypto";
import {
    mkdir,
    readFile,
    stat,
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
            byteSize: content.byteLength,
            mimeType: options.mimeType ?? null,
        };
    }

    async read(key: string): Promise<Uint8Array> {
        return readFile(resolveBlobKey(this.config, key));
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
}

export { BlobWorkflowValueStore } from "./workflow-value-store.js";
