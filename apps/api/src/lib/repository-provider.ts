import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { Repository } from "@codex-swarm/contracts";

const execFileAsync = promisify(execFile);

export type RepositoryProviderInspection = {
  connectivityStatus: "validated" | "failed" | "skipped";
  validatedAt: Date | null;
  defaultBranch: string | null;
  branches: string[];
  providerRepoUrl: string | null;
  lastError: string | null;
};

function shouldSkipProviderInspection(
  repository: Pick<Repository, "provider" | "localPath">,
) {
  return repository.provider === "local" || repository.localPath !== null;
}

export async function inspectRepositoryProvider(
  repository: Pick<Repository, "provider" | "url" | "localPath">,
): Promise<RepositoryProviderInspection> {
  if (shouldSkipProviderInspection(repository)) {
    return {
      connectivityStatus: "skipped",
      validatedAt: null,
      defaultBranch: null,
      branches: [],
      providerRepoUrl: repository.url,
      lastError: null,
    };
  }

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["ls-remote", "--symref", repository.url, "HEAD", "refs/heads/*"],
      {
        timeout: 15_000,
        maxBuffer: 1024 * 1024,
      },
    );

    const branches = new Set<string>();
    let defaultBranch: string | null = null;

    for (const line of stdout.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }

      if (line.startsWith("ref: ")) {
        const match = line.match(/^ref:\s+refs\/heads\/([^\s]+)\s+HEAD$/);

        if (match?.[1]) {
          defaultBranch = match[1];
          branches.add(match[1]);
        }

        continue;
      }

      const refMatch = line.match(/refs\/heads\/(.+)$/);

      if (refMatch?.[1]) {
        branches.add(refMatch[1]);
      }
    }

    return {
      connectivityStatus: "validated",
      validatedAt: new Date(),
      defaultBranch,
      branches: [...branches].sort(),
      providerRepoUrl: repository.url,
      lastError: null,
    };
  } catch (error) {
    return {
      connectivityStatus: "failed",
      validatedAt: new Date(),
      defaultBranch: null,
      branches: [],
      providerRepoUrl: repository.url,
      lastError: error instanceof Error ? error.message : String(error),
    };
  }
}
