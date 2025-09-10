// Core practice data types for template system

export interface Practice {
  practice_id: string;
  name: string;
  domain: string;
  status: 'active' | 'inactive' | 'pending';
  template_id: string;
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
  gallery_images?: string[];
  
  // SEO
  meta_title?: string;
  meta_description?: string;
  
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

// Template props interface - what all templates receive
export interface TemplateProps {
  practice: Practice;
  attributes: PracticeAttributes;
  staff: StaffMember[];
}
