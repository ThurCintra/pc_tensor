import type { Profile } from '../realtime/protocol';

/**
 * Bento Grid camaleão: cada perfil (detectado pelo app em foco no PC) define a ordem e o tamanho dos cards.
 * A grade tem 4 colunas no PC e 2 no celular; `size` é a área do card nessa grade.
 */
export type CardId = 'cpu' | 'gpu' | 'lag' | 'energy' | 'xray' | 'stutter' | 'vram' | 'maintenance' | 'efficiency';

export type CardSize = 'sm' | 'wide' | 'tall' | 'lg';

export interface CardSlot {
  id: CardId;
  size: CardSize;
  /** Card em destaque no perfil (borda de cor). */
  highlight?: boolean;
}

export const PROFILE_LABELS: Record<Profile, string> = {
  COMPETITIVE_FPS: 'FPS competitivo',
  AAA_GRAPHICS: 'Jogo gráfico pesado',
  DEV_WORKSTATION: 'Trabalho e desenvolvimento',
  IDLE: 'Uso leve',
};

export const LAYOUTS: Record<Profile, readonly CardSlot[]> = {
  // Em FPS competitivo, o que importa é latência: o Juiz de Lag e a rede vêm primeiro
  COMPETITIVE_FPS: [
    { id: 'lag', size: 'lg', highlight: true },
    { id: 'cpu', size: 'wide' },
    { id: 'stutter', size: 'sm', highlight: true },
    { id: 'gpu', size: 'sm' },
    { id: 'vram', size: 'sm' },
    { id: 'energy', size: 'sm' },
    { id: 'xray', size: 'wide' },
    { id: 'maintenance', size: 'sm' },
    { id: 'efficiency', size: 'sm' },
  ],
  // Em jogo gráfico, a GPU e a memória de vídeo são o gargalo provável
  AAA_GRAPHICS: [
    { id: 'gpu', size: 'wide', highlight: true },
    { id: 'xray', size: 'tall' },
    { id: 'vram', size: 'sm', highlight: true },
    { id: 'cpu', size: 'sm' },
    { id: 'lag', size: 'wide' },
    { id: 'stutter', size: 'sm' },
    { id: 'energy', size: 'sm' },
    { id: 'maintenance', size: 'sm' },
    { id: 'efficiency', size: 'sm' },
  ],
  // Compilando ou renderizando: CPU sustentada, eficiência e saúde térmica
  DEV_WORKSTATION: [
    { id: 'cpu', size: 'wide', highlight: true },
    { id: 'efficiency', size: 'sm', highlight: true },
    { id: 'maintenance', size: 'sm' },
    { id: 'xray', size: 'wide' },
    { id: 'energy', size: 'wide' },
    { id: 'gpu', size: 'sm' },
    { id: 'lag', size: 'sm' },
    { id: 'vram', size: 'sm' },
    { id: 'stutter', size: 'sm' },
  ],
  // PC à toa: custo de energia e manutenção em primeiro plano
  IDLE: [
    { id: 'energy', size: 'wide', highlight: true },
    { id: 'xray', size: 'wide' },
    { id: 'maintenance', size: 'sm' },
    { id: 'efficiency', size: 'sm' },
    { id: 'cpu', size: 'sm' },
    { id: 'gpu', size: 'sm' },
    { id: 'lag', size: 'sm' },
    { id: 'vram', size: 'sm' },
    { id: 'stutter', size: 'sm' },
  ],
};

/** Classes de grade de cada tamanho (2 colunas no celular, 4 no PC). */
export const SIZE_CLASSES: Record<CardSize, string> = {
  sm: 'col-span-1 row-span-1',
  wide: 'col-span-2 row-span-1',
  tall: 'col-span-1 row-span-2 max-md:col-span-2 max-md:row-span-1',
  lg: 'col-span-2 row-span-2',
};

export function layoutFor(profile: Profile | null | undefined): readonly CardSlot[] {
  return LAYOUTS[profile ?? 'IDLE'];
}
