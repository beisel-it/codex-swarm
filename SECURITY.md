# Security Policy

## Supported release boundary

The current supported release boundary is:

- private self-hosted deployments
- single-host managed installations
- optional same-host worker fan-out

Public-browser-safe deployments and generalized remote-worker onboarding are not
yet part of the supported release boundary.

Version support expectations live in
`docs/operations/supported-versions.md`.

## Reporting a vulnerability

Do not open public GitHub issues for suspected security vulnerabilities.

Instead:

1. email the maintainers or repository owners privately
2. include affected version or commit, deployment shape, and reproduction notes
3. describe whether the issue affects API auth, worker execution, artifact
   access, secret handling, or deployment/install flows

If you cannot reach a maintainer privately, open a minimal GitHub issue that
states a private report is needed without disclosing exploit details.

## Response expectations

Best-effort response targets:

- initial acknowledgement within 5 business days
- triage and severity classification as soon as reproducible detail is available
- coordinated fix and disclosure timing based on severity and deployment impact

## Hardening notes

Current operators should treat these as important boundaries:

- frontend runtime token injection is for private deployments only
- worker nodes should run with least-privilege credentials
- secrets should stay within the documented control-plane and brokered paths
- upgrades should follow the checked-in backup and restore guidance before
  reopening traffic
