import { useEffect, useState } from 'react';
import useReducedMotion from '../../hooks/useReducedMotion';
import Avatar from './Avatar';
import SwapText from './SwapText';
import SplitBillCard from './SplitBillCard';
import SpendingChart from './SpendingChart';
import PaymentSuccess from './PaymentSuccess';
import PaymentNotification from './PaymentNotification';
import {
  LogoMark,
  HomeIcon,
  UsersIcon,
  ReceiptIcon,
  ChartIcon,
  SplitIcon,
  CheckCircleIcon,
} from './icons';
import { PEOPLE, BALANCE_VALUES, BALANCE_CAPTIONS } from './demoData';

/**
 * Sequence (illustration only, no real payments):
 * 0 idle · 1 expense card · 2 split + balance · 3 payment card
 * 4 check draws, Aarav settled · 5 all settled · 6 chart grows · 7 fade out → loop
 */
const STEP_AT = [0, 700, 1900, 3900, 5200, 6400, 7600, 11200]; // ms from loop start
const FADE_STEP = 7;
const LOOP_MS = 12800;
const STATIC_STEP = 6; // final state shown when reduced motion is on

function BalanceCard({ step }) {
  const on = step >= 2 && step < FADE_STEP;
  const idx = step >= 5 ? 2 : step >= 4 ? 1 : 0;
  return (
    <section className={`sm-balance sm-card-in ${on ? 'is-on' : ''}`}>
      <span className="sm-balance__label">Friends owe you</span>
      <SwapText className="sm-balance__value" items={BALANCE_VALUES} index={idx} />
      <SwapText className="sm-balance__caption" items={BALANCE_CAPTIONS} index={idx} />
    </section>
  );
}

export default function AnimatedPhone() {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const activeStep = reduced ? STATIC_STEP : step;

  useEffect(() => {
    if (reduced) return undefined;

    let timers = [];
    const run = () => {
      timers = [];
      setStep(0);
      STEP_AT.forEach((t, i) => {
        if (i > 0) timers.push(setTimeout(() => setStep(i), t));
      });
      timers.push(setTimeout(run, LOOP_MS));
    };
    run();

    return () => timers.forEach(clearTimeout);
  }, [reduced]);

  const live = (from, to = FADE_STEP - 1) => activeStep >= from && activeStep <= to;
  const showNotif = (from, to) => (reduced ? true : live(from, to));

  return (
    <div className="sm-visual">
      <span className="sm-shape sm-shape--disc" />
      <span className="sm-shape sm-shape--sq" />
      <span className="sm-shape sm-shape--dot1" />
      <span className="sm-shape sm-shape--dot2" />

      <div
        className="sm-phone-stage"
        role="img"
        aria-label="Animated illustration of the SplitMate app splitting a ₹2,400 dinner bill between four friends into ₹600 each, then showing everyone settled up. Sample data only."
      >
        <div className="sm-phone-scale">
          <div className="sm-phone">
            <span className="sm-phone__btn sm-phone__btn--a" />
            <span className="sm-phone__btn sm-phone__btn--b" />
            <span className="sm-phone__btn sm-phone__btn--c" />

            <div className="sm-phone__screen">
              <span className="sm-phone__island" />

              <div className="sm-status">
                <span>9:41</span>
                <svg width="38" height="12" viewBox="0 0 38 12" fill="currentColor" aria-hidden="true">
                  <rect x="0" y="8" width="3" height="4" rx="1" />
                  <rect x="5" y="5" width="3" height="7" rx="1" />
                  <rect x="10" y="2" width="3" height="10" rx="1" />
                  <rect x="18" y="1" width="18" height="10" rx="3" fill="none" stroke="currentColor" />
                  <rect x="20" y="3" width="12" height="6" rx="1.5" />
                </svg>
              </div>

              <div className="sm-app-head">
                <span className="sm-app-brand">
                  <LogoMark size={22} /> SplitMate
                </span>
                <span className="sm-avatars">
                  {PEOPLE.map((p) => (
                    <Avatar key={p.id} name={p.name} tone={p.tone} size={22} />
                  ))}
                </span>
              </div>

              <BalanceCard step={activeStep} />
              <SplitBillCard step={activeStep} fadeStep={FADE_STEP} />
              <SpendingChart on={live(6)} />

              <PaymentSuccess visible={activeStep >= 3 && activeStep < 6} checked={activeStep >= 4} />

              <nav className="sm-tabbar">
                <span className="is-active"><HomeIcon size={18} /></span>
                <span><UsersIcon size={18} /></span>
                <span><ReceiptIcon size={18} /></span>
                <span><ChartIcon size={18} /></span>
              </nav>
            </div>
          </div>
        </div>
      </div>

      <PaymentNotification
        className="sm-notif--a"
        visible={showNotif(2, 3)}
        icon={<SplitIcon size={16} />}
        title="Dinner bill split successfully"
        meta="Weekend Trip · 4 people"
      />
      <PaymentNotification
        className="sm-notif--b"
        visible={showNotif(4, 5)}
        icon={<CheckCircleIcon size={18} />}
        title="Payment received · ₹600"
        meta="From Aarav"
      />
      <PaymentNotification
        className="sm-notif--c"
        visible={showNotif(5, 6)}
        icon={<UsersIcon size={16} />}
        title="3 friends settled up"
        meta="Weekend Trip"
      />
    </div>
  );
}
