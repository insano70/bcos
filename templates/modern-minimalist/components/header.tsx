import type { Practice, PracticeAttributes, ColorStyles } from '@/lib/types/practice';

interface HeaderProps {
  practice: Practice;
  attributes: PracticeAttributes;
  colorStyles?: ColorStyles;
}

export default function Header({ practice, attributes, colorStyles }: HeaderProps) {
  return (
    <header className="bg-white shadow-sm border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          {/* Logo */}
          <div className="flex items-center">
            {attributes.logo_url ? (
              <img 
                src={attributes.logo_url} 
                alt={`${practice.name} logo`}
                className="h-8 w-auto"
              />
            ) : (
              <div className="text-2xl font-light text-gray-900">
                {practice.name}
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex space-x-8">
            <a href="#about" className="text-gray-600 hover:text-gray-900 font-light transition-colors">
              About
            </a>
            <a href="#services" className="text-gray-600 hover:text-gray-900 font-light transition-colors">
              Services
            </a>
            <a href="#providers" className="text-gray-600 hover:text-gray-900 font-light transition-colors">
              Providers
            </a>
            <a href="#contact" className="text-gray-600 hover:text-gray-900 font-light transition-colors">
              Contact
            </a>
          </nav>

          {/* Contact Info */}
          <div className="hidden lg:flex items-center space-x-4">
            {attributes.phone && (
              <a 
                href={`tel:${attributes.phone}`}
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                {attributes.phone}
              </a>
            )}
            <a 
              href="#appointment" 
              className="px-4 py-2 text-sm font-light transition-colors bg-practice-primary"
            >
              Schedule
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
