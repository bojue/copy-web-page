"use client";

import { useState } from "react";
import Link from "next/link";

const templates = [
  { id: 1, name: "飞书",     previewUrl: "http://clone.nocokit.cn/api/clone/dYBADdLRCT/preview" },
  { id: 2, name: "Kimi",     previewUrl: "http://clone.nocokit.cn/api/clone/8I0qfHjxiA/preview" },
  { id: 3, name: "shadcn",   previewUrl: "http://clone.nocokit.cn/api/clone/A2QJILIqWi/preview" },
];

export default function Templates() {
  const [active, setActive] = useState(templates[0]);

  return (
    <div className="bg-white text-[#16191f] h-screen flex flex-col overflow-hidden">
      <main className="flex-grow flex flex-col relative">
        {/* 预览区域 */}
        <div className="flex-grow relative">
          <iframe
            key={active.id}
            src={active.previewUrl}
            className="w-full h-full absolute inset-0 border-0"
            title={active.name}
          />
        </div>

        {/* 底部居中模版切换 */}
        <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none z-10">
          <div className="pointer-events-auto flex items-center gap-1 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-full px-2 py-1.5 shadow-md">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setActive(t)}
                className={`px-4 py-1.5 text-sm font-medium rounded-full whitespace-nowrap transition-colors ${
                  active.id === t.id
                    ? "bg-slate-900 text-white"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                {t.name}
              </button>
            ))}

            {/* 返回首页按钮 */}
            <div className="w-px h-5 bg-slate-200 mx-1" />
            <Link
              href="/"
              className="px-4 py-1.5 text-sm font-medium rounded-full whitespace-nowrap transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-100 flex items-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
              </svg>
              首页
            </Link>
          </div>
        </div>
      </main>

      <footer className="w-full text-center py-4 border-t border-slate-200 bg-white flex-shrink-0">
        <p className="text-[11px] text-slate-500">
          Web Page Cloner · 开源轻量级工具 · 仅供技术研究与授权测试使用
        </p>
      </footer>
    </div>
  );
}
