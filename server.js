import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import cors from "cors";
import routes from "./routes/index.js";

const app = express();

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://support-manager-react-app.s3.eu-west-2.amazonaws.com",
    "http://support-manager-react-app.s3-website.eu-west-2.amazonaws.com/",
    "https://d1v0xbkzql66b4.cloudfront.net",
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(express.json({ limit: "1mb" }));
app.use(cors(corsOptions));
app.use(rateLimit({ windowMs: 60_000, max: 30 }));

app.use("/", routes);

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`API is running on port ${PORT}`);
});
