import path from "path";
import fs from "fs";
import { execSync } from "child_process";

export function writeNpmrcOverrides(repoPath, scopes) {
  // Force these scopes to resolve against the public npm registry (no auth)
  const lines = scopes.map((s) => `${s}:registry=https://registry.npmjs.org/`);
  const npmrcPath = path.join(repoPath, ".npmrc");
  try {
    const existing = fs.existsSync(npmrcPath)
      ? fs.readFileSync(npmrcPath, "utf8")
      : "";
    const merged =
      [existing.trim(), ...lines].filter(Boolean).join("\n") + "\n";
    fs.writeFileSync(npmrcPath, merged);
  } catch (e) {
    console.warn("Failed writing .npmrc overrides:", e.message);
  }
}

export function stripPrivateDeps(repoPath, scopes) {
  const pkgPath = path.join(repoPath, "package.json");
  if (!fs.existsSync(pkgPath)) return { removed: [] };

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const sections = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ];
  const removed = [];

  for (const sec of sections) {
    if (!pkg[sec]) continue;
    for (const name of Object.keys(pkg[sec])) {
      if (scopes.some((scope) => name.startsWith(`${scope}/`))) {
        removed.push(`${name}@${pkg[sec][name]}`);
        delete pkg[sec][name];
      }
    }
    // clean up empty objects so npm doesn't complain
    if (pkg[sec] && Object.keys(pkg[sec]).length === 0) delete pkg[sec];
  }

  if (removed.length) {
    // keep a backup
    fs.writeFileSync(pkgPath + ".bak", fs.readFileSync(pkgPath, "utf8"));
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    // nuke lockfile & node_modules so resolution doesn't point to removed pkgs
    const lockPath = path.join(repoPath, "package-lock.json");
    if (fs.existsSync(lockPath)) fs.rmSync(lockPath, { force: true });
    const nmPath = path.join(repoPath, "node_modules");
    if (fs.existsSync(nmPath))
      fs.rmSync(nmPath, { recursive: true, force: true });
  }

  return { removed };
}

export const runNpmOutdated = async (repoPath) => {
  console.log("running npm outdated...");
  try {
    const out = execSync("npm outdated --json", {
      cwd: repoPath,
      stdio: ["ignore", "pipe", "pipe"],
    }).toString();
    return JSON.parse(out);
  } catch (err) {
    // exit code 1 = outdated deps found (expected)
    if (err.status === 1 && err.stdout) {
      return JSON.parse(err.stdout.toString());
    }
    console.error("npm outdated failed:", err.message);
    return {};
  }
};

export const runNpmAudit = async (repoPath) => {
  console.log("running npm audit (including dev deps)...");
  try {
    // NB: no --omit=dev so we get dev‐dep vulns too
    const out = execSync("npm audit --json", {
      cwd: repoPath,
      stdio: ["ignore", "pipe", "pipe"],
    }).toString();
    return JSON.parse(out);
  } catch (err) {
    // exit code 1 means vulnerabilities were found; stdout holds the JSON
    if (err.status === 1 && err.stdout) {
      return JSON.parse(err.stdout.toString());
    }
    // anything else is unexpected err
    console.error("npm audit failed unexpectedly:", err.message);
    return { vulnerabilities: {}, metadata: {} };
  }
};
