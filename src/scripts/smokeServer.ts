import { createServer } from "node:http";
import { connect } from "node:net";
import app from "../app";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { notificationGateway } from "../modules/notification/notification.gateway";
import { exportQueue, exportWorker } from "../utils/exportQueue";
import {
  schedulerQueue,
  schedulerWorker,
} from "../utils/scheduler";

const websocketUnauthorizedStatus = (port: number) =>
  new Promise<string>((resolve, reject) => {
    const socket = connect({ host: "127.0.0.1", port }, () => {
      socket.write(
        [
          "GET /ws/notifications HTTP/1.1",
          `Host: 127.0.0.1:${port}`,
          "Connection: Upgrade",
          "Upgrade: websocket",
          "Sec-WebSocket-Version: 13",
          "Sec-WebSocket-Key: c21va2UtdGVzdC1rZXk=",
          "Origin: http://localhost:3000",
          "",
          "",
        ].join("\r\n"),
      );
    });
    socket.setEncoding("utf8");
    socket.once("data", (data) => {
      resolve(String(data).split("\r\n")[0] ?? "");
      socket.destroy();
    });
    socket.once("error", reject);
  });

const run = async () => {
  const server = createServer(app);
  notificationGateway.attach(server);
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", resolve),
  );
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Smoke server did not expose a TCP port.");
  }

  const base = `http://127.0.0.1:${address.port}`;
  const [homepageResponse, privacyResponse, websocketStatus] =
    await Promise.all([
      fetch(`${base}/api/v1/content/homepage`),
      fetch(`${base}/api/v1/content/pages/privacy`),
      websocketUnauthorizedStatus(address.port),
    ]);
  const homepage = (await homepageResponse.json()) as {
    success: boolean;
    data: { sections: unknown[] };
  };
  const privacy = (await privacyResponse.json()) as {
    success: boolean;
    data: { title: string };
  };

  process.stdout.write(
    `${JSON.stringify(
      {
        homepageStatus: homepageResponse.status,
        homepageSuccess: homepage.success,
        homepageSections: homepage.data.sections.length,
        privacyStatus: privacyResponse.status,
        privacyTitle: privacy.data.title,
        websocketUnauthorizedStatus: websocketStatus,
      },
      null,
      2,
    )}\n`,
  );
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
};

run()
  .catch((error) => {
    process.stderr.write(
      `[smoke] ${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([
      exportWorker.close(),
      exportQueue.close(),
      schedulerWorker.close(),
      schedulerQueue.close(),
    ]);
    if (redis.status === "ready" || redis.status === "connecting") {
      await redis.quit().catch(() => redis.disconnect());
    } else if (redis.status !== "end") {
      redis.disconnect();
    }
    await prisma.$disconnect();
  });
