'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export default function AppearancePanel() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div className="grow">
      {/* Panel body */}
      <div className="p-6 space-y-6">
        <h2 className="text-2xl text-gray-800 dark:text-gray-100 font-bold mb-5">
          Appearance
        </h2>

        {/* Theme Selection */}
        <section>
          <h3 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-1">
            Theme
          </h3>
          <div className="text-sm">Choose your preferred color scheme.</div>
          <div className="flex flex-col mt-5 space-y-3">
            {/* Light Mode Option */}
            <label className="flex items-center">
              <input
                type="radio"
                name="theme"
                value="light"
                checked={theme === 'light'}
                onChange={() => setTheme('light')}
                className="form-radio"
              />
              <span className="text-sm text-gray-600 dark:text-gray-300 font-medium ml-2">
                Light Mode
              </span>
            </label>

            {/* Dark Mode Option */}
            <label className="flex items-center">
              <input
                type="radio"
                name="theme"
                value="dark"
                checked={theme === 'dark'}
                onChange={() => setTheme('dark')}
                className="form-radio"
              />
              <span className="text-sm text-gray-600 dark:text-gray-300 font-medium ml-2">
                Dark Mode
              </span>
            </label>

            {/* System Preference Option */}
            <label className="flex items-center">
              <input
                type="radio"
                name="theme"
                value="system"
                checked={theme === 'system'}
                onChange={() => setTheme('system')}
                className="form-radio"
              />
              <span className="text-sm text-gray-600 dark:text-gray-300 font-medium ml-2">
                System Preference
              </span>
            </label>
          </div>
        </section>
      </div>

      {/* Panel footer */}
      <footer>
        <div className="flex flex-col px-6 py-5 border-t border-gray-200 dark:border-gray-700/60">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Theme changes are applied immediately and saved automatically.
          </div>
        </div>
      </footer>
    </div>
  );
}
