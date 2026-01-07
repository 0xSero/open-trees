import { formatError } from "./format";

type SdkResponseEnvelope<T> = {
  data?: T;
  error?: unknown;
};

const extractErrorMessage = (error: unknown) => {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const isEnvelope = (value: unknown): value is SdkResponseEnvelope<unknown> =>
  typeof value === "object" && value !== null && ("data" in value || "error" in value);

export const unwrapSdkResponse = <T>(
  response: unknown,
  action: string,
): { ok: true; data: T } | { ok: false; error: string } => {
  if (isEnvelope(response)) {
    if (response.error) {
      return {
        ok: false,
        error: formatError(`${action} failed.`, {
          details: extractErrorMessage(response.error),
        }),
      };
    }

    if (response.data === undefined) {
      return {
        ok: false,
        error: formatError(`${action} returned no data.`),
      };
    }

    return { ok: true, data: response.data as T };
  }

  if (response === undefined || response === null) {
    return {
      ok: false,
      error: formatError(`${action} returned no data.`),
    };
  }

  return { ok: true, data: response as T };
};
