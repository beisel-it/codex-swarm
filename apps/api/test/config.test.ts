import { afterEach, describe, expect, it } from "vitest";

import { getConfig } from "../src/config.js";

describe("getConfig", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
      return;
    }

    process.env.NODE_ENV = originalNodeEnv;
  });

  it("applies documented defaults", () => {
    delete process.env.NODE_ENV;

    const config = getConfig({
      NODE_ENV: undefined,
      PORT: undefined,
      HOST: undefined,
      DATABASE_URL: undefined,
      DEV_AUTH_TOKEN: undefined,
      OPENAI_TRACING_DISABLED: undefined,
      OPENAI_TRACING_EXPORT_API_KEY: undefined
    });

    expect(config).toMatchObject({
      NODE_ENV: "development",
      PORT: 3000,
      HOST: "0.0.0.0",
      DEV_AUTH_TOKEN: "codex-swarm-dev-token"
    });
    expect(config.DATABASE_URL).toContain("codex_swarm");
  });

  it("parses environment overrides", () => {
    const config = getConfig({
      NODE_ENV: "test",
      PORT: "4010",
      HOST: "127.0.0.1",
      DATABASE_URL: "postgres://example/test",
      DEV_AUTH_TOKEN: "secret-token",
      OPENAI_TRACING_DISABLED: "false",
      OPENAI_TRACING_EXPORT_API_KEY: undefined
    });

    expect(config).toEqual({
      NODE_ENV: "test",
      PORT: 4010,
      HOST: "127.0.0.1",
      DATABASE_URL: "postgres://example/test",
      DEV_AUTH_TOKEN: "secret-token",
      OPENAI_TRACING_DISABLED: false,
      OPENAI_TRACING_EXPORT_API_KEY: undefined
    });
  });
});
