import ClassicProfessionalTemplate from '@/templates/classic-professional';
import ClinicalFocusTemplate from '@/templates/clinical-focus';
import CommunityPracticeTemplate from '@/templates/community-practice';
import ModernMinimalistTemplate from '@/templates/modern-minimalist';
import TidyProfessionalTemplate from '@/templates/tidy-professional';
import WarmWelcomingTemplate from '@/templates/warm-welcoming';

// Template mapping
const TEMPLATE_MAP = {
  'classic-professional': ClassicProfessionalTemplate,
  'modern-minimalist': ModernMinimalistTemplate,
  'warm-welcoming': WarmWelcomingTemplate,
  'clinical-focus': ClinicalFocusTemplate,
  'community-practice': CommunityPracticeTemplate,
  'tidy-professional': TidyProfessionalTemplate,
} as const;

export type TemplateSlug = keyof typeof TEMPLATE_MAP;

export function getTemplateComponent(slug: string) {
  // Default to classic-professional if template not found
  const templateSlug = (slug in TEMPLATE_MAP ? slug : 'classic-professional') as TemplateSlug;
  return TEMPLATE_MAP[templateSlug];
}

export function getAllTemplateOptions() {
  return [
    {
      slug: 'classic-professional',
      name: 'Classic Professional',
      description:
        'Traditional medical practice layout inspired by established rheumatology clinics',
    },
    {
      slug: 'modern-minimalist',
      name: 'Modern Minimalist',
      description: 'Clean, contemporary design focusing on expertise and technology',
    },
    {
      slug: 'warm-welcoming',
      name: 'Warm & Welcoming',
      description: 'Patient-friendly, approachable design emphasizing comfort and care',
    },
    {
      slug: 'clinical-focus',
      name: 'Clinical Focus',
      description: 'Research and expertise-focused design for academic practices',
    },
    {
      slug: 'community-practice',
      name: 'Community Practice',
      description: 'Local, family-oriented approach for neighborhood practices',
    },
    {
      slug: 'tidy-professional',
      name: 'Tidy Professional',
      description: 'Elegant, modern design with sophisticated typography and smooth animations',
    },
  ];
}
