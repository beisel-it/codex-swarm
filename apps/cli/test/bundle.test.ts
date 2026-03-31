import { describe, expect, it } from "vitest";

import { defaultInstallRoot, RELEASE_BUNDLE_ASSET_PREFIX, RELEASE_METADATA_FILE } from "../src/lib/single-host.js";

describe("release bundle metadata", () => {
  it("exposes a stable bundle asset prefix", () => {
    expect(RELEASE_BUNDLE_ASSET_PREFIX).toBe("codex-swarm-single-host");
  });

  it("exposes a stable metadata filename", () => {
    expect(RELEASE_METADATA_FILE).toBe("codex-swarm-release.json");
  });

  it("uses a non-checkout default install root", () => {
    expect(defaultInstallRoot()).toContain(".local/share/codex-swarm/install");
  });
});
