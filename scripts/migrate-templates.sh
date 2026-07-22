#!/bin/bash

# 案例模板迁移脚本
# 将临时目录的案例迁移到 public/templates 永久保存

set -e

TEMPLATES=("Cm_4FQOKoc" "eS1NL30S8x")
SOURCE_DIR="/tmp/web-cloner"
TARGET_DIR="public/templates"

echo "========================================="
echo "  案例模板迁移脚本"
echo "========================================="
echo ""

# 获取项目根目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# 创建目标目录
echo "📁 创建目标目录: $TARGET_DIR"
mkdir -p "$TARGET_DIR"
echo ""

# 迁移每个模板
SUCCESS_COUNT=0
SKIP_COUNT=0

for template_id in "${TEMPLATES[@]}"; do
  source_path="$SOURCE_DIR/$template_id"
  target_path="$TARGET_DIR/$template_id"

  echo "处理模板: $template_id"
  echo "  源路径: $source_path"
  echo "  目标路径: $target_path"

  if [ -d "$source_path" ]; then
    if [ -d "$target_path" ]; then
      echo "  ⚠️  目标已存在，跳过（如需覆盖请手动删除目标目录）"
      ((SKIP_COUNT++))
    else
      echo "  📦 复制中..."
      cp -r "$source_path" "$target_path"

      # 验证
      if [ -f "$target_path/site/index.html" ]; then
        echo "  ✅ 迁移成功"
        ((SUCCESS_COUNT++))
      else
        echo "  ❌ 迁移失败：找不到 index.html"
      fi
    fi
  else
    echo "  ⚠️  源路径不存在，跳过"
    ((SKIP_COUNT++))
  fi

  echo ""
done

# 统计结果
echo "========================================="
echo "  迁移结果"
echo "========================================="
echo "成功: $SUCCESS_COUNT"
echo "跳过: $SKIP_COUNT"
echo "总计: ${#TEMPLATES[@]}"
echo ""

# 验证
echo "========================================="
echo "  验证迁移结果"
echo "========================================="
for template_id in "${TEMPLATES[@]}"; do
  target_path="$TARGET_DIR/$template_id"
  if [ -d "$target_path/site" ]; then
    size=$(du -sh "$target_path" | cut -f1)
    echo "✓ $template_id: $size"
  else
    echo "✗ $template_id: 不存在"
  fi
done
echo ""

echo "========================================="
echo "  后续步骤"
echo "========================================="
echo "1. 访问 http://localhost:3000/templates 验证案例展示"
echo "2. 访问以下 URL 验证预览："
echo "   - http://localhost:3000/api/clone/Cm_4FQOKoc/preview"
echo "   - http://localhost:3000/api/clone/eS1NL30S8x/preview"
echo "3. 如果验证通过，可以删除源文件："
for template_id in "${TEMPLATES[@]}"; do
  echo "   rm -rf $SOURCE_DIR/$template_id"
done
echo ""
echo "完成！"
