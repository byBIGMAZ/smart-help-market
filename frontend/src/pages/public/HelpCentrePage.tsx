import { Link } from 'react-router-dom'
import HelpCentreChat from '../../components/help/HelpCentreChat'
import '../../components/help/HelpCentreChat.css'
import '../../styles/extended-pages.css'

export default function HelpCentrePage() {
  return (
    <main className="extended-page help-centre-page">
      <section className="help-centre-hero">
        <span className="extended-kicker">SMART HELP CENTRE</span>
        <h1>Let's get you where you need to be.</h1>
        <p>Ask a question in your own words. Get guided answers, discover matching marketplace opportunities and jump directly to the right feature. If a person needs to step in, you can send the conversation to our support team.</p>
        <p><Link to="/how-it-works">See how the marketplace works ↗</Link></p>
      </section>
      <HelpCentreChat mode="page" />
    </main>
  )
}
