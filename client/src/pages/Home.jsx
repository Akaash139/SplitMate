import { Link } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/useTheme';
import AnimatedPhone from '../components/home/AnimatedPhone';
import ProductPreview from '../components/home/ProductPreview';
import Reveal from '../components/home/Reveal';
import {
  LogoMark,
  UsersIcon,
  SplitIcon,
  ScaleIcon,
  CheckCircleIcon,
  ChartIcon,
  ArrowRightIcon,
  CheckIcon,
} from '../components/home/icons';
import '../styles/home.css';

const ROUTES = { register: '/register', login: '/login' };

const FEATURES = [
  { icon: <UsersIcon size={24} />, title: 'Groups for every plan', text: 'Trips, flats, dinners — keep every shared expense together in one tidy group.' },
  { icon: <SplitIcon size={24} />, title: 'Flexible bill splitting', text: 'Split equally or customise who pays what, expense by expense.' },
  { icon: <ScaleIcon size={24} />, title: 'Clear balances', text: 'See who owes whom at a glance, updated as expenses are added.' },
  { icon: <CheckCircleIcon size={24} />, title: 'Simple settlements', text: 'Record payments between friends and see exactly what is left to settle.' },
  { icon: <ChartIcon size={24} />, title: 'Spending insights', text: 'Understand where the money goes with easy category breakdowns.' },
];

const STEPS = [
  { title: 'Create a group', text: 'Add friends, flatmates or travel buddies in a few taps.' },
  { title: 'Add and split smarter', text: 'Log a bill, choose who shared it and decide how to split it.' },
  { title: 'Settle up', text: 'Check balances and mark payments as settled when friends pay back.' },
];

const PREVIEW_POINTS = [
  'See who paid for what',
  'Balances update with every expense',
  'Spot exactly who still needs to settle',
];

export function Home() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="sm-home">
      <a className="sm-skip" href="#main">Skip to content</a>

      {/* Header with Navigation and Theme Toggle */}
      <header className="sm-header">
        <div className="sm-container sm-header__inner">
          <Link className="sm-brand" to="/" aria-label="SplitMate home">
            <LogoMark size={32} />
            SplitMate
          </Link>
          <nav className="sm-nav" aria-label="Primary">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <a href="#preview">Preview</a>
          </nav>

          <div className="sm-header__actions">
            {/* Dark Mode Theme Toggle */}
            <button
              type="button"
              className="sm-theme-toggle"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              id="home-theme-toggle"
              data-testid="home-theme-toggle"
            >
              {theme === 'dark' ? (
                <Sun size={18} className="sm-theme-icon sm-theme-icon--sun" />
              ) : (
                <Moon size={18} className="sm-theme-icon sm-theme-icon--moon" />
              )}
            </button>
          </div>
        </div>
      </header>

      <main id="main">
        {/* ───────── Hero ───────── */}
        <section className="sm-hero">
          <div className="sm-container sm-hero__grid">
            <div className="sm-hero__copy">
              <span className="sm-eyebrow sm-rise" style={{ '--n': 0 }}>
                Group expenses, simplified
              </span>
              <h1 className="sm-hero__title sm-rise" style={{ '--n': 1 }}>
                Split smarter.
                <br />
                <span className="sm-accent-text">Spend wiser.</span>
              </h1>
              <p className="sm-hero__lead sm-rise" style={{ '--n': 2 }}>
                Track trips, rent, dining, and roommate ledgers. SplitMate simplifies multi-party debts so you settle with fewer payments.
              </p>
              <div className="sm-hero__cta sm-rise" style={{ '--n': 3 }}>
                <Link className="sm-btn sm-btn--primary" to={ROUTES.register}>
                  Get Started <ArrowRightIcon size={18} />
                </Link>
                <Link className="sm-btn sm-btn--secondary" to={ROUTES.login}>
                  Log In
                </Link>
              </div>
            </div>

            <div className="sm-hero__visual">
              <AnimatedPhone />
            </div>
          </div>
        </section>

        {/* ───────── Features ───────── */}
        <section id="features" className="sm-section">
          <div className="sm-container">
            <Reveal className="sm-section__head sm-section__head--center">
              <span className="sm-kicker">Features</span>
              <h2 className="sm-section__title">Everything a group needs to stay square</h2>
              <p className="sm-section__lead">
                From the first shared dinner to the last settle-up, SplitMate keeps the maths out of the way.
              </p>
            </Reveal>

            <div className="sm-features">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} className="sm-feature-cell" delay={i * 70}>
                  <article className="sm-feature">
                    <span className="sm-feature__icon">{f.icon}</span>
                    <h3>{f.title}</h3>
                    <p>{f.text}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ───────── How it works ───────── */}
        <section id="how-it-works" className="sm-section sm-section--soft">
          <div className="sm-container">
            <Reveal className="sm-section__head sm-section__head--center">
              <span className="sm-kicker">How it works</span>
              <h2 className="sm-section__title">Three steps from “who paid?” to “all settled”</h2>
            </Reveal>

            <ol className="sm-steps">
              {STEPS.map((s, i) => (
                <Reveal as="li" key={s.title} className="sm-step" delay={i * 100}>
                  <span className="sm-step__num" aria-hidden="true">{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* ───────── Second product preview ───────── */}
        <section id="preview" className="sm-section">
          <div className="sm-container sm-preview">
            <Reveal className="sm-preview__copy">
              <span className="sm-kicker">Stay on top of it</span>
              <h2 className="sm-section__title">Every expense and balance, in one clear view</h2>
              <p className="sm-section__lead">
                No more scrolling chats to work out who owes what. Your group’s spending and balances live together.
              </p>
              <ul className="sm-check-list">
                {PREVIEW_POINTS.map((p) => (
                  <li key={p}>
                    <span className="sm-check-list__icon"><CheckIcon size={16} /></span>
                    {p}
                  </li>
                ))}
              </ul>
            </Reveal>
            <ProductPreview />
          </div>
        </section>

        {/* ───────── Call To Action ───────── */}
        <section className="sm-cta">
          <div className="sm-container">
            <Reveal className="sm-cta__box">
              <h2>Ready to simplify group expenses?</h2>
              <p>Join friends, roommates, and travel groups splitting bills effortlessly.</p>
              <div className="sm-hero__cta" style={{ justifyContent: 'center' }}>
                <Link className="sm-btn sm-btn--light" to={ROUTES.register}>
                  Get Started Free <ArrowRightIcon size={18} />
                </Link>
                <Link className="sm-btn sm-btn--secondary" to={ROUTES.login} style={{ color: 'inherit' }}>
                  Log In
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* ───────── Footer ───────── */}
      <footer className="sm-footer">
        <div className="sm-container sm-footer__inner">
          <div className="sm-footer__brand-col">
            <Link className="sm-brand" to="/" aria-label="SplitMate home">
              <LogoMark size={28} />
              SplitMate
            </Link>
            <p className="sm-footer__tagline">Group expenses, split smarter and settled with ease.</p>
          </div>

          <div className="sm-footer__right">
            <div className="sm-footer__theme-pill">
              <span className="sm-footer__theme-label">Theme:</span>
              <button
                type="button"
                className="sm-footer__theme-toggle"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                id="footer-theme-toggle"
                data-testid="footer-theme-toggle"
              >
                {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                <span>{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
              </button>
            </div>

            <nav className="sm-footer__links" aria-label="Footer navigation">
              <a href="#features">Features</a>
              <a href="#how-it-works">How it works</a>
              <a href="#preview">Preview</a>
              <Link to={ROUTES.login}>Log In</Link>
              <Link to={ROUTES.register}>Register</Link>
            </nav>
          </div>

          <div className="sm-footer__fine">
            <span>© {new Date().getFullYear()} SplitMate. Split smarter, spend wiser.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Home;
