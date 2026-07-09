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
  const [url, setUrl] = useState("https://mintlify.com");
  const [depth, setDepth] = useState(1);
  const [includeJs, setIncludeJs] = useState(true);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    const rateLimit = preset === "custom"
      ? customConfig
      : RATE_LIMIT_PRESETS[preset];

    onSubmit({ url: url.trim(), depth, includeJs, rateLimit });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* URL Input */}
      <div>
        <label htmlFor="url" className="block text-sm font-semibold text-gray-300 mb-2">
          网页地址
        </label>
        <div className="relative">
          <input
            id="url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            required
            className="w-full px-4 py-3.5 bg-gray-800/50 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 focus:bg-gray-800 transition-all"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
          </div>
        </div>
      </div>

      {/* Options Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Depth */}
        <Select
          label="爬取深度"
          value={depth}
          onChange={setDepth}
          options={[
            { value: 1, label: "单页 - 仅当前页面" },
            { value: 2, label: "2 层 - 跟随链接" },
            { value: 3, label: "3 层 - 深度爬取" },
          ]}
        />

        {/* Include JS */}
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">
            JavaScript
          </label>
          <Checkbox
            checked={includeJs}
            onChange={setIncludeJs}
            label="包含 JS 文件"
          />
        </div>
      </div>

      {/* Advanced: Rate Limiting */}
      <div className="border border-gray-700/50 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full px-4 py-3 flex items-center justify-between bg-gray-800/30 hover:bg-gray-800/50 transition-all cursor-pointer"
        >
          <span className="text-sm font-semibold text-gray-400">请求频率控制</span>
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${showAdvanced ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showAdvanced && (
          <div className="p-4 space-y-4 border-t border-gray-700/50">
            {/* Preset Selector */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">速度预设</label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(PRESET_LABELS) as PresetKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPreset(key)}
                    className={`px-3 py-2 text-xs rounded-lg border transition-all cursor-pointer ${
                      preset === key
                        ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-300"
                        : "bg-gray-800/30 border-gray-700/50 text-gray-400 hover:bg-gray-800/50"
                    }`}
                  >
                    {PRESET_LABELS[key]}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Config */}
            {preset === "custom" && (
              <div className="space-y-3 pt-2 border-t border-gray-700/30">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">并发数</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={customConfig.concurrency}
                      onChange={(e) => setCustomConfig({ ...customConfig, concurrency: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">窗口请求数 (0=不限)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={customConfig.requestsPerWindow}
                      onChange={(e) => setCustomConfig({ ...customConfig, requestsPerWindow: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">时间窗口 (ms)</label>
                    <input
                      type="number"
                      min={500}
                      max={10000}
                      step={500}
                      value={customConfig.windowMs}
                      onChange={(e) => setCustomConfig({ ...customConfig, windowMs: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">批次间延迟 (ms)</label>
                    <input
                      type="number"
                      min={0}
                      max={5000}
                      step={100}
                      value={customConfig.interBatchDelayMs}
                      onChange={(e) => setCustomConfig({ ...customConfig, interBatchDelayMs: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">单请求间隔 (ms)</label>
                    <input
                      type="number"
                      min={0}
                      max={3000}
                      step={50}
                      value={customConfig.perRequestDelayMs}
                      onChange={(e) => setCustomConfig({ ...customConfig, perRequestDelayMs: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    />
                  </div>
                  <div className="flex items-end">
                    <Checkbox
                      checked={customConfig.adaptive}
                      onChange={(checked) => setCustomConfig({ ...customConfig, adaptive: checked })}
                      label="自适应"
                      className="h-[38px] px-3 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Preset Description */}
            {preset !== "custom" && (
              <p className="text-xs text-gray-500 mt-2">
                {preset === "aggressive" && "最大并发20，无延迟。适用于无反爬保护的站点。"}
                {preset === "normal" && "并发10，批次间200ms延迟。适合大多数站点。"}
                {preset === "careful" && "并发5，每2秒最多10请求，批次间500ms。适合有基础反爬的站点。"}
                {preset === "stealth" && "并发3，每3秒最多5请求，随机延迟。适合严格反爬站点。"}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Submit */}
      <Button
        type="submit"
        disabled={!url.trim()}
        loading={isLoading}
        variant="primary"
      >
        {isLoading ? "克隆中..." : "开始克隆"}
      </Button>
    </form>
  );
}
