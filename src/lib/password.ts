/**
 * Password hashing utilities for Evergreen ILS compatibility
 * 
 * IMPORTANT: Evergreen uses MD5 hashing for password authentication.
 * While MD5 is cryptographically weak, it is required for Evergreen compatibility.
 * 
 * Security Notes:
 * - MD5 is vulnerable to rainbow table attacks
 * - This is an Evergreen ILS limitation, not a StacksOS design choice
 * - Passwords are transmitted over HTTPS (when SSL is properly configured)
 * - Consider implementing rate limiting to mitigate brute force attacks
 */

import * as crypto from "crypto";

/**
 * Hash password using MD5 method (matching Evergreen staff client behavior)
 * Formula: md5(seed + md5(password))
 * 
 * @param password - Plain text password
 * @param seed - Evergreen authentication seed
 * @returns MD5 hash compatible with Evergreen
 */
export function hashPassword(password: string, seed: string): string {
  const passwordMd5 = crypto.createHash("md5").update(password).digest("hex");
  return crypto.createHash("md5").update(seed + passwordMd5).digest("hex");
}
