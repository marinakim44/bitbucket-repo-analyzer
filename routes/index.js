// routes/index.js
import { Router } from "express";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { requireCognitoAuth } from "../middleware/cognitoJwtMiddleware.js";

const router = Router();

const region = process.env.AWS_REGION;
const queueUrl = process.env.AWS_QUEUE_URL;
const tableName = "PreMaintenanceJobs";
const sqs = new SQSClient({ region });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

const JOB_STATUSES = {
  inprogress: "IN_PROGRESS",
  completed: "COMPLETED",
  pending: "PENDING",
};

router.post("/pre-maintenance", requireCognitoAuth, async (req, res) => {
  const projects = Array.isArray(req.body?.projects) ? req.body.projects : [];
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
        NumberOfProjects: projects.length,
      },
    }),
  );
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({ jobId, projects }),
    }),
  );
  res.status(202).json({ jobId });
});

router.get("/jobs/status/:status", requireCognitoAuth, async (req, res) => {
  const requested = req.params.status;
  const status = JOB_STATUSES[requested];
  if (!status) {
    return res.status(400).json({ error: "Invalid status" });
  }
  try {
    const baseParams = {
      TableName: tableName,
      FilterExpression: "#st = :st",
      ExpressionAttributeNames: { "#st": "Status" },
      ExpressionAttributeValues: { ":st": status },
    };
    const { Items = [] } = await ddb.send(new ScanCommand(baseParams));
    if (!Items.length) {
      return res.status(404).json({ error: `No job with status ${status}` });
    }
    let job = Items[0];
    if (requested === "completed" && Items.length > 1) {
      job = Items.sort(
        (a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt),
      )[0];
    }
    const payload = {
      jobId: job.JobId,
      status: job.Status,
      progress: Number(job.Progress),
      numberOfProjects: Number(job.NumberOfProjects),
      createdAt: job.CreatedAt,
      results: job.Results || [],
    };
    if (requested === "completed") {
      payload.allCompletedJobs = Items;
    }
    res.json(payload);
  } catch (err) {
    console.error("Error fetching jobs:", err);
    res
      .status(err.statusCode || 500)
      .json({ error: err.message || "Could not fetch jobs" });
  }
});

router.get("/jobs/:jobId", requireCognitoAuth, async (req, res) => {
  try {
    const { Item } = await ddb.send(
      new GetCommand({
        TableName: tableName,
        Key: { JobId: req.params.jobId },
      }),
    );
    if (!Item) {
      return res.status(404).json({ error: "Job not found" });
    }
    const { Status, Progress, Results, CreatedAt } = Item;
    res.json({
      jobId: Item.JobId,
      status: Status,
      progress: Number(Progress),
      results: Results || [],
      createdAt: CreatedAt,
    });
  } catch (err) {
    console.error("Error fetching job", err);
    res
      .status(err.statusCode || 500)
      .json({ error: err.message || "Could not fetch job status" });
  }
});

export default router;
