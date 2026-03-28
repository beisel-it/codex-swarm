import { describe, expect, it } from "vitest";

import { canActorPerformAction, getActorRoles, resolveRunStatusAction } from "../src/lib/authorization.js";

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

  it("maps run status transitions to governed actions", () => {
    expect(resolveRunStatusAction("completed")).toBe("run.review");
    expect(resolveRunStatusAction("in_progress")).toBe("run.retry");
    expect(resolveRunStatusAction("cancelled")).toBe("run.stop");
  });
});
