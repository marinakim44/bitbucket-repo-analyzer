#!/usr/bin/env node

import { runAnalyzer } from "../lib/runner.js";

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(
    "Usage: bitbucket-repo-analyzer check <check-name> --org=<bitbucket-org>"
  );
  process.exit(1);
}

const command = args[0];
const checkName = args[1];
const orgArg = args.find((arg) => arg.startsWith("--org="));
const org = orgArg?.split("=")[1];
const reposArg = args.find((arg) => arg.startsWith("--repos="));
const reposFilter = reposArg?.split("=")[1]?.split(",") ?? null;
const reposFile = args
  .find((arg) => arg.startsWith("--reposFile="))
  ?.split("=")[1];
const deepScan = args.includes("--deep");
let keyword = null;
if (checkName === "keyword") {
  keyword = args.find((arg) => arg.startsWith("--keyword="))?.split("=")[1];
  if (!keyword && args[2] && !args[2].startsWith("--")) {
    keyword = args[2]; // fallback if user writes: check keyword apilayer
  }
}

if (command === "check") {
  if (!checkName || !org) {
    console.error("❌ Missing check name or org.");
    process.exit(1);
  }
  await runAnalyzer(checkName, org, reposFilter, {
    deepScan,
    reposFile,
    keyword,
  });
} else if (command === "count") {
  if (!org) {
    console.error("❌ Please provide a Bitbucket org using --org=<org-name>.");
    process.exit(1);
  }

  const { getRepositories } = await import("../lib/bitbucket.js");
  const repos = await getRepositories(org);
  console.log(`📦 Total repositories in "${org}": ${repos.length}`);
} else {
  console.log(`Unknown command: ${command}`);
}
