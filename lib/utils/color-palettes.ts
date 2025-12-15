/**
 * Predefined color palette templates for practices
 * All palettes are designed to meet WCAG AA contrast standards
 */

export interface ColorPalette {
  id: string;
  name: string;
  description: string;
  category: 'professional' | 'warm' | 'clinical' | 'modern' | 'community' | 'creative';
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  // Suggested use cases
  bestFor?: string[];
}

export const COLOR_PALETTES: ColorPalette[] = [
  // Professional Category
  {
    id: 'classic-blue',
    name: 'Classic Blue',
    description: 'Traditional medical professional palette with trustworthy blues',
    category: 'professional',
    colors: {
      primary: '#00AEEF',
      secondary: '#FFFFFF',
      accent: '#44C0AE',
    },
    bestFor: ['Established practices', 'Traditional approach', 'Insurance-focused'],
  },
  {
    id: 'executive-navy',
    name: 'Executive Navy',
    description: 'Sophisticated deep blue with premium feel',
    category: 'professional',
    colors: {
      primary: '#1E3A8A',
      secondary: '#F8FAFC',
      accent: '#3B82F6',
    },
    bestFor: ['Executive health', 'Concierge medicine', 'Premium services'],
  },
  {
    id: 'tidy-modern',
    name: 'Tidy Modern',
    description: 'Contemporary blue with light accents',
    category: 'professional',
    colors: {
      primary: '#2174EA',
      secondary: '#F8FAFC',
      accent: '#5696FF',
    },
    bestFor: ['Modern practices', 'Tech-forward', 'Digital health'],
  },

  // Warm Category
  {
    id: 'warm-welcome',
    name: 'Warm Welcome',
    description: 'Inviting golden tones for patient comfort',
    category: 'warm',
    colors: {
      primary: '#D69E2E',
      secondary: '#FFF5E6',
      accent: '#C05621',
    },
    bestFor: ['Family practices', 'Pediatrics', 'Patient-centered care'],
  },
  {
    id: 'sunset-coral',
    name: 'Sunset Coral',
    description: 'Warm coral with energetic accents',
    category: 'warm',
    colors: {
      primary: '#F59E0B',
      secondary: '#FFF7ED',
      accent: '#DC2626',
    },
    bestFor: ['Wellness centers', 'Holistic medicine', 'Lifestyle practices'],
  },
  {
    id: 'earth-tones',
    name: 'Earth Tones',
    description: 'Natural, grounding browns and tans',
    category: 'warm',
    colors: {
      primary: '#92400E',
      secondary: '#FEF3C7',
      accent: '#78350F',
    },
    bestFor: ['Natural medicine', 'Integrative care', 'Spa-like environments'],
  },

  // Clinical Category
  {
    id: 'clinical-focus',
    name: 'Clinical Focus',
    description: 'Medical blue with clean green accents',
    category: 'clinical',
    colors: {
      primary: '#2B6CB0',
      secondary: '#EDF2F7',
      accent: '#38A169',
    },
    bestFor: ['Research practices', 'Academic medicine', 'Specialized care'],
  },
  {
    id: 'medical-teal',
    name: 'Medical Teal',
    description: 'Clinical teal with sterile whites',
    category: 'clinical',
    colors: {
      primary: '#0D9488',
      secondary: '#F0FDFA',
      accent: '#14B8A6',
    },
    bestFor: ['Surgery centers', 'Urgent care', 'Medical procedures'],
  },
  {
    id: 'hospital-green',
    name: 'Hospital Green',
    description: 'Classic medical green with calming tones',
    category: 'clinical',
    colors: {
      primary: '#059669',
      secondary: '#ECFDF5',
      accent: '#10B981',
    },
    bestFor: ['Hospitals', 'Emergency medicine', 'Surgical practices'],
  },

  // Modern Category
  {
    id: 'minimalist-charcoal',
    name: 'Minimalist Charcoal',
    description: 'Bold charcoal with vibrant orange accents',
    category: 'modern',
    colors: {
      primary: '#2D3748',
      secondary: '#F7FAFC',
      accent: '#ED8936',
    },
    bestFor: ['Design-conscious', 'Urban practices', 'Contemporary aesthetic'],
  },
  {
    id: 'tech-purple',
    name: 'Tech Purple',
    description: 'Modern purple for innovative practices',
    category: 'modern',
    colors: {
      primary: '#7C3AED',
      secondary: '#FAF5FF',
      accent: '#A78BFA',
    },
    bestFor: ['Telemedicine', 'Digital health', 'Innovation-focused'],
  },
  {
    id: 'slate-steel',
    name: 'Slate & Steel',
    description: 'Industrial slate with cool blue accents',
    category: 'modern',
    colors: {
      primary: '#475569',
      secondary: '#F1F5F9',
      accent: '#0EA5E9',
    },
    bestFor: ['Sports medicine', 'Orthopedics', 'Physical therapy'],
  },

  // Community Category
  {
    id: 'community-green',
    name: 'Community Green',
    description: 'Friendly green with approachable feel',
    category: 'community',
    colors: {
      primary: '#48BB78',
      secondary: '#F0FFF4',
      accent: '#9F7AEA',
    },
    bestFor: ['Community clinics', 'Non-profit care', 'Local practices'],
  },
  {
    id: 'neighborhood-blue',
    name: 'Neighborhood Blue',
    description: 'Approachable sky blue for local care',
    category: 'community',
    colors: {
      primary: '#38B2AC',
      secondary: '#E6FFFA',
      accent: '#4299E1',
    },
    bestFor: ['Family medicine', 'Neighborhood clinics', 'Walk-in care'],
  },
  {
    id: 'caring-lavender',
    name: 'Caring Lavender',
    description: 'Gentle lavender with compassionate tones',
    category: 'community',
    colors: {
      primary: '#9F7AEA',
      secondary: '#FAF5FF',
      accent: '#ED64A6',
    },
    bestFor: ['Mental health', 'Counseling', 'Support services'],
  },

  // Creative Category
  {
    id: 'vibrant-magenta',
    name: 'Vibrant Magenta',
    description: 'Bold magenta for distinctive branding',
    category: 'creative',
    colors: {
      primary: '#DB2777',
      secondary: '#FDF2F8',
      accent: '#EC4899',
    },
    bestFor: ['Cosmetic medicine', 'Aesthetic practices', 'Unique branding'],
  },
  {
    id: 'energetic-cyan',
    name: 'Energetic Cyan',
    description: 'Fresh cyan with electric feel',
    category: 'creative',
    colors: {
      primary: '#06B6D4',
      secondary: '#ECFEFF',
      accent: '#0891B2',
    },
    bestFor: ['Sports medicine', 'Fitness-focused', 'Active lifestyle'],
  },
  {
    id: 'sunset-gradient',
    name: 'Sunset Gradient',
    description: 'Warm sunset with gradient inspiration',
    category: 'creative',
    colors: {
      primary: '#F97316',
      secondary: '#FFF7ED',
      accent: '#EA580C',
    },
    bestFor: ['Wellness spas', 'Lifestyle medicine', 'Holistic care'],
  },
];
