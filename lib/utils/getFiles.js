import fs from "fs";
import path from "path";

export default function getFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".git") {
      getFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}