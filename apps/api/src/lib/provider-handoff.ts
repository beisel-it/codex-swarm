import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface BranchPublishRequest {
  workspacePath: string;
  branchName: string;
  remoteName: string;
}

export interface PullRequestCreateRequest {
  workspacePath: string;
  baseBranch: string;
  headBranch: string;
  title: string;
  body: string;
}

export interface PullRequestCreateResult {
  url: string;
  number: number | null;
  status: "open";
}

export interface ProviderHandoffAdapter {
  publishBranch(input: BranchPublishRequest): Promise<void>;
  createGitHubPullRequest(input: PullRequestCreateRequest): Promise<PullRequestCreateResult>;
}

export function createShellProviderHandoffAdapter(options?: {
  gitCommand?: string;
  ghCommand?: string;
}): ProviderHandoffAdapter {
  const gitCommand = options?.gitCommand ?? "git";
  const ghCommand = options?.ghCommand ?? "gh";

  return {
    async publishBranch(input) {
      await execFileAsync(
        gitCommand,
        ["push", input.remoteName, input.branchName],
        { cwd: input.workspacePath, timeout: 120_000, maxBuffer: 1024 * 1024 * 4 }
      );
    },

    async createGitHubPullRequest(input) {
      const scratchDir = await mkdtemp(join(tmpdir(), "codex-swarm-pr-body-"));
      const bodyFile = join(scratchDir, "body.md");

      try {
        await writeFile(bodyFile, input.body, "utf8");
        const { stdout } = await execFileAsync(
          ghCommand,
          [
            "pr",
            "create",
            "--base",
            input.baseBranch,
            "--head",
            input.headBranch,
            "--title",
            input.title,
            "--body-file",
            bodyFile
          ],
          { cwd: input.workspacePath, timeout: 120_000, maxBuffer: 1024 * 1024 * 4 }
        );

        const url = stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find((line) => /^https?:\/\//.test(line));

        if (!url) {
          throw new Error("gh pr create did not return a pull request URL");
        }

        const numberMatch = url.match(/\/pull\/(\d+)(?:\/?|$)/);

        return {
          url,
          number: numberMatch ? Number.parseInt(numberMatch[1] ?? "", 10) : null,
          status: "open"
        };
      } finally {
        await rm(scratchDir, { recursive: true, force: true });
      }
    }
  };
}
