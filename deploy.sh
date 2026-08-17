#!/usr/bin/env sh

# 忽略错误
set -e

# 循环直到用户输入有效信息
while true; do
    echo "请输入提交信息（不能为空）:"
    read commit_message

    # 检查输入是否为空
    if [ -n "$commit_message" ]; then
        break  # 输入有效，退出循环
    else
        echo "提交信息不能为空，请重新输入！"
    fi
done

git add .
git commit -m "$commit_message"
git push