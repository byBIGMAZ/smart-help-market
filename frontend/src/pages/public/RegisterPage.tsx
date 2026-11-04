import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  marketplaceRegister,
  type MarketplaceAccountType,
} from '../../services/marketplaceRegistration'
import './RegisterPage.css'

const accountTypes: {
  value: MarketplaceAccountType
  title: string
  description: string
}[] = [
  {
    value: 'buyer',
    title: 'Buyer',
    description: 'Find and purchase products, properties and services.',
  },
  {
    value: 'landlord',
    title: 'Landlord',
    description: 'Advertise properties and manage rental enquiries.',
  },
  {
    value: 'seller',
    title: 'Seller',
    description: 'List products and reach potential customers.',
  },
  {
    value: 'service_provider',
    title: 'Service Provider',
    description: 'Promote your professional services.',
  },
  {
    value: 'agent',
    title: 'Agent',
    description: 'Connect customers with properties and opportunities.',
  },
]

export default function RegisterPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const requestedType = searchParams.get('type')
  const initialAccountType = accountTypes.some(
    (type) => type.value === requestedType,
  )
    ? (requestedType as MarketplaceAccountType)
    : 'buyer'

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [accountType, setAccountType] =
    useState<MarketplaceAccountType>(initialAccountType)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    const cleanName = displayName.trim().replace(/\s+/g, ' ')

    if (cleanName.length < 2 || cleanName.length > 100) {
      setError('Enter a name between 2 and 100 characters.')
      return
    }

    if (password.length < 12 || password.length > 128) {
      setError('Your password must contain between 12 and 128 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Your passwords do not match.')
      return
    }

    setLoading(true)

    try {
      const user = await marketplaceRegister({
        displayName: cleanName,
        email,
        password,
        accountType,
      })

      const destinations: Record<MarketplaceAccountType, string> = {
        buyer: '/buyer/dashboard',
        landlord: '/landlord/dashboard',
        seller: '/seller/dashboard',
        service_provider: '/provider/dashboard',
        agent: '/agent/dashboard',
      }

      navigate(destinations[user.accountType] || '/buyer/dashboard', {
        replace: true,
      })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Registration could not be completed. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="marketplace-register-page">
      <section className="marketplace-register-card">
        <div className="marketplace-register-brand">
          <span className="marketplace-register-logo">SH</span>
          <div>
            <strong>SMART HELP MARKET</strong>
            <span>BY BIGMAZ</span>
          </div>
        </div>

        <header className="marketplace-register-heading">
          <span className="marketplace-register-eyebrow">
            JOIN OUR MARKETPLACE
          </span>
          <h1>Create your account</h1>
          <p>
            Register to discover opportunities, connect with people and
            participate in the marketplace.
          </p>
        </header>

        <form
          className="marketplace-register-form"
          onSubmit={handleSubmit}
        >
          <label htmlFor="register-name">Full name</label>
          <input
            id="register-name"
            type="text"
            autoComplete="name"
            placeholder="Enter your full name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={100}
            required
            disabled={loading}
          />

          <label htmlFor="register-email">Email address</label>
          <input
            id="register-email"
            type="email"
            autoComplete="email"
            placeholder="Enter your email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={254}
            required
            disabled={loading}
          />

          <div className="marketplace-register-section-heading">
            <label>What best describes your account?</label>
            <span>Select one account type</span>
          </div>

          <div className="marketplace-register-account-types">
            {accountTypes.map((type) => (
              <label
                className={`marketplace-register-account-option ${
                  accountType === type.value ? 'selected' : ''
                }`}
                key={type.value}
              >
                <input
                  type="radio"
                  name="accountType"
                  value={type.value}
                  checked={accountType === type.value}
                  onChange={() => setAccountType(type.value)}
                  disabled={loading}
                />
                <span className="marketplace-register-radio" />
                <span className="marketplace-register-account-copy">
                  <strong>{type.title}</strong>
                  <span>{type.description}</span>
                </span>
              </label>
            ))}
          </div>

          {accountType !== 'buyer' && (
            <div className="marketplace-register-verification">
              <strong>Verification required</strong>
              <span>
                Your account will be created, but the selected business
                account type will require verification before access to
                restricted activities is granted.
              </span>
            </div>
          )}

          <label htmlFor="register-password">Password</label>
          <div className="marketplace-register-password">
            <input
              id="register-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Create a password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={12}
              maxLength={128}
              required
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              disabled={loading}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <span className="marketplace-register-hint">
            Use at least 12 characters.
          </span>

          <label htmlFor="register-confirm-password">
            Confirm password
          </label>
          <div className="marketplace-register-password">
            <input
              id="register-confirm-password"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Enter your password again"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              maxLength={128}
              required
              disabled={loading}
            />
            <button
              type="button"
              onClick={() =>
                setShowConfirmPassword((current) => !current)
              }
              disabled={loading}
              aria-label={
                showConfirmPassword ? 'Hide password' : 'Show password'
              }
            >
              {showConfirmPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          {error && (
            <div className="marketplace-register-error" role="alert">
              {error}
            </div>
          )}

          <button
            className="marketplace-register-submit"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <footer className="marketplace-register-footer">
          <p>
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
          <Link to="/">Back to marketplace</Link>
          <span>
            Your password is securely encrypted. Never share it with anyone.
          </span>
        </footer>
      </section>
    </main>
  )
}
