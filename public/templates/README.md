# 模板目录说明

## 目录结构

```
public/templates/
├── {jobId1}/
│   └── site/
│       ├── index.html
│       └── assets/
└── {jobId2}/
    └── site/
        ├── index.html
        └── assets/
```

## 使用方法

### 1. 保存案例模板

将要永久保存的案例从临时目录复制到这里：

```bash
# 示例：保存 jobId 为 Cm_4FQOKoc 的案例
cp -r /tmp/web-cloner/Cm_4FQOKoc public/templates/
```

### 2. 访问模板

- 临时克隆结果：`/tmp/web-cloner/{jobId}/` （会被定时清理）
- 永久案例模板：`public/templates/{jobId}/` （不会被清理）

预览 API 会**自动优先从 public/templates 读取**，如果不存在才从临时目录读取。

### 3. 更新模板页面

在 `app/templates/page.tsx` 中添加新案例：

```typescript
const templates = [
  { id: 1, name: "Mintlify", previewUrl: "http://clone.nocokit.cn/api/clone/Cm_4FQOKoc/preview" },
  { id: 2, name: "Kimi", previewUrl: "http://clone.nocokit.cn/api/clone/eS1NL30S8x/preview" },
  // 添加新案例
  { id: 3, name: "新案例", previewUrl: "http://clone.nocokit.cn/api/clone/{新jobId}/preview" },
];
```

## 注意事项

- ✅ 此目录的文件**不会被定时清理**
- ✅ 代码已自动支持从此目录读取
- ⚠️ 文件会被提交到 Git，注意案例内容的版权
- 💡 如果文件较大，考虑添加到 `.gitignore` 或使用 Git LFS
