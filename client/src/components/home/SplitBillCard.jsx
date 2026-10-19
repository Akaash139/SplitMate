import Avatar from './Avatar';
import { MapPinIcon } from './icons';
import { PEOPLE, SHARE } from './demoData';

export default function SplitBillCard({ step, fadeStep = 7 }) {
  const live = (n) => step >= n && step < fadeStep;

  return (
    <section className={`sm-split sm-card-in ${live(1) ? 'is-on' : ''}`}>
      <header className="sm-split__head">
        <span className="sm-split__icon">
          <MapPinIcon size={16} />
        </span>
        <div className="sm-split__title">
          <strong>Weekend Trip</strong>
          <span>Dinner with friends — ₹2,400</span>
        </div>
        <span className="sm-split__meta">÷ 4</span>
      </header>

      <ul className="sm-split__rows">
        {PEOPLE.map((p, i) => {
          const isPayer = p.id === 'you';
          const settled = Boolean(p.settledAt) && step >= p.settledAt;
          const pill = isPayer ? 'paid' : settled ? 'done' : 'owes';
          const label = isPayer ? 'Paid bill' : settled ? 'Settled' : 'Owes';

          return (
            <li
              key={p.id}
              className={`sm-split__row sm-card-in ${live(2) ? 'is-on' : ''}`}
              style={{ '--i': i }}
            >
              <Avatar name={p.name} tone={p.tone} size={26} />
              <span className="sm-split__name">{p.name}</span>
              <span className="sm-split__share">{SHARE}</span>
              <span className={`sm-pill sm-pill--${pill}`}>{label}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
