/**
 * Mask a phone number for safe logging: keep country code + last 4 digits.
 * Example: "+919876543210" -> "+91XXXXXX3210".
 *
 * Per CLAUDE.md: never log full phone numbers in production-level logs.
 */
export function maskPhone(phone: string): string {
  if (phone.length <= 6) return 'XXXX';
  const tail = phone.slice(-4);
  return `${phone.slice(0, 3)}XXXXXX${tail}`;
}
