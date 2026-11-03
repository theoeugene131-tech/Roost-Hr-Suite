import "./globals.css";

export const metadata = {
  title: "Medash HR Suite | HR Management, Payroll & Training",
  description: "Medash HR Suite brings HR management, payroll and employee training into one organised workspace for growing businesses.",
  manifest: "/manifest.json",
  themeColor: "#241623",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body style={{fontFamily:'Inter, sans-serif'}}>{children}</body>
    </html>
  );
}
