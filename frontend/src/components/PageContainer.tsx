import type { ReactNode } from 'react';

/**
 * Standard page width and padding.
 *
 * A component pages opt into rather than a second layout route: `/plan` and a
 * line's page want a full-bleed list-and-map split instead, and they should be
 * able to simply not use this.
 */
export function PageContainer({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      {children}
    </div>
  );
}
