import "dotenv/config";
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { runPreMaintenanceCheck } from "./lib/checks/pre-maintenance.js"; // ensure this path is correct

const region = process.env.AWS_REGION || "eu-west-2";
const queueUrl = process.env.AWS_QUEUE_URL; // required
const tableName = "PreMaintenanceJobs";

if (!queueUrl) {
  console.error("Missing AWS_QUEUE_URL env var");
  process.exit(1);
}

const sqs = new SQSClient({ region });
const ddbRaw = new DynamoDBClient({ region });
const ddb = DynamoDBDocumentClient.from(ddbRaw);

async function updateJobStatus(jobId, jobStatus, progress, results) {
  const params = {
    TableName: tableName,
    Key: { JobId: jobId },
    UpdateExpression:
      "SET #s = :s, Progress = :p" +
      (results !== undefined ? ", Results = :r" : ""),
    ExpressionAttributeNames: { "#s": "Status" },
    ExpressionAttributeValues: {
      ":s": jobStatus,
      ":p": progress,
      ...(results !== undefined && { ":r": results }),
    },
  };
  await ddb.send(new UpdateCommand(params));
}

// poll messages from SQS
async function poll() {
  console.log("Worker started, polling for messages...");
  const res = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 20,
      VisibilityTimeout: 3600,
    })
  );

  if (res.Messages && res.Messages.length > 0) {
    const msg = res.Messages[0];
    const { jobId, projects } = JSON.parse(msg.Body);

    try {
      // Mark in-progress
      await updateJobStatus(jobId, "IN_PROGRESS", 0);

      const results = [];
      for (let i = 0; i < projects.length; i++) {
        const { repoSlug, branch } = projects[i];
        const repo = {
          slug: repoSlug,
          links: {
            clone: [
              {
                name: "https",
                href: `https://bitbucket.org/dogfish/${repoSlug}.git`,
              },
            ],
          },
        };

        try {
          const output = await runPreMaintenanceCheck(repo, { branch });
          results.push({ repoSlug, branch, status: "ok", output });
        } catch (err) {
          results.push({
            repoSlug,
            branch,
            status: "error",
            error: err.message || String(err),
          });
        }

        // Update progress
        await updateJobStatus(jobId, "IN_PROGRESS", i + 1);
      }

      // Final success update
      await updateJobStatus(jobId, "COMPLETED", projects.length, results);
    } catch (err) {
      console.error("Job failed:", err);
      await updateJobStatus(jobId, "FAILED", 0, { error: err.message });
    }

    // Delete the message
    await sqs.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: msg.ReceiptHandle,
      })
    );
  }

  // Continue polling
  setImmediate(poll);
}

poll().catch(console.error);
