/** Marca do PC Sentinel: hexágono com pulso em traço único, na cor do texto (mesmo desenho de assets/icon.svg). */
export function Logo({ size = 24, className = '' }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 1024 1024" aria-hidden>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="80">
        <path d="M512 96 L862 298 V726 L512 928 L162 726 V298 Z" />
        <polyline points="268,536 414,536 470,392 564,688 630,462 676,536 768,536" />
      </g>
    </svg>
  );
}
