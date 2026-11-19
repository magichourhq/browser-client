import { englishMessage, type MessageFormatter } from "./messages.js";

export function httpsURL(value: string, formatMessage: MessageFormatter = englishMessage): string {
  let url: URL | undefined;
  try {
    url = new URL(value);
  } catch {
    // URL parser errors can repeat the value, which may be a signed URL.
  }
  if (url?.protocol !== "https:" || url.username || url.password)
    throw new Error(
      formatMessage({
        defaultMessage: "Expected an HTTPS media URL.",
        description: "Error shown when a Magic Hour API operation cannot complete.",
      })
    );
  return url.href;
}
