export type MessageDescriptor = { id?: string; defaultMessage: string; description: string };
export type MessageFormatter = (
  message: MessageDescriptor,
  values?: Record<string, string | number>
) => string;
export const englishMessage: MessageFormatter = (message, values = {}) =>
  message.defaultMessage.replace(/\{(\w+)\}/g, (placeholder, key) =>
    String(values[key] ?? placeholder)
  );
