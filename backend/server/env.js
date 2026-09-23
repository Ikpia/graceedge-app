import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(serverDir, "..");

function readDotEnv(full) {
  if (!fs.existsSync(full)) return {};

  const env = {};
  const lines = fs.readFileSync(full, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const i = trimmed.indexOf("=");
    const key = trimmed.slice(0, i).trim();
    let value = trimmed.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const fileEnv = readDotEnv(path.join(backendRoot, ".env"));

export function env(name, fallback = undefined) {
  const value = process.env[name] ?? fileEnv[name];
  return value === undefined || value === "" ? fallback : value;
}

export function envNumber(name, fallback = undefined) {
  const value = env(name);
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number.`);
  return n;
}

export function envFlag(name, fallback = false) {
  const value = env(name);
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

export function requiredEnv(name) {
  const value = env(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
