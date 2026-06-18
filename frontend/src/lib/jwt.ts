/**
 * Safe JWT payload decoder with base64url support and expiry checking.
 *
 * Pure utility functions — no side effects, no localStorage access.
 * Auth state management is handled by the Zustand authStore.
 *
 * This module provides:
 *  1. Base64url decoding (replaces -/+ and _/)
 *  2. Safe JWT payload parsing
 *  3. Token expiry validation
 */

interface JwtPayload {
  [key: string]: unknown;
  exp?: number;
  iat?: number;
  sub?: string;
  role?: string;
}

/**
 * Decode a base64url-encoded string (RFC 4648 section 5).
 * Replaces URL-safe characters before calling atob().
 */
function base64UrlDecode(str: string): string {
  // Pad with '=' to make length a multiple of 4
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad === 2) {
    base64 += '==';
  } else if (pad === 3) {
    base64 += '=';
  }
  return atob(base64);
}

/**
 * Safely decode a JWT token's payload.
 *
 * Returns the parsed payload object, or null if:
 *  - The token format is invalid (not 3 dot-separated parts)
 *  - Base64url decoding fails
 *  - JSON parsing fails
 *
 * This is a pure function — it does NOT check expiry, clear tokens,
 * or redirect. Use isTokenExpired() for expiry checks, and the
 * authStore for side-effect handling.
 */
export function decodeJwt(token: string): JwtPayload | null {
  if (!token || typeof token !== 'string') {
    return null;
  }

  // Split token into header.payload.signature
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  let payloadString: string;
  try {
    payloadString = base64UrlDecode(parts[1]);
  } catch {
    // Base64 decode failed — malformed payload
    return null;
  }

  let payload: JwtPayload;
  try {
    payload = JSON.parse(payloadString);
  } catch {
    // JSON parse failed — malformed payload
    return null;
  }

  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  return payload;
}

/**
 * Check whether a JWT token is expired.
 *
 * Returns true if the token's `exp` claim is present and in the past.
 * Returns true if the token cannot be decoded at all.
 * Returns false if the token has no `exp` claim or is still valid.
 *
 * This is a pure function — no side effects.
 */
export function isTokenExpired(token: string): boolean {
  const payload = decodeJwt(token);
  if (!payload) {
    // Cannot decode — treat as invalid
    return true;
  }

  if (typeof payload.exp === 'number') {
    // exp is seconds since epoch; compare with current time
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return true;
    }
  }

  return false;
}
