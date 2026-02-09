import https from "https";

export default function fetchJson(url) {
  return new Promise((res, rej) => {
    https
      .get(url, { headers: { "User-Agent": "repo-analyzer" } }, (r) => {
        if (r.statusCode >= 400) return rej(new Error(`HTTP ${r.statusCode}`));
        let buf = "";
        r.on("data", (c) => (buf += c));
        r.on("end", () => res(JSON.parse(buf)));
      })
      .on("error", rej);
  });
}