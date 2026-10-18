import React from 'react';

/**
 * DigitCol Component
 * Rola a coluna de 0 a 9 verticalmente no eixo Y
 */
function DigitCol({ digit }) {
  const num = parseInt(digit, 10);
  const translateY = isNaN(num) ? 0 : num * 10;

  return (
    <span
      style={{
        display: 'inline-block',
        height: '1em',
        lineHeight: '1em',
        overflow: 'hidden',
        verticalAlign: 'top',
        position: 'relative',
        width: '0.62em',
        textAlign: 'center',
      }}
    >
      <span
        style={{
          display: 'flex',
          flexDirection: 'column',
          transform: `translateY(-${translateY}%)`,
          transition: 'transform 380ms cubic-bezier(0.16, 1, 0.3, 1)',
          willChange: 'transform',
        }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <span key={n} style={{ height: '1em', lineHeight: '1em' }}>
            {n}
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * NumberTicker Component
 * Transição vertical suave de algarismos técnicos com tabular-nums
 */
export function NumberTicker({ value, className = '', style = {} }) {
  const str = value !== undefined && value !== null ? String(value) : '--';

  return (
    <span
      className={`tabular-nums ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        userSelect: 'none',
        ...style,
      }}
    >
      {str.split('').map((char, index) => {
        if (/[0-9]/.test(char)) {
          return <DigitCol key={index} digit={char} />;
        }
        return (
          <span
            key={index}
            style={{
              display: 'inline-block',
              width: char === '.' || char === ',' ? '0.28em' : 'auto',
              textAlign: 'center',
            }}
          >
            {char}
          </span>
        );
      })}
    </span>
  );
}
