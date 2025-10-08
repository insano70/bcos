import { db, users } from '@/lib/db';
import { user_organizations, organizations } from '@/lib/db/rbac-schema';
import { eq } from 'drizzle-orm';

async function checkUserOrgs() {
  const userOrgs = await db
    .select({
      email: users.email,
      org_name: organizations.name,
      org_slug: organizations.slug,
    })
    .from(user_organizations)
    .innerJoin(users, eq(user_organizations.user_id, users.user_id))
    .innerJoin(organizations, eq(user_organizations.organization_id, organizations.organization_id));

  console.log('\n✅ User Organizations:');
  userOrgs.forEach(uo => {
    console.log(`  - ${uo.email} → ${uo.org_name} (${uo.org_slug})`);
  });

  console.log(`\n📊 Total: ${userOrgs.length} user-organization mappings\n`);
  process.exit(0);
}

checkUserOrgs();
