import Avatar from './Avatar';
import Reveal from './Reveal';
import { ReceiptIcon, MapPinIcon, HomeIcon } from './icons';
import { TRIP_EXPENSES, TRIP_BALANCES, TRIP_SETTLEUPS } from './demoData';

const EXPENSE_ICONS = { receipt: ReceiptIcon, pin: MapPinIcon, home: HomeIcon };

export default function ProductPreview() {
  return (
    <Reveal className="sm-window" delay={100}>
      <div className="sm-window__bar">
        <span className="sm-window__dot" />
        <span className="sm-window__dot" />
        <span className="sm-window__dot" />
        <span className="sm-window__title">Weekend Trip · 4 members · sample data</span>
      </div>

      <div className="sm-window__body">
        <div className="sm-pane">
          <h3 className="sm-pane__title">Expenses</h3>
          <ul>
            {TRIP_EXPENSES.map((e) => {
              const Icon = EXPENSE_ICONS[e.icon];
              return (
                <li key={e.id} className="sm-exp">
                  <span className="sm-exp__icon"><Icon size={18} /></span>
                  <span className="sm-exp__text">
                    <strong>{e.title}</strong>
                    <span>Paid by {e.by}</span>
                  </span>
                  <span className="sm-exp__amt">{e.amount}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="sm-pane">
          <h3 className="sm-pane__title">Group balances</h3>
          <ul>
            {TRIP_BALANCES.map((b, i) => (
              <li key={b.name} className="sm-bal">
                <div className="sm-bal__row">
                  <Avatar name={b.name} tone={b.tone} size={26} />
                  <span className="sm-bal__name">{b.name}</span>
                  <span className={`sm-bal__amt sm-bal__amt--${b.kind}`}>{b.label}</span>
                </div>
                <div className="sm-bal__track">
                  <span
                    className={`sm-bal__fill sm-bal__fill--${b.kind}`}
                    style={{ '--v': b.v, '--i': i }}
                  />
                </div>
              </li>
            ))}
          </ul>

          <h3 className="sm-pane__title sm-pane__title--spaced">Ways to settle</h3>
          <ul className="sm-settle">
            {TRIP_SETTLEUPS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      </div>
    </Reveal>
  );
}
