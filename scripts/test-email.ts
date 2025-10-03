#!/usr/bin/env tsx

/**
 * Test script for AWS SES email functionality
 * Usage: tsx scripts/test-email.ts
 */

import { emailService } from '../lib/api/services/email-service-instance'

async function testEmailService() {
  console.log('🧪 Testing AWS SES Email Service...\n')

  try {
    // Test 1: Send a welcome email
    console.log('📧 Test 1: Sending welcome email...')
    await emailService.sendWelcomeEmail(
      'test@example.com',
      'Test',
      'User'
    )
    console.log('✅ Welcome email sent successfully\n')

    // Test 2: Send system notification
    console.log('🔔 Test 2: Sending system notification...')
    await emailService.sendSystemNotification(
      'Test System Notification',
      'This is a test notification to verify the email system is working.',
      { environment: 'test', timestamp: new Date().toISOString() }
    )
    console.log('✅ System notification sent successfully\n')

    // Test 3: Send appointment request notification
    console.log('📅 Test 3: Sending appointment request notification...')
    await emailService.sendAppointmentRequest('practice@example.com', {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      phone: '555-0123',
      preferredDate: '2025-01-15',
      preferredTime: 'morning',
      reason: 'new-patient',
      message: 'Looking forward to my first visit.'
    })
    console.log('✅ Appointment request notification sent successfully\n')

    // Test 4: Send contact form notification
    console.log('📬 Test 4: Sending contact form notification...')
    await emailService.sendContactForm('practice@example.com', {
      name: 'Jane Smith',
      email: 'jane.smith@example.com',
      phone: '555-0456',
      subject: 'insurance',
      message: 'I have questions about insurance coverage for my upcoming visit.'
    })
    console.log('✅ Contact form notification sent successfully\n')

    console.log('🎉 All email tests completed successfully!')
    console.log('📝 Check your email inbox and AWS SES sending statistics to confirm delivery.')

  } catch (error) {
    console.error('❌ Email test failed:', error)
    console.log('\n🔍 Troubleshooting tips:')
    console.log('1. Verify AWS SES credentials are configured correctly')
    console.log('2. Check that sender email is verified in AWS SES')
    console.log('3. Ensure recipient email is verified (if in sandbox mode)')
    console.log('4. Check AWS SES sending limits and quotas')
    process.exit(1)
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testEmailService().catch(console.error)
}

export { testEmailService }
