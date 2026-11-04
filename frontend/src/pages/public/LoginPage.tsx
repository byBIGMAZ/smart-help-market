import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { marketplaceLogin } from '../../services/marketplaceAuth'
import './LoginPage.css'

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const requestedDestination = searchParams.get('redirect')
  const destination =
    requestedDestination &&
    requestedDestination.startsWith('/') &&
    !requestedDestination.startsWith('//')
      ? requestedDestination
      : null

  function getRoleDestination(roles: string[]): string {
    const roleDestinations: Record<string, string> = {
      super_admin: '/admin',
      landlord: '/landlord/dashboard',
      seller: '/seller/dashboard',
      service_provider: '/provider/dashboard',
      provider: '/provider/dashboard',
      agent: '/agent/dashboard',
      buyer: '/buyer/dashboard',
    }

    const priority = [
      'super_admin',
      'landlord',
      'seller',
      'service_provider',
      'provider',
      'agent',
      'buyer',
    ]

    const matchingRole = priority.find((role) => roles.includes(role))

    return matchingRole
      ? roleDestinations[matchingRole]
      : '/explore'
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      setError('Enter your email address and password.')
      return
    }

    setLoading(true)

    try {
      const user = await marketplaceLogin(email, password)
      navigate(destination || getRoleDestination(user.roles || []), {
        replace: true,
      })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Sign in could not be completed. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="marketplace-login-page">
      <section className="marketplace-login-card">
        <div className="marketplace-login-brand">
          <span className="marketplace-login-logo">SH</span>
          <div>
            <strong>SMART HELP MARKET</strong>
            <span>BY BIGMAZ</span>
          </div>
        </div>

        <div className="marketplace-login-heading">
          <span className="marketplace-login-eyebrow">WELCOME BACK</span>
          <h1>Sign in to your account</h1>
          <p>
            Access your marketplace account and manage your activities.
          </p>
        </div>

        <form className="marketplace-login-form" onSubmit={handleSubmit}>
          <label htmlFor="marketplace-login-email">Email address</label>
          <input
            id="marketplace-login-email"
            type="email"
            name="email"
            autoComplete="username"
            placeholder="Enter your email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={254}
            required
            disabled={loading}
          />

          <div className="marketplace-login-password-heading">
            <label htmlFor="marketplace-login-password">Password</label>
            <Link
              to="/forgot-password"
              style={{
                color: 'var(--brand-primary)',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              Forgot password?
            </Link>
          </div>

          <div className="marketplace-login-password-field">
            <input
              id="marketplace-login-password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              maxLength={128}
              required
              disabled={loading}
            />

            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              disabled={loading}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          {error && (
            <div className="marketplace-login-error" role="alert">
              {error}
            </div>
          )}

          <button
            className="marketplace-login-submit"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="marketplace-login-footer">
          <Link to="/">Back to marketplace</Link>
          <span>
            New to the marketplace? <Link to="/register">Create an account</Link>
          </span>
          <span>Your account is protected by secure session authentication.</span>
        </div>
      </section>
    </main>
  )
}
