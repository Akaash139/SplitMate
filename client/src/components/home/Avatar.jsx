export default function Avatar({ name, tone = 1, size = 28, className = '' }) {
  return (
    <span
      className={`sm-avatar sm-avatar--${tone} ${className}`}
      style={{ '--size': `${size}px` }}
      aria-hidden="true"
    >
      {name?.charAt(0) || ''}
    </span>
  );
}
