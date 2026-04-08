import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      NOTION_API_KEY: "ntn_test",
      NOTION_DATABASE_ID: "12345678-0000-0000-0000-000000000000",
      API_SECRET: "test-secret",
    },
  },
});
