import type { Practice, PracticeAttributes } from '@/lib/types/practice';

interface HeaderProps {
  practice: Practice;
  attributes: PracticeAttributes;
}

export default function Header({ practice, attributes }: HeaderProps) {
  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and practice name */}
          <div className="flex items-center">
            {attributes.logo_url ? (
              <img
                src={attributes.logo_url}
                alt={`${practice.name} logo`}
                className="h-10 w-auto"
              />
            ) : (
              <div className="h-10 w-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">🏥</span>
              </div>
            )}
            <div className="ml-3">
              <h1 className="text-xl font-bold text-gray-900">{practice.name}</h1>
            </div>
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex space-x-8">
            <a href="#about" className="text-gray-700 hover:text-blue-600 font-medium">
              About
            </a>
            <a href="#services" className="text-gray-700 hover:text-blue-600 font-medium">
              Services
            </a>
            <a href="#providers" className="text-gray-700 hover:text-blue-600 font-medium">
              Our Team
            </a>
            <a href="#contact" className="text-gray-700 hover:text-blue-600 font-medium">
              Contact
            </a>
          </nav>

          {/* Contact info */}
          <div className="hidden lg:flex items-center space-x-4">
            {attributes.phone && (
              <a
                href={`tel:${attributes.phone}`}
                className="text-blue-600 hover:text-blue-700 font-semibold"
              >
                {attributes.phone}
              </a>
            )}
            <button
              type="button"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Schedule Appointment
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
