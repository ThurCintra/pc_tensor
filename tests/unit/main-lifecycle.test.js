import { describe, it, expect, vi } from 'vitest';
const { buildTrayMenuTemplate } = require('../../src/main/main');

describe('Main Process Lifecycle & System Tray (FASE 3)', () => {
  it('deve construir o menu de contexto da bandeja (Tray) com todas as opções da FASE 3', () => {
    const onOpen = vi.fn();
    const onBoost = vi.fn();
    const onQr = vi.fn();
    const onQuit = vi.fn();

    const template = buildTrayMenuTemplate({
      serverPort: 3892,
      onOpenDashboard: onOpen,
      onBoost,
      onShowQr: onQr,
      onQuit,
    });

    expect(Array.isArray(template)).toBe(true);
    expect(template.length).toBeGreaterThanOrEqual(6);

    const labels = template.map((item) => item.label).filter(Boolean);
    expect(labels).toContain('Abrir Dashboard');
    expect(labels).toContain('Modo Boost (Liberar RAM)');
    expect(labels).toContain('Exibir QR Code Mobile');
    expect(labels).toContain('Sair do PC Sentinel');

    // Valida exibição dinâmica da porta
    const portItem = template.find((item) => item.label && item.label.includes('Servidor Mobile'));
    expect(portItem).toBeDefined();
    expect(portItem.label).toContain('3892');
    expect(portItem.enabled).toBe(false);
  });

  it('deve acionar callbacks ao clicar nos itens do menu do Tray', () => {
    const onOpen = vi.fn();
    const onBoost = vi.fn();
    const onQr = vi.fn();
    const onQuit = vi.fn();

    const template = buildTrayMenuTemplate({
      serverPort: 3890,
      onOpenDashboard: onOpen,
      onBoost,
      onShowQr: onQr,
      onQuit,
    });

    const openItem = template.find((i) => i.label === 'Abrir Dashboard');
    const boostItem = template.find((i) => i.label === 'Modo Boost (Liberar RAM)');
    const qrItem = template.find((i) => i.label === 'Exibir QR Code Mobile');
    const quitItem = template.find((i) => i.label === 'Sair do PC Sentinel');

    openItem.click();
    expect(onOpen).toHaveBeenCalledTimes(1);

    boostItem.click();
    expect(onBoost).toHaveBeenCalledTimes(1);

    qrItem.click();
    expect(onQr).toHaveBeenCalledTimes(1);

    quitItem.click();
    expect(onQuit).toHaveBeenCalledTimes(1);
  });
});
