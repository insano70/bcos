import { db, users, templates, practices, practice_attributes, staff_members } from './index';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../auth/password';

async function seedUsers() {
  console.log('🌱 Seeding users...');

  try {
    // Check if admin user already exists
    const existingAdmin = await db
      .select()
      .from(users)
      .where(eq(users.email, 'admin@bendcare.com'))
      .limit(1);

    if (existingAdmin.length === 0) {
      // Create admin user
      const adminPasswordHash = await hashPassword('admin123!'); // Change this to a secure password

      const [adminUser] = await db
        .insert(users)
        .values({
          email: 'admin@bendcare.com',
          first_name: 'Bendcare',
          last_name: 'Admin',
          password_hash: adminPasswordHash,
          email_verified: true,
          is_active: true,
        })
        .returning();

      console.log('✅ Admin user created:', adminUser.email);
    } else {
      console.log('ℹ️  Admin user already exists, skipping...');
    }

    // Add more sample users for development
    const sampleUsers = [
      {
        email: 'john.doe@example.com',
        first_name: 'John',
        last_name: 'Doe',
        password_hash: await hashPassword('password123'),
        email_verified: true,
        is_active: true,
      },
      {
        email: 'jane.smith@example.com',
        first_name: 'Jane',
        last_name: 'Smith',
        password_hash: await hashPassword('password123'),
        email_verified: false,
        is_active: true,
      },
      {
        email: 'bob.johnson@example.com',
        first_name: 'Bob',
        last_name: 'Johnson',
        password_hash: await hashPassword('password123'),
        email_verified: true,
        is_active: false,
      },
    ];

    // Check and create sample users
    for (const userData of sampleUsers) {
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, userData.email))
        .limit(1);

      if (existingUser.length === 0) {
        const [newUser] = await db.insert(users).values(userData).returning();

        console.log('✅ Sample user created:', newUser.email);
      } else {
        console.log(`ℹ️  User ${userData.email} already exists, skipping...`);
      }
    }

    console.log('🎉 User seeding completed!');
  } catch (error) {
    console.error('❌ Error seeding users:', error);
    throw error;
  }
}

async function seedTemplates() {
  console.log('🎨 Seeding templates...');
  
  const templateData = [
    {
      name: 'Classic Professional',
      slug: 'classic-professional',
      description: 'Traditional medical practice layout inspired by established rheumatology clinics like Denver Arthritis Clinic',
    },
    {
      name: 'Modern Minimalist',
      slug: 'modern-minimalist', 
      description: 'Clean, contemporary design focusing on expertise and technology',
    },
    {
      name: 'Warm & Welcoming',
      slug: 'warm-welcoming',
      description: 'Patient-friendly, approachable design emphasizing comfort and care',
    },
    {
      name: 'Clinical Focus',
      slug: 'clinical-focus',
      description: 'Research and expertise-focused design for academic practices',
    },
    {
      name: 'Community Practice',
      slug: 'community-practice',
      description: 'Local, family-oriented approach for neighborhood practices',
    }
  ];

  for (const template of templateData) {
    const existing = await db
      .select()
      .from(templates)
      .where(eq(templates.slug, template.slug))
      .limit(1);

    if (existing.length === 0) {
      const [newTemplate] = await db
        .insert(templates)
        .values(template)
        .returning();
      
      console.log('✅ Template created:', newTemplate.name);
    } else {
      console.log(`ℹ️  Template ${template.name} already exists, skipping...`);
    }
  }
}

async function seedPractices() {
  console.log('🏥 Seeding sample practice...');
  
  try {
        // Get a random template for demo
        const allTemplates = await db.select().from(templates).where(eq(templates.is_active, true));
        const randomTemplate = allTemplates[Math.floor(Math.random() * allTemplates.length)];

        if (!randomTemplate) {
          console.log('❌ No templates found, skipping practice seeding');
          return;
        }

        console.log(`ℹ️  Using template: ${randomTemplate.name} (${randomTemplate.slug})`);

    // Get admin user
    const [adminUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'admin@bendcare.com'))
      .limit(1);

    if (!adminUser) {
      console.log('❌ Admin user not found, skipping practice seeding');
      return;
    }

    // Check if demo practice exists
    const existingPractice = await db
      .select()
      .from(practices)
      .where(eq(practices.domain, 'demo-rheumatology.com'))
      .limit(1);

    if (existingPractice.length === 0) {
      const [newPractice] = await db
        .insert(practices)
        .                    values({
                      name: 'Demo Rheumatology Clinic',
                      domain: 'demo-rheumatology.com',
                      template_id: randomTemplate.template_id,
                      status: 'active',
                      owner_user_id: adminUser.user_id,
                    })
        .returning();
      
      console.log('✅ Demo practice created:', newPractice.name);
      
      // Create practice attributes
      await db
        .insert(practice_attributes)
        .values({
          practice_id: newPractice.practice_id,
          phone: '(303) 555-0123',
          email: 'info@demo-rheumatology.com',
          address_line1: '123 Medical Center Drive',
          address_line2: 'Suite 200',
          city: 'Denver',
          state: 'CO',
          zip_code: '80202',
          business_hours: JSON.stringify({
            monday: { open: '08:00', close: '17:00', closed: false },
            tuesday: { open: '08:00', close: '17:00', closed: false },
            wednesday: { open: '08:00', close: '17:00', closed: false },
            thursday: { open: '08:00', close: '17:00', closed: false },
            friday: { open: '08:00', close: '17:00', closed: false },
            saturday: { closed: true },
            sunday: { closed: true }
          }),
          services: JSON.stringify([
            'Rheumatoid Arthritis Treatment',
            'Lupus Management', 
            'Infusion Therapy',
            'Joint Injections',
            'Osteoporosis Treatment',
            'Clinical Research'
          ]),
          conditions_treated: JSON.stringify([
            'Rheumatoid Arthritis',
            'Psoriatic Arthritis', 
            'Lupus',
            'Gout',
            'Osteoporosis',
            'Osteoarthritis',
            'Fibromyalgia',
            'Ankylosing Spondylitis'
          ]),
          insurance_accepted: JSON.stringify([
            'Aetna',
            'Anthem Blue Cross Blue Shield',
            'Cigna', 
            'Medicare',
            'UnitedHealthcare',
            'Rocky Mountain Health Plans'
          ]),
          about_text: 'Demo Rheumatology Clinic has been providing expert rheumatology care for over 20 years. Our board-certified rheumatologists specialize in treating complex autoimmune and inflammatory conditions.',
          mission_statement: 'To provide compassionate, expert rheumatology care while advancing the field through research and education.',
          welcome_message: 'Welcome to Demo Rheumatology Clinic, where expert care meets compassionate treatment.',
          meta_title: 'Demo Rheumatology Clinic - Expert Arthritis & Autoimmune Care',
          meta_description: 'Leading rheumatology practice specializing in rheumatoid arthritis, lupus, and autoimmune conditions. Expert care from board-certified rheumatologists.'
        });

      // Create sample staff member
      await db
        .insert(staff_members)
        .values({
          practice_id: newPractice.practice_id,
          name: 'Dr. Sarah Johnson',
          title: 'Rheumatologist',
          credentials: 'MD, FACR',
          bio: 'Dr. Johnson is a board-certified rheumatologist with over 15 years of experience treating autoimmune and inflammatory conditions. She completed her fellowship at Johns Hopkins and specializes in rheumatoid arthritis and lupus.',
          specialties: JSON.stringify([
            'Rheumatoid Arthritis',
            'Lupus',
            'Infusion Therapy',
            'Clinical Research'
          ]),
          education: JSON.stringify([
            { degree: 'MD', school: 'University of Colorado School of Medicine', year: '2005' },
            { degree: 'Rheumatology Fellowship', school: 'Johns Hopkins Hospital', year: '2009' },
            { degree: 'Internal Medicine Residency', school: 'Denver Health Medical Center', year: '2008' }
          ]),
          display_order: 1,
        });
      
      console.log('✅ Demo practice configuration and staff created');
    } else {
      console.log('ℹ️  Demo practice already exists, skipping...');
    }
    
  } catch (error) {
    console.error('❌ Error seeding practices:', error);
    throw error;
  }
}

async function seed() {
  console.log('🚀 Starting database seeding...');
  
  try {
    await seedUsers();
    await seedTemplates();
    await seedPractices();
    
    console.log('✨ Database seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('💥 Database seeding failed:', error);
    process.exit(1);
  }
}

// Run the seed function if this file is executed directly
if (require.main === module) {
  seed();
}

export { seed, seedUsers };
