import { englishMessage, messages, type MessageFormatter } from "./messages.js";

export class MagicHourError extends Error {
  readonly isRetryable = false;
  constructor(
    message: string,
    readonly projectId?: string,
    readonly status?: number,
    formatMessage: MessageFormatter = englishMessage,
    /** The API's machine-readable error code, such as `invalid_request` or `insufficient_credits`. */
    readonly code?: string
  ) {
    super(
      projectId ? formatMessage({ ...messages.projectRecovery }, { message, projectId }) : message
    );
    this.name = "MagicHourError";
  }
}
