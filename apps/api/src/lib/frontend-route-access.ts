import { existsSync, readFileSync } from "node:fs";
import { posix, resolve } from "node:path";

const DEFAULT_PUBLIC_FRONTEND_FILE_PATHS = new Set([
  "/favicon.svg",
  "/icons.svg",
  "/runtime-config.js",
  "/runtime-config.json"
]);

const OPERATIONAL_FRONTEND_ROUTE_PREFIXES = [
  "/projects",
  "/adhoc-runs",
  "/runs",
  "/settings"
];

const HTML_ASSET_REFERENCE_PATTERN = /<(?:script|link|img|source)\b[^>]*\b(?:src|href)=["']([^"'?#]+)(?:[?#][^"']*)?["']/g;
const CSS_ASSET_REFERENCE_PATTERN = /(?:@import\s+|url\()\s*['"]?([^"'()?#\s]+)(?:[?#][^"'()\s]*)?['"]?\s*\)?/g;
const JS_MODULE_REFERENCE_PATTERN = /\bimport\s*\(\s*["']([^"']+)["']\s*\)|\bimport\s+["']([^"']+)["']|\bfrom\s+["']([^"']+)["']/g;

export interface FrontendRouteAccess {
  isOperationalPath(pathname: string): boolean;
  isPublicPath(pathname: string): boolean;
}

export function normalizeFrontendPath(url: string) {
  const pathname = url.split("?", 1)[0] ?? "/";
  const trimmed = pathname.trim();

  if (trimmed.length === 0) {
    return "/";
  }

  if (trimmed === "/") {
    return "/";
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function isOperationalFrontendPathname(pathname: string) {
  return OPERATIONAL_FRONTEND_ROUTE_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function normalizeReferencedAssetPath(rawReference: string, basePath = "/") {
  if (rawReference.startsWith("data:") || rawReference.startsWith("http://") || rawReference.startsWith("https://")) {
    return null;
  }

  if (rawReference.startsWith("/")) {
    return normalizeFrontendPath(rawReference);
  }

  if (!rawReference.startsWith(".")) {
    return null;
  }

  const normalized = posix.normalize(posix.join(posix.dirname(basePath), rawReference));

  if (!normalized.startsWith("/")) {
    return null;
  }

  return normalizeFrontendPath(normalized);
}

function collectMatches(source: string, pattern: RegExp, basePath = "/") {
  const matches = new Set<string>();

  for (const match of source.matchAll(pattern)) {
    const rawReference = match.slice(1).find((value) => typeof value === "string" && value.length > 0) ?? "";
    const referencedPath = normalizeReferencedAssetPath(rawReference, basePath);

    if (referencedPath) {
      matches.add(referencedPath);
    }
  }

  return matches;
}

function readUtf8IfPresent(path: string) {
  if (!existsSync(path)) {
    return null;
  }

  return readFileSync(path, "utf8");
}

function collectLandingAssetPaths(frontendDistRoot: string) {
  const publicAssetPaths = new Set<string>(DEFAULT_PUBLIC_FRONTEND_FILE_PATHS);
  const landingIndexPath = resolve(frontendDistRoot, "index.html");
  const landingHtml = readUtf8IfPresent(landingIndexPath);

  if (!landingHtml) {
    return publicAssetPaths;
  }

  const htmlReferences = collectMatches(landingHtml, HTML_ASSET_REFERENCE_PATTERN, "/index.html");
  const assetsToScan = [...htmlReferences];
  const scannedAssets = new Set<string>();

  for (const referencedPath of htmlReferences) {
    publicAssetPaths.add(referencedPath);
  }

  while (assetsToScan.length > 0) {
    const referencedPath = assetsToScan.shift();

    if (!referencedPath || scannedAssets.has(referencedPath)) {
      continue;
    }

    scannedAssets.add(referencedPath);

    if (referencedPath.endsWith(".css")) {
      const stylesheet = readUtf8IfPresent(resolve(frontendDistRoot, `.${referencedPath}`));

      if (!stylesheet) {
        continue;
      }

      for (const stylesheetReference of collectMatches(stylesheet, CSS_ASSET_REFERENCE_PATTERN, referencedPath)) {
        if (!publicAssetPaths.has(stylesheetReference)) {
          assetsToScan.push(stylesheetReference);
        }

        publicAssetPaths.add(stylesheetReference);
      }

      continue;
    }

    if (!referencedPath.endsWith(".js") && !referencedPath.endsWith(".mjs")) {
      continue;
    }

    const script = readUtf8IfPresent(resolve(frontendDistRoot, `.${referencedPath}`));

    if (!script) {
      continue;
    }

    for (const scriptReference of collectMatches(script, JS_MODULE_REFERENCE_PATTERN, referencedPath)) {
      if (!publicAssetPaths.has(scriptReference)) {
        assetsToScan.push(scriptReference);
      }

      publicAssetPaths.add(scriptReference);
    }
  }

  return publicAssetPaths;
}

export function createFrontendRouteAccess(frontendDistRoot?: string | null): FrontendRouteAccess {
  const publicFrontendFilePaths = frontendDistRoot
    ? collectLandingAssetPaths(frontendDistRoot)
    : new Set<string>(DEFAULT_PUBLIC_FRONTEND_FILE_PATHS);

  return {
    isOperationalPath(pathname: string) {
      return isOperationalFrontendPathname(pathname);
    },
    isPublicPath(pathname: string) {
      if (pathname === "/") {
        return true;
      }

      return publicFrontendFilePaths.has(pathname);
    }
  };
}

const defaultFrontendRouteAccess = createFrontendRouteAccess();

export function isPublicFrontendPath(pathname: string) {
  return defaultFrontendRouteAccess.isPublicPath(pathname);
}

export function isOperationalFrontendPath(pathname: string) {
  return defaultFrontendRouteAccess.isOperationalPath(pathname);
}
