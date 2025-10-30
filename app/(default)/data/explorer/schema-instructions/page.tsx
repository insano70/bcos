import { SelectedItemsProvider } from '@/app/selected-items-context';
import SchemaInstructionsContent from './instructions-content';

export const metadata = {
  title: 'Schema Instructions',
  description: 'Manage global query rules for AI SQL generation',
};

export default function SchemaInstructionsPage() {
  return (
    <SelectedItemsProvider>
      <SchemaInstructionsContent />
    </SelectedItemsProvider>
  );
}

