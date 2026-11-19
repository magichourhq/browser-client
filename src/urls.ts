import { englishMessage, messages, type MessageFormatter } from "./messages.js";

export function httpsURL(value: string, formatMessage: MessageFormatter = englishMessage): string {
  let url: URL | undefined;
  try {
    url = new URL(value);
  } catch {
    // URL parser errors can repeat the value, which may be a signed URL.
  }
  if (url?.protocol !== "https:" || url.username || url.password)
    throw new Error(formatMessage(messages.invalidMediaUrl));
  return url.href;
}
