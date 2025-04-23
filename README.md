# 🕵️‍♀️ Bitbucket Repo Analyzer

A light and fast CLI tool to scan all Bitbucket repositories in your workspace for:

- React versions
- AWS SDK v2 vs v3 versions

Reminder: AWS SDK v2 will be deprecated and we need to switch to AWS SDK v3 by 8th of September 2025.

Perfect for speeding up monthly audits and maintenance activities.

---

## 🚀 Features

- ✅ Scan all Bitbucket repos in a workspace
- ✅ Detect usage of:
  - AWS SDK v2 (`aws-sdk`) and v3 (`@aws-sdk/*`)
  - React versions (18+, 17, 16, <16)
- ✅ Classify React support lifecycle (Active, Deprecated, Legacy, Unsupported)
- ✅ Works with monorepos + nested `package.json` via `--deep` flag
- ✅ Supports repo filtering via `--repos` or `--reposFile`
- ✅ Concurrency + progress bar + limiting to latest commit = fast scans
- ✅ Output results to JSON for reporting
- ✅ Npx or global CLI use

---

## Set Environmental Variables

Set env vars in the terminal:
export BITBUCKET_USERNAME=your-username
export BITBUCKET_APP_PASSWORD=your-password

It's also possible to prefix the command with env vars:
`BITBUCKET_USERNAME=username BITBUCKET_APP_PASSWORD=password npx bitbucket-repo-analyzer count --org=org-name`

## 📦 Installation

Install globally:

```bash
npm install -g bitbucket-repo-analyzer
```

## Use without installation

You can execute it directly without installing.
```bash
npx bitbucket-repo-analyzer count --org=org-name
```

## Usage

### Check AWS SDK version across all repos:

```bash
bitbucket-repo-analyzer check aws-sdk --org=my-org
```

### Check React version across all repos:

```bash
bitbucket-repo-analyzer check react-version --org=my-org
```

### Scan specific repos:

Specify repos in a command:
```bash
bitbucket-repo-analyzer check aws-sdk --org=my-org --repos=repo-one,repo-two
```

Specify repos in a .txt file:
```bash
bitbucket-repo-analyzer check aws-sdk --org=my-org --reposFile=repos.txt
```


### Enable deep scan mode (look for package.json in nested folders)

```bash
bitbucket-repo-analyzer check aws-sdk --org=my-org --deep
```

### Count how many repos you have in Bitbucket

```bash
bitbucket-repo-analyzer count --org=my-org
```

## Output

A .json file is saved to the output/ folder automatically.
Example:

## 📊 React Usage Summary

### Summary:

- **Total repos analyzed:** 50
- **Using React:** 38
  - **Active support (>= 18):** 22
  - **Deprecated (17):** 8
  - **Legacy (16):** 6
  - **Unsupported (<16):** 2

### Results:

- 🔎 **repo-a:** react: `^18.2.0` | support: **Active**
- 🔎 **repo-b:** react: `^17.0.2` | ❌ outdated | support: **Deprecated**
- ❌ **repo-c:** is not using React

## Roadmap

- Check outdated npm packages and vulnerabilities
- Detect secrets: .env, .pem, hardcoded tokens
- Dockerfile best practice checker
- React Native version check
- Markdown / CSV output support
- GitHub / GitLab support

## Author

Built by Marina Kim  
GitHub: [@marinakim44](https://github.com/marinakim44)  
Founder of [CatBytes Community for Women in Tech](https://www.catbytes.io)

## License

MIT — use it, fork it, make it yours.
