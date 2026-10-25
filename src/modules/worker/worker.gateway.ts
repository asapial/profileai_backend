import { createHash } from 'node:crypto';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { sessionFromRawAccessToken, touchWorkerDevice } from './worker.service';

type WorkerClient = {
  userId: string;
  deviceId: string;
  alive: boolean;
};

type PendingClient = {
  socket: Duplex;
  timer: NodeJS.Timeout;
  buffer: Buffer;
};

const clients = new Map<Duplex, WorkerClient>();
const pending = new Map<Duplex, PendingClient>();
let heartbeat: NodeJS.Timeout | null = null;

const websocketFrame = (opcode: number, payload: Uint8Array = Buffer.alloc(0)): Buffer => {
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

const send = (socket: Duplex, message: Record<string, unknown>): void => {
  if (socket.destroyed || !socket.writable) return;
  socket.write(websocketFrame(0x1, Buffer.from(JSON.stringify(message), 'utf8')));
};

const rejectUpgrade = (socket: Duplex, code: number, message: string): void => {
  socket.end(`HTTP/1.1 ${code} ${message}\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\n${message}`);
};

const acceptUpgrade = (socket: Duplex, key: string): void => {
  const accept = createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
};

type ParsedFrame = { opcode: number; payload: Buffer; length: number };

function parseFrame(buffer: Buffer): ParsedFrame | null {
  if (buffer.length < 2) return null;
  const opcode = buffer[0]! & 0x0f;
  const masked = Boolean(buffer[1]! & 0x80);
  let length = buffer[1]! & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < 4) return null;
    length = buffer.readUInt16BE(2);
    offset = 4;
  } else if (length === 127) {
    if (buffer.length < 10) return null;
    const large = buffer.readBigUInt64BE(2);
    if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    length = Number(large);
    offset = 10;
  }
  if (length > 64 * 1024) return null;
  const total = offset + (masked ? 4 : 0) + length;
  if (buffer.length < total) return null;
  let payload = buffer.subarray(offset + (masked ? 4 : 0), total);
  if (masked) {
    const mask = buffer.subarray(offset, offset + 4);
    payload = Buffer.from(payload);
    for (let index = 0; index < payload.length; index += 1) {
      payload[index] = payload[index]! ^ mask[index % 4]!;
    }
  }
  return { opcode, payload, length: total };
}

async function authenticatePending(client: PendingClient, payload: Buffer): Promise<void> {
  let message: { type?: string; deviceId?: unknown; token?: unknown };
  try {
    message = JSON.parse(payload.toString('utf8')) as typeof message;
  } catch {
    rejectClient(client, 'Authentication message must be JSON.');
    return;
  }
  if (message.type !== 'AUTH' || typeof message.deviceId !== 'string' || typeof message.token !== 'string') {
    rejectClient(client, 'The first worker message must authenticate the device.');
    return;
  }
  const session = await sessionFromRawAccessToken(message.token);
  if (!session || session.deviceId !== message.deviceId) {
    rejectClient(client, 'Worker WebSocket token is invalid or revoked.');
    return;
  }
  clearTimeout(client.timer);
  pending.delete(client.socket);
  const socket = client.socket;
  clients.set(socket, { userId: session.device.userId, deviceId: session.deviceId, alive: true });
  await touchWorkerDevice(session.deviceId, session.device.userId).catch(() => undefined);
  send(socket, { type: 'connection.ready', data: { deviceId: session.deviceId, protocolVersion: 1 } });
}

function rejectClient(client: PendingClient, message: string): void {
  clearTimeout(client.timer);
  pending.delete(client.socket);
  send(client.socket, { type: 'error', data: { message } });
  if (!client.socket.destroyed) client.socket.end(websocketFrame(0x8));
}

function handleFrame(client: PendingClient, frame: ParsedFrame): void {
  if (frame.opcode === 0x8) {
    client.socket.end(websocketFrame(0x8));
    return;
  }
  if (frame.opcode === 0x9) {
    client.socket.write(websocketFrame(0x0a, frame.payload));
    return;
  }
  if (frame.opcode === 0x0a) {
    client.socket.write(websocketFrame(0x0a));
    return;
  }
  if (frame.opcode !== 0x1) {
    rejectClient(client, 'The worker socket only accepts text control frames.');
    return;
  }
  void authenticatePending(client, frame.payload).catch(() => rejectClient(client, 'Worker authentication failed.'));
}

function handleAuthenticatedFrame(socket: Duplex, frame: ParsedFrame): void {
  const context = clients.get(socket);
  if (!context) return;
  if (frame.opcode === 0x8) {
    socket.end(websocketFrame(0x8));
  } else if (frame.opcode === 0x9) {
    socket.write(websocketFrame(0x0a, frame.payload));
  } else if (frame.opcode === 0x0a) {
    context.alive = true;
  }
}

const onUpgrade = async (request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname !== '/ws/worker') return;
  if (request.headers.origin) {
    // Node sidecar clients do not send Origin. Browser origins must not be
    // able to open a worker socket even if they learn an access token.
    rejectUpgrade(socket, 403, 'Forbidden');
    return;
  }
  if (request.headers.upgrade?.toLowerCase() !== 'websocket') {
    rejectUpgrade(socket, 400, 'Bad Request');
    return;
  }
  const key = request.headers['sec-websocket-key'];
  if (typeof key !== 'string') {
    rejectUpgrade(socket, 400, 'Bad Request');
    return;
  }
  acceptUpgrade(socket, key);
  if ('setNoDelay' in socket && typeof socket.setNoDelay === 'function') socket.setNoDelay(true);
  const client: PendingClient = {
    socket,
    buffer: head.length ? Buffer.from(head) : Buffer.alloc(0),
    timer: setTimeout(() => rejectClient(client, 'Worker authentication timed out.'), 10_000),
  };
  client.timer.unref?.();
  pending.set(socket, client);
  socket.on('data', chunk => {
    const current = pending.get(socket);
    if (current) {
      current.buffer = Buffer.concat([current.buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))]);
      const frame = parseFrame(current.buffer);
      if (frame) handleFrame(current, frame);
      return;
    }
    const authenticated = clients.get(socket);
    if (!authenticated) return;
    const frame = parseFrame(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    if (frame) {
      authenticated.alive = true;
      handleAuthenticatedFrame(socket, frame);
    }
  });
  const cleanup = () => {
    const current = pending.get(socket);
    if (current) clearTimeout(current.timer);
    pending.delete(socket);
    clients.delete(socket);
  };
  socket.on('close', cleanup);
  socket.on('end', cleanup);
  socket.on('error', cleanup);
  if (client.buffer.length) {
    const frame = parseFrame(client.buffer);
    if (frame) handleFrame(client, frame);
  }
};

export const workerGateway = {
  attach(server: HttpServer): void {
    server.on('upgrade', (request, socket, head) => {
      void onUpgrade(request, socket, head).catch(() => {
        if (!socket.destroyed) rejectUpgrade(socket, 500, 'Internal Server Error');
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

  sendTaskAvailable(deviceId: string, task: unknown): void {
    for (const [socket, context] of clients) {
      if (context.deviceId === deviceId) send(socket, { type: 'task.available', data: { task } });
    }
  },

  sendApprovalDecision(deviceId: string, approvalId: string, decision: 'APPROVED' | 'REJECTED' | 'TAKEOVER', actor: string): void {
    for (const [socket, context] of clients) {
      if (context.deviceId === deviceId) send(socket, { type: 'approval.decision', data: { approvalId, decision, actor } });
    }
  },

  sendControl(deviceId: string, taskId: string, action: 'pause' | 'resume' | 'stop' | 'takeover' | 'handback'): void {
    for (const [socket, context] of clients) {
      if (context.deviceId === deviceId) send(socket, { type: 'control', data: { taskId, action } });
    }
  },

  isDeviceOnline(deviceId: string): boolean {
    return [...clients.values()].some(context => context.deviceId === deviceId);
  },

  connectionCount(): number {
    return clients.size;
  },

  close(): void {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    for (const client of pending.values()) {
      clearTimeout(client.timer);
      client.socket.destroy();
    }
    pending.clear();
    for (const socket of clients.keys()) socket.destroy();
    clients.clear();
  },
};
