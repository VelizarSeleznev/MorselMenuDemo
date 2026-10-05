import type { Metadata } from 'next';
import './globals.css';
import {LocaleProvider} from '@/lib/i18n';
export const metadata: Metadata = {
  title: 'morsel — good food, your way',
  description:
    'Find your next favourite. Explore dishes in 3D and choose your perfect portion.',
  appleWebApp: { capable: true, title: 'morsel', statusBarStyle: 'default' },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body><LocaleProvider>{children}</LocaleProvider></body>
    </html>
  );
}
