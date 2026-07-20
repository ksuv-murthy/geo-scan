// Extracts a readable message from any thrown value. Needed because
// Supabase's PostgrestError (and similar client errors) are plain objects
// with a .message property — they are NOT instanceof Error, so a naive
// `err instanceof Error ? err.message : String(err)` check renders them as
// the literal string "[object Object]" instead of the actual error text.
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    return (err as { message: string }).message;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
