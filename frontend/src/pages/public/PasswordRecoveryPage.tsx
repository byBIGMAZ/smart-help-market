import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import '../../styles/extended-pages.css'

export default function PasswordRecoveryPage() {
  const { pathname } = useLocation()
  const reset = pathname === '/reset-password'
  const [submitted, setSubmitted] = useState(false)

  return (
    <main className="extended-page recovery-page">
      <section className="extended-form-card">
        <span className="extended-kicker">ACCOUNT SECURITY</span>
        <h1>{reset ? 'Choose a new password' : 'Recover your account'}</h1>
        <p>{reset ? 'Enter and confirm a new password for your account.' : 'Enter your email address to begin the password recovery process.'}</p>

        <form onSubmit={(event) => { event.preventDefault(); setSubmitted(true) }}>
          {!reset ? (
            <label>Email address<input required type="email" placeholder="you@example.com" /></label>
          ) : (
            <>
              <label>New password<input required type="password" minLength={8} placeholder="At least 8 characters" /></label>
              <label>Confirm new password<input required type="password" minLength={8} placeholder="Repeat your password" /></label>
            </>
          )}
          <button className="extended-primary" type="submit">{reset ? 'Preview password update' : 'Continue'}</button>
        </form>

        {submitted && <p className="extended-success" role="status">The form is working. Actual password recovery requires the backend and secure email verification.</p>}
        <Link to="/login" className="extended-back-link">← Back to sign in</Link>
      </section>
    </main>
  )
}
