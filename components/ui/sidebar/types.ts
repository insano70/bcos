/**
 * Sidebar Component Types
 * Type definitions for sidebar menu structure and components
 */

export interface SidebarMenuItem {
  href: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
  permissions?: string | string[];
  requireAll?: boolean;
}

export interface SidebarMenuGroup {
  title: string;
  items: SidebarMenuItem[];
  icon?: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  permissions?: string | string[];
  requireAll?: boolean;
}

export interface SidebarState {
  sidebarOpen: boolean;
  sidebarExpanded: boolean;
  setSidebarOpen: (open: boolean) => void;
  setSidebarExpanded: (expanded: boolean) => void;
}

export interface SidebarVariant {
  variant?: 'default' | 'v2';
}
