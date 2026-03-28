# Python Profile

## Use When

- the target repo is a Python application, service, or tooling repository

## Baseline Layout

- `pyproject.toml`
- locked dependency workflow
- virtual environment bootstrap in docs or scripts
- CI entrypoints for format, type, test, and package checks

## Swarm Defaults

- architect: package boundaries and runtime dependency review
- implementer: service or CLI slice delivery
- reviewer: migration and environment regression review
- tester: pytest coverage and smoke validation

## Recommended Skills

- `plan-from-spec`
- `create-task-dag`
- `validate-milestone`
- `prepare-pr`
