import { describe, expect, it } from "vitest";
import { registryDatabaseUrl } from "./client";

describe("registry deployment isolation", () => {
  it("never falls back to the application database", () => {
    expect(() =>
      registryDatabaseUrl({
        DATABASE_URL: "postgresql://db/app",
        REGISTRY_ENVIRONMENT: "production",
      }),
    ).toThrow();
  });
  it.each(["", "public", "registry_preview_", "public,registry_preview_test"])(
    "rejects staging schema %s",
    (schema) => {
      expect(() =>
        registryDatabaseUrl({
          REGISTRY_ENVIRONMENT: "staging",
          REGISTRY_DATABASE_URL: `postgresql://db/app?schema=${encodeURIComponent(schema)}`,
        }),
      ).toThrow();
    },
  );
  it("allows staging only in an explicit preview schema", () => {
    const url = "postgresql://db/app?schema=registry_preview_release_20260908";
    expect(
      registryDatabaseUrl({
        REGISTRY_ENVIRONMENT: "staging",
        REGISTRY_DATABASE_URL: url,
      }),
    ).toBe(url);
  });
  it.each(["test", "development"])(
    "keeps %s on isolated local databases",
    (environment) => {
      expect(() =>
        registryDatabaseUrl({
          REGISTRY_ENVIRONMENT: environment,
          REGISTRY_DATABASE_URL:
            "postgresql://db/app?schema=registry_preview_release",
        }),
      ).toThrow();
      expect(() =>
        registryDatabaseUrl({
          REGISTRY_ENVIRONMENT: environment,
          REGISTRY_DATABASE_URL: "postgresql://localhost/production",
        }),
      ).toThrow();
      expect(
        registryDatabaseUrl({
          REGISTRY_ENVIRONMENT: environment,
          REGISTRY_DATABASE_URL: "postgresql://127.0.0.1/registry_test_example",
        }),
      ).toContain("registry_test_example");
    },
  );
});
