'use client';

interface FieldDefinition {
  name: string;
  type: string;
  description: string;
  example: any;
  groupable: boolean;
  filterable: boolean;
  aggregatable?: boolean;
  allowedValues?: string[];
}

interface SchemaInfo {
  fields: Record<string, FieldDefinition>;
  availableMeasures: Array<{ measure: string }>;
  availableFrequencies: Array<{ frequency: string }>;
}

interface ChartBuilderSchemaProps {
  schemaInfo: SchemaInfo;
}

export default function ChartBuilderSchema({ schemaInfo }: ChartBuilderSchemaProps) {
  return (
    <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4">
      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 group-open:text-violet-600 dark:group-open:text-violet-400">
          📊 Available Data Fields ({Object.keys(schemaInfo.fields).length})
        </summary>
        
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {Object.entries(schemaInfo.fields).map(([key, field]) => (
            <div key={key} className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
              <div className="font-medium text-gray-900 dark:text-gray-100">{field.name}</div>
              <div className="text-gray-600 dark:text-gray-400">{field.type}</div>
              <div className="text-gray-500 dark:text-gray-400 mt-1">{field.description}</div>
              {field.example && (
                <div className="text-violet-600 dark:text-violet-400 mt-1">
                  Example: {field.example}
                </div>
              )}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
