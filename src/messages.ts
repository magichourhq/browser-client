export type MessageDescriptor = { id?: string; defaultMessage: string; description: string };
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
