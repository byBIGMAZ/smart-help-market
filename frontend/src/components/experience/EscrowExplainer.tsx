import { useEffect, useState } from 'react'

const steps = [
  { icon: '🤝', title: 'Agree on the deal', copy: 'Buyer and seller confirm the item or service, price, delivery details and terms before payment.', scene: 'agreement' },
  { icon: '₦', title: 'Your payment is received', copy: 'The buyer pays through the agreed secure payment flow. The funds stay held under the applicable escrow arrangement instead of going straight to the seller.', scene: 'payment' },
  { icon: '📦', title: 'Funds stay protected while work gets done', copy: 'The seller delivers the item or completes the service. The payment remains held while the buyer checks that the agreed work is complete.', scene: 'delivery' },
  { icon: '✓', title: 'You are satisfied. Funds are released', copy: 'After the buyer confirms fulfilment, funds can be released according to the transaction terms. Disputes follow the platform resolution process.', scene: 'release' },
]

export default function EscrowExplainer() {
  const [active, setActive] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setActive((current) => (current + 1) % steps.length), 5200)
    return () => window.clearInterval(timer)
  }, [])
  return (
    <section className="shm-escrow-section" aria-labelledby="shm-escrow-title">
      <div className="shm-escrow-intro">
        <span className="section-kicker">A CLEARER WAY TO TRANSACT</span>
        <h2 id="shm-escrow-title">Your money stays protected until the deal is fulfilled.</h2>
        <p>Watch how a protected transaction is designed to work, from agreement to delivery and release.</p>
        <div className="shm-escrow-trust"><span>🔐</span><div><strong>Know where your payment is</strong><small>Funds are held and released only under the applicable transaction terms and escrow arrangement.</small></div></div>
      </div>
      <div className="shm-escrow-demo" aria-live="polite">
        <div className="shm-escrow-movie" data-scene={steps[active].scene}>
          <div className="shm-escrow-scene-glow" />
          <div className="shm-escrow-scene-platform" />
          <div className="shm-escrow-wallet"><span>₦</span><small>PAYMENT</small></div>
          <div className="shm-escrow-vault"><span>🔒</span><small>SECURE HOLD</small></div>
          <div className="shm-escrow-package"><span>📦</span><small>DELIVERY</small></div>
          <div className="shm-escrow-person buyer"><span>🙂</span><small>BUYER</small></div>
          <div className="shm-escrow-person seller"><span>🧑🏽‍🔧</span><small>SELLER</small></div>
          <div className="shm-escrow-money-trail"><i>₦</i><i>₦</i><i>₦</i></div>
          <div className="shm-escrow-status"><span>✓</span> {active === 3 ? 'PAYMENT RELEASED' : active === 2 ? 'PAYMENT PROTECTED' : active === 1 ? 'PAYMENT RECEIVED' : 'DEAL AGREED'}</div>
        </div>
        <div className="shm-escrow-track" aria-label={`Stage ${active + 1} of 4`}>
          <span className="shm-escrow-progress" style={{ width: `${((active + 1) / steps.length) * 100}%` }} />
          {steps.map((step, index) => <span key={step.title} className={index <= active ? 'is-complete' : ''}>{index < active ? '✓' : index + 1}</span>)}
        </div>
        <article className="shm-escrow-stage" key={active}>
          <span className="shm-escrow-stage-count">STEP 0{active + 1} / 04 · AUTO-PLAY</span>
          <h3>{steps[active].title}</h3>
          <p>{steps[active].copy}</p>
          <div className="shm-escrow-auto-progress"><span key={active} /></div>
        </article>
      </div>
    </section>
  )
}
