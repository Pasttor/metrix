import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getEnv } from "@/lib/env";

/**
 * AES-256-GCM for OAuth tokens at rest.
 * Payload format: `iv:authTag:ciphertext`, each part base64.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function loadKey(key?: string): Buffer {
  const buffer = Buffer.from(key ?? getEnv().TOKEN_ENCRYPTION_KEY, "base64");
  if (buffer.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes in base64");
  }
  return buffer;
}

export function encrypt(plaintext: string, key?: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, loadKey(key), iv, { authTagLength: TAG_BYTES });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64")).join(":");
}

export class DecryptionError extends Error {
  constructor() {
    super("Encrypted value is malformed or was tampered with");
    this.name = "DecryptionError";
  }
}

export function decrypt(payload: string, key?: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) throw new DecryptionError();

  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64"));
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new DecryptionError();

  try {
    const decipher = createDecipheriv(ALGORITHM, loadKey(key), iv, { authTagLength: TAG_BYTES });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new DecryptionError();
  }
}
