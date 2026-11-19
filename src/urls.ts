import { englishMessage, type MessageFormatter } from "./messages.js";

export function httpsURL(value: string, formatMessage: MessageFormatter = englishMessage): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error(
      formatMessage({
        defaultMessage: "Expected an HTTPS media URL.",
        description: "Error shown when a Magic Hour API operation cannot complete.",
      })
    );
  return url.href;
}
