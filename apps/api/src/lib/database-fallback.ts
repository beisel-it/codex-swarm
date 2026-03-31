const recoverableDatabaseCodes = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "42P01",
  "3D000",
  "57P03",
]);

export function isRecoverableDatabaseError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const code =
    "code" in error && typeof error.code === "string" ? error.code : undefined;
  const message = error.message.toLowerCase();

  return (
    recoverableDatabaseCodes.has(code ?? "") ||
    message.includes("connect econnrefused") ||
    message.includes("connection refused") ||
    message.includes("does not exist") ||
    message.includes("relation") ||
    message.includes("failed to connect")
  );
}
