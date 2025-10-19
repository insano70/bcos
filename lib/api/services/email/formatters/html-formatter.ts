/**
 * HTML Email Formatter
 * Shared HTML structures, CSS styles, and utility functions for email templates
 */

/**
 * Shared inline CSS styles for email templates
 * Using inline styles for maximum email client compatibility
 */
export const emailStyles = {
  body: "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;",
  container: 'max-width: 600px; margin: 0 auto; padding: 20px;',
  headerPrimary:
    'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;',
  headerSuccess:
    'background: linear-gradient(135deg, #00AEEF 0%, #44C0AE 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;',
  headerTitle: 'color: white; margin: 0; font-size: 28px;',
  contentBox: 'background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;',
  contentBoxFlat: 'background: #f8f9fa; padding: 30px; border-radius: 10px;',
  contentBoxWarning:
    'background: #f8f9fa; padding: 30px; border-radius: 10px; border-left: 4px solid #ffc107;',
  title: 'color: #333; margin: 0 0 20px 0; font-size: 24px;',
  greeting: 'font-size: 18px; margin-bottom: 20px;',
  paragraph: 'margin: 15px 0;',
  list: 'margin: 15px 0; padding-left: 20px;',
  button:
    'background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;',
  buttonDanger:
    'background: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;',
  buttonSuccess:
    'background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;',
  buttonPrimary:
    'background: #00AEEF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;',
  buttonCenter: 'text-align: center; margin: 30px 0;',
  detailBox: 'background: white; padding: 20px; border-radius: 8px; border: 1px solid #e9ecef;',
  detailRow: 'margin: 8px 0;',
  detailLabel: 'font-weight: 600; color: #495057;',
  codeBlock:
    'background: #f8f9fa; padding: 15px; border-radius: 5px; font-size: 12px; overflow-x: auto; font-family: monospace;',
  footer: 'text-align: center; padding: 20px; color: #666; font-size: 12px;',
  infoBox: 'margin-top: 20px; padding: 15px; background: #e7f3ff; border-radius: 4px;',
  infoText: 'margin: 0; font-size: 14px; color: #0066cc;',
  warningBox: 'margin-top: 20px; padding: 15px; background: #fff3cd; border-radius: 4px;',
  warningText: 'margin: 0; font-size: 14px; color: #856404;',
  messageBox:
    'background: #f8f9fa; padding: 15px; border-radius: 4px; border-left: 4px solid #007bff;',
  messageBoxSuccess:
    'background: #f8f9fa; padding: 15px; border-radius: 4px; border-left: 4px solid #28a745;',
};

/**
 * Wrap email content with standard HTML structure
 */
export function wrapEmailContent(
  title: string,
  content: string,
  options?: {
    headerGradient?: 'primary' | 'success';
    includeFooter?: boolean;
  }
): string {
  const headerStyle =
    options?.headerGradient === 'success' ? emailStyles.headerSuccess : emailStyles.headerPrimary;
  const includeFooter = options?.includeFooter !== false;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${title}</title>
      </head>
      <body style="${emailStyles.body}">
        <div style="${headerStyle}">
          <h1 style="${emailStyles.headerTitle}">${title}</h1>
        </div>

        <div style="${emailStyles.contentBox}">
          ${content}
        </div>

        ${
          includeFooter
            ? `
        <div style="${emailStyles.footer}">
          <p>© ${new Date().getFullYear()} ${process.env.NEXT_PUBLIC_APP_NAME || 'Platform'}. All rights reserved.</p>
        </div>
        `
            : ''
        }
      </body>
    </html>
  `;
}

/**
 * Wrap email content with flat box (no header gradient)
 */
export function wrapEmailContentFlat(title: string, content: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${title}</title>
      </head>
      <body style="${emailStyles.body}">
        <div style="${emailStyles.contentBoxFlat}">
          <h1 style="${emailStyles.title}">${title}</h1>
          ${content}
        </div>
      </body>
    </html>
  `;
}

/**
 * Wrap email content with warning box
 */
export function wrapEmailContentWarning(title: string, content: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${title}</title>
      </head>
      <body style="${emailStyles.body}">
        <div style="${emailStyles.contentBoxWarning}">
          <h1 style="${emailStyles.title}">⚠️ ${title}</h1>
          ${content}
        </div>
      </body>
    </html>
  `;
}

/**
 * Create a detail row for key-value display
 */
export function createDetailRow(label: string, value: string): string {
  return `<p style="${emailStyles.detailRow}"><strong>${label}:</strong> ${value}</p>`;
}

/**
 * Create an action button
 */
export function createButton(
  text: string,
  url: string,
  variant?: 'primary' | 'danger' | 'success' | 'info'
): string {
  let buttonStyle = emailStyles.button;
  if (variant === 'danger') buttonStyle = emailStyles.buttonDanger;
  else if (variant === 'success') buttonStyle = emailStyles.buttonSuccess;
  else if (variant === 'info') buttonStyle = emailStyles.buttonPrimary;

  return `
    <div style="${emailStyles.buttonCenter}">
      <a href="${url}" style="${buttonStyle}">
        ${text}
      </a>
    </div>
  `;
}

/**
 * Create a bulleted list
 */
export function createList(items: string[]): string {
  return `
    <ul style="${emailStyles.list}">
      ${items.map((item) => `<li>${item}</li>`).join('\n      ')}
    </ul>
  `;
}

/**
 * Create info box
 */
export function createInfoBox(message: string): string {
  return `
    <div style="${emailStyles.infoBox}">
      <p style="${emailStyles.infoText}">
        <strong>Next Steps:</strong> ${message}
      </p>
    </div>
  `;
}

/**
 * Create warning box
 */
export function createWarningBox(message: string): string {
  return `
    <div style="${emailStyles.warningBox}">
      <p style="${emailStyles.warningText}">
        <strong>Note:</strong> ${message}
      </p>
    </div>
  `;
}

/**
 * Create code/JSON block
 */
export function createCodeBlock(content: string): string {
  return `<pre style="${emailStyles.codeBlock}">${content}</pre>`;
}
