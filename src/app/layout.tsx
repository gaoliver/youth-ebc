import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Youth | Emmanuel Baptist Church',
  description: 'Connect with us and stay updated with all the latest news.',
  openGraph: {
    title: 'Youth | Emmanuel Baptist Church',
    description: 'Connect with us and stay updated with all the latest news.',
    url: 'https://youth.ebc-nl.org',
    siteName: 'Youth EBC',
    images: [
      {
        url: 'https://youth.ebc-nl.org/og-image.jpg', // Adicione uma imagem no public/og-image.jpg
        width: 1200,
        height: 630,
        alt: 'Youth EBC',
      },
    ],
    locale: 'En-US',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="En-US" className="dark">
      <body className={`${inter.className} bg-zinc-950 text-zinc-100 antialiased`}>
        {children}
      </body>
    </html>
  );
}