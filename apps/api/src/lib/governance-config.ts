import type { Repository } from "@codex-swarm/contracts";
import type { AppConfig } from "../config.js";

export function getRetentionPolicy(config: AppConfig) {
  return {
    runsDays: config.RETENTION_RUN_DAYS,
    artifactsDays: config.RETENTION_ARTIFACT_DAYS,
    eventsDays: config.RETENTION_EVENT_DAYS,
  };
}

export function getSecretIntegrationBoundary(config: AppConfig) {
  return {
    sourceMode: config.SECRET_SOURCE_MODE,
    provider: config.SECRET_PROVIDER,
    remoteCredentialEnvNames: config.REMOTE_SECRET_ENV_NAMES,
    allowedRepositoryTrustLevels: config.SECRET_ALLOWED_TRUST_LEVELS,
    sensitivePolicyProfiles: config.SENSITIVE_POLICY_PROFILES,
    credentialDistribution: config.SECRET_DISTRIBUTION_BOUNDARY,
    policyDrivenAccess: config.POLICY_DRIVEN_SECRET_ACCESS,
  };
}

export function getRepositorySecretAccessPlan(
  config: AppConfig,
  repository: Pick<
    Repository,
    "id" | "name" | "trustLevel" | "approvalProfile"
  >,
) {
  const boundary = getSecretIntegrationBoundary(config);
  const trustAllowed = boundary.allowedRepositoryTrustLevels.includes(
    repository.trustLevel,
  );
  const sensitivePolicy = boundary.sensitivePolicyProfiles.includes(
    repository.approvalProfile,
  );
  const access = !trustAllowed
    ? "denied"
    : sensitivePolicy
      ? "brokered"
      : "allowed";

  return {
    repositoryId: repository.id,
    repositoryName: repository.name,
    trustLevel: repository.trustLevel,
    policyProfile: repository.approvalProfile,
    access,
    sourceMode: boundary.sourceMode,
    provider: boundary.provider,
    credentialEnvNames: boundary.remoteCredentialEnvNames,
    distributionBoundary: boundary.credentialDistribution,
    reason:
      access === "denied"
        ? `trust level ${repository.trustLevel} is outside the configured secret boundary`
        : access === "brokered"
          ? `policy profile ${repository.approvalProfile} requires brokered secret delivery for governed repos`
          : `repository can receive the standard ${boundary.sourceMode} secret path`,
  };
}
