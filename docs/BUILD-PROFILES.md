# 构建版本与本机试用

`build-profiles.json` 集中记录功能边界。公开版默认仅含核心：主页、任务、日历、日记、习惯、专注、建议、通用卡片与统计，以及普通笔记／页面／链接快捷入口。藏馆、RSS、健康、财务、物品（含衣橱）和旅行仅自用。藏馆的共享源码仍在本仓库，由编译边界排除；其他自用源码在同级 `noria-private`。这不是源码保密方案，也不是界面开关。

公开构建仍用 `npm run build`，产物只取 `main.js`、`manifest.json`、`styles.css`，禁止用整个已安装插件目录作为发布包。构建检查依赖边界，并在本机 `evidence/public-build-info.json` 记录实际输入。将外部自用模块转为公开需要明确迁入可发布源码，不能仅修改列表绕过源代码边界。

在私用工程中：

```powershell
npm run build
node scripts/build.mjs --modules=media,rss
```

第一条输出完整自用版 `dist/noria`；第二条只组合藏馆与RSS，输出 `dist/profiles/media-rss/noria`。物品与衣橱同属 `inventory`。每个输出旁的 `build-info.json` 声明程序文件和校验值；选定功能决定代码、后台程序和资源。没有选中的功能不提供入口、卡片和接口。

在公开工程用同一安装命令：

```powershell
node scripts/install-release-to-vault.mjs <测试库路径>
node scripts/install-release-to-vault.mjs <测试库路径> --from=../noria-private/dist/noria
```

随后在该库重新加载Noria。两个版本使用相同插件ID；安装器先核对包内文件和路径，再替换程序文件，保留 `data.json`、迁移恢复记录、草稿及其他文件。旧自用资源可以留在本机，公开构建不加载它们。不存在的模块布局只暂不显示，切回后继续读取原数据。RSS独立后台有自己的生命周期：已开启的采集不会因更换插件版本自动停止，若需停止应先在自用版关闭该开关。

本批只准备本地候选版本和新库试用，未上传、推送或创建Release。首次使用测试库不复制个人设置、凭据或真实数据。
