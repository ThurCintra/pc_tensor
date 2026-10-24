/** Energia do mês gravada na nuvem e a energia da sessão do PC no momento em que ela foi buscada. */
export interface MonthEnergy {
  wh: number;
  /** sessionKwh do quadro na hora da busca (Wh), para o mês andar junto com o taxímetro até a próxima busca. */
  sessionWhAtFetch: number | null;
  /** Início do mês (ms), para a projeção. */
  since: number;
}

/** Quanto já passou do mês, em fração (0 a 1), para projetar o custo até o fim dele. */
export function monthFraction(since: number, now: number): number {
  const start = new Date(since);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1).getTime();
  return Math.max(0, Math.min(1, (now - since) / (end - since)));
}

/** Wh do mês: o que está no banco + o que o PC consumiu desde a busca (o resumo do minuto ainda não chegou). */
export function liveMonthWh(month: MonthEnergy, sessionKwh: number): number {
  if (month.sessionWhAtFetch === null) return month.wh;
  const extra = sessionKwh * 1000 - month.sessionWhAtFetch;
  return month.wh + (extra > 0 ? extra : 0); // sessão zerou (serviço reiniciado): fica só o banco
}

/** Projeção do mês só depois de um dia de dados: antes disso ela exagera. */
export function projectMonth(costSoFar: number | null, fraction: number): number | null {
  return costSoFar !== null && fraction > 1 / 31 ? costSoFar / fraction : null;
}
