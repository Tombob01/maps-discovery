import { defineConfig } from "vitest/config";
import { resolve }      from "node:path";

export default defineConfig({
  test: {
    globals:     true,
    environment: "node",
    include:  ["tests/**/*.test.ts"],
    exclude:  ["node_modules", "dist"],
    snapshotOptions: {
      snapshotFormat: {
        printBasicPrototype: false,
        escapeString:        false,
      },
    },
    coverage: {
      provider:         "v8",
      reporter:         ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include:          ["src/**/*.ts"],
      exclude:          ["src/**/*.d.ts", "src/**/index.ts"],
      thresholds: {
        lines:      80,
        functions:  80,
        branches:   75,
        statements: 80,
      },
    },
    testTimeout:  15000,
    hookTimeout:  15000,
    reporter: process.env["CI"] ? "github-actions" : "verbose",
    retry: process.env["CI"] ? 1 : 0,
  },
  resolve: {
    alias: {
      "@core":         resolve(__dirname, "src/core"),
      "@query-engine": resolve(__dirname, "src/query-engine"),
      "@providers":    resolve(__dirname, "src/providers"),
      "@pipeline":     resolve(__dirname, "src/pipeline"),
      "@queue":        resolve(__dirname, "src/queue"),
      "@storage":      resolve(__dirname, "src/storage"),
      "@exporters":    resolve(__dirname, "src/exporters"),
      "@normalizer":   resolve(__dirname, "src/normalizer"),
      "/src/":         resolve(__dirname, "dist") + "/",
      "../src/":       resolve(__dirname, "dist") + "/",
      "../../src/":    resolve(__dirname, "dist") + "/",
      "../../../src/": resolve(__dirname, "dist") + "/",
      "../../../../src/": resolve(__dirname, "dist") + "/",
    },
  },
});
