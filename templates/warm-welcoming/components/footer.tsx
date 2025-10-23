import type { Practice, PracticeAttributes } from '@/lib/types/practice';

interface FooterProps {
  practice: Practice;
  attributes: PracticeAttributes;
  colorStyles?: any;
}

export default function Footer({ practice, attributes, colorStyles }: FooterProps) {
  return (
    <footer className="text-white py-12 bg-practice-primary">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Practice Info */}
          <div>
            <h3 className="text-2xl font-serif mb-4">{practice.name}</h3>
            <p className="text-amber-200 mb-4">
              Caring for our community with warmth and expertise
            </p>
            <div className="text-amber-200 space-y-2">
              {attributes.address_line1 && <p>{attributes.address_line1}</p>}
              {attributes.address_line2 && <p>{attributes.address_line2}</p>}
              {(attributes.city || attributes.state || attributes.zip_code) && (
                <p>
                  {attributes.city && `${attributes.city}, `}
                  {attributes.state && `${attributes.state} `}
                  {attributes.zip_code}
                </p>
              )}
            </div>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-lg font-serif mb-4">Contact Us</h3>
            <div className="space-y-2">
              {attributes.phone && (
                <p className="text-amber-200">
                  <a href={`tel:${attributes.phone}`} className="hover:text-white transition-colors">
                    {attributes.phone}
                  </a>
                </p>
              )}
              {attributes.email && (
                <p className="text-amber-200">
                  <a href={`mailto:${attributes.email}`} className="hover:text-white transition-colors">
                    {attributes.email}
                  </a>
                </p>
              )}
            </div>
          </div>

          {/* Services */}
          <div>
            <h3 className="text-lg font-serif mb-4">Our Care</h3>
            <div className="text-amber-200 space-y-2">
              <p>Compassionate Treatment</p>
              <p>Family-Centered Care</p>
              <p>Personalized Attention</p>
              <p>Expert Rheumatology</p>
            </div>
          </div>
        </div>

        <div className="border-t border-amber-800 mt-12 pt-8 text-center">
          <p className="text-amber-300">
            © {new Date().getFullYear()} {practice.name}. Caring for you with love and expertise.
          </p>
        </div>
      </div>
    </footer>
  );
}
