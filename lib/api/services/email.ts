import { Resend } from 'resend'
import { logger } from '@/lib/logger'

/**
 * Professional Email Service
 * Handles all email communications with templates and tracking
 */

interface EmailTemplate {
  subject: string
  html: string
  text?: string
}

interface EmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  template?: string
  variables?: Record<string, string>
  attachments?: Array<{
    filename: string
    content: Buffer | string
    contentType?: string
  }>
}

// Email service functions - converted from class with only static methods

let resendInstance: Resend | null = null

function getResend(): Resend {
  if (!resendInstance) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set')
    }
    resendInstance = new Resend(apiKey)
  }
  return resendInstance
}

/**
 * Send a welcome email to new users
 */
export async function sendWelcomeEmail(email: string, firstName: string, lastName: string): Promise<void> {
  const template = getWelcomeTemplate({ firstName, lastName })

  await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    ...(template.text && { text: template.text })
  })
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(email: string, resetToken: string, firstName: string): Promise<void> {
  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${resetToken}`
  const template = getPasswordResetTemplate({ firstName, resetUrl })

  await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    ...(template.text && { text: template.text })
  })
}

/**
 * Send email verification email
 */
export async function sendEmailVerificationEmail(email: string, verificationToken: string, firstName: string): Promise<void> {
  const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${verificationToken}`
  const template = getEmailVerificationTemplate({ firstName, verificationUrl })

  await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    ...(template.text && { text: template.text })
  })
}

/**
 * Send practice setup notification to practice owners
 */
export async function sendPracticeSetupEmail(email: string, practiceName: string, ownerName: string): Promise<void> {
  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`
  const template = getPracticeSetupTemplate({ ownerName, practiceName, dashboardUrl })

  await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    ...(template.text && { text: template.text })
  })
}

/**
 * Send system notification emails to admins
 */
export async function sendSystemNotification(
  subject: string,
  message: string,
  details?: Record<string, unknown>
): Promise<void> {
  const adminEmails = process.env.ADMIN_NOTIFICATION_EMAILS?.split(',') || []

  if (adminEmails.length === 0) {
    logger.warn('No admin notification emails configured', {
      operation: 'sendAdminNotification',
      reason: 'ADMIN_NOTIFICATION_EMAILS not set'
    })
    return
  }

  const template = getSystemNotificationTemplate({ message, details: details || {} })

  await sendEmail({
    to: adminEmails,
    subject: `[System Alert] ${subject}`,
    html: template.html,
    ...(template.text && { text: template.text })
  })
}

/**
 * Core email sending method
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  try {
    const resend = getResend()
    const fromEmail = process.env.EMAIL_FROM || 'noreply@yourdomain.com'

    const emailData = {
      from: fromEmail,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html || '',
      text: options.text || '',
      attachments: options.attachments
    };

    const result = await resend.emails.send(emailData)

    if (result.error) {
      throw new Error(`Email sending failed: ${result.error.message}`)
    }

    logger.info('Email sent successfully', {
      to: emailData.to,
      subject: emailData.subject,
      operation: 'sendEmail'
    })
  } catch (error) {
    logger.error('Email sending failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      operation: 'sendEmail'
    })
    throw error
  }
}

/**
 * Welcome email template
 */
function getWelcomeTemplate(vars: { firstName: string; lastName: string }): EmailTemplate {
  const subject = `Welcome to ${process.env.NEXT_PUBLIC_APP_NAME || 'Our Platform'}, ${vars.firstName}!`

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Welcome!</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #00AEEF; margin: 0;">Welcome to Our Platform!</h1>
        </div>

        <p>Hello ${vars.firstName},</p>

        <p>Welcome to ${process.env.NEXT_PUBLIC_APP_NAME || 'our platform'}! We're excited to have you join our community.</p>

        <p>Your account has been successfully created and you can now access all the features of our platform.</p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || '#'}" style="background-color: #00AEEF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Get Started</a>
        </div>

        <p>If you have any questions, please don't hesitate to contact our support team.</p>

        <p>Best regards,<br>The ${process.env.NEXT_PUBLIC_APP_NAME || 'Platform'} Team</p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="font-size: 12px; color: #666; text-align: center;">
          This email was sent to you because you created an account on ${process.env.NEXT_PUBLIC_APP_NAME || 'our platform'}.
          If you didn't create this account, please ignore this email.
        </p>
      </body>
    </html>
  `

  const text = `Welcome to ${process.env.NEXT_PUBLIC_APP_NAME || 'Our Platform'}, ${vars.firstName}!

Hello ${vars.firstName},

Welcome to ${process.env.NEXT_PUBLIC_APP_NAME || 'our platform'}! We're excited to have you join our community.

Your account has been successfully created and you can now access all the features of our platform.

Get Started: ${process.env.NEXT_PUBLIC_APP_URL || '#'}

If you have any questions, please don't hesitate to contact our support team.

Best regards,
The ${process.env.NEXT_PUBLIC_APP_NAME || 'Platform'} Team

---
This email was sent to you because you created an account on ${process.env.NEXT_PUBLIC_APP_NAME || 'our platform'}.
If you didn't create this account, please ignore this email.`

  return { subject, html, text }
}

/**
 * Password reset email template
 */
function getPasswordResetTemplate(vars: { firstName: string; resetUrl: string }): EmailTemplate {
  const subject = 'Reset Your Password'

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Reset Your Password</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #00AEEF; margin: 0;">Password Reset</h1>
        </div>

        <p>Hello ${vars.firstName},</p>

        <p>We received a request to reset your password. Click the button below to create a new password:</p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${vars.resetUrl}" style="background-color: #00AEEF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
        </div>

        <p>This link will expire in 1 hour for security reasons.</p>

        <p>If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>

        <p>Best regards,<br>The ${process.env.NEXT_PUBLIC_APP_NAME || 'Platform'} Team</p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="font-size: 12px; color: #666; text-align: center;">
          This email was sent to you because a password reset was requested for your account.
          If you didn't request this, please ignore this email.
        </p>
      </body>
    </html>
  `

  const text = `Reset Your Password

Hello ${vars.firstName},

We received a request to reset your password. Click the link below to create a new password:

${vars.resetUrl}

This link will expire in 1 hour for security reasons.

If you didn't request a password reset, please ignore this email. Your password will remain unchanged.

Best regards,
The ${process.env.NEXT_PUBLIC_APP_NAME || 'Platform'} Team

---
This email was sent to you because a password reset was requested for your account.
If you didn't request this, please ignore this email.`

  return { subject, html, text }
}

/**
 * Email verification template
 */
function getEmailVerificationTemplate(vars: { firstName: string; verificationUrl: string }): EmailTemplate {
  const subject = 'Verify Your Email Address'

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Verify Your Email</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #00AEEF; margin: 0;">Verify Your Email</h1>
        </div>

        <p>Hello ${vars.firstName},</p>

        <p>Thank you for creating an account! To complete your registration, please verify your email address by clicking the button below:</p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${vars.verificationUrl}" style="background-color: #00AEEF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a>
        </div>

        <p>This link will expire in 24 hours.</p>

        <p>If the button doesn't work, you can also copy and paste this link into your browser:</p>
        <p style="word-break: break-all; background: #f8f9fa; padding: 10px; border-radius: 3px; font-family: monospace;">${vars.verificationUrl}</p>

        <p>Best regards,<br>The ${process.env.NEXT_PUBLIC_APP_NAME || 'Platform'} Team</p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="font-size: 12px; color: #666; text-align: center;">
          This email was sent to you because you created an account on ${process.env.NEXT_PUBLIC_APP_NAME || 'our platform'}.
          If you didn't create this account, please ignore this email.
        </p>
      </body>
    </html>
  `

  const text = `Verify Your Email Address

Hello ${vars.firstName},

Thank you for creating an account! To complete your registration, please verify your email address by clicking the link below:

${vars.verificationUrl}

This link will expire in 24 hours.

If you didn't create this account, please ignore this email.

Best regards,
The ${process.env.NEXT_PUBLIC_APP_NAME || 'Platform'} Team

---
This email was sent to you because you created an account on ${process.env.NEXT_PUBLIC_APP_NAME || 'our platform'}.
If you didn't create this account, please ignore this email.`

  return { subject, html, text }
}

/**
 * Practice setup notification template
 */
function getPracticeSetupTemplate(vars: { ownerName: string; practiceName: string; dashboardUrl: string }): EmailTemplate {
  const subject = `Your ${vars.practiceName} Website is Ready!`

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Your Website is Ready!</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #00AEEF; margin: 0;">Your Website is Ready!</h1>
        </div>

        <p>Hello ${vars.ownerName},</p>

        <p>Congratulations! Your ${vars.practiceName} website has been successfully set up and is now live.</p>

        <p>You can now access your dashboard to manage your practice information, configure services, and customize your website.</p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${vars.dashboardUrl}" style="background-color: #00AEEF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Access Dashboard</a>
        </div>

        <p>Here are some next steps you can take:</p>
        <ul>
          <li>Complete your practice profile</li>
          <li>Add your services and specialties</li>
          <li>Upload photos and documents</li>
          <li>Customize your website design</li>
        </ul>

        <p>If you need any assistance, our support team is here to help.</p>

        <p>Best regards,<br>The ${process.env.NEXT_PUBLIC_APP_NAME || 'Platform'} Team</p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="font-size: 12px; color: #666; text-align: center;">
          This email was sent to you because you completed the setup process for ${vars.practiceName}.
        </p>
      </body>
    </html>
  `

  const text = `Your ${vars.practiceName} Website is Ready!

Hello ${vars.ownerName},

Congratulations! Your ${vars.practiceName} website has been successfully set up and is now live.

You can now access your dashboard to manage your practice information, configure services, and customize your website.

Access Dashboard: ${vars.dashboardUrl}

Here are some next steps you can take:
- Complete your practice profile
- Add your services and specialties
- Upload photos and documents
- Customize your website design

If you need any assistance, our support team is here to help.

Best regards,
The ${process.env.NEXT_PUBLIC_APP_NAME || 'Platform'} Team

---
This email was sent to you because you completed the setup process for ${vars.practiceName}.`

  return { subject, html, text }
}

/**
 * System notification template
 */
function getSystemNotificationTemplate(vars: { message: string; details?: Record<string, unknown> }): EmailTemplate {
  const subject = 'System Notification'

  const detailsHtml = vars.details
    ? `<pre style="background: #f8f9fa; padding: 15px; border-radius: 5px; font-size: 12px; overflow-x: auto;">${JSON.stringify(vars.details, null, 2)}</pre>`
    : ''

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>System Notification</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #dc3545; margin: 0;">System Notification</h1>
        </div>

        <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #856404;"><strong>System Alert:</strong></p>
          <p style="margin: 5px 0 0 0; color: #856404;">${vars.message}</p>
        </div>

        ${detailsHtml}

        <p>This notification has been sent to system administrators for awareness and potential action.</p>

        <p>Please review the details above and take appropriate action if necessary.</p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="font-size: 12px; color: #666; text-align: center;">
          Timestamp: ${new Date().toISOString()}
          Environment: ${process.env.NODE_ENV || 'unknown'}
        </p>
      </body>
    </html>
  `

  const text = `System Notification

SYSTEM ALERT: ${vars.message}

${vars.details ? `Details:\n${JSON.stringify(vars.details, null, 2)}` : ''}

This notification has been sent to system administrators for awareness and potential action.

Please review the details above and take appropriate action if necessary.

---
Timestamp: ${new Date().toISOString()}
Environment: ${process.env.NODE_ENV || 'unknown'}`

  return { subject, html, text }
}

// Export for backward compatibility
export const EmailService = {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
  sendPracticeSetupEmail,
  sendSystemNotification
}