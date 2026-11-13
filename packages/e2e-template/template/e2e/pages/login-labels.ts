/**
 * Label of the one-time code field (MFA). Matches "Code", "Authentication code", "2FA code",
 * "Enter your 6-digit code"... but not "Promo code", "Postal code" or "Recovery code".
 * Replace it with the exact label if the app uses another wording.
 */
export const TOTP_LABEL =
  /^\s*code\s*$|\b(one[- ]time|verification|authentication|authenticator|security|2fa|mfa|totp|\d-digit)\b.*\bcode\b/i;
