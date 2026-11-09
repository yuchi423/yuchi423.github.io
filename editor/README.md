# 博客编辑器

在博客仓库根目录运行以下命令。第一次使用时先运行一次 npm ci。

```sh
npm run editor
```

打开 [本地编辑器](http://127.0.0.1:5174/__editor/)。点标题输入文字，点正文段落就地编辑 Markdown，或用「正文源码」编辑全文。点「完成」收起当前输入框。工具栏的封面、图片和附件可以选择本地文件。

「保存草稿」保存到 drafts/editor/，下次启动后从「打开」继续。「保存到博客」写入 docs/tech/ 或 docs/essay/，图片和附件同时进入 docs/public/。用 Git 提交并推送到 main 后发布。

预览使用同一套 VitePress 配置和主题。终端按 Ctrl+C 停止编辑器。
