import type { Metadata } from 'next';
import './globals.css';
import HeaderBar from '../components/HeaderBar';

export const metadata: Metadata = {
  title: 'Algo Terminal',
  description: 'Live trading algo dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Google Fonts: Inter + IBM Plex Mono */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-hl-bg text-hl-text antialiased">
        {/* Top Navbar - dynamic */}
        <HeaderBar />

        {/* Main content */}
        <main className="pt-12 min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}