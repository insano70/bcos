import type { TemplateProps } from '@/lib/types/practice';
import Head from 'next/head';

export default function ClinicalFocusTemplate({ 
  practice, 
  attributes, 
  staff 
}: TemplateProps) {
  return (
    <>
      <Head>
        <title>{attributes.meta_title || `${practice.name} - Research-Driven Rheumatology`}</title>
        <meta name="description" content={attributes.meta_description || `Academic excellence in rheumatology research and patient care at ${practice.name}`} />
      </Head>

      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <header className="bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold text-slate-900">{practice.name}</h1>
              <nav className="space-x-6">
                <a href="#research" className="text-slate-600 hover:text-slate-900">Research</a>
                <a href="#services" className="text-slate-600 hover:text-slate-900">Services</a>
                <a href="#faculty" className="text-slate-600 hover:text-slate-900">Faculty</a>
                <a href="#contact" className="text-slate-600 hover:text-slate-900">Contact</a>
              </nav>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="py-20 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
          <div className="max-w-7xl mx-auto px-4 text-center">
            <h1 className="text-5xl font-bold mb-6">Advancing Rheumatology Through Research</h1>
            <p className="text-xl mb-8 max-w-3xl mx-auto">
              {attributes.about_text || "Leading academic medical center combining cutting-edge research with exceptional patient care"}
            </p>
            <div className="space-x-4">
              <a href="#appointment" className="bg-white text-blue-600 px-8 py-3 rounded font-semibold hover:bg-gray-100">
                Schedule Consultation
              </a>
              <a href="#research" className="border border-white text-white px-8 py-3 rounded hover:bg-white hover:text-blue-600">
                View Research
              </a>
            </div>
          </div>
        </section>

        {/* Research Focus */}
        <section id="research" className="py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4">
            <h2 className="text-3xl font-bold text-center mb-12">Research Excellence</h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center p-6">
                <div className="text-4xl mb-4">🔬</div>
                <h3 className="text-xl font-semibold mb-2">Clinical Trials</h3>
                <p>Leading innovative clinical trials for breakthrough treatments</p>
              </div>
              <div className="text-center p-6">
                <div className="text-4xl mb-4">📊</div>
                <h3 className="text-xl font-semibold mb-2">Data Analysis</h3>
                <p>Advanced biostatistical analysis and outcomes research</p>
              </div>
              <div className="text-center p-6">
                <div className="text-4xl mb-4">🎓</div>
                <h3 className="text-xl font-semibold mb-2">Education</h3>
                <p>Training the next generation of rheumatologists</p>
              </div>
            </div>
          </div>
        </section>

        {/* Services */}
        <section id="services" className="py-16 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4">
            <h2 className="text-3xl font-bold text-center mb-12">Clinical Services</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(attributes.services ? JSON.parse(attributes.services) : [
                'Rheumatoid Arthritis Research',
                'Lupus Clinical Trials',
                'Biologics Research',
                'Autoimmune Studies',
                'Precision Medicine',
                'Genetic Research'
              ]).map((service: string, index: number) => (
                <div key={index} className="bg-white p-6 rounded-lg shadow">
                  <h3 className="font-semibold mb-2">{service}</h3>
                  <p className="text-gray-600">Evidence-based treatment with research integration</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Faculty */}
        <section id="faculty" className="py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4">
            <h2 className="text-3xl font-bold text-center mb-12">Our Faculty</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {staff.map((member) => (
                <div key={member.staff_id} className="text-center">
                  <div className="w-32 h-32 bg-gray-200 rounded-full mx-auto mb-4 flex items-center justify-center">
                    {member.photo_url ? (
                      <img src={member.photo_url} alt={member.name} className="w-32 h-32 rounded-full object-cover" />
                    ) : (
                      <span className="text-4xl">👨‍🔬</span>
                    )}
                  </div>
                  <h3 className="font-semibold">{member.name}</h3>
                  <p className="text-gray-600">{member.title}</p>
                  <p className="text-sm text-gray-500">{member.credentials}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Appointment Form */}
        <section id="appointment" className="py-16 bg-blue-50">
          <div className="max-w-2xl mx-auto px-4">
            <h2 className="text-3xl font-bold text-center mb-8">Schedule Research Consultation</h2>
            <div className="bg-white p-8 rounded-lg shadow">
              <p className="text-center text-gray-600 mb-6">
                Interested in participating in clinical trials or receiving care from our research team?
              </p>
              <div className="text-center">
                <a href={`tel:${attributes.phone}`} className="bg-blue-600 text-white px-8 py-3 rounded font-semibold hover:bg-blue-700">
                  Call {attributes.phone}
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4">
            <div className="grid md:grid-cols-2 gap-12">
              <div>
                <h2 className="text-2xl font-bold mb-6">Contact Information</h2>
                <div className="space-y-4">
                  {attributes.phone && <p><strong>Phone:</strong> {attributes.phone}</p>}
                  {attributes.email && <p><strong>Email:</strong> {attributes.email}</p>}
                  {attributes.address_line1 && (
                    <div>
                      <strong>Address:</strong>
                      <p>{attributes.address_line1}</p>
                      {attributes.address_line2 && <p>{attributes.address_line2}</p>}
                      <p>{attributes.city}, {attributes.state} {attributes.zip_code}</p>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-bold mb-6">Research Opportunities</h2>
                <p className="text-gray-600">
                  We are actively recruiting patients for various clinical trials. 
                  Contact us to learn about current research opportunities.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-slate-900 text-white py-8">
          <div className="max-w-7xl mx-auto px-4 text-center">
            <p>© {new Date().getFullYear()} {practice.name}. Advancing medicine through research.</p>
          </div>
        </footer>
      </div>
    </>
  );
}
