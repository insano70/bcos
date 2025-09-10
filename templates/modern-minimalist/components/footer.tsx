import type { Practice, PracticeAttributes, ColorStyles } from '@/lib/types/practice';

interface FooterProps {
  practice: Practice;
  attributes: PracticeAttributes;
  colorStyles: ColorStyles;
}

export default function Footer({ practice, attributes, colorStyles }: FooterProps) {
  return (
    <footer className="text-white py-12" style={colorStyles.primary}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="text-gray-300">
            © {new Date().getFullYear()} {practice.name}. Modern rheumatology care.
          </p>
        </div>
      </div>
    </footer>
  );
}