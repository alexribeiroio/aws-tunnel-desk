#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const tauriConfig = JSON.parse(readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const cargoManifest = readFileSync(path.join(root, "src-tauri", "Cargo.toml"), "utf8");
const cargoVersion = cargoManifest.match(/^version\s*=\s*"([^"]+)"/m)?.[1];

const versions = new Map([
  ["package.json", packageJson.version],
  ["src-tauri/tauri.conf.json", tauriConfig.version],
  ["src-tauri/Cargo.toml", cargoVersion],
]);

for (const [file, version] of versions) {
  if (!version) throw new Error(`Unable to read the version from ${file}.`);
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`${file} contains an invalid semantic version: ${version}`);
  }
}

const uniqueVersions = new Set(versions.values());
if (uniqueVersions.size !== 1) {
  throw new Error(`Version mismatch:\n${[...versions].map(([file, version]) => `- ${file}: ${version}`).join("\n")}`);
}

const version = packageJson.version;
const releaseTag = process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME;
if (releaseTag && releaseTag !== `v${version}`) {
  throw new Error(`Release tag ${releaseTag} does not match source version v${version}.`);
}

console.log(`Version ${version} is synchronized across all manifests${releaseTag ? ` and tag ${releaseTag}` : ""}.`);
