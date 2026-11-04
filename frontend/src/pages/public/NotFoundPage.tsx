
import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <main className="not-found-page">
      <div className="not-found-content">
        <p className="not-found-brand">
          SMART HELP MARKET
        </p>

        <h1>404</h1>

        <h2>Page not found</h2>

        <p className="not-found-description">
          The page you are looking for does not exist
          or may have been moved.
        </p>

        <Link to="/" className="not-found-home-link">
          Return to homepage
        </Link>
      </div>
    </main>
  )
}
