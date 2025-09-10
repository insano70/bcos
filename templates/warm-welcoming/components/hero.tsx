import type { Practice, PracticeAttributes } from '@/lib/types/practice';

interface HeroProps {
  practice: Practice;
  attributes: PracticeAttributes;
  colorStyles: any;
}

export default function Hero({ practice, attributes, colorStyles }: HeroProps) {
  return (
    <section className="relative bg-gradient-to-br from-amber-100 to-orange-200 py-20 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif text-amber-900 leading-tight mb-6">
              {attributes.welcome_message || `Caring for You Like Family`}
            </h1>
            <p className="text-xl text-amber-800 leading-relaxed mb-8">
              {attributes.about_text || 
                `At our practice, we believe in treating every patient with the warmth and compassion they deserve. Our experienced team is here to guide you through your rheumatology journey with understanding and expertise.`
              }
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a 
                href="#appointment" 
                className="px-8 py-4 text-lg rounded-full transition-colors text-center shadow-lg"
                style={colorStyles.primary}
              >
                Schedule a Visit
              </a>
              <a 
                href="#about" 
                className="border-2 px-8 py-4 text-lg rounded-full transition-colors text-center"
                style={colorStyles.primaryBorder}
              >
                Learn More
              </a>
            </div>
          </div>

          {/* Image */}
          <div className="relative">
            {attributes.hero_image_url ? (
              <img 
                src={attributes.hero_image_url} 
                alt={`${practice.name} welcoming environment`}
                className="w-full h-96 object-cover rounded-3xl shadow-2xl"
              />
            ) : (
              <div className="w-full h-96 bg-gradient-to-br from-amber-200 to-orange-300 rounded-3xl flex items-center justify-center shadow-2xl">
                <div className="text-center">
                  <div className="text-6xl text-amber-700 mb-4">🏥</div>
                  <p className="text-amber-800 font-serif text-lg">Welcoming Medical Environment</p>
                </div>
              </div>
            )}
            <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-orange-300 rounded-full opacity-60"></div>
            <div className="absolute -top-6 -left-6 w-16 h-16 bg-amber-300 rounded-full opacity-40"></div>
          </div>
        </div>
      </div>
    </section>
  );
}
