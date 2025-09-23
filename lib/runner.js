import { getRepositories } from "./bitbucket.js";
import { checkAwsSdk } from "./checks/aws-sdk.js";
import { checkReactVersion } from "./checks/react-version.js";
import logUpdate from "log-update";
import pLimit from "p-limit";
import fs from "fs";
import { checkKeyword } from "./checks/keyword.js";
import { checkReactNativeVersion } from "./checks/react-native-version.js";
import { checkSecrets } from "./checks/secrets.js";
import { runPreMaintenanceCheck } from "./checks/pre-maintenance.js";

const limit = pLimit(5);

const checks = {
  "aws-sdk": checkAwsSdk,
  "react-version": checkReactVersion,
  "react-native-version": checkReactNativeVersion,
  keyword: checkKeyword,
  secrets: checkSecrets,
  "pre-maintenance": runPreMaintenanceCheck,
};

export async function runAnalyzer(
  checkName, // see above "checks" - available types of checks
  org, // dogfish
  reposFilter = null, // if you don't use a filter, all repos in org will be analysed
  options = {} // various check specific options
) {
  const checkFn = checks[checkName];
  if (!checkFn) {
    console.error(`Unknown check: ${checkName}`);
    return;
  }

  console.log(`Checking "${checkName}" check for org "${org}"...`);

  let repos = await getRepositories(org);
  console.log(`Found ${repos.length} repositories in "${org}"`);

  // Load reposFilter from file if not provided directly
  if (!reposFilter && options.reposFile) {
    const fileContent = fs.readFileSync(options.reposFile, "utf8");
    reposFilter = fileContent
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  if (reposFilter) {
    repos = repos.filter((r) => reposFilter.includes(r.slug));
    console.log(`Filtering to ${repos.length} specific repos...`);
  }

  if (options.reposFile) {
    const fileContent = fs.readFileSync(options.reposFile, "utf8");
    reposFilter = fileContent
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  if (!repos.length) {
    console.log("No repositories found");
    return;
  }

  const results = [];
  const total = repos.length;
  let completed = 0;

  await Promise.all(
    repos.map((repo) =>
      limit(async () => {
        const result = await checkFn(repo, options);
        completed++;

        if (result) {
          results.push(result);
        }

        const progressBar = generateProgressBar(completed, total);
        logUpdate(`${progressBar} ${completed}/${total} Repos`);
      })
    )
  );

  logUpdate.done();

  let summaryLines = [];

  if (checkName === "aws-sdk") {
    console.log("Analyzing AWS SDK version...", results);
    const awsSummary = {
      total: results.length,
      v2: 0,
      v3: 0,
      mixed: 0,
      none: 0,
    };

    for (const r of results) {
      if (!r) continue;

      if (r.usesV2 && r.usesV3) awsSummary.mixed++;
      else if (r.usesV2) awsSummary.v2++;
      else if (r.usesV3) awsSummary.v3++;
      else awsSummary.none++;
    }

    summaryLines = [
      `AWS SDK Version Summary:`,
      `• Total repos analyzed: ${awsSummary.total}`,
      `• AWS SDK v2 only: ${awsSummary.v2}`,
      `• AWS SDK v3 only: ${awsSummary.v3}`,
      `• Mixed v2 + v3 usage: ${awsSummary.mixed}`,
      `• Not using AWS SDK: ${awsSummary.none}`,
    ];
  } else if (checkName === "react-version") {
    const summary = {
      total: results.length,
      usingReact: 0,
      active: 0, // React 18+
      deprecated: 0, // React 17
      legacy: 0, // React 16
      unsupported: 0, // < React 16
    };

    for (const r of results) {
      if (!r || !r.reactVersion) continue;
      summary.usingReact++;

      if (r.support.includes("Active")) summary.active++;
      else if (r.support.includes("Deprecated")) summary.deprecated++;
      else if (r.support.includes("Legacy")) summary.legacy++;
      else if (r.support.includes("Unsupported")) summary.unsupported++;
    }

    summaryLines = [
      `React Version Summary:`,
      `• Total repos analyzed: ${summary.total}`,
      `• Using React: ${summary.usingReact}`,
      `• Active support (>= 18): ${summary.active}`,
      `• Deprecated (17): ${summary.deprecated}`,
      `• Legacy (16): ${summary.legacy}`,
      `• Unsupported (<16): ${summary.unsupported}`,
    ];
  } else if (checkName === "keyword") {
    const keyword = options.keyword;
    const summary = {
      total: results.length,
      matches: 0,
      noMatches: 0,
    };

    for (const r of results) {
      if (r?.matches?.length > 0) summary.matches++;
      else summary.noMatches++;
    }

    summaryLines = [
      `Keyword Search Summary:`,
      `• Total repos scanned: ${summary.total}`,
      `• Matches for "${keyword}": ${summary.matches}`,
      `• No matches: ${summary.noMatches}`,
    ];
  } else if (checkName === "react-native-version") {
    const summary = {
      total: results.length,
      active: 0,
      deprecated: 0,
      legacy: 0,
      unknown: 0,
      none: 0,
    };

    for (const r of results) {
      if (!r || !r.status) {
        summary.none++;
        continue;
      }

      if (r.status.includes("active")) summary.active++;
      else if (r.status.includes("deprecated")) summary.deprecated++;
      else if (r.status.includes("legacy")) summary.legacy++;
      else summary.unknown++;
    }

    summaryLines = [
      `React Native Version Summary:`,
      `• Total repos analyzed: ${summary.total}`,
      `• Active support (>= 0.72): ${summary.active}`,
      `• Deprecated (0.70–0.71): ${summary.deprecated}`,
      `• Legacy (<0.70): ${summary.legacy}`,
      `• Not using React Native: ${summary.none}`,
      `• Unknown versions: ${summary.unknown}`,
    ];
  } else if (checkName === "secrets") {
    const summary = {
      total: results.length,
      withSecrets: 0,
      clean: 0,
    };

    for (const r of results) {
      if (!r || typeof r === "string") {
        summary.clean++;
      } else if (r.hits?.length) {
        summary.withSecrets++;
      } else {
        summary.clean++;
      }
    }

    summaryLines = [
      `Secrets Check Summary:`,
      `• Total repos scanned: ${summary.total}`,
      `• Repos with potential secrets: ${summary.withSecrets}`,
      `• Clean repos: ${summary.clean}`,
    ];
  } else {
    summaryLines = [`Completed: ${checkName} check`];
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = `output/${checkName}-results-${timestamp}.json`;

  const output = {
    summary: summaryLines,
    results:
      checkName === "aws-sdk"
        ? results
            .filter((r) => r.usesV2 || r.usesV3)
            .map((r) => ({
              repo: r.slug,
              usesV2: r.usesV2,
              usesV3: r.usesV3,
            }))
        : results.map((r) => r.raw || r),
  };

  fs.mkdirSync("output", { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\n✅ Done! ${repos.length} repositories analyzed`);
  summaryLines.forEach((line) => console.log(line));
  console.log(`Results saved to ${outputPath}`);
}

function generateProgressBar(completed, total, length = 40) {
  const ratio = completed / total;
  const filled = Math.round(ratio * length);
  const empty = length - filled;
  return `Progress |${"█".repeat(filled)}${"░".repeat(empty)}|`;
}
