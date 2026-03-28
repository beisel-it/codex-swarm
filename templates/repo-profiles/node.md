# Node Profile

## Use When

- the target repo is a Node.js or TypeScript service, library, or monorepo

## Baseline Layout

- root `package.json`
- package manager pinned with `packageManager`
- `tsconfig.json` or package-level TypeScript config
- CI entrypoints for lint, typecheck, test, and build

## Swarm Defaults

- leader: planning and DAG creation
- implementer: service or package slice delivery
- reviewer: contract drift and CI regression review
- tester: Vitest or framework-native integration coverage

## Recommended Skills

- `plan-from-spec`
- `create-task-dag`
- `validate-milestone`
- `prepare-pr`
