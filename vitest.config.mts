import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(import.meta.dirname, "./src") };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      // Componentes y schemas: jsdom + testing-library.
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "ui",
          fsModuleCache: true,
          // jsdom role queries are slower on Windows under local CPU/IO contention.
          testTimeout: process.platform === "win32" ? 30_000 : 5_000,
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          include: ["src/**/*.test.{ts,tsx}", "src/**/__tests__/**/*.{ts,tsx}"],
        },
      },
      // Unitarios en Node puro: sin base, en paralelo. Es lo que corre el
      // hook pre-push (`pnpm test:unit`), así que tiene que ser rápido.
      {
        resolve: { alias },
        test: {
          name: "unit",
          fsModuleCache: true,
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          // Cold module transforms and repository scans can exceed 30s on Windows.
          testTimeout: process.platform === "win32" ? 90_000 : 30_000,
        },
      },
      // Dominio y datos contra MySQL. jsdom acá sólo rompe mysql2.
      {
        resolve: { alias },
        test: {
          name: "integration",
          fsModuleCache: true,
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/global-setup.ts"],
          // Las suites de integración comparten una sola base: sin esto, una
          // trunca tablas mientras otra las usa.
          fileParallelism: false,
          // Windows git fixtures and bcrypt setup can exceed 30s under local IO/CPU contention.
          // Linux CI retains its existing threshold; database lock waits remain independently bounded.
          testTimeout: process.platform === "win32" ? 90_000 : 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
