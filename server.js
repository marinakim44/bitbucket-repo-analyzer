import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

const region = process.env.AWS_REGION;
const queueUrl = process.env.AWS_QUEUE_URL;
const tableName = "PreMaintenanceJobs";

const sqs = new SQSClient({ region });
const ddbRaw = new DynamoDBClient({ region });
const ddb = DynamoDBDocumentClient.from(ddbRaw);

const app = express();

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://support-manager-react-app.s3.eu-west-2.amazonaws.com",
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.options(
  "/pre-maintenance",
  cors({
    origin: [
      "http://localhost:5173",
      "https://support-manager-react-app.s3.eu-west-2.amazonaws.com",
    ],
    methods: ["POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(rateLimit({ windowMs: 60_000, max: 30 }));

// simple API auth
app.use((req, res, next) => {
  const apiToken = process.env.API_TOKEN;
  if (!apiToken) return next();

  const receivedToken = (req.headers.authorization || "").replace(
    /^Bearer /,
    ""
  );
  if (apiToken !== receivedToken)
    return res.status(401).json({ error: "Unauthorized" });
  next();
});

// run pre-maintenance for all projects
app.post("/pre-maintenance", async (req, res) => {
  console.log("pre maintenance was triggered")
  const projects = Array.isArray(req.body?.projects) ? req.body.projects : [];
  console.log("projects", projects);
  if (!projects.length) {
    return res
      .status(400)
      .json({ error: "Provide projects: [{ repoSlug, branch? }]" });
  }

  const jobId = uuidv4();

  await ddb.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        JobId: jobId,
        Status: "PENDING",
        CreatedAt: new Date().toISOString(),
        Progress: 0,
      },
    })
  );

  await sqs.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({ jobId, projects }),
    })
  );

  res.status(202).json({ jobId });
});

app.get("/jobs/:jobId", async (req, res) => {
  const jobId = req.params.jobId;
  try {
    const { Item } = await ddb.send(new GetCommand({
      TableName: tableName,
      Key: { JobId: jobId }
    }));
    if(!Item) {
      return res.status(404).json({ error: "Job not found" });
    };

    const { Status, Progress, Results, CreatedAt } = Item;
    res.json({
      jobId,
      status: Status,
      progress: Number(Progress),
      results: Results || [],
      createdAt: CreatedAt
    });
  } catch(err) {
    console.error("Error fetching job", err);
    res.status(err.statusCode || 500).json({ error: err.message || "Could not fetch job status" })
  }
})

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`API is running on port ${PORT}`);
});
