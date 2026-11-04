import { useState } from 'react'

const steps = [
  { icon: '🛍️', title: 'Agree on the deal', copy: 'Buyer and seller agree on the item or service, price, delivery and terms before payment.' },
  { icon: '🔒', title: 'Payment is secured', copy: 'The buyer pays through the platform. Funds are held under the applicable escrow arrangement, not released straight to the seller.' },
  { icon: '📦', title: 'Delivery or service', copy: 'The seller delivers the item or completes the agreed service. Both sides can follow the transaction progress.' },
  { icon: '🤝', title: 'Confirm and release', copy: 'When the buyer confirms fulfilment, the payment can be released according to the transaction terms. Disputes follow the platform resolution process.' },
]

export default function EscrowExplainer() {
  const [active, setActive] = useState(0)
  return (
    <section className="shm-escrow-section" id="how-it-works">
      <div className="shm-escrow-intro">
        <span className="section-kicker">A CLEARER WAY TO TRANSACT</span>
        <h2>Know where your money is, every step of the way.</h2>
        <p>Explore the transaction journey. Select each stage to see how a protected transaction is designed to work.</p>
        <div className="shm-escrow-trust"><span>🔐</span><div><strong>Protection through clear steps</strong><small>Escrow availability and release conditions depend on the transaction and platform terms.</small></div></div>
      </div>
      <div className="shm-escrow-demo">
        <div className="shm-escrow-track" aria-label={`Step ${active + 1} of 4`}>
          {steps.map((step, index) => (
            <button key={step.title} type="button" className={`shm-escrow-node ${index === active ? 'is-active' : ''} ${index < active ? 'is-complete' : ''}`} onClick={() => setActive(index)} aria-pressed={index === active}>
              <span>{index < active ? '✓' : step.icon}</span><small>{index + 1}</small>
            </button>
          ))}
          <span className="shm-escrow-progress" style={{ '--progress': `${(active / (steps.length - 1)) * 100}%` } as React.CSSProperties} />
        </div>
        <article className="shm-escrow-stage" key={active}>
          <span className="shm-escrow-stage-icon">{steps[active].icon}</span>
          <span className="shm-escrow-stage-count">STAGE 0{active + 1} / 04</span>
          <h3>{steps[active].title}</h3>
          <p>{steps[active].copy}</p>
          <div className="shm-escrow-stage-actions">
            <button type="button" disabled={active === 0} onClick={() => setActive((value) => Math.max(0, value - 1))}>← Previous</button>
            <button type="button" onClick={() => setActive((value) => value === steps.length - 1 ? 0 : value + 1)}>{active === steps.length - 1 ? 'Replay journey' : 'Next stage →'}</button>
          </div>
        </article>
      </div>
    </section>
  )
}
