// Client-side mirror of the server's password rules (shared/src/index.ts).
// The client can't import @cafepos/shared (kept out of client deps for the Vercel
// build), so the list is duplicated here for instant feedback; the server stays the
// source of truth and re-validates every password it's sent.
const WEAK_PASSWORDS = new Set(
  [
    "admin123",
    "cashier123",
    "password",
    "password1",
    "password123",
    "12345678",
    "123456789",
    "1234567890",
    "qwerty123",
    "admin@123",
    "welcome1",
    "changeme",
    "letmein1",
    "iloveyou",
    "abcd1234",
    "kamala123",
  ].map((p) => p.toLowerCase())
);

/** Returns an error message if the password is too weak, else null. */
export function passwordProblem(password: string): string | null {
  const p = password ?? "";
  if (p.length < 8) return "Use at least 8 characters.";
  if (!/[a-zA-Z]/.test(p)) return "Add at least one letter.";
  if (!/[0-9]/.test(p)) return "Add at least one number.";
  if (WEAK_PASSWORDS.has(p.toLowerCase())) return "That password is too common — pick a unique one.";
  if (/^(.)\1+$/.test(p)) return "Don't repeat a single character.";
  return null;
}
