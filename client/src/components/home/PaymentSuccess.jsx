import Avatar from './Avatar';

export default function PaymentSuccess({ visible, checked, name = 'Aarav', amount = '₹600' }) {
  return (
    <div className={`sm-pay ${visible ? 'is-on' : ''} ${checked ? 'is-checked' : ''}`}>
      <Avatar name={name} tone={2} size={34} />
      <div className="sm-pay__text">
        <strong>
          {name} paid {amount}
        </strong>
        <span>Weekend Trip · demo only</span>
      </div>
      <span className="sm-check">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
          <path d="m7 12.5 3.2 3.2L17 9" pathLength="1" />
        </svg>
      </span>
    </div>
  );
}
