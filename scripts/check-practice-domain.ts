#!/usr/bin/env tsx

/**
 * Script to check if a practice exists with a specific domain
 * Usage: npx tsx scripts/check-practice-domain.ts <domain>
 */

import { db, practices, practice_attributes, templates } from '@/lib/db';
import { eq, isNull, and } from 'drizzle-orm';

async function checkPracticeByDomain(domain: string) {
  console.log(`🔍 Checking for practice with domain: ${domain}`);
  
  try {
    // Check if practice exists
    const [practice] = await db
      .select()
      .from(practices)
      .leftJoin(templates, eq(practices.template_id, templates.template_id))
      .where(and(
        eq(practices.domain, domain),
        isNull(practices.deleted_at)
      ))
      .limit(1);

    if (!practice) {
      console.log(`❌ No practice found with domain: ${domain}`);
      console.log('\n📝 To create a practice with this domain, you can:');
      console.log('1. Use the "Add Practice" button in the admin panel');
      console.log('2. Set domain to:', domain);
      console.log('3. Set status to "active" after creation');
      return;
    }

    console.log(`✅ Practice found:`, {
      id: practice.practices.practice_id,
      name: practice.practices.name,
      domain: practice.practices.domain,
      status: practice.practices.status,
      template: practice.templates?.name || 'No template',
      created_at: practice.practices.created_at
    });

    // Check if practice attributes exist
    const [attributes] = await db
      .select()
      .from(practice_attributes)
      .where(eq(practice_attributes.practice_id, practice.practices.practice_id))
      .limit(1);

    console.log(`📋 Practice attributes:`, attributes ? '✅ Exist' : '❌ Missing');

    if (practice.practices.status !== 'active') {
      console.log(`⚠️  Practice status is "${practice.practices.status}" - needs to be "active" for website to show`);
      console.log(`💡 Update with: UPDATE practices SET status = 'active' WHERE practice_id = '${practice.practices.practice_id}';`);
    }

  } catch (error) {
    console.error('❌ Error checking practice:', error);
  }
}

async function main() {
  const domain = process.argv[2];
  
  if (!domain) {
    console.log('Usage: npx tsx scripts/check-practice-domain.ts <domain>');
    console.log('Example: npx tsx scripts/check-practice-domain.ts lakenorman.care');
    process.exit(1);
  }

  await checkPracticeByDomain(domain);
  process.exit(0);
}

main().catch(console.error);
