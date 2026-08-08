#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  "README.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "SECURITY.md",
  "SUPPORT.md",
  "AGENTS.md",
  "CLAUDE.md",
  "LICENSE",
  ".github/pull_request_template.md",
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
];

const missingFiles = requiredFiles.filter((file) => !existsSync(path.join(root, file)));
if (missingFiles.length) throw new Error(`Missing required repository files:\n${missingFiles.map((file) => `- ${file}`).join("\n")}`);

const excludedDirectories = new Set([".git", "dist", "node_modules", "target"]);
const excludedFiles = new Set(["package-lock.json", "Cargo.lock", "check-repository.mjs"]);
const textExtensions = new Set([".css", ".html", ".js", ".jsx", ".json", ".md", ".mjs", ".rs", ".toml", ".yml", ".yaml"]);
const personalReferencePatterns = [
  { label: "Linux home path", pattern: /\/home\/[A-Za-z0-9._-]+\//g },
  { label: "macOS home path", pattern: /\/Users\/[A-Za-z0-9._-]+\//g },
  { label: "Windows user path", pattern: /[A-Za-z]:\\Users\\[^\\]+\\/g },
  { label: "Codex temporary artifact", pattern: /codex-desktop|\.codex\/generated_images/g },
];

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (excludedDirectories.has(entry.name)) return [];
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(absolute);
    if (!entry.isFile() || excludedFiles.has(entry.name) || !textExtensions.has(path.extname(entry.name))) return [];
    if (statSync(absolute).size > 2_000_000) return [];
    return [absolute];
  });
}

const findings = [];
for (const file of collectFiles(root)) {
  const content = readFileSync(file, "utf8");
  for (const { label, pattern } of personalReferencePatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) findings.push(`${path.relative(root, file)}: ${label}`);
  }
}

if (findings.length) throw new Error(`Repository hygiene check failed:\n${findings.map((finding) => `- ${finding}`).join("\n")}`);
console.log("Repository community files and personal-reference checks passed.");
