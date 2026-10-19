// Cross-fades between stacked text values (used for the balance update).
export default function SwapText({ items, index, className = '' }) {
  return (
    <span className={`sm-swap ${className}`}>
      {items.map((text, i) => (
        <span
          key={text}
          className={`sm-swap__item ${i === index ? 'is-active' : i < index ? 'is-past' : ''}`}
        >
          {text}
        </span>
      ))}
    </span>
  );
}
