// Decorative floating card around the phone. Hidden from assistive tech
// because the phone illustration already carries a text description.
export default function PaymentNotification({ icon, title, meta, visible, className = '' }) {
  return (
    <div className={`sm-notif ${className} ${visible ? 'is-on' : ''}`} aria-hidden="true">
      <span className="sm-notif__icon">{icon}</span>
      <span className="sm-notif__text">
        <strong>{title}</strong>
        {meta && <small>{meta}</small>}
      </span>
    </div>
  );
}
