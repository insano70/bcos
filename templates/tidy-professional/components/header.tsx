import type { Practice, PracticeAttributes } from '@/lib/types/practice';

interface HeaderProps {
  practice: Practice;
  attributes: PracticeAttributes;
  colorStyles: any;
}

export default function Header({ practice, attributes, colorStyles }: HeaderProps) {
  return (
    <header className="absolute w-full z-30">
      <div className="max-w-6xl mx-auto px-5 sm:px-6">
        <div className="flex items-center justify-between h-16 md:h-20">

          {/* Site branding */}
          <div className="shrink-0 mr-4">
            {attributes.logo_url ? (
              <img 
                src={attributes.logo_url} 
                alt={`${practice.name} logo`}
                className="h-8 w-auto"
              />
            ) : (
              <div className="text-2xl font-bold font-playfair-display" style={colorStyles.primaryText}>
                {practice.name}
              </div>
            )}
          </div>

          {/* Desktop navigation */}
          <nav className="hidden md:flex md:grow">

            {/* Desktop menu links */}
            <ul className="flex grow justify-start flex-wrap items-center">
              <li>
                <a 
                  href="#about" 
                  className="font-medium text-slate-800 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-600 px-3 lg:px-5 py-2 flex items-center transition duration-150 ease-in-out"
                >
                  About
                </a>
              </li>
              <li>
                <a 
                  href="#services" 
                  className="font-medium text-slate-800 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-600 px-3 lg:px-5 py-2 flex items-center transition duration-150 ease-in-out"
                >
                  Services
                </a>
              </li>
              <li>
                <a 
                  href="#providers" 
                  className="font-medium text-slate-800 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-600 px-3 lg:px-5 py-2 flex items-center transition duration-150 ease-in-out"
                >
                  Our Team
                </a>
              </li>
              <li>
                <a 
                  href="#contact" 
                  className="font-medium text-slate-800 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-600 px-3 lg:px-5 py-2 flex items-center transition duration-150 ease-in-out"
                >
                  Contact
                </a>
              </li>
            </ul>

            {/* Desktop action links */}
            <ul className="flex grow justify-end flex-wrap items-center">
              {attributes.phone && (
                <li>
                  <a 
                    href={`tel:${attributes.phone}`} 
                    className="font-medium text-slate-800 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-600 px-3 lg:px-5 py-2 flex items-center transition duration-150 ease-in-out"
                  >
                    {attributes.phone}
                  </a>
                </li>
              )}
              <li>
                <a 
                  href="#appointment" 
                  className="font-medium px-3 lg:px-5 py-2 flex items-center transition duration-150 ease-in-out group"
                  style={colorStyles.primaryText}
                >
                  Schedule Appointment 
                  <span className="tracking-normal group-hover:translate-x-0.5 transition-transform duration-150 ease-in-out ml-1">
                    →
                  </span>
                </a>
              </li>
            </ul>

          </nav>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button 
              className="hamburger"
              aria-label="Toggle mobile menu"
            >
              <span className="hamburger-box">
                <span className="hamburger-inner bg-slate-800"></span>
              </span>
            </button>
          </div>

        </div>
      </div>
    </header>
  );
}
