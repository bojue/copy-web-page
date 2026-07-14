"use client";

import { useState } from "react";
import { RATE_LIMIT_PRESETS, RateLimitOptions } from "@/lib/types";
import Button from "./ui/Button";
import Checkbox from "./ui/Checkbox";
import Select from "./ui/Select";

interface CloneFormProps {
  onSubmit: (options: { url: string; depth: number; includeJs: boolean; rateLimit?: Partial<RateLimitOptions> }) => void;
  isLoading: boolean;
}

type PresetKey = "aggressive" | "normal" | "careful" | "stealth" | "custom";

const PRESET_LABELS: Record<PresetKey, string> = {
  aggressive: "激进 - 最快速度",
  normal: "正常 - 平衡速度与安全",
  careful: "谨慎 - 低频率访问",
  stealth: "隐身 - 最低检测率",
  custom: "自定义",
};

export default function CloneForm({ onSubmit, isLoading }: CloneFormProps) {
  const [url, setUrl] = useState("https://ui.shadcn.com/");
  const [depth, setDepth] = useState(1);
  const [includeJs, setIncludeJs] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [preset, setPreset] = useState<PresetKey>("normal");
  const [customConfig, setCustomConfig] = useState<RateLimitOptions>({
    concurrency: 10,
    requestsPerWindow: 0,
    windowMs: 2000,
    interBatchDelayMs: 200,
    perRequestDelayMs: 0,
    adaptive: true,
  });
  const [lastSubmitTime, setLastSubmitTime] = useState(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    // 防止3秒内重复提交
    const now = Date.now();
    if (now - lastSubmitTime < 3000) {
      return;
    }

    setLastSubmitTime(now);

    const rateLimit = preset === "custom"
      ? customConfig
      : RATE_LIMIT_PRESETS[preset];

    onSubmit({ url: url.trim(), depth, includeJs, rateLimit });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* URL Input */}
      <div className="space-y-1.5">
        <label htmlFor="url" className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
          网页地址 (Target URL)
        </label>
        <p className="text-[11px] text-slate-500 leading-normal">
          请输入包含 http:// 或 https:// 的完整网络协议地址。
        </p>
        <input
          id="url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          required
          className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-[#0066cc] focus:border-[#0066cc] text-xs transition-all placeholder-slate-400"
        />
      </div>

      {/* Options Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Depth */}
        <div className="space-y-1.5">
          <label htmlFor="depth" className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
            爬取深度
          </label>
          <select
            id="depth"
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-[#0066cc] focus:border-[#0066cc] text-xs transition-all text-slate-700"
          >
            <option value={1}>单页 - 仅当前页面</option>
          </select>
        </div>

        {/* Rate Limit Preset */}
        <div className="space-y-1.5">
          <label htmlFor="rate" className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
            请求频率控制
          </label>
          <select
            id="rate"
            value={preset}
            onChange={(e) => setPreset(e.target.value as PresetKey)}
            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-[#0066cc] focus:border-[#0066cc] text-xs transition-all text-slate-700"
          >
            {(Object.keys(PRESET_LABELS) as PresetKey[]).map((key) => (
              <option key={key} value={key}>{PRESET_LABELS[key]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* JavaScript 附加选项 */}
      <div className="flex items-start gap-2.5 pt-1">
        <input
          type="checkbox"
          id="js-include"
          checked={includeJs}
          onChange={(e) => setIncludeJs(e.target.checked)}
          className="mt-0.5 rounded border-slate-300 text-[#232f3e] focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer"
        />
        <div className="space-y-0.5">
          <label htmlFor="js-include" className="block text-xs font-semibold text-slate-800 cursor-pointer">
            包含 JavaScript 脚本文件
          </label>
          <p className="text-[11px] text-slate-500">
            如果目标页面有动态交互，建议勾选。若只需离线静态展示，可不勾选以加快速度。
          </p>
        </div>
      </div>

      {/* Custom Rate Limit Configuration */}
      {preset === "custom" && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded space-y-3">
          <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">自定义配置</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">并发数</label>
              <input
                type="number"
                min={1}
                max={30}
                value={customConfig.concurrency}
                onChange={(e) => setCustomConfig({ ...customConfig, concurrency: Number(e.target.value) })}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-[#0066cc]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">窗口请求数 (0=不限)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={customConfig.requestsPerWindow}
                onChange={(e) => setCustomConfig({ ...customConfig, requestsPerWindow: Number(e.target.value) })}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-[#0066cc]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">时间窗口 (ms)</label>
              <input
                type="number"
                min={500}
                max={10000}
                step={500}
                value={customConfig.windowMs}
                onChange={(e) => setCustomConfig({ ...customConfig, windowMs: Number(e.target.value) })}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-[#0066cc]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">批次间延迟 (ms)</label>
              <input
                type="number"
                min={0}
                max={5000}
                step={100}
                value={customConfig.interBatchDelayMs}
                onChange={(e) => setCustomConfig({ ...customConfig, interBatchDelayMs: Number(e.target.value) })}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-[#0066cc]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">单请求间隔 (ms)</label>
              <input
                type="number"
                min={0}
                max={3000}
                step={50}
                value={customConfig.perRequestDelayMs}
                onChange={(e) => setCustomConfig({ ...customConfig, perRequestDelayMs: Number(e.target.value) })}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-[#0066cc]"
              />
            </div>
            <div className="flex items-end">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="adaptive"
                  checked={customConfig.adaptive}
                  onChange={(e) => setCustomConfig({ ...customConfig, adaptive: e.target.checked })}
                  className="rounded border-slate-300 text-[#232f3e] focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer"
                />
                <label htmlFor="adaptive" className="text-[11px] text-slate-700 cursor-pointer">
                  自适应速率
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preset Description */}
      {preset !== "custom" && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded">
          <p className="text-[11px] text-slate-600 leading-relaxed">
            {preset === "aggressive" && "最大并发20，无延迟。适用于无反爬保护的站点。"}
            {preset === "normal" && "并发10，批次间200ms延迟。适合大多数站点。"}
            {preset === "careful" && "并发5，每2秒最多10请求，批次间500ms。适合有基础反爬的站点。"}
            {preset === "stealth" && "并发3，每3秒最多5请求，随机延迟。适合严格反爬站点。"}
          </p>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={!url.trim() || isLoading}
        className="w-full bg-[#ff9900] hover:bg-[#ec8c00] text-[#111111] font-semibold text-xs py-2 px-4 rounded shadow-sm transition-all text-center focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isLoading && (
          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        )}
        {isLoading ? "克隆中..." : "开始克隆 (Start Clone)"}
      </button>
    </form>
  );
}
