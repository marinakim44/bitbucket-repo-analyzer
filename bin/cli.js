#!/usr/bin/env node

import { runAnalyzer } from "../lib/runner.js";
import fs from "fs";

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(
    "Usage example: bitbucket-repo-analyzer check <check-name> --org=<bitbucket-org>"
  );
  process.exit(1);
}

const command = args[0];
const checkName = args[1];
const orgArg = args.find((arg) => arg.startsWith("--org="));
const org = orgArg?.split("=")[1];
const reposArg = args.find((arg) => arg.startsWith("--repos="));
let reposFilter = reposArg?.split("=")[1]?.split(",") ?? null;
const reposFile = args
  .find((arg) => arg.startsWith("--reposFile="))
  ?.split("=")[1] ?? null;
const branchMap = {};
if(reposFile) {
  const lines = fs.readFileSync(reposFile, "utf8")
    .trim()
    .split(/\r?\n/)
  // csv should have columns: repo,branch
  reposFilter = [];
  for(let i = 1; i < lines.length; i++) {
    const [repo, branch] = lines[i].split(",").map(s => s.trim());
    if(!repo) continue;
    reposFilter.push(repo);
    if(branch) branchMap[repo] = branch;
  }
}

const deepScan = args.includes("--deep");
const branchArg = args.find((arg) => arg.startsWith("--branch="));
const branch = branchArg?.split("=")[1] ?? null;
let keyword = null;
if (checkName === "keyword") {
  keyword = args.find((arg) => arg.startsWith("--keyword="))?.split("=")[1];
  if (!keyword && args[2] && !args[2].startsWith("--")) {
    keyword = args[2]; // fallback if user writes: check keyword apilayer
  }
}

if (command === "check") {
  if (!checkName || !org) {
    console.error("Please provide check name and org");
    process.exit(1);
  }

  await runAnalyzer(checkName, org, reposFilter, {
    deepScan,
    reposFile,
    keyword,
    branch,
    branchMap
  });
} else if (command === "count") {
  if (!org) {
    console.error("Please provide a Bitbucket org using --org=<org-name>.");
    process.exit(1);
  }

  const { getRepositories } = await import("../lib/bitbucket.js");
  const repos = await getRepositories(org);
  console.log(`Total repositories in "${org}": ${repos.length}`);
} else {
  console.log(`Unknown command: ${command}`);
}
