import { type ReactNode } from 'react';

/** Sign-in, sign-up and the email-link pages: one narrow column. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-sm px-4 py-8 sm:py-14">{children}</div>;
}
