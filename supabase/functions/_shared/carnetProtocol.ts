export class ApiError extends Error {
  constructor(public code: string, public status = 400, public retryable = false, message = code) { super(message); }
}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function uuid(value: unknown): string { if (typeof value !== "string" || !UUID.test(value)) throw new ApiError("invalid_uuid"); return value.toLowerCase(); }
