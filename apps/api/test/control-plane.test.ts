import test from "node:test";
import assert from "node:assert/strict";

import { ControlPlaneService } from "../src/services/control-plane-service.js";
import { systemClock } from "../src/lib/clock.js";

class FakeDb {
  repositories = new Map<string, any>();
  runs = new Map<string, any>();
  tasks = new Map<string, any>();
  agents = new Map<string, any>();
  sessions = new Map<string, any>();
  messages = new Map<string, any>();
  approvals = new Map<string, any>();
  validations = new Map<string, any>();
  artifacts = new Map<string, any>();
}

test("placeholder", () => {
  assert.ok(ControlPlaneService);
  assert.ok(systemClock.now() instanceof Date);
});
