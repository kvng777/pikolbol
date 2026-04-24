import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { AuthProvider } from "@/components/AuthProvider";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/next"

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pikolbol — Book Your Pickleball Court",
  description: "Reserve your pickleball court online. Easy booking, instant confirmation.",
  openGraph: {
    title: "Pikolbol — Book Your Pickleball Court",
    description: "Reserve your pickleball court online. Easy booking, instant confirmation.",
    type: "website",
    images: [{ width: 1200, height: 630, url: "/opengraph-image" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pikolbol — Book Your Pickleball Court",
    description: "Reserve your pickleball court online. Easy booking, instant confirmation.",
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${plusJakartaSans.variable} antialiased bg-white`}
      >
        <Providers>
          <AuthProvider>
            {children}
            <Analytics />
            <Toaster />
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
