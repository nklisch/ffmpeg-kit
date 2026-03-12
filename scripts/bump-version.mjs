#!/usr/bin/env node
/**
 * Usage: node scripts/bump-version.mjs <patch|minor|major|x.y.z>
 *
 * Bumps version in package.json, commits, tags, and pushes.
 * The CI publish job fires automatically on the pushed tag.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const pkgPath = resolve(root, "package.json");

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node scripts/bump-version.mjs <patch|minor|major|x.y.z>");
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const [major, minor, patch] = pkg.version.split(".").map(Number);

let next;
if (arg === "patch") {
  next = `${major}.${minor}.${patch + 1}`;
} else if (arg === "minor") {
  next = `${major}.${minor + 1}.0`;
} else if (arg === "major") {
  next = `${major + 1}.0.0`;
} else if (/^\d+\.\d+\.\d+$/.test(arg)) {
  next = arg;
} else {
  console.error(`Unknown version argument: ${arg}`);
  process.exit(1);
}

console.log(`${pkg.version} → ${next}`);

pkg.version = next;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log("  updated package.json");

const tag = `v${next}`;
const run = (cmd) => execSync(cmd, { stdio: "inherit", cwd: root });

run(`git commit -am "Release ${tag}"`);
run(`git tag ${tag}`);
run("git push");
run(`git push origin ${tag}`);
console.log(`\nReleased ${tag} — CI will publish to npm.`);
