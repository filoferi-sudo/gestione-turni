// Marchio Planivo. Il logo è un quadrato arrotondato Forest Pine con una spunta bianca: il verde
// "coperto / confermato" del design system (DESIGN.md) reso identità — la promessa del prodotto
// (il turno è coperto) diventa il logo. Il wordmark eredita currentColor (scuro sul login chiaro,
// bianco sulla sidebar scura). Puramente presentazionale: nessuna logica, nessuna dipendenza.
export function Logo({ size = 28, withWordmark = true, className = '' }) {
  const labelProps = withWordmark ? { 'aria-hidden': 'true' } : { role: 'img', 'aria-label': 'Planivo' };
  return (
    <span className={`brand${className ? ` ${className}` : ''}`}>
      <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" {...labelProps}>
        <rect width="32" height="32" rx="8" fill="var(--color-primary)" />
        <path
          d="M9 16.5l4.8 4.8L23 11"
          fill="none"
          stroke="#fff"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {withWordmark && <span className="brand-wordmark">Planivo</span>}
    </span>
  );
}
