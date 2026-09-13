import {
  envVars,
  prisma
} from "./chunk-AQ3QEWOG.js";

// src/modules/notification/notification.gateway.ts
import { createHash } from "crypto";

// src/utils/jwt.ts
import jwt from "jsonwebtoken";
var createToken = (payload, secret, { expiresIn }) => {
  const token = jwt.sign(payload, secret, { expiresIn });
  return token;
};
var vefifyToken = (token, secret) => {
  try {
    const decoded = jwt.verify(token, secret);
    return {
      success: true,
      data: decoded
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
      error
    };
  }
};
var decodedToken = (token) => {
  const decodedToken2 = jwt.decode(token);
  return decodedToken2;
};
var jwtUtils = {
  createToken,
  vefifyToken,
  decodedToken
};

// src/modules/notification/notification.gateway.ts
var clients = /* @__PURE__ */ new Map();
var heartbeat = null;
var allowedOrigins = new Set(
  [envVars.FRONTEND_URL, "http://localhost:3000"].filter(Boolean)
);
var parseCookies = (header) => Object.fromEntries(
  (header ?? "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return index === -1 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  })
);
var websocketFrame = (opcode, payload = Buffer.alloc(0)) => {
  const length = payload.length;
  let header;
  if (length < 126) {
    header = Buffer.from([128 | opcode, length]);
  } else if (length <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 128 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 128 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, Buffer.from(payload)]);
};
var send = (socket, event) => {
  if (socket.destroyed || !socket.writable) return;
  socket.write(websocketFrame(1, Buffer.from(JSON.stringify(event), "utf8")));
};
var rejectUpgrade = (socket, code, message) => {
  socket.end(
    `HTTP/1.1 ${code} ${message}\r
Connection: close\r
Content-Type: text/plain\r
\r
${message}`
  );
};
var acceptUpgrade = (socket, key) => {
  const accept = createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  socket.write(
    `HTTP/1.1 101 Switching Protocols\r
Upgrade: websocket\r
Connection: Upgrade\r
Sec-WebSocket-Accept: ${accept}\r
\r
`
  );
};
var handleClientFrame = (socket, buffer) => {
  if (buffer.length < 2) return;
  const opcode = buffer[0] & 15;
  const masked = Boolean(buffer[1] & 128);
  let length = buffer[1] & 127;
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
      payload[i] = payload[i] ^ mask[i % 4];
    }
  }
  if (opcode === 8) {
    socket.end(websocketFrame(8));
  } else if (opcode === 9) {
    socket.write(websocketFrame(10, payload));
  } else if (opcode === 10) {
    const context = clients.get(socket);
    if (context) context.alive = true;
  }
};
var authenticate = async (request) => {
  const token = parseCookies(request.headers.cookie).accessToken;
  if (!token) return null;
  const verified = jwtUtils.vefifyToken(token, envVars.ACCESS_TOKEN_SECRET);
  if (!verified.success || !verified.data) return null;
  const userId = String(verified.data.userId ?? "");
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true }
  });
  if (!user?.isActive) return null;
  return { userId: user.id, role: user.role };
};
var onUpgrade = async (request, socket, head) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname !== "/ws/notifications") return;
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.has(origin) && !/^https:\/\/.*\.vercel\.app$/.test(origin)) {
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
  socket.on(
    "data",
    (chunk) => handleClientFrame(
      socket,
      Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(String(chunk))
    )
  );
  socket.on("close", () => clients.delete(socket));
  socket.on("end", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
  if (head.length > 0) handleClientFrame(socket, head);
  send(socket, { event: "connection.ready", data: { role: identity.role } });
};
var notificationGateway = {
  attach(server) {
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
        if (socket.writable) socket.write(websocketFrame(9));
      }
    }, 3e4);
    heartbeat.unref();
  },
  toUser(userId, event) {
    for (const [socket, context] of clients) {
      if (context.userId === userId) send(socket, event);
    }
  },
  toRole(role, event) {
    for (const [socket, context] of clients) {
      if (context.role === role) send(socket, event);
    }
  },
  connectionCount() {
    return clients.size;
  },
  close() {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    for (const socket of clients.keys()) socket.destroy();
    clients.clear();
  }
};

export {
  jwtUtils,
  notificationGateway
};
