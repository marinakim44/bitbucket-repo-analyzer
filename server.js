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
