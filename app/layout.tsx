import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Web Page Cloner",
  description: "Clone any web page with all styles and assets",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh" className="h-full antialiased">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
// 过滤本地访问统计
if (typeof window !== 'undefined') {
  var hostname = window.location.hostname;
  var isLocal = hostname === 'localhost' ||
                hostname === '127.0.0.1' ||
                hostname.startsWith('192.168.') ||
                hostname.startsWith('10.') ||
                hostname.startsWith('172.16.');

  if (!isLocal) {
    var _hmt = _hmt || [];
    (function() {
      var hm = document.createElement("script");
      hm.src = "https://hm.baidu.com/hm.js?8775e1dd8a18a03c5be475ff840c59ff";
      var s = document.getElementsByTagName("script")[0];
      s.parentNode.insertBefore(hm, s);
    })();
  }
}
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
