/**
 * Turns a Postgres error into a message for staff (docs/SECURITY_THREAT_MODEL.md §5). Raw database
 * text is never shown: it can name constraints, tables or values.
 */
export interface DbError {
  code?: string;
}

export interface DbErrorMessages {
  /** 23505: duplicate. */
  duplicate?: string;
  /** 23503: a linked record is missing, or this record is still in use. */
  linked?: string;
  /** 23514: a database rule refused the values. */
  rule?: string;
  /** 23P01: overlaps an existing record. */
  overlap?: string;
}

export function dbErrorMessage(error: DbError, messages: DbErrorMessages = {}): string | null {
  switch (error.code) {
    case "23505":
      return messages.duplicate ?? "That already exists.";
    case "23503":
      return messages.linked ?? "This is linked to another record, so it cannot be saved or removed.";
    case "23514":
      return messages.rule ?? "Those values are not allowed. Check the form and try again.";
    case "23P01":
      return messages.overlap ?? "This overlaps an existing record.";
    case "42501":
      return "You do not have permission to do that.";
    default:
      return null;
  }
}
