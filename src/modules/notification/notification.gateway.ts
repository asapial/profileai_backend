import { createHash } from "node:crypto";
import type { Server as HttpServer, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { envVars } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { jwtUtils } from "../../utils/jwt";

type Role = "ADMIN" | "USER";
type ClientContext = { userId: string; role: Role; alive: boolean };

export type RealtimeEvent =
  | {
      event: "notification.created";
      data: Record<string, unknown>;
    }
  | {
      event: "notification.changed";
      data: { id?: string; unreadCount?: number };
    }
  | {
      event: "connection.ready";
      data: { role: Role };
    };

const clients = new Map<Duplex, ClientContext>();
let heartbeat: NodeJS.Timeout | null = null;

const allowedOrigins = new Set(
  [envVars.FRONTEND_URL, "http://localhost:3000"].filter(Boolean),
);

const parseCookies = (header?: string): Record<string, string> =>
  Object.fromEntries(
    (header ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1
          ? [part, ""]
          : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );

const websocketFrame = (
  opcode: number,
  payload: Uint8Array = Buffer.alloc(0),
): Buffer => {
  const length = payload.length;
  let header: Buffer;
  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length]);
  } else if (length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, Buffer.from(payload)]);
};

const send = (socket: Duplex, event: RealtimeEvent): void => {
  if (socket.destroyed || !socket.writable) return;
  socket.write(websocketFrame(0x1, Buffer.from(JSON.stringify(event), "utf8")));
};

const rejectUpgrade = (socket: Duplex, code: number, message: string): void => {
  socket.end(
    `HTTP/1.1 ${code} ${message}\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\n${message}`,
  );
};

const acceptUpgrade = (socket: Duplex, key: string): void => {
  const accept = createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
};

const handleClientFrame = (socket: Duplex, buffer: Buffer): void => {
  if (buffer.length < 2) return;
  const opcode = buffer[0]! & 0x0f;
  const masked = Boolean(buffer[1]! & 0x80);
  let length = buffer[1]! & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < 4) return;
    length = buffer.readUInt16BE(2);
    offset = 4;
  } else if (length === 127) {
    if (buffer.length < 10) return;
    const largeLength = buffer.readBigUInt64BE(2);
    if (largeLength > BigInt(Number.MAX_SAFE_INTEGER)) return;
    length = Number(largeLength);
    offset = 10;
  }

  let payload = buffer.subarray(offset + (masked ? 4 : 0), offset + (masked ? 4 : 0) + length);
  if (masked) {
    const mask = buffer.subarray(offset, offset + 4);
    payload = Buffer.from(payload);
    for (let i = 0; i < payload.length; i += 1) {
      payload[i] = payload[i]! ^ mask[i % 4]!;
    }
  }

  if (opcode === 0x8) {
    socket.end(websocketFrame(0x8));
  } else if (opcode === 0x9) {
    socket.write(websocketFrame(0x0a, payload));
  } else if (opcode === 0x0a) {
    const context = clients.get(socket);
    if (context) context.alive = true;
  }
};

const authenticate = async (
  request: IncomingMessage,
): Promise<{ userId: string; role: Role } | null> => {
  const token = parseCookies(request.headers.cookie).accessToken;
  if (!token) return null;
  const verified = jwtUtils.vefifyToken(token, envVars.ACCESS_TOKEN_SECRET);
  if (!verified.success || !verified.data) return null;
  const userId = String((verified.data as { userId?: unknown }).userId ?? "");
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true },
  });
  if (!user?.isActive) return null;
  return { userId: user.id, role: user.role as Role };
};

const onUpgrade = async (
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): Promise<void> => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname !== "/ws/notifications") return;

  const origin = request.headers.origin;
  if (
    origin &&
    !allowedOrigins.has(origin) &&
    !/^https:\/\/.*\.vercel\.app$/.test(origin)
  ) {
    rejectUpgrade(socket, 403, "Forbidden");
    return;
  }
  if (request.headers.upgrade?.toLowerCase() !== "websocket") {
    rejectUpgrade(socket, 400, "Bad Request");
    return;
  }
  const key = request.headers["sec-websocket-key"];
  if (typeof key !== "string") {
    rejectUpgrade(socket, 400, "Bad Request");
    return;
  }

  const identity = await authenticate(request);
  if (!identity) {
    rejectUpgrade(socket, 401, "Unauthorized");
    return;
  }

  acceptUpgrade(socket, key);
  clients.set(socket, { ...identity, alive: true });
  if ("setNoDelay" in socket && typeof socket.setNoDelay === "function") {
    socket.setNoDelay(true);
  }
  socket.on("data", (chunk) =>
    handleClientFrame(
      socket,
      Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(String(chunk)),
    ),
  );
  socket.on("close", () => clients.delete(socket));
  socket.on("end", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
  if (head.length > 0) handleClientFrame(socket, head);
  send(socket, { event: "connection.ready", data: { role: identity.role } });
};

export const notificationGateway = {
  attach(server: HttpServer): void {
    server.on("upgrade", (request, socket, head) => {
      void onUpgrade(request, socket, head).catch(() => {
        if (!socket.destroyed) rejectUpgrade(socket, 500, "Internal Server Error");
      });
    });

    heartbeat ??= setInterval(() => {
      for (const [socket, context] of clients) {
        if (!context.alive) {
          clients.delete(socket);
          socket.destroy();
          continue;
        }
        context.alive = false;
        if (socket.writable) socket.write(websocketFrame(0x9));
      }
    }, 30_000);
    heartbeat.unref();
  },

  toUser(userId: string, event: RealtimeEvent): void {
    for (const [socket, context] of clients) {
      if (context.userId === userId) send(socket, event);
    }
  },

  toRole(role: Role, event: RealtimeEvent): void {
    for (const [socket, context] of clients) {
      if (context.role === role) send(socket, event);
    }
  },

  connectionCount(): number {
    return clients.size;
  },

  close(): void {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    for (const socket of clients.keys()) socket.destroy();
    clients.clear();
  },
};
