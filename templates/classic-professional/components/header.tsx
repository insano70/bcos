import type { Practice, PracticeAttributes, ColorStyles } from '@/lib/types/practice';

interface HeaderProps {
  practice: Practice;
  attributes: PracticeAttributes;
  colorStyles: ColorStyles;
}

export default function Header({ practice, attributes, colorStyles }: HeaderProps) {
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
              <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={colorStyles.primary}>
                <span className="text-white font-bold text-lg">🏥</span>
              </div>
            )}
            <div className="ml-3">
              <h1 className="text-xl font-bold text-gray-900">{practice.name}</h1>
            </div>
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex space-x-8">
            <a href="#about" className="text-gray-700 font-medium transition-colors hover:opacity-80" style={colorStyles.primaryText}>
              About
            </a>
            <a href="#services" className="text-gray-700 font-medium transition-colors hover:opacity-80" style={colorStyles.primaryText}>
              Services
            </a>
            <a href="#providers" className="text-gray-700 font-medium transition-colors hover:opacity-80" style={colorStyles.primaryText}>
              Our Team
            </a>
            <a href="#contact" className="text-gray-700 font-medium transition-colors hover:opacity-80" style={colorStyles.primaryText}>
              Contact
            </a>
          </nav>

          {/* Contact info */}
          <div className="hidden lg:flex items-center space-x-4">
            {attributes.phone && (
              <a
                href={`tel:${attributes.phone}`}
                className="font-semibold transition-colors"
                style={colorStyles.primaryText}
              >
                {attributes.phone}
              </a>
            )}
            <button
              type="button"
              className="px-4 py-2 rounded-lg transition-colors"
              style={colorStyles.primary}
            >
              Schedule Appointment
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
