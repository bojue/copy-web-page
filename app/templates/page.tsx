"use client";

import { useState } from "react";
import NavHeader from "../components/NavHeader";

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
