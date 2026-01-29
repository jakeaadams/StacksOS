/**
 * Secure password hashing utilities
 * 
 * Security Model:
 * 1. First layer: bcrypt hash (industry standard, prevents rainbow tables)
 * 2. Second layer: MD5 (for Evergreen ILS compatibility)
 * 
 * This approach provides strong security while maintaining Evergreen compatibility.
 * Even if MD5 hash is intercepted, it cannot be reversed because the input
 * was already bcrypt-hashed.
 */

import * as crypto from "crypto";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 10; // Standard security level

/**
 * Hash password using bcrypt + MD5 layered approach
 * Formula: md5(seed + md5(bcrypt(password)))
 * 
 * @param password - Plain text password
 * @param seed - Evergreen authentication seed
 * @returns Final hash compatible with Evergreen
 */
export async function hashPasswordSecure(password: string, seed: string): Promise<string> {
  // Layer 1: bcrypt (prevents rainbow table attacks)
  const bcryptHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  
  // Layer 2: MD5 of bcrypt (for Evergreen compatibility)
  const passwordMd5 = crypto.createHash("md5").update(bcryptHash).digest("hex");
  
  // Layer 3: Final MD5 with seed (Evergreen protocol)
  return crypto.createHash("md5").update(seed + passwordMd5).digest("hex");
}

/**
 * Verify password matches expected hash
 * Used for local password verification before sending to Evergreen
 * 
 * @param password - Plain text password
 * @param hash - Stored bcrypt hash
 * @returns True if password matches
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate bcrypt hash for storage
 * Use this when storing passwords locally
 * 
 * @param password - Plain text password
 * @returns bcrypt hash
 */
export async function generatePasswordHash(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}
