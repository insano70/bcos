import type { Practice, PracticeAttributes } from '@/lib/types/practice';

interface HeaderProps {
  practice: Practice;
  attributes: PracticeAttributes;
  colorStyles?: any;
}

export default function Header({ practice, attributes, colorStyles }: HeaderProps) {
  return (
    <header className="bg-white shadow-sm border-b-2 border-amber-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          {/* Logo */}
          <div className="flex items-center">
            {attributes.logo_url ? (
              <img 
                src={attributes.logo_url} 
                alt={`${practice.name} logo`}
                className="h-10 w-auto"
              />
            ) : (
              <div className="text-2xl font-serif text-amber-900">
                {practice.name}
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex space-x-8">
            <a href="#about" className="text-amber-800 hover:text-amber-900 font-medium transition-colors">
              About
            </a>
            <a href="#services" className="text-amber-800 hover:text-amber-900 font-medium transition-colors">
              Services
            </a>
            <a href="#providers" className="text-amber-800 hover:text-amber-900 font-medium transition-colors">
              Our Team
            </a>
            <a href="#contact" className="text-amber-800 hover:text-amber-900 font-medium transition-colors">
              Contact
            </a>
          </nav>

          {/* Contact Info */}
          <div className="hidden lg:flex items-center space-x-4">
            {attributes.phone && (
              <a 
                href={`tel:${attributes.phone}`}
                className="text-sm text-amber-800 hover:text-amber-900 transition-colors"
              >
                {attributes.phone}
              </a>
            )}
            <a 
              href="#appointment" 
              className="px-6 py-2 rounded-full text-sm transition-colors bg-practice-primary"
            >
              Book Appointment
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
