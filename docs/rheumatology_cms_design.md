# Rheumatology Practice Website Management System
## Design Document v1.0

---

## 1. Executive Summary

The Rheumatology Practice Website Management System is a specialized SaaS platform that enables rheumatology practices to quickly deploy and manage professional websites. The system provides 5 pre-designed templates specifically tailored for rheumatology practices, with a simple configuration interface for practice details and automatic domain-based routing.

### Key Features
- 5 professionally designed rheumatology-focused website templates
- Practice configuration management (contact info, hours, staff, services)
- Custom domain mapping and routing
- Responsive design optimized for medical practices
- Patient-focused content and functionality

---

## 2. System Architecture

### 2.1 High-Level Architecture
```
Internet → Load Balancer → Next.js App → PostgreSQL Database
                        ↓
                   Template Engine → Rendered Practice Website
```

### 2.2 Core Components
- **Admin Dashboard**: Practice configuration and template management
- **Template Engine**: Dynamic template rendering with practice data
- **Domain Router**: Multi-tenant domain handling
- **Database**: Practice configurations and template data
- **Public Website Renderer**: Customer-facing websites

---

## 3. Database Schema Design

### 3.1 Core Tables

```sql
-- Practice Management
practices (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) UNIQUE NOT NULL,
  template_id INTEGER REFERENCES templates(id),
  status ENUM('active', 'inactive', 'pending') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Template Definitions
templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  preview_image VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Practice Configuration
practice_configs (
  id SERIAL PRIMARY KEY,
  practice_id INTEGER REFERENCES practices(id) ON DELETE CASCADE,
  
  -- Contact Information
  phone VARCHAR(20),
  email VARCHAR(255),
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(20),
  
  -- Business Details
  business_hours JSONB, -- Flexible hours structure
  services JSONB, -- Array of services offered
  insurance_accepted JSONB, -- Array of insurance providers
  
  -- Content
  about_text TEXT,
  mission_statement TEXT,
  welcome_message TEXT,
  
  -- Media
  logo_url VARCHAR(500),
  hero_image_url VARCHAR(500),
  gallery_images JSONB, -- Array of image URLs
  
  -- SEO
  meta_title VARCHAR(255),
  meta_description VARCHAR(500),
  
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Staff/Doctor Profiles
staff_members (
  id SERIAL PRIMARY KEY,
  practice_id INTEGER REFERENCES practices(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  title VARCHAR(255),
  credentials VARCHAR(255),
  bio TEXT,
  photo_url VARCHAR(500),
  specialties JSONB,
  education JSONB,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

-- System Users (Practice Admins)
users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  role ENUM('admin', 'practice_owner') DEFAULT 'practice_owner',
  practice_id INTEGER REFERENCES practices(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 4. Template System Design

### 4.1 Template Structure
Each template will be a React component with standardized props interface:

```typescript
interface TemplateProps {
  practice: Practice;
  config: PracticeConfig;
  staff: StaffMember[];
}

interface Practice {
  id: number;
  name: string;
  domain: string;
  templateId: number;
}

interface PracticeConfig {
  // Contact & Location
  phone?: string;
  email?: string;
  address: Address;
  
  // Business
  businessHours: BusinessHours;
  services: Service[];
  insuranceAccepted: string[];
  
  // Content
  aboutText?: string;
  missionStatement?: string;
  welcomeMessage?: string;
  
  // Media
  logoUrl?: string;
  heroImageUrl?: string;
  galleryImages: string[];
  
  // SEO
  metaTitle?: string;
  metaDescription?: string;
}
```

### 4.2 Template Variants
1. **Classic Professional** - Traditional medical practice layout
2. **Modern Minimalist** - Clean, contemporary design
3. **Warm & Welcoming** - Patient-friendly, approachable design
4. **Clinical Focus** - Research and expertise-focused
5. **Community Practice** - Local, family-oriented approach

---

## 5. Key Features & User Stories

### 5.1 Admin Dashboard Features
- **Practice Management**
  - Create/edit practice profiles
  - Template selection and preview
  - Domain configuration
  - Practice status management

- **Content Management**
  - Practice information forms
  - Staff profile management
  - Image upload and management
  - Service/specialty configuration

- **Analytics & Monitoring**
  - Website traffic overview
  - Contact form submissions
  - Domain status monitoring

### 5.2 Public Website Features
- **Essential Pages**
  - Homepage with practice overview
  - About Us / Meet the Team
  - Services & Specialties
  - Contact & Location
  - Patient Resources

- **Patient-Focused Elements**
  - Clear contact information
  - Business hours display
  - Location with map integration
  - Insurance information
  - Appointment request forms
  - Emergency contact info

---

## 6. Technical Implementation

### 6.1 Domain Routing Strategy
```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const hostname = request.nextUrl.hostname;
  
  // Admin dashboard
  if (hostname === 'admin.yourdomain.com') {
    return NextResponse.rewrite(new URL('/admin', request.url));
  }
  
  // Practice websites
  const practice = await getPracticeByDomain(hostname);
  if (practice) {
    return NextResponse.rewrite(
      new URL(`/practice/${practice.id}`, request.url)
    );
  }
  
  return NextResponse.next();
}
```

### 6.2 Template Rendering
```typescript
// app/practice/[id]/page.tsx
export default async function PracticeWebsite({ params }: { params: { id: string } }) {
  const practice = await getPractice(params.id);
  const config = await getPracticeConfig(params.id);
  const staff = await getStaffMembers(params.id);
  const template = await getTemplate(practice.templateId);
  
  const TemplateComponent = await import(`@/templates/${template.slug}`);
  
  return (
    <TemplateComponent.default
      practice={practice}
      config={config}
      staff={staff}
    />
  );
}
```

### 6.3 Configuration API
```typescript
// RESTful API endpoints
GET    /api/practices/:id
PUT    /api/practices/:id
GET    /api/practices/:id/config
PUT    /api/practices/:id/config
GET    /api/practices/:id/staff
POST   /api/practices/:id/staff
PUT    /api/staff/:id
DELETE /api/staff/:id
```

---

## 7. Development Phases

### Phase 1: Core Infrastructure (Weeks 1-3)
- Database schema implementation
- Authentication system
- Basic admin dashboard
- Domain routing middleware
- First template implementation

### Phase 2: Template System (Weeks 4-6)
- Complete all 5 templates
- Template preview system
- Practice configuration forms
- Image upload functionality

### Phase 3: Enhanced Features (Weeks 7-8)
- SEO optimization
- Contact form handling
- Analytics integration
- Mobile responsiveness testing

### Phase 4: Polish & Launch (Weeks 9-10)
- User testing
- Performance optimization
- Documentation
- Deployment automation

---

## 8. Security Considerations

### 8.1 Multi-tenancy Security
- Practice data isolation
- Domain verification
- User access controls
- Secure file uploads

### 8.2 Data Protection
- HIPAA compliance considerations
- Encrypted sensitive data
- Secure authentication (NextAuth.js)
- Input validation and sanitization

---

## 9. Deployment Architecture

### 9.1 Infrastructure
- **Platform**: Vercel or similar Next.js-optimized platform
- **Database**: PostgreSQL (Supabase/Neon/Railway)
- **File Storage**: AWS S3 or Vercel Blob
- **Domain Management**: Programmatic DNS via Cloudflare API
- **Monitoring**: Vercel Analytics + Sentry

### 9.2 Custom Domain Setup Process
1. Customer configures DNS CNAME to point to your platform
2. SSL certificate automatic provisioning
3. Domain verification and activation
4. Practice website goes live

---

## 10. Success Metrics

- **Technical KPIs**
  - Website load time < 3 seconds
  - 99.9% uptime
  - Mobile responsiveness score > 95

- **Business KPIs**
  - Practice onboarding time < 30 minutes
  - Customer satisfaction score > 4.5/5
  - Template utilization distribution

---

## Next Steps

1. **Database Setup**: Implement the schema using Drizzle ORM
2. **Authentication**: Configure NextAuth.js for practice owners
3. **First Template**: Build the "Classic Professional" template
4. **Admin Dashboard**: Create practice configuration interface
5. **Domain Routing**: Implement middleware for multi-tenant routing

This system will provide rheumatology practices with professional websites in minutes rather than weeks, while maintaining the flexibility to customize their online presence.