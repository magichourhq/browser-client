const API_ERROR = "Error shown when a Magic Hour API operation cannot complete.";

export type MessageDescriptor = { id?: string; defaultMessage: string; description: string };
export type MessageCatalog = Record<string, Omit<MessageDescriptor, "id">>;
export type MessageFormatter = (
  message: MessageDescriptor,
  values?: Record<string, string | number>
) => string;
export function englishMessage(
  message: MessageDescriptor,
  values: Record<string, string | number> = {}
): string {
  return message.defaultMessage.replace(/\{(\w+)\}/g, (placeholder, key) =>
    String(values[key] ?? placeholder)
  );
}

/** IDs are stable so translations in host apps keep matching. */
export const messages = {
  apiKeyRequired: {
    id: "7qmBZL",
    defaultMessage: "Magic Hour API key is required.",
    description: API_ERROR,
  },
  invalidPollInterval: {
    id: "RSrbWC",
    defaultMessage: "Invalid poll interval.",
    description: API_ERROR,
  },
  invalidTimeout: {
    id: "cXdBXG",
    defaultMessage: "Invalid timeout.",
    description: API_ERROR,
  },
  apiHttpError: {
    id: "PrdpnS",
    defaultMessage: "Magic Hour API returned HTTP {status}.",
    description: API_ERROR,
  },
  invalidApiResponse: {
    id: "K5KpAT",
    defaultMessage: "Magic Hour API returned an invalid response.",
    description: API_ERROR,
  },
  invalidRequest: {
    id: "a8uZ4I",
    defaultMessage: "The Magic Hour request is invalid and was not sent.",
    description: API_ERROR,
  },
  submissionInterrupted: {
    id: "u4SaMP",
    defaultMessage:
      "Generation submission was interrupted. Acceptance is unknown; check account history before submitting again.",
    description: API_ERROR,
  },
  missingProjectId: {
    id: "/rjHpj",
    defaultMessage: "Missing project ID. Check account history before submitting again.",
    description: API_ERROR,
  },
  projectIdNotSaved: {
    id: "lrk6HX",
    defaultMessage: "Could not save the accepted project ID.",
    description: API_ERROR,
  },
  noDownloadableOutput: {
    id: "XXdpo6",
    defaultMessage: "Completed project has no downloadable output.",
    description: API_ERROR,
  },
  generationError: {
    id: "sjgpXT",
    defaultMessage: "Generation error.",
    description: "The generation failed on the server.",
  },
  generationCanceled: {
    id: "QCWRFd",
    defaultMessage: "Generation canceled.",
    description: "The generation was canceled on the server.",
  },
  unknownProjectStatus: {
    id: "Ly0kYi",
    defaultMessage: "Unknown project status.",
    description: API_ERROR,
  },
  projectNotRetrieved: {
    id: "SzrP/b",
    defaultMessage: "Could not retrieve the project.",
    description: API_ERROR,
  },
  downloadHttpError: {
    id: "Rj5Wq8",
    defaultMessage: "Media download returned HTTP {status}.",
    description: API_ERROR,
  },
  invalidImage: {
    id: "Dmss/X",
    defaultMessage: "Expected a nonempty PNG, JPEG, or WebP image.",
    description: API_ERROR,
  },
  invalidUploadResponse: {
    id: "nrNacv",
    defaultMessage: "Invalid upload response.",
    description: API_ERROR,
  },
  uploadHttpError: {
    id: "AFvxOh",
    defaultMessage: "Image upload returned HTTP {status}.",
    description: API_ERROR,
  },
  waitingStopped: {
    id: "TG/33D",
    defaultMessage: "Waiting stopped.",
    description: API_ERROR,
  },
  invalidMediaUrl: {
    id: "MMckAv",
    defaultMessage: "Expected an HTTPS media URL.",
    description: API_ERROR,
  },
  projectRecovery: {
    id: "+EA0uF",
    defaultMessage:
      "{message} (project {projectId}; resume this project instead of generating again)",
    description: "Error recovery guidance containing the original error and accepted project ID.",
  },
} satisfies Record<string, MessageDescriptor>;

/** Message catalog for hosts that translate client errors, such as Canva. */
export function messageCatalog(): MessageCatalog {
  const catalog: MessageCatalog = {};
  for (const { id, defaultMessage, description } of Object.values(messages))
    catalog[id] = { defaultMessage, description };
  return catalog;
}
