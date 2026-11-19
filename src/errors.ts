import { englishMessage, type MessageFormatter } from "./messages.js";

export class MagicHourError extends Error {
  readonly isRetryable = false;
  constructor(
    message: string,
    readonly projectId?: string,
    readonly status?: number,
    formatMessage: MessageFormatter = englishMessage
  ) {
    super(
      projectId
        ? formatMessage(
            {
              defaultMessage:
                "{message} (project {projectId}; resume this project instead of generating again)",
              description:
                "Error recovery guidance containing the original error and accepted project ID.",
            },
            { message, projectId }
          )
        : message
    );
    this.name = "MagicHourError";
  }
}
