import "./Card.css";

export function Card({ children, hoverable = false, className = "", ...props }) {
  return (
    <div className={`splitmate-card ${hoverable ? "is-hoverable" : ""} ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = "", ...props }) {
  return (
    <div className={`card-header ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = "", as: Component = "h3", ...props }) {
  return (
    <Component className={`card-title ${className}`} {...props}>
      {children}
    </Component>
  );
}

export function CardDescription({ children, className = "", ...props }) {
  return (
    <p className={`card-description ${className}`} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ children, className = "", ...props }) {
  return (
    <div className={`card-content ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className = "", ...props }) {
  return (
    <div className={`card-footer ${className}`} {...props}>
      {children}
    </div>
  );
}
