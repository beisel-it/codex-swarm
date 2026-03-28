import { describe, expect, it } from "vitest";

import { canActorPerformAction, getActorRoles } from "../src/lib/authorization.js";

describe("authorization", () => {
  it("normalizes primary and secondary actor roles", () => {
    expect(getActorRoles({
      role: "workspace_admin",
      roles: ["workspace_admin", "reviewer"]
    })).toEqual(["workspace_admin", "reviewer"]);
  });

  it("allows actions when any assigned role grants permission", () => {
    expect(canActorPerformAction({
      role: "member",
      roles: ["member", "reviewer"]
    }, "approval.resolve")).toBe(true);
  });

  it("denies actions when no assigned role grants permission", () => {
    expect(canActorPerformAction({
      role: "member",
      roles: ["member"]
    }, "admin.read")).toBe(false);
  });
});
