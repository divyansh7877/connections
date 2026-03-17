import { afterEach, beforeEach, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/server.js";

const publicDir = path.join(process.cwd(), "public");
let activeTempDir;
let app;

async function request(pathname, init) {
  const request = new Request(`http://connections.test${pathname}`, init);
  return app.fetch(request);
}

beforeEach(async () => {
  activeTempDir = await fs.mkdtemp(path.join(os.tmpdir(), "connections-test-"));
  const dataFile = path.join(activeTempDir, "store.json");
  app = createApp({ dataFile, publicDir });
});

afterEach(async () => {
  if (activeTempDir) {
    await fs.rm(activeTempDir, { recursive: true, force: true });
    activeTempDir = null;
  }
  app = null;
});

test("creates a room and returns a join URL", async () => {
  const createResponse = await request("/api/rooms", { method: "POST" });
  expect(createResponse.status).toBe(201);
  const created = await createResponse.json();

  expect(created.room.code).toMatch(/^[A-Z0-9]{6}$/);
  expect(created.joinUrl).toBe(`http://connections.test/rooms/${created.room.code}`);
  expect(created.qrImageUrl).toMatch(/^https:\/\/api\.qrserver\.com\//);

  const getResponse = await request(`/api/rooms/${created.room.code}`);
  expect(getResponse.status).toBe(200);
  const loaded = await getResponse.json();
  expect(loaded.room.code).toBe(created.room.code);
});

test("adds a member and returns them in the room list", async () => {
  const created = await (await request("/api/rooms", { method: "POST" })).json();

  const joinResponse = await request(`/api/rooms/${created.room.code}/members`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName: "Jordan Lee",
      linkedinUrl: "linkedin.com/in/jordan-lee"
    })
  });

  expect(joinResponse.status).toBe(201);
  const joined = await joinResponse.json();
  expect(joined.member.displayName).toBe("Jordan Lee");
  expect(joined.room.members.length).toBe(1);

  const roomResponse = await request(`/api/rooms/${created.room.code}`);
  const room = await roomResponse.json();
  expect(room.room.members[0].linkedinUrl).toBe("https://linkedin.com/in/jordan-lee");
});

test("rejects malformed linkedin urls", async () => {
  const created = await (await request("/api/rooms", { method: "POST" })).json();

  const joinResponse = await request(`/api/rooms/${created.room.code}/members`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName: "Jordan Lee",
      linkedinUrl: "https://example.com/jordan"
    })
  });

  expect(joinResponse.status).toBe(400);
  const payload = await joinResponse.json();
  expect(payload.error).toMatch(/LinkedIn/);
});

test("expired rooms reject joins", async () => {
  const dataFile = path.join(activeTempDir, "ttl-store.json");
  app = createApp({ dataFile, publicDir, roomTtlMs: 20 });

  const created = await (await request("/api/rooms", { method: "POST" })).json();
  await Bun.sleep(30);

  const joinResponse = await request(`/api/rooms/${created.room.code}/members`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName: "Jordan Lee",
      linkedinUrl: "https://www.linkedin.com/in/jordan-lee"
    })
  });

  expect(joinResponse.status).toBe(410);

  const roomResponse = await request(`/api/rooms/${created.room.code}`);
  const room = await roomResponse.json();
  expect(room.room.status).toBe("expired");
});

test("member can be removed", async () => {
  const created = await (await request("/api/rooms", { method: "POST" })).json();
  const joined = await (
    await request(`/api/rooms/${created.room.code}/members`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Jordan Lee",
        linkedinUrl: "https://www.linkedin.com/in/jordan-lee"
      })
    })
  ).json();

  const deleteResponse = await request(`/api/rooms/${created.room.code}/members/${joined.member.id}`, {
    method: "DELETE"
  });
  expect(deleteResponse.status).toBe(204);

  const roomResponse = await request(`/api/rooms/${created.room.code}`);
  const room = await roomResponse.json();
  expect(room.room.members.length).toBe(0);
});
