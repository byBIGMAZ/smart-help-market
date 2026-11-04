import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import '../../styles/extended-pages.css'
import './HowItWorksExperience.css'

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

function HowItWorksExperience() {
  const steps = [
    {
      number: '01',
      title: 'Discover',
      subtitle: 'Shine a light on what matters.',
      body: 'Start with a need. Search homes, land, products or services, then explore relevant options from one marketplace.',
      note: 'Search by keyword, category and location.',
      visual: 'discover',
    },
    {
      number: '02',
      title: 'Compare',
      subtitle: 'Put your options side by side.',
      body: 'Open listings, inspect photos and details, compare prices, locations and available information before making a choice.',
      note: 'Look closely. Ask questions. Take your time.',
      visual: 'compare',
    },
    {
      number: '03',
      title: 'Connect',
      subtitle: 'Reach the right person.',
      body: 'When an option feels right, contact the relevant landlord, seller, agent or service provider and clarify the important details.',
      note: 'Confirm identity, availability and terms.',
      visual: 'connect',
    },
    {
      number: '04',
      title: 'Move forward',
      subtitle: 'Make your next step with confidence.',
      body: 'Agree on the next steps, review every condition and use available transaction safeguards where they are supported.',
      note: 'Inspect and confirm before you commit.',
      visual: 'forward',
    },
  ]

  return (
    <main className="extended-page how-it-works-page">
      <section className="hiw-hero">
        <span className="extended-kicker">THE SMART HELP MARKET JOURNEY</span>
        <h1>From searching to <span>getting it done.</span></h1>
        <p>Four clear steps take you from an idea to the right opportunity. Watch how the marketplace works.</p>
        <div className="hiw-hero-track" aria-label="Four steps: Discover, Compare, Connect and Move forward">
          {steps.map((step, index) => (
            <span className="hiw-track-step" key={step.visual}>
              <i>{step.number}</i><b>{step.title}</b>{index < steps.length - 1 && <em aria-hidden="true">→</em>}
            </span>
          ))}
        </div>
      </section>

      <section className="hiw-journey" aria-label="How the marketplace works">
        {steps.map((step) => (
          <article className={`hiw-step-card hiw-step-${step.visual}`} key={step.visual}>
            <div className="hiw-step-visual" aria-hidden="true">
              <span className="hiw-visual-grid" />
              {step.visual === 'discover' && (
                <div className="hiw-discovery-scene">
                  <span className="hiw-search-ring" />
                  <span className="hiw-search-target hiw-target-one">⌂<small>HOME</small></span>
                  <span className="hiw-search-target hiw-target-two">◇<small>GOODS</small></span>
                  <span className="hiw-search-target hiw-target-three">✳<small>SERVICES</small></span>
                  <span className="hiw-beam" />
                  <span className="hiw-flashlight"><i /><b /></span>
                  <span className="hiw-scan-word">SCANNING OPTIONS</span>
                  <span className="hiw-discover-result">3 possibilities found <b>✓</b></span>
                </div>
              )}
              {step.visual === 'compare' && (
                <div className="hiw-compare-scene">
                  <div className="hiw-compare-card hiw-compare-a"><span>OPTION A</span><i>⌂</i><b>₦850k</b><small>Good location</small><em>✓</em></div>
                  <div className="hiw-compare-card hiw-compare-b"><span>OPTION B</span><i>⌂</i><b>₦780k</b><small>More space</small><em>✓</em></div>
                  <div className="hiw-compare-scan" />
                  <div className="hiw-compare-check">✓ <span>DETAILS REVIEWED</span></div>
                  <span className="hiw-compare-spark">✦</span>
                </div>
              )}
              {step.visual === 'connect' && (
                <div className="hiw-connect-scene">
                  <div className="hiw-person hiw-person-user"><i>☺</i><b>YOU</b></div>
                  <div className="hiw-message-flow"><span>HELLO!</span><i>•••</i><span>Let's talk</span></div>
                  <div className="hiw-person hiw-person-pro"><i>☺</i><b>PROVIDER</b></div>
                  <span className="hiw-connect-link">CONNECTED <b>✓</b></span>
                  <span className="hiw-connect-pulse" />
                </div>
              )}
              {step.visual === 'forward' && (
                <div className="hiw-forward-scene">
                  <div className="hiw-forward-orbit" />
                  <div className="hiw-forward-shield">✓</div>
                  <div className="hiw-forward-check hiw-check-one">DETAILS <b>✓</b></div>
                  <div className="hiw-forward-check hiw-check-two">TERMS <b>✓</b></div>
                  <div className="hiw-forward-check hiw-check-three">INSPECTION <b>✓</b></div>
                  <span className="hiw-forward-label">READY FOR THE NEXT STEP</span>
                </div>
              )}
            </div>
            <div className="hiw-step-copy">
              <span className="hiw-step-number">{step.number} / 04</span>
              <h2>{step.title}</h2>
              <h3>{step.subtitle}</h3>
              <p>{step.body}</p>
              <div className="hiw-step-note"><span>✓</span>{step.note}</div>
            </div>
          </article>
        ))}
      </section>

      <section className="hiw-bottom-message">
        <div className="hiw-bottom-icon">✦</div>
        <div><span className="extended-kicker">YOUR JOURNEY, YOUR PACE</span><h2>Good decisions start with good information.</h2><p>Browse freely, take your time and verify important details before making commitments.</p></div>
        <Link className="extended-primary" to="/explore">Start exploring <span aria-hidden="true">→</span></Link>
      </section>
      <p className="hiw-disclaimer">Marketplace features and transaction safeguards depend on availability. Demonstration listings are not verified offers, and this page does not represent active payment or escrow services.</p>
    </main>
  )
}

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
