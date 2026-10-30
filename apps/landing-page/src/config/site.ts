/**
 * Single place for outbound links and contact configuration, so no component
 * hard-codes a URL (or, worse, a placeholder `href="#"`).
 */
export const site = {
  name: 'AeroScribe',
  repoUrl: 'https://github.com/knarayanareddy/Aeroscribe',
  issuesUrl: 'https://github.com/knarayanareddy/Aeroscribe/issues/new',
  specsUrl: 'https://github.com/knarayanareddy/Aeroscribe/tree/main/specs',
  /** Where "Open the dashboard" points; override when deploying under a custom base. */
  dashboardUrl: import.meta.env.VITE_DASHBOARD_URL ?? '/Aeroscribe/dashboard/',
  /** Optional JSON endpoint for the contact form; see apps/landing-page/README.md. */
  contactEndpoint: import.meta.env.VITE_CONTACT_ENDPOINT,
} as const;

export interface NavLink {
  label: string;
  href: string;
}

export const navLinks: readonly NavLink[] = [
  { label: 'About', href: '#about' },
  { label: 'Capabilities', href: '#capabilities' },
  { label: 'Domains', href: '#research' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Docs', href: '#docs' },
  { label: 'Contact', href: '#contact' },
] as const;
