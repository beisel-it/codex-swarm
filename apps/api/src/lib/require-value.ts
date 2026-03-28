import { HttpError } from "./http-error.js";

export function requireValue<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new HttpError(500, message);
  }

  return value;
}
