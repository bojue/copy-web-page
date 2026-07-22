"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const templates = [
  { id: 1, name: "Shadcn",   previewUrl: "http://clone.nocokit.cn/api/clone/A2QJILIqWi/preview" },
  { id: 2, name: "Dify",   previewUrl: "http://clone.nocokit.cn/api/clone/3qzWpHZT_s/preview" },
  { id: 3, name: "火山-AI普惠季",   previewUrl: "http://clone.nocokit.cn/api/clone/hwOCpPO_A0/preview" },
  { id: 4, name: "飞书-咨询表单", previewUrl: "http://clone.nocokit.cn/api/clone/dYBADdLRCT/preview" },
  { id: 5, name: "飞书-客户成功", previewUrl: "http://clone.nocokit.cn/api/clone/3HrujHHZ7a/preview" },
  { id: 6, name: "Kimi",     previewUrl: "http://clone.nocokit.cn/api/clone/8I0qfHjxiA/preview" },
];

const LOADING_TEXT =
  "为了保持相同的效果，所有模版资源不做任何优化，HTTP服务器请求资源并发限制导致请求时间较久，请耐心等待，也可以自行测试";

function TypingText({ text, active }: { text: string; active: boolean }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    // 每次重新加载时重置动画
    setCount(0);
    if (!active) return;

    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= text.length) clearInterval(timer);
    }, 150);

    return () => clearInterval(timer);
  }, [text, active]);

  return (
    <p className="text-2xl text-slate-600 mt-3 max-w-3xl text-center leading-relaxed min-h-[4rem]">
      {text.slice(0, count)}
      <span className="inline-block w-1 h-7 bg-slate-600 ml-1 -mb-1 animate-pulse" />
    </p>
  );
}

export default function Templates() {
  const [active, setActive] = useState(templates[0]);
  const [loading, setLoading] = useState(true);

  return (
    <div className="bg-white text-[#16191f] h-screen flex flex-col overflow-hidden">
      <main className="flex-grow flex flex-col relative">
        {/* 预览区域 */}
        <div className="flex-grow relative">
          {/* Loading 效果 */}
          {loading && (
            <div className="absolute inset-0 flex items-start justify-center pt-[20vh] bg-gradient-to-br from-slate-50 to-slate-100 z-10">
              <div className="flex flex-col items-center gap-4">
                {/* 旋转圆环 */}
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-slate-200 rounded-full"></div>
                  <div className="w-16 h-16 border-4 border-slate-900 rounded-full border-t-transparent animate-spin absolute top-0 left-0"></div>
                </div>
                {/* 加载文字 */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-600">加载中</span>
                  <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium">{active.name}</p>
                <TypingText text={LOADING_TEXT} active={loading} />
              </div>
            </div>
          )}

          <iframe
            key={active.id}
            src={active.previewUrl}
            className="w-full h-full absolute inset-0 border-0"
            title={active.name}
            onLoad={() => setLoading(false)}
          />
        </div>

        {/* 底部居中模版切换 */}
        <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none z-10">
          <div className="pointer-events-auto flex items-center gap-1 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-full px-2 py-1.5 shadow-md">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setActive(t);
                  setLoading(true);
                }}
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
