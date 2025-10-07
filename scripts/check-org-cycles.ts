import { db } from '@/lib/db';
import { organizations } from '@/lib/db/schema';
import { isNull, eq, and } from 'drizzle-orm';

async function checkForCycles() {
  console.log('🔍 Checking for circular organization references...\n');

  // Get all organizations
  const allOrgs = await db
    .select({
      organization_id: organizations.organization_id,
      name: organizations.name,
      parent_organization_id: organizations.parent_organization_id,
    })
    .from(organizations)
    .where(and(eq(organizations.is_active, true), isNull(organizations.deleted_at)));

  console.log(`📊 Found ${allOrgs.length} active organizations\n`);

  // Check for self-references
  const selfReferences = allOrgs.filter(
    (org) => org.parent_organization_id === org.organization_id
  );

  if (selfReferences.length > 0) {
    console.log(`❌ Self-references found:`);
    selfReferences.forEach((org) => {
      console.log(`  - ${org.name} (${org.organization_id}) has itself as parent`);
    });
  }

  // Check for cycles
  const cycles: string[][] = [];

  for (const org of allOrgs) {
    const visited = new Set<string>();
    const path: string[] = [];
    let currentId: string | null = org.organization_id;

    while (currentId) {
      if (visited.has(currentId)) {
        // Found a cycle
        const cycleStart = path.indexOf(currentId);
        const cycle = path.slice(cycleStart);
        cycle.push(currentId);

        // Check if we already found this cycle
        const cycleKey = cycle.sort().join(',');
        const alreadyFound = cycles.some(
          (c) => c.sort().join(',') === cycleKey
        );

        if (!alreadyFound) {
          cycles.push(cycle);
        }
        break;
      }

      visited.add(currentId);
      path.push(currentId);

      const currentOrg = allOrgs.find((o) => o.organization_id === currentId);
      currentId = currentOrg?.parent_organization_id || null;
    }
  }

  if (cycles.length > 0) {
    console.log(`\n❌ Circular references found (${cycles.length}):`);
    for (const cycle of cycles) {
      const orgNames = cycle
        .map((id) => {
          const org = allOrgs.find((o) => o.organization_id === id);
          return org ? `${org.name} (${id.slice(0, 8)}...)` : id;
        })
        .join(' → ');
      console.log(`  - ${orgNames}`);
    }
  } else {
    console.log('✅ No circular references found');
  }

  process.exit(0);
}

checkForCycles();
