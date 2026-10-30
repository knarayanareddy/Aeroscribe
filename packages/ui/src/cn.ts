import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Compose Tailwind class names, letting later utilities win over conflicting
 * earlier ones. Shared by every AeroScribe app so the copies of this helper that
 * used to live in each app cannot drift apart.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
