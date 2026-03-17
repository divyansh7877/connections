import fs from "node:fs/promises";
import path from "node:path";
import { DataStore } from "./data-store.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const VALIDATION_ERRORS = new Set([
  "LinkedIn URL is required.",
  "Enter a valid LinkedIn profile URL.",
  "Only LinkedIn URLs are allowed.",
  "LinkedIn profile URL must include a path.",
  "Name is required.",
  "Name must be at least 2 characters.",
  "Name must be 80 characters or fewer."
]);

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS
  });
}

function noContentResponse() {
  return new Response(null, { status: 204 });
}

function textResponse(status, message) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" }
  });
}

async function parseRequestBody(request) {
  const raw = await request.text();
  if (raw.length > 100_000) {
    throw new Error("Request body is too large.");
  }

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

async function serveFile(filePath) {
  await fs.access(filePath);
  return new Response(Bun.file(filePath));
}

function buildOrigin(request) {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/$/, "");
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    const host = request.headers.get("host") || new URL(request.url).host;
    return `${forwardedProto}://${host}`;
  }

  return new URL(request.url).origin;
}

function buildRoomUrls(request, room) {
  const origin = buildOrigin(request);
  const joinUrl = `${origin}/rooms/${room.code}`;
  const qrImageUrl =
    "https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&data=" +
    encodeURIComponent(joinUrl);

  return { joinUrl, qrImageUrl };
}

async function handleError(error) {
  if (error?.code === "ENOENT") {
    return jsonResponse(404, { error: "File not found." });
  }

  if (error?.message === "Request body must be valid JSON." || error?.message === "Request body is too large.") {
    return jsonResponse(400, { error: error.message });
  }

  if (VALIDATION_ERRORS.has(error?.message)) {
    return jsonResponse(400, { error: error.message });
  }

  console.error(error);
  return jsonResponse(500, { error: "Internal server error." });
}

export function createApp({ dataFile, publicDir, roomTtlMs }) {
  const store = new DataStore({ filePath: dataFile, roomTtlMs });

  const fetchHandler = async (request) => {
    const url = new URL(request.url, "http://localhost");
    const { pathname } = url;

    try {
      if (request.method === "GET" && pathname === "/health") {
        return jsonResponse(200, { ok: true });
      }

      if (request.method === "POST" && pathname === "/api/rooms") {
        const room = await store.createRoom();
        return jsonResponse(201, { room, ...buildRoomUrls(request, room) });
      }

      const roomMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]+)$/);
      if (request.method === "GET" && roomMatch) {
        const room = await store.getRoom(roomMatch[1]);
        if (!room) {
          return jsonResponse(404, { error: "Room not found." });
        }

        return jsonResponse(200, { room, ...buildRoomUrls(request, room) });
      }

      const memberMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/members$/);
      if (request.method === "POST" && memberMatch) {
        const body = await parseRequestBody(request);
        const result = await store.addMember(memberMatch[1], body);
        if (result.error) {
          return jsonResponse(result.error.status, { error: result.error.message });
        }

        return jsonResponse(201, result);
      }

      const deleteMemberMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/members\/([a-z0-9_-]+)$/i);
      if (request.method === "DELETE" && deleteMemberMatch) {
        const result = await store.removeMember(deleteMemberMatch[1], deleteMemberMatch[2]);
        if (result.error) {
          return jsonResponse(result.error.status, { error: result.error.message });
        }

        return noContentResponse();
      }

      const isRoomPage = /^\/rooms\/[A-Z0-9]+$/.test(pathname);
      if (request.method === "GET" && (pathname === "/" || isRoomPage)) {
        return serveFile(path.join(publicDir, "index.html"));
      }

      if (request.method === "GET" && (pathname === "/app.js" || pathname === "/styles.css")) {
        return serveFile(path.join(publicDir, pathname.slice(1)));
      }

      if (request.method === "GET" && pathname === "/robots.txt") {
        return textResponse(200, "User-agent: *\nAllow: /\n");
      }

      return jsonResponse(404, { error: `Not found: ${pathname}` });
    } catch (error) {
      return handleError(error);
    }
  };

  return { fetch: fetchHandler, store };
}

export function startServer({ dataFile, publicDir, roomTtlMs, port = 3000 }) {
  const app = createApp({ dataFile, publicDir, roomTtlMs });
  const server = Bun.serve({
    port,
    fetch: app.fetch
  });

  console.log(`Connections server running at ${server.url}`);

  return { ...app, server };
}
