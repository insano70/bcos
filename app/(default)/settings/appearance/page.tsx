export const metadata = {
  title: 'Appearance Settings - Thrive',
  description: 'Customize your theme and appearance preferences',
};

import { Card } from '@/components/ui/card';
import SettingsSidebar from '../settings-sidebar';
import AppearancePanel from './appearance-panel';

export default function AppearanceSettings() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* Page header */}
      <div className="mb-8">
        {/* Title */}
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
          Settings
        </h1>
      </div>

      {/* Content */}
      <Card padding="none" className="mb-8">
        <div className="flex flex-col md:flex-row md:-mr-px">
          <SettingsSidebar />
          <AppearancePanel />
        </div>
      </Card>
    </div>
  );
}
