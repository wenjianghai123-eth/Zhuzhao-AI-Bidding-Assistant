import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const trackedFilesResult = spawnSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  {
  cwd: process.cwd(),
  encoding: "utf8",
  },
);
if (trackedFilesResult.error) {
  throw trackedFilesResult.error;
}
if (trackedFilesResult.status !== 0) {
  throw new Error("Unable to enumerate tracked files for the secret scan.");
}

const trackedFiles = trackedFilesResult.stdout
  .split("\0")
  .filter((filePath) => filePath.length > 0);
const findings: string[] = [];

const placeholderPattern = /^(?:secret|password|replace[_-]?me|change[_-]?me|example|dummy|redacted|x+|<[^>]+>|\$\{[^}]+\})$/i;
const credentialUrlPattern = /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/([^\s:/]+):([^\s@/]+)@/g;
const sensitiveAssignmentPattern = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY))\s*=\s*["']?([^\s"']+)["']?\s*$/gm;
const tokenPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
  /\bgh[opusr]_[A-Za-z0-9]{30,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
];

for (const filePath of trackedFiles) {
  if (/^\.env(?:\.|$)/.test(filePath) && filePath !== ".env.example") {
    findings.push(`${filePath}: tracked environment file`);
    continue;
  }
  if (filePath === "pnpm-lock.yaml" || filePath.endsWith(".xlsx")) {
    continue;
  }

  const content = readFileSync(filePath, "utf8");
  for (const pattern of tokenPatterns) {
    if (pattern.test(content)) {
      findings.push(`${filePath}: credential/token signature`);
    }
  }

  for (const match of content.matchAll(credentialUrlPattern)) {
    const password = match[2];
    if (password && !placeholderPattern.test(decodeURIComponent(password))) {
      findings.push(`${filePath}: database URL contains a non-placeholder password`);
    }
  }

  for (const match of content.matchAll(sensitiveAssignmentPattern)) {
    const value = match[2];
    if (value && !placeholderPattern.test(value)) {
      findings.push(`${filePath}: ${match[1]} contains a non-placeholder value`);
    }
  }
}

if (findings.length > 0) {
  throw new Error(`Secret scan failed:\n${[...new Set(findings)].join("\n")}`);
}

console.info(`Secret scan PASS (${trackedFiles.length} repository files checked).`);
