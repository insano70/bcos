/**
 * Plain Text Email Formatter
 * Utilities for formatting plain text email alternatives
 */

/**
 * Format a details list as plain text
 */
export function formatDetailsList(details: Record<string, string>): string {
  return Object.entries(details)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}

/**
 * Wrap plain text email with standard structure
 */
export function wrapTextEmail(title: string, body: string, footer?: string): string {
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Platform';
  const defaultFooter = `

Best regards,
The ${appName} Team`;

  return `${title}

${body}${footer !== undefined ? `\n\n${footer}` : defaultFooter}`;
}

/**
 * Create a plain text section separator
 */
export function createSeparator(char = '-', length = 50): string {
  return char.repeat(length);
}

/**
 * Format a bulleted list for plain text
 */
export function formatList(items: string[], bullet = '-'): string {
  return items.map((item) => `${bullet} ${item}`).join('\n');
}

/**
 * Create plain text heading
 */
export function createHeading(text: string, underlineChar = '='): string {
  return `${text}\n${underlineChar.repeat(text.length)}`;
}
