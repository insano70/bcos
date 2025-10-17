import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { work_item_statuses, work_item_types } from '@/lib/db/schema';

/**
 * Seed Work Item Types and Statuses
 * Creates default work item types with their associated statuses for development and testing
 */

async function seedWorkItems() {
  try {
    console.log('🔍 Seeding global work item types and statuses...');

    console.log('\n📝 Note: Creating global work item types (organization_id = null)');
    console.log('These types will be available to all organizations.\n');

    // 1. Insert default global work item types (organization_id = null for global types)
    const workItemTypesData = [
      {
        organization_id: null,
        name: 'Task',
        description: 'A general task or work item',
        icon: '✓',
        color: '#3B82F6', // blue-500
        is_active: true,
      },
      {
        organization_id: null,
        name: 'Bug',
        description: 'A software bug or defect',
        icon: '🐛',
        color: '#EF4444', // red-500
        is_active: true,
      },
      {
        organization_id: null,
        name: 'Feature',
        description: 'A new feature or enhancement',
        icon: '⭐',
        color: '#10B981', // green-500
        is_active: true,
      },
      {
        organization_id: null,
        name: 'Story',
        description: 'A user story',
        icon: '📖',
        color: '#8B5CF6', // purple-500
        is_active: true,
      },
    ];

    const createdTypes: Array<{ work_item_type_id: string; name: string }> = [];

    for (const typeData of workItemTypesData) {
      const [existingType] = await db
        .select()
        .from(work_item_types)
        .where(eq(work_item_types.name, typeData.name))
        .limit(1);

      if (existingType) {
        console.log(`✓ Work item type "${typeData.name}" already exists`);
        createdTypes.push({
          work_item_type_id: existingType.work_item_type_id,
          name: existingType.name,
        });
      } else {
        const [newType] = await db.insert(work_item_types).values(typeData).returning();

        if (!newType) {
          throw new Error(`Failed to create work item type: ${typeData.name}`);
        }

        console.log(`✅ Created work item type: ${newType.name}`);
        createdTypes.push({
          work_item_type_id: newType.work_item_type_id,
          name: newType.name,
        });
      }
    }

    // 2. Insert statuses for each work item type
    const statusesData = [
      // Task statuses
      {
        typeName: 'Task',
        statuses: [
          {
            status_name: 'To Do',
            status_category: 'todo' as const,
            is_initial: true,
            is_final: false,
            color: '#6B7280', // gray-500
            display_order: 0,
          },
          {
            status_name: 'In Progress',
            status_category: 'in_progress' as const,
            is_initial: false,
            is_final: false,
            color: '#3B82F6', // blue-500
            display_order: 1,
          },
          {
            status_name: 'Done',
            status_category: 'completed' as const,
            is_initial: false,
            is_final: true,
            color: '#10B981', // green-500
            display_order: 2,
          },
        ],
      },
      // Bug statuses
      {
        typeName: 'Bug',
        statuses: [
          {
            status_name: 'Open',
            status_category: 'todo' as const,
            is_initial: true,
            is_final: false,
            color: '#EF4444', // red-500
            display_order: 0,
          },
          {
            status_name: 'In Progress',
            status_category: 'in_progress' as const,
            is_initial: false,
            is_final: false,
            color: '#F59E0B', // amber-500
            display_order: 1,
          },
          {
            status_name: 'Testing',
            status_category: 'in_progress' as const,
            is_initial: false,
            is_final: false,
            color: '#8B5CF6', // purple-500
            display_order: 2,
          },
          {
            status_name: 'Resolved',
            status_category: 'completed' as const,
            is_initial: false,
            is_final: true,
            color: '#10B981', // green-500
            display_order: 3,
          },
        ],
      },
      // Feature statuses
      {
        typeName: 'Feature',
        statuses: [
          {
            status_name: 'Backlog',
            status_category: 'todo' as const,
            is_initial: true,
            is_final: false,
            color: '#6B7280', // gray-500
            display_order: 0,
          },
          {
            status_name: 'In Development',
            status_category: 'in_progress' as const,
            is_initial: false,
            is_final: false,
            color: '#3B82F6', // blue-500
            display_order: 1,
          },
          {
            status_name: 'In Review',
            status_category: 'in_progress' as const,
            is_initial: false,
            is_final: false,
            color: '#F59E0B', // amber-500
            display_order: 2,
          },
          {
            status_name: 'Released',
            status_category: 'completed' as const,
            is_initial: false,
            is_final: true,
            color: '#10B981', // green-500
            display_order: 3,
          },
        ],
      },
      // Story statuses
      {
        typeName: 'Story',
        statuses: [
          {
            status_name: 'To Do',
            status_category: 'todo' as const,
            is_initial: true,
            is_final: false,
            color: '#6B7280', // gray-500
            display_order: 0,
          },
          {
            status_name: 'In Progress',
            status_category: 'in_progress' as const,
            is_initial: false,
            is_final: false,
            color: '#3B82F6', // blue-500
            display_order: 1,
          },
          {
            status_name: 'Done',
            status_category: 'completed' as const,
            is_initial: false,
            is_final: true,
            color: '#10B981', // green-500
            display_order: 2,
          },
        ],
      },
    ];

    for (const statusGroup of statusesData) {
      const type = createdTypes.find((t) => t.name === statusGroup.typeName);
      if (!type) {
        console.log(`⚠️  Skipping statuses for ${statusGroup.typeName} - type not found`);
        continue;
      }

      for (const statusData of statusGroup.statuses) {
        const [existingStatus] = await db
          .select()
          .from(work_item_statuses)
          .where(
            and(
              eq(work_item_statuses.work_item_type_id, type.work_item_type_id),
              eq(work_item_statuses.status_name, statusData.status_name)
            )
          )
          .limit(1);

        if (existingStatus) {
          console.log(`✓ Status "${statusData.status_name}" for ${type.name} already exists`);
        } else {
          await db.insert(work_item_statuses).values({
            work_item_type_id: type.work_item_type_id,
            ...statusData,
          });
          console.log(`✅ Created status: ${statusData.status_name} for ${type.name}`);
        }
      }
    }

    console.log('\n✅ Work item seeding completed successfully!');
    console.log(`\nCreated/verified ${createdTypes.length} work item types with their statuses.`);
  } catch (error) {
    console.error('❌ Error seeding work items:', error);
    throw error;
  }
}

// Run the seed function
seedWorkItems()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to seed work items:', error);
    process.exit(1);
  });
