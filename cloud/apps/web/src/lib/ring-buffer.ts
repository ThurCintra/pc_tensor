/**
 * Buffer circular de capacidade fixa: inserir é O(1) e não aloca depois de cheio; ao passar da capacidade,
 * o item mais antigo é sobrescrito.
 */
export class RingBuffer<T> {
  private readonly items: (T | undefined)[];
  private start = 0;
  private count = 0;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0)
      throw new RangeError('A capacidade deve ser um inteiro positivo.');
    this.items = new Array<T | undefined>(capacity);
  }

  get size(): number {
    return this.count;
  }

  push(item: T): void {
    const index = (this.start + this.count) % this.capacity;
    this.items[index] = item;
    if (this.count < this.capacity) this.count++;
    else this.start = (this.start + 1) % this.capacity;
  }

  /** Item mais antigo, sem remover. */
  peekOldest(): T | undefined {
    return this.count === 0 ? undefined : this.items[this.start];
  }

  peekNewest(): T | undefined {
    return this.count === 0 ? undefined : this.items[(this.start + this.count - 1) % this.capacity];
  }

  /** Remove o item mais antigo. */
  shift(): T | undefined {
    if (this.count === 0) return undefined;
    const item = this.items[this.start];
    this.items[this.start] = undefined;
    this.start = (this.start + 1) % this.capacity;
    this.count--;
    return item;
  }

  /** Cópia do mais antigo ao mais novo. */
  toArray(): T[] {
    const out = new Array<T>(this.count);
    for (let i = 0; i < this.count; i++) out[i] = this.items[(this.start + i) % this.capacity] as T;
    return out;
  }

  clear(): void {
    this.items.fill(undefined);
    this.start = 0;
    this.count = 0;
  }
}
