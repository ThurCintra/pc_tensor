// Tipos dos componentes compartilhados (ui.jsx) para as telas em TypeScript (Pit Wall, nuvem).
import type { ComponentType, ElementType, FormEventHandler, JSX, ReactNode } from 'react';

type Icon = ComponentType<{ size?: number | string; 'aria-hidden'?: boolean; className?: string }>;
type Tone = '' | 'success' | 'caution' | 'critical';
type Level = 'normal' | 'none' | 'caution' | 'critical';

export function PageHeader(props: { title: ReactNode; subtitle?: ReactNode; children?: ReactNode }): JSX.Element;
export function Section(props: { title: ReactNode; children?: ReactNode }): JSX.Element;
export function Card(props: {
  title?: ReactNode;
  icon?: Icon;
  action?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
}): JSX.Element;
export function Setting(props: {
  title: ReactNode;
  description?: ReactNode;
  stacked?: boolean;
  as?: ElementType;
  onSubmit?: FormEventHandler;
  children?: ReactNode;
}): JSX.Element;
export function Meter(props: { value: number | null | undefined; level?: Level; label?: string }): JSX.Element;
export function LabeledMeter(props: {
  label: ReactNode;
  valueText: ReactNode;
  value: number | null | undefined;
  level?: Level;
  ariaLabel?: string;
  strong?: boolean;
}): JSX.Element;
export function Badge(props: { tone?: Tone; dot?: boolean; children?: ReactNode }): JSX.Element;
export function InfoBar(props: {
  tone?: 'info' | Exclude<Tone, ''>;
  title?: ReactNode;
  actions?: ReactNode;
  onDismiss?: () => void;
  children?: ReactNode;
}): JSX.Element;
export function Rows(props: { children?: ReactNode }): JSX.Element;
export function Row(props: { label: ReactNode; children?: ReactNode }): JSX.Element;
export function Switch(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
}): JSX.Element;
export function Segmented<T extends string | number>(props: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
}): JSX.Element;
export function EmptyState(props: { children?: ReactNode }): JSX.Element;
export function StatValue(props: {
  value: number | null | undefined;
  unit?: string;
  digits?: number;
  emptyText?: string;
}): JSX.Element;
