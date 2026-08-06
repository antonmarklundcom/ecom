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
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          include: ["src/**/*.test.{ts,tsx}", "src/**/__tests__/**/*.{ts,tsx}"],
        },
      },
      // Dominio y datos: Node puro contra MySQL. jsdom acá sólo rompe mysql2.
      {
        resolve: { alias },
        test: {
          name: "domain",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          globalSetup: ["tests/global-setup.ts"],
          // Las suites de integración comparten una sola base: sin esto, una
          // trunca tablas mientras otra las usa.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
