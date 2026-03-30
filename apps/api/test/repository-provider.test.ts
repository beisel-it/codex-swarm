import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { inspectRepositoryProvider } from "../src/lib/repository-provider.js";

let tempRoot: string;

async function runGit(args: string[], cwd: string) {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  await execFileAsync("git", args, { cwd });
}

describe("repository-provider inspection", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "codex-swarm-repo-provider-"));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("discovers default branch and branch inventory from a reachable repository", async () => {
    const originPath = join(tempRoot, "origin.git");
    const workingPath = join(tempRoot, "working");

    await runGit(["init", "--bare", originPath], tempRoot);
    await runGit(["init", "-b", "main", workingPath], tempRoot);
    await runGit(["config", "user.name", "Codex Swarm"], workingPath);
    await runGit(["config", "user.email", "codex-swarm@example.com"], workingPath);
    await writeFile(join(workingPath, "README.md"), "# test\n");
    await runGit(["add", "README.md"], workingPath);
    await runGit(["commit", "-m", "Initial commit"], workingPath);
    await runGit(["branch", "release"], workingPath);
    await runGit(["remote", "add", "origin", originPath], workingPath);
    await runGit(["push", "--all", "origin"], workingPath);
    await runGit(["symbolic-ref", "HEAD", "refs/heads/main"], originPath);

    const inspection = await inspectRepositoryProvider({
      provider: "github",
      url: originPath,
      localPath: null
    });

    expect(inspection).toMatchObject({
      connectivityStatus: "validated",
      defaultBranch: "main",
      providerRepoUrl: originPath,
      lastError: null
    });
    expect(inspection.validatedAt).toBeInstanceOf(Date);
    expect(inspection.branches).toEqual(["main", "release"]);
  });

  it("skips provider inspection for local-path repositories", async () => {
    const inspection = await inspectRepositoryProvider({
      provider: "local",
      url: "file:///tmp/local-repo",
      localPath: "/tmp/local-repo"
    });

    expect(inspection).toEqual({
      connectivityStatus: "skipped",
      validatedAt: null,
      defaultBranch: null,
      branches: [],
      providerRepoUrl: "file:///tmp/local-repo",
      lastError: null
    });
  });
});
