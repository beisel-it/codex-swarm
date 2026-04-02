import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import type { AppConfig } from "../config.js";

type PasswordHashComponents = {
  keylen: number;
  n: number;
  p: number;
  r: number;
  salt: Buffer;
  derivedKey: Buffer;
};

function parsePasswordHash(value: string): PasswordHashComponents {
  const [algorithm, nRaw, rRaw, pRaw, keylenRaw, saltRaw, hashRaw] = value.split("$");

  if (
    algorithm !== "scrypt"
    || !nRaw
    || !rRaw
    || !pRaw
    || !keylenRaw
    || !saltRaw
    || !hashRaw
  ) {
    throw new Error("invalid password hash format");
  }

  return {
    n: Number.parseInt(nRaw, 10),
    r: Number.parseInt(rRaw, 10),
    p: Number.parseInt(pRaw, 10),
    keylen: Number.parseInt(keylenRaw, 10),
    salt: Buffer.from(saltRaw, "base64url"),
    derivedKey: Buffer.from(hashRaw, "base64url")
  };
}

export async function hashPassword(password: string, config: AppConfig): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = scryptSync(password, salt, config.AUTH_PASSWORD_SCRYPT_KEYLEN, {
    N: config.AUTH_PASSWORD_SCRYPT_N,
    r: config.AUTH_PASSWORD_SCRYPT_R,
    p: config.AUTH_PASSWORD_SCRYPT_P
  });

  return [
    "scrypt",
    String(config.AUTH_PASSWORD_SCRYPT_N),
    String(config.AUTH_PASSWORD_SCRYPT_R),
    String(config.AUTH_PASSWORD_SCRYPT_P),
    String(config.AUTH_PASSWORD_SCRYPT_KEYLEN),
    salt.toString("base64url"),
    derivedKey.toString("base64url")
  ].join("$");
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const components = parsePasswordHash(encodedHash);
  const derivedKey = scryptSync(password, components.salt, components.keylen, {
    N: components.n,
    r: components.r,
    p: components.p
  });

  return derivedKey.length === components.derivedKey.length
    && timingSafeEqual(derivedKey, components.derivedKey);
}
