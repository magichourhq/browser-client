export type MessageDescriptor = { id?: string; defaultMessage: string; description: string };
export type MessageFormatter = (
  message: MessageDescriptor,
  values?: Record<string, string | number>
) => string;
export const englishMessage: MessageFormatter = (message, values = {}) =>
  message.defaultMessage.replace(/\{(\w+)\}/g, (placeholder, key) =>
    String(values[key] ?? placeholder)
  );
/** Keeps error handling working when a host's translation function throws. */
export const withEnglishFallback =
  (formatMessage: MessageFormatter = englishMessage): MessageFormatter =>
  (message, values) => {
    try {
      return formatMessage(message, values);
    } catch {
      return englishMessage(message, values);
    }
  };
