import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chat Bot Dev — منصة إدارة بوتات الذكاء الاصطناعي',
  description: 'أنشئ، وزّع، وراقب بوتات الذكاء الاصطناعي على مواقع عملائك — بوابة AI موحّدة بمحرك توزيع أحمال ونبضات 24/7.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
