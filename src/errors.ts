import type { ImageToVideoCreateResponse402 } from "@magichourhq/api-types";
import { englishMessage, messages, type MessageFormatter } from "./messages.js";

export class MagicHourError extends Error {
  readonly isRetryable = false;
  /** Account balance when the API checked the request. */
  readonly creditsAvailable?: number;
  /** Credit cost of the rejected request. */
  readonly creditsRequired?: number;
  /** What the account owner can do about the rejection, when the API provides it. */
  readonly nextAction?: ImageToVideoCreateResponse402["next_action"];
  constructor(
    message: string,
    readonly projectId?: string,
    readonly status?: number,
    formatMessage: MessageFormatter = englishMessage,
    /** The API's machine-readable error code, such as `invalid_request` or `insufficient_credits`. */
    readonly code?: string,
    /** Credits missing for this request, when the API returns `insufficient_credits`. */
    readonly creditShortfall?: number,
    creditDetails?: Pick<MagicHourError, "creditsAvailable" | "creditsRequired" | "nextAction">
  ) {
    super(
      projectId ? formatMessage({ ...messages.projectRecovery }, { message, projectId }) : message
    );
    this.name = "MagicHourError";
    this.creditsAvailable = creditDetails?.creditsAvailable;
    this.creditsRequired = creditDetails?.creditsRequired;
    this.nextAction = creditDetails?.nextAction;
  }
}
