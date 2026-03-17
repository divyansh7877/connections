import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 8;

function randomId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function createRoomCode(length = 6) {
  let value = "";

  while (value.length < length) {
    const index = crypto.randomInt(0, ROOM_CODE_ALPHABET.length);
    value += ROOM_CODE_ALPHABET[index];
  }

  return value;
}

function createDefaultState() {
  return { rooms: [] };
}

function isExpired(room, now = Date.now()) {
  return room.status !== "closed" && new Date(room.expiresAt).getTime() <= now;
}

export function normalizeLinkedInUrl(rawValue) {
  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    throw new Error("LinkedIn URL is required.");
  }

  let value = rawValue.trim();
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid LinkedIn profile URL.");
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname !== "linkedin.com" && !hostname.endsWith(".linkedin.com")) {
    throw new Error("Only LinkedIn URLs are allowed.");
  }

  if (!url.pathname || url.pathname === "/") {
    throw new Error("LinkedIn profile URL must include a path.");
  }

  url.hash = "";
  url.search = "";
  return url.toString();
}

export function normalizeDisplayName(rawValue) {
  if (typeof rawValue !== "string") {
    throw new Error("Name is required.");
  }

  const value = rawValue.trim().replace(/\s+/g, " ");
  if (value.length < 2) {
    throw new Error("Name must be at least 2 characters.");
  }

  if (value.length > 80) {
    throw new Error("Name must be 80 characters or fewer.");
  }

  return value;
}

async function readJson(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return createDefaultState();
    }
    throw error;
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempFile = `${filePath}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(data, null, 2));
  await fs.rename(tempFile, filePath);
}

function toPublicRoom(room) {
  return {
    id: room.id,
    code: room.code,
    createdAt: room.createdAt,
    expiresAt: room.expiresAt,
    status: room.status,
    members: room.members.map((member) => ({
      id: member.id,
      displayName: member.displayName,
      linkedinUrl: member.linkedinUrl,
      joinedAt: member.joinedAt
    }))
  };
}

export class DataStore {
  constructor({ filePath, roomTtlMs = DEFAULT_TTL_MS }) {
    this.filePath = filePath;
    this.roomTtlMs = roomTtlMs;
    this.writeChain = Promise.resolve();
  }

  async readState() {
    const state = await readJson(this.filePath);
    this.expireRooms(state);
    return state;
  }

  expireRooms(state, now = Date.now()) {
    for (const room of state.rooms) {
      if (isExpired(room, now)) {
        room.status = "expired";
      }
    }
  }

  async commit(mutator) {
    this.writeChain = this.writeChain.then(async () => {
      const state = await this.readState();
      const result = await mutator(state);
      await writeJson(this.filePath, state);
      return result;
    });

    return this.writeChain;
  }

  async createRoom() {
    return this.commit(async (state) => {
      const existingCodes = new Set(state.rooms.map((room) => room.code));
      let code = createRoomCode();
      while (existingCodes.has(code)) {
        code = createRoomCode();
      }

      const createdAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + this.roomTtlMs).toISOString();
      const room = {
        id: randomId("room"),
        code,
        createdAt,
        expiresAt,
        status: "active",
        members: []
      };

      state.rooms.push(room);
      return toPublicRoom(room);
    });
  }

  async getRoom(code) {
    const state = await this.readState();
    const room = state.rooms.find((item) => item.code === code);
    return room ? toPublicRoom(room) : null;
  }

  async addMember(code, payload) {
    const displayName = normalizeDisplayName(payload.displayName);
    const linkedinUrl = normalizeLinkedInUrl(payload.linkedinUrl);

    return this.commit(async (state) => {
      const room = state.rooms.find((item) => item.code === code);
      if (!room) {
        return { error: { status: 404, message: "Room not found." } };
      }

      this.expireRooms(state);
      if (room.status !== "active") {
        return { error: { status: 410, message: "This room is no longer active." } };
      }

      const existingProfile = room.members.find(
        (member) => member.linkedinUrl.toLowerCase() === linkedinUrl.toLowerCase()
      );
      if (existingProfile) {
        return {
          error: {
            status: 409,
            message: "That LinkedIn profile is already in this room."
          }
        };
      }

      const member = {
        id: randomId("member"),
        displayName,
        linkedinUrl,
        joinedAt: new Date().toISOString()
      };

      room.members.push(member);
      return { room: toPublicRoom(room), member };
    });
  }

  async removeMember(code, memberId) {
    return this.commit(async (state) => {
      const room = state.rooms.find((item) => item.code === code);
      if (!room) {
        return { error: { status: 404, message: "Room not found." } };
      }

      const index = room.members.findIndex((member) => member.id === memberId);
      if (index === -1) {
        return { error: { status: 404, message: "Member not found." } };
      }

      room.members.splice(index, 1);
      return { room: toPublicRoom(room) };
    });
  }
}
