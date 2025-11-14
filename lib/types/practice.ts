// Core practice data types for template system

export interface Practice {
  practice_id: string;
  id: string; // Alias for practice_id for consistency with selection hooks
  name: string;
  domain: string;
  status: 'active' | 'inactive' | 'pending';
  template_id: string;
  template_name?: string;
  owner_email?: string;
  created_at: string;
}

export interface PracticeAttributes {
  practice_attribute_id: string;
  practice_id: string;

  // Contact Information
  phone?: string;
  email?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip_code?: string;

  // Business Details
  business_hours?: BusinessHours;
  services?: string[];
  insurance_accepted?: string[];
  conditions_treated?: string[];

  // Content
  about_text?: string;
  mission_statement?: string;
  welcome_message?: string;

  // Media
  logo_url?: string;
  hero_image_url?: string;
  hero_overlay_opacity?: number; // 0.0 to 1.0
  gallery_images?: string[];

  // SEO
  meta_title?: string;
  meta_description?: string;

  // Brand Colors
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;

  // Clinect Ratings Integration
  practice_slug?: string;
  ratings_feed_enabled?: boolean;

  updated_at: string;
}

export interface BusinessHours {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
}

export interface DaySchedule {
  open?: string; // "08:00"
  close?: string; // "17:00"
  closed: boolean;
}

export interface StaffMember {
  staff_id: string;
  practice_id: string;
  name: string;
  title?: string;
  credentials?: string;
  bio?: string;
  photo_url?: string;
  specialties?: string[];
  education?: Education[];
  display_order: number;
  is_active: boolean;
}

export interface Education {
  degree: string;
  school: string;
  year: string;
}

// Color styles interface for templates
// @deprecated - Use CSS custom properties (bg-practice-primary, text-practice-primary, etc.) instead
// This interface will be removed in a future version
export interface ColorStyles {
  primary: {
    backgroundColor: string;
    color: string;
  };
  primaryText: {
    color: string;
  };
  primaryBorder: {
    borderColor: string;
    color: string;
  };
  primaryBg50: {
    backgroundColor: string;
  };
  primaryBg100: {
    backgroundColor: string;
  };
  primaryGradient: {
    background: string;
  };
  secondary: {
    backgroundColor: string;
  };
  secondaryText: {
    color: string;
  };
  accent: {
    backgroundColor: string;
    color: string;
  };
  accentText: {
    color: string;
  };
  accentBorder: {
    borderColor: string;
    color: string;
  };
}

// Practice comment interface
export interface PracticeComment {
  comment_id: string;
  practice_id: string;
  commenter_name: string | null;
  commenter_location: string | null;
  comment: string;
  rating: string;
  display_order: number;
  created_at: Date;
}

// Clinect Ratings Integration interfaces
export interface ClinectRating {
  provider_id: string;
  id_slug: string;
  response_count: number;
  curated_response_count: number;
  score_value: number; // 0-100
  score_value_stars: number; // 0-5
}

export interface ClinectReview {
  survey_response_id: string;
  score_value: number; // 0-100
  score_value_pure_5: number; // 0-5
  approved_comment: string;
  patient_name: string | null;
  approved_at_formatted: string;
}

export interface ClinectReviews {
  data: ClinectReview[];
}

// Template props interface - what all templates receive
export interface TemplateProps {
  practice: Practice;
  attributes: PracticeAttributes;
  staff: StaffMember[];
  comments?: PracticeComment[]; // Optional customer reviews for carousel
  clinectRatings?: ClinectRating | null | undefined; // Clinect aggregate ratings (SSR data)
  clinectReviews?: ClinectReview[] | null | undefined; // Clinect reviews (SSR data)
  /** @deprecated - Use CSS custom properties instead. This prop will be removed in a future version. */
  colorStyles?: ColorStyles; // Dynamic color styles for the template (DEPRECATED)
  nonce?: string; // CSP nonce for inline scripts and styles
}
