import type { Practice, PracticeAttributes } from '@/lib/types/practice';

interface FooterProps {
  practice: Practice;
  attributes: PracticeAttributes;
}

export default function Footer({ practice, attributes }: FooterProps) {
  return (
    <footer className="bg-gray-900 text-white py-12">
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