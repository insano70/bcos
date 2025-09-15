'use client';

import { useState, useId } from 'react';

interface ServicesEditorProps {
  services: string[];
  onChange: (services: string[]) => void;
  label?: string;
  placeholder?: string;
  className?: string;
}

export default function ServicesEditor({
  services = [],
  onChange,
  label = "Services",
  placeholder = "Enter service name (e.g., Rheumatoid Arthritis Treatment)",
  className = ''
}: ServicesEditorProps) {
  const [newService, setNewService] = useState('');
  const uid = useId();

  const addService = () => {
    if (newService.trim() && !services.includes(newService.trim())) {
      const updatedServices = [...services, newService.trim()];
      onChange(updatedServices);
      setNewService('');
    }
  };

  const removeService = (indexToRemove: number) => {
    const updatedServices = services.filter((_, index) => index !== indexToRemove);
    onChange(updatedServices);
  };

  const moveService = (fromIndex: number, toIndex: number) => {
    const updatedServices = [...services];
    const [movedService] = updatedServices.splice(fromIndex, 1);
    if (movedService) {
      updatedServices.splice(toIndex, 0, movedService);
      onChange(updatedServices);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addService();
    }
  };

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
        {label}
      </label>
      
      {/* Add new service */}
      <div className="flex gap-2 mb-4">
        <input
          id={`${uid}-new-service`}
          type="text"
          value={newService}
          onChange={(e) => setNewService(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          type="button"
          onClick={addService}
          disabled={!newService.trim() || services.includes(newService.trim())}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Add
        </button>
      </div>

      {/* Services list */}
      {services.length > 0 ? (
        <div className="space-y-2">
          {services.map((service, index) => (
            <div
              key={index}
              className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg group"
            >
              {/* Reorder buttons */}
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => moveService(index, index - 1)}
                  disabled={index === 0}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Move up"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => moveService(index, index + 1)}
                  disabled={index === services.length - 1}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Move down"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* Service name */}
              <div className="flex-1">
                <span className="text-gray-900 dark:text-gray-100">{service}</span>
              </div>

              {/* Delete button */}
              <button
                type="button"
                onClick={() => removeService(index)}
                className="p-1 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove service"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 bg-gray-50 dark:bg-gray-700 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
          <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            No services yet
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Add services to showcase what your practice offers.
          </p>
        </div>
      )}
    </div>
  );
}
