import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { UiShowcase } from './ui-showcase';

export const metadata: Metadata = { title: 'Thư viện component', robots: { index: false } };

/** Development-only gallery of the shared components; 404 in production builds. */
export default function UiShowcasePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <UiShowcase />;
}
