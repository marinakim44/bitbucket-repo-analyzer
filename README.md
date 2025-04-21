# 🕵️‍♀️ Bitbucket Repo Analyzer

A light and fast CLI tool to scan all Bitbucket repositories in your workspace for things for updated AWS SDK version. Reminder: AWS SDK v2 will be deprecated and we need to switch to AWS SDK v3 by 8th of September 2025.

Perfect for monthly audits and maintenance activities or just catching potential vulnerabilities.

---

## 🚀 Features

- ✅ Scan all Bitbucket repos in a workspace
- ✅ Detect usage of AWS SDK v2 (`aws-sdk`) or v3 (`@aws-sdk/*`)
- ✅ Works with monorepos + nested `package.json` via `--deep`
- ✅ Concurrency + progress bar = super fast scans
- ✅ Output results to JSON for reporting
- ✅ Clean CLI UX, ready for automation or casual usage

---

## 📦 Installation

```bash
npm install -g bitbucket-repo-analyzer
```

## Set Environmental Variables

export BITBUCKET_USERNAME=your-username
export BITBUCKET_APP_PASSWORD=your-password

or prefix the command with these values:
`BITBUCKET_USERNAME=username BITBUCKET_APP_PASSWORD=password npx bitbucket-repo-analyzer count --org=org-name`

## Use without installation

You can use it without installing as well.
Don't forget to prefix with env vars or set them in your terminal.
`npx bitbucket-repo-analyzer count --org=org-name`

## Usage

### Scan all repos in a workspace:

`bitbucket-repo-analyzer check aws-sdk --org=my-org`

### Scan specific repos:

`bitbucket-repo-analyzer check aws-sdk --org=my-org --repos=repo-one,repo-two`

### Enable deep scan mode (look for package.json in nested folderd)

`bitbucket-repo-analyzer check aws-sdk --org=my-org --deep`

### Count how many repos you have in Bitbucket

`bitbucket-repo-analyzer count --org=my-org`

## Output

A .json file is saved to the output/ folder automatically:
[
"🔎 repo-a: 🟢 AWS SDK v3",
"🔎 repo-b: 🟡 AWS SDK v2",
"🔎 repo-c: 🟡 AWS SDK v2 | 🟢 AWS SDK v3",
"⚠️ repo-d has no package.json",
"❌ repo-e has a broken package.json: Unexpected token ..."
]

## Roadmap

[ ] check outdated npm packages and vulnerabilities
[ ] check secrets: detect .env, .pem, hardcoded tokens
[ ] check docker: check for Dockerfile best practices
[ ] check react: detect outdated React versions
[ ] check react native: detect outdated React Native versions
[ ] Markdown / CSV output
[ ] GitHub / GitLab support

## Author

Built by Marina Kim | GitHub @marinakim44

## License

MIT — use it, fork it, make it yours.
