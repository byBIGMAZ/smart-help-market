import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import '../../styles/extended-pages.css'

const pages: Record<string, { eyebrow: string; title: string; intro: string; sections: { title: string; body: string }[] }> = {
  about: {
    eyebrow: 'ABOUT OUR MARKETPLACE',
    title: 'One smarter marketplace. Many possibilities.',
    intro: 'SMART HELP MARKET BY BIGMAZ brings properties, products and services together in one convenient place.',
    sections: [
      { title: 'Our mission', body: 'Make it easier for people to discover opportunities, compare options and connect with marketplace participants.' },
      { title: 'More than property', body: 'Explore accommodation, land, products, professional services and other opportunities in one expanding marketplace.' },
      { title: 'Built around trust', body: 'We are designing transparent listings, clear pricing, responsible verification and safer transaction workflows.' },
    ],
  },
  'how-it-works': {
    eyebrow: 'HOW IT WORKS',
    title: 'Find what you need, with greater confidence.',
    intro: 'A straightforward way to discover, compare and prepare for your next opportunity.',
    sections: [
      { title: '01. Discover', body: 'Browse properties, products and services. Search by keyword, category and location.' },
      { title: '02. Compare', body: 'Review listing details, prices and available information before deciding what suits you.' },
      { title: '03. Connect', body: 'Use the platform workflows as they become available to communicate and progress your request.' },
      { title: '04. Make informed decisions', body: 'Review costs, terms and verification information. Never pay based solely on an unverified demonstration listing.' },
    ],
  },
  help: {
    eyebrow: 'HELP CENTRE',
    title: 'How can we help you?',
    intro: 'Find guidance for exploring the marketplace and using its features.',
    sections: [
      { title: 'Browsing listings', body: 'You can browse public listings without creating an account. Use search and category filters to narrow your options.' },
      { title: 'Your account', body: 'An account will unlock personalized features such as saved items, preferences, alerts and role-specific workspaces.' },
      { title: 'Listing an opportunity', body: 'Landlords, sellers and service providers will have dedicated workflows for submitting and managing listings.' },
      { title: 'Safety', body: 'Verify the identity of the person you deal with, inspect property or goods where appropriate, and confirm all costs before payment.' },
    ],
  },
  terms: {
    eyebrow: 'LEGAL',
    title: 'Terms of use',
    intro: 'These demonstration terms describe the intended use of the SMART HELP MARKET frontend. Final legal terms must be approved before public launch.',
    sections: [
      { title: 'Using the marketplace', body: 'Users should provide accurate information and use the platform lawfully and respectfully.' },
      { title: 'Listings and information', body: 'Users must not submit misleading, fraudulent, unlawful or unauthorised listings. Demonstration listings are not genuine offers.' },
      { title: 'Payments and transactions', body: 'No payment, escrow, refund or transaction protection is promised by this frontend demonstration.' },
      { title: 'Platform changes', body: 'Features, eligibility requirements and marketplace rules may change as the platform develops.' },
    ],
  },
  privacy: {
    eyebrow: 'LEGAL',
    title: 'Privacy and data protection',
    intro: 'We are designing SMART HELP MARKET with privacy and responsible data handling in mind. This is a frontend demonstration, not the final privacy policy.',
    sections: [
      { title: 'Information you provide', body: 'Future account features may request contact details, profile information and information needed to provide requested services.' },
      { title: 'Your control', body: 'Personal information should only be collected when necessary, with clear purposes and appropriate access controls.' },
      { title: 'Identity verification', body: 'Sensitive identity information and biometric checks require appropriate safeguards, lawful processing and approved verification partners.' },
      { title: 'Location privacy', body: 'Public listings should show suitable location descriptions rather than exposing private residential addresses.' },
    ],
  },
}

const faqs = [
  ['Can I browse without signing in?', 'Yes. Public marketplace browsing should be available to guests. Signing in unlocks personalized features.'],
  ['What categories are supported?', 'Properties, products and services, with room for additional categories as the marketplace grows.'],
  ['Are demonstration listings genuine offers?', 'No. Sample listings are for frontend development and testing only.'],
  ['How do I become a seller or service provider?', 'Dedicated registration and role-specific workflows are being developed.'],
  ['Does the demonstration support payments?', 'No. Payment and transaction workflows are not active in this frontend demonstration.'],
  ['How do I change the appearance?', 'Use the Light, System or Dark controls in the marketplace header.'],
]

export default function InformationPage() {
  const { pathname } = useLocation()
  const pageKey = pathname.split('/').filter(Boolean)[0] || 'about'
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const page = pages[pageKey]

  return (
    <main className="extended-page">
      <section className="extended-hero">
        <span className="extended-kicker">{page?.eyebrow || 'SUPPORT'}</span>
        <h1>{page?.title || 'Frequently asked questions'}</h1>
        <p>{page?.intro || 'Quick answers to common marketplace questions.'}</p>
      </section>

      {page && (
        <section className="extended-content-grid">
          {page.sections.map((section, index) => (
            <article className="extended-card" key={section.title}>
              <span className="extended-number">{String(index + 1).padStart(2, '0')}</span>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </section>
      )}

      {pageKey === 'faqs' && (
        <section className="extended-faqs">
          {faqs.map(([question, answer]) => (
            <details className="extended-faq" key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </section>
      )}

      {pageKey === 'contact' && (
        <section className="extended-form-card">
          <h2>Send us a message</h2>
          <p>This is a local frontend demonstration. Your message will not be sent to a server.</p>
          <form onSubmit={(event) => { event.preventDefault(); setSent(true) }}>
            <label>Your name<input required placeholder="Enter your name" /></label>
            <label>Email address<input required type="email" placeholder="you@example.com" /></label>
            <label>Subject<input required placeholder="How can we help?" /></label>
            <label>Message<textarea required rows={5} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write your message..." /></label>
            <button className="extended-primary" type="submit">Preview submission</button>
          </form>
          {sent && <p className="extended-success" role="status">Your form works! Server submission will be connected during backend integration.</p>}
        </section>
      )}

      <section className="extended-cta">
        <div><h2>Ready to explore?</h2><p>Discover opportunities across the marketplace.</p></div>
        <Link className="extended-primary" to="/explore">Explore marketplace →</Link>
      </section>
    </main>
  )
}
