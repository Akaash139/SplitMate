import { CATEGORIES } from './demoData';

export default function SpendingChart({ on }) {
  return (
    <section className="sm-chart">
      <header className="sm-chart__head">
        <strong>Spending</strong>
        <span>This trip</span>
      </header>
      <div className="sm-chart__bars">
        {CATEGORIES.map((c, i) => (
          <div key={c.label} className="sm-chart__col">
            <div className="sm-chart__track">
              <span
                className={`sm-chart__bar ${on ? 'is-on' : ''}`}
                style={{ '--v': c.v, '--i': i }}
              />
            </div>
            <span className="sm-chart__label">{c.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
