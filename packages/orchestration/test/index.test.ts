import { describe, expect, it } from "vitest";

import { areDependencyStatusesComplete, resolveInitialTaskStatus } from "../src/index.js";

describe("resolveInitialTaskStatus", () => {
  it("marks independent tasks as pending", () => {
    expect(resolveInitialTaskStatus([])).toBe("pending");
  });

  it("marks dependent tasks as blocked", () => {
    expect(resolveInitialTaskStatus(["task-1"])).toBe("blocked");
  });
});

describe("areDependencyStatusesComplete", () => {
  it("returns true only when every dependency is completed", () => {
    expect(areDependencyStatusesComplete(["completed", "completed"])).toBe(true);
    expect(areDependencyStatusesComplete(["completed", "blocked"])).toBe(false);
  });

  it("treats an empty dependency list as complete", () => {
    expect(areDependencyStatusesComplete([])).toBe(true);
  });
});
