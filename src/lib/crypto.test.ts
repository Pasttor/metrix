import { describe, expect, it } from "vitest";
import { decrypt, DecryptionError, encrypt } from "./crypto";

const key = Buffer.alloc(32, 7).toString("base64");
const otherKey = Buffer.alloc(32, 8).toString("base64");

describe("crypto", () => {
  it("round-trips a value", () => {
    const secret = "ya29.a0-access-token-ñ";
    expect(decrypt(encrypt(secret, key), key)).toBe(secret);
  });

  it("uses the iv:authTag:ciphertext format with a fresh IV each time", () => {
    const first = encrypt("same", key);
    const second = encrypt("same", key);
    expect(first.split(":")).toHaveLength(3);
    expect(first).not.toBe(second);
    expect(first).not.toContain("same");
  });

  it("rejects a tampered ciphertext", () => {
    const [iv, tag, ciphertext] = encrypt("token", key).split(":");
    const bytes = Buffer.from(ciphertext, "base64");
    bytes[0] ^= 0xff;
    expect(() => decrypt([iv, tag, bytes.toString("base64")].join(":"), key)).toThrow(DecryptionError);
  });

  it("rejects a tampered auth tag", () => {
    const [iv, tag, ciphertext] = encrypt("token", key).split(":");
    const bytes = Buffer.from(tag, "base64");
    bytes[0] ^= 0x01;
    expect(() => decrypt([iv, bytes.toString("base64"), ciphertext].join(":"), key)).toThrow(DecryptionError);
  });

  it("rejects the wrong key", () => {
    expect(() => decrypt(encrypt("token", key), otherKey)).toThrow(DecryptionError);
  });

  it("rejects malformed payloads", () => {
    expect(() => decrypt("not-a-payload", key)).toThrow(DecryptionError);
    expect(() => decrypt("a:b:c", key)).toThrow(DecryptionError);
  });

  it("refuses keys that are not 32 bytes", () => {
    expect(() => encrypt("token", Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
  });
});
