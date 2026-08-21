import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const rootDirectory = resolve(import.meta.dirname);

export default defineConfig({
    resolve: {
        alias: {
            "@cosmos/contracts": resolve(
                rootDirectory,
                "packages/contracts/src/index.ts",
            ),
            "@cosmos/logging": resolve(
                rootDirectory,
                "packages/logging/src/index.ts",
            ),
            "@cosmos/domain": resolve(
                rootDirectory,
                "packages/domain/src/index.ts",
            ),
            "@cosmos/application": resolve(
                rootDirectory,
                "packages/application/src/index.ts",
            ),
            "@cosmos/blob-store": resolve(
                rootDirectory,
                "packages/blob-store/src/index.ts",
            ),
            "@cosmos/storage-prisma": resolve(
                rootDirectory,
                "packages/storage-prisma/src/index.ts",
            ),
            "@cosmos/plugin-rss": resolve(
                rootDirectory,
                "plugins/rss/src/index.ts",
            ),
            "@cosmos/plugin-collectors": resolve(
                rootDirectory,
                "plugins/collectors/src/index.ts",
            ),
            "@cosmos/transport-http": resolve(
                rootDirectory,
                "packages/transport-http/src/index.ts",
            ),
        },
    },
    test: {
        include: [
            "packages/**/src/**/*.property.test.ts",
            "apps/**/src/**/*.property.test.ts",
            "test/properties/**/*.test.ts",
        ],
        fileParallelism: false,
        testTimeout: 60_000,
        hookTimeout: 120_000,
        passWithNoTests: false,
    },
});
