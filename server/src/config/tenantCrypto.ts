// Railway + Vanna migration, Phase 4 (see
// .claude/skills/railway-vanna-migration/SKILL.md, decision 12). Encrypts/
// decrypts the per-tenant SQL Server passwords stored in the
// tenant_connections table (db/schema.sql) — those rows live on the same
// Postgres as users/companies/chat (decision 5's amendment), so the
// passwords must not sit there in plaintext even though the database itself
// is otherwise trusted; this is defense-in-depth against a Postgres-only
// compromise, DB dump, or backup leak, not a defense against the app server
// itself (which necessarily can decrypt, same as it can read JWT_SECRET).
//
// AES-256-GCM: authenticated encryption (detects tampering, not just
// confidentiality) — appropriate for credentials, unlike a plain cipher
// mode. Encoded as `${ivHex}:${authTagHex}:${ciphertextHex}` so it's a
// single opaque TEXT column value, no separate columns needed for the IV/tag.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "./env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV is the AES-GCM standard/recommended size

function getKey(): Buffer {
  if (!env.tenantCredentialsKey) {
    throw new Error(
      "TENANT_CREDENTIALS_KEY is not set — cannot encrypt/decrypt tenant SQL Server credentials. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" and set it in server/.env. See server/.env.example."
    );
  }
  const key = Buffer.from(env.tenantCredentialsKey, "hex");
  if (key.length !== 32) {
    throw new Error(
      `TENANT_CREDENTIALS_KEY must decode to exactly 32 bytes (64 hex characters) for AES-256 — got ${key.length} bytes.`
    );
  }
  return key;
}

export function encryptTenantSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptTenantSecret(encoded: string): string {
  const key = getKey();
  const parts = encoded.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed tenant secret ciphertext — expected 'iv:authTag:ciphertext'.");
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
  return plaintext.toString("utf-8");
}
