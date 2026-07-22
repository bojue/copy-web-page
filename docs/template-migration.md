# 案例模板迁移指南

## 问题说明

当前案例文件存储在 `/tmp/web-cloner/{jobId}/` 临时目录下，会被定时清理脚本删除。为了保护案例不被删除，需要将它们迁移到 `public/templates/` 目录。

## 解决方案

### 1. 目录结构

```
public/
└── templates/
    ├── Cm_4FQOKoc/          # Mintlify 案例
    │   └── site/
    │       ├── index.html
    │       └── assets/
    └── eS1NL30S8x/          # Kimi 案例
        └── site/
            ├── index.html
            └── assets/
```

### 2. 迁移步骤

#### 方式一：手动复制（推荐）

```bash
# 1. 创建目标目录
mkdir -p public/templates

# 2. 复制 Mintlify 案例
cp -r /tmp/web-cloner/Cm_4FQOKoc public/templates/

# 3. 复制 Kimi 案例
cp -r /tmp/web-cloner/eS1NL30S8x public/templates/

# 4. 验证文件是否存在
ls -la public/templates/Cm_4FQOKoc/site/
ls -la public/templates/eS1NL30S8x/site/
```

#### 方式二：使用迁移脚本

```bash
#!/bin/bash
# scripts/migrate-templates.sh

TEMPLATES=("Cm_4FQOKoc" "eS1NL30S8x")
SOURCE_DIR="/tmp/web-cloner"
TARGET_DIR="public/templates"

mkdir -p "$TARGET_DIR"

for template_id in "${TEMPLATES[@]}"; do
  source_path="$SOURCE_DIR/$template_id"
  target_path="$TARGET_DIR/$template_id"
  
  if [ -d "$source_path" ]; then
    echo "迁移 $template_id..."
    cp -r "$source_path" "$target_path"
    echo "✓ 完成"
  else
    echo "⚠️  警告: $source_path 不存在，跳过"
  fi
done

echo "迁移完成！"
```

### 3. 代码修改说明

已经修改了以下文件来支持从 `public/templates` 读取案例：

1. **app/api/clone/[jobId]/preview/route.ts**
   - 优先从 `public/templates/{jobId}/site` 查找
   - 如果不存在，再从 `/tmp/web-cloner/{jobId}/site` 查找

2. **app/api/clone/[jobId]/preview/assets/[...path]/route.ts**
   - 同样支持两个路径的资源查找

### 4. 工作原理

- **公共模板（案例）**：存放在 `public/templates/` 下，不会被清理
- **临时克隆结果**：存放在 `/tmp/web-cloner/` 下，会被定时清理
- **路由自动判断**：预览 API 会自动优先从公共模板读取，确保案例永久可用

### 5. 验证迁移

访问以下 URL 确认案例正常显示：

- Mintlify: http://localhost:3000/api/clone/Cm_4FQOKoc/preview
- Kimi: http://localhost:3000/api/clone/eS1NL30S8x/preview
- 模板页面: http://localhost:3000/templates

### 6. 添加新案例

将来添加新案例时，直接将克隆结果复制到 `public/templates/` 即可：

```bash
# 克隆完成后，复制到公共目录
cp -r /tmp/web-cloner/{new-job-id} public/templates/

# 更新 app/templates/page.tsx
const templates = [
  { id: 1, name: "Mintlify", previewUrl: "http://clone.nocokit.cn/api/clone/Cm_4FQOKoc/preview" },
  { id: 2, name: "Kimi", previewUrl: "http://clone.nocokit.cn/api/clone/eS1NL30S8x/preview" },
  { id: 3, name: "新案例", previewUrl: "http://clone.nocokit.cn/api/clone/{new-job-id}/preview" },
];
```

## 注意事项

1. ⚠️ **迁移前先检查源文件是否存在**，避免案例已被清理
2. ✅ **迁移后保持原有的目录结构**：`{jobId}/site/index.html`
3. 🔒 **public 目录的文件会被提交到 Git**，确认案例内容适合公开
4. 💾 **文件较大时考虑 .gitignore**，或使用 Git LFS

## 清理脚本修改建议（可选）

如果担心误删公共模板，可以修改 `scripts/cleanup-puppeteer-profiles.sh`：

```bash
# 添加保护逻辑
PROTECTED_IDS=("Cm_4FQOKoc" "eS1NL30S8x")

for id in "${PROTECTED_IDS[@]}"; do
  if [ "$dir" = "/tmp/web-cloner/$id" ]; then
    echo "跳过受保护的模板: $id"
    continue 2
  fi
done
```
