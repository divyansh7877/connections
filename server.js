import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./src/server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = Number(process.env.PORT || 3000);
const dataFile = process.env.DATA_FILE || path.join(__dirname, "data", "store.json");
const publicDir = path.join(__dirname, "public");

startServer({ dataFile, publicDir, port });
