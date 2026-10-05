# Noria card providers

This interface is part of the current experience build. A provider contributes a card to Home and Diary through `app.plugins.plugins.noria.cards`; it does not embed an arbitrary plugin window. Users install and manage dependencies with Obsidian's community plugin interface.

## Register a provider

Use `<your-plugin-id>:<card-type>` as a stable ID. Noria derives the dependency from that prefix. Register after the workspace is ready and listen for `noria:cards-ready` to reconnect when Noria reloads. Always dispose the previous registration and unregister when your plugin unloads.

```js
const { Plugin } = require("obsidian");

module.exports = class ExamplePlugin extends Plugin {
  onload() {
    let current;
    let unregister;
    const connect = (cards = this.app.plugins.plugins.noria?.cards) => {
      if (!cards || cards === current) return;
      unregister?.();
      current = cards;
      unregister = cards.register({
        id: `${this.manifest.id}:folder-count`,
        title: "Folder notes",
        icon: "files",
        description: "Count Markdown notes in a folder.",
        fields: [{ key: "folder", label: "Folder", type: "folder", required: true }],
        validate: (config) => {
          if (!this.app.vault.getAbstractFileByPath(config.folder)?.children) {
            throw new Error("Choose an existing folder.");
          }
        },
        render: ({ app, container, component, config, openSource }) => {
          const paint = () => {
            const prefix = config.folder.replace(/\/$/, "") + "/";
            const files = app.vault.getMarkdownFiles()
              .filter(file => file.path.startsWith(prefix));
            container.empty();
            container.createEl("p", { text: `${files.length} notes` });
            const first = files[0];
            if (first) {
              const button = container.createEl("button", { text: first.basename });
              component.registerDomEvent(button, "click", () => openSource(first.path));
            }
          };
          paint();
          for (const event of ["create", "delete", "rename"]) {
            component.registerEvent(app.vault.on(event, paint));
          }
        }
      });
    };
    this.registerEvent(this.app.workspace.on("noria:cards-ready", connect));
    this.app.workspace.onLayoutReady(() => connect());
    this.register(() => { unregister?.(); current = null; });
  }
};
```

## Configuration and rendering

`fields` is an array or a function of the current configuration. Each field accepts `key`, `label`, `type`, optional `default`, `required`, and `options` for selects (`{ value, label }`). Types are `text`, `number`, `checkbox`, `date`, `select`, `file`, `folder`, and `property`. Set `refresh: true` when changing a field changes the remaining form. Optional `validate(config)` can return a promise and reject invalid input before Apply.

`render(context)` receives:

| Value | Contract |
| --- | --- |
| `app` | Obsidian's current vault and workspace. |
| `container` | This instance's mount element. |
| `component` | A loaded Obsidian Component owned by this mount. Register events, timers and child components here. |
| `config` | A copy of this instance's configuration. Changing it does not save settings or affect another card. |
| `selection` | Only present for `supportsDate: true`: the Diary selection (`mode`, `anchorDate`) when available. Home can pass an empty object. |
| `openSource(path)` | Open the source in a separate tab. |

Rendering may be async and may return a cleanup function. Noria calls cleanup when the card is removed, rerendered, its provider unregisters, or Noria unloads. A render that finishes after disposal also has its cleanup called. Providers must cancel their own pending work and stop writing to detached elements. Card previews use the same renderer: rendering must not create or mutate source records; require an explicit user action for writes.

Two instances must keep separate local state. Keep durable data in source files, use current-text writes, and avoid relying on `getActiveFile()` for embedded contents. Hiding, duplicating or removing a card must not remove source data.

## Dependency changes and compatibility

If a configured provider is missing or disabled, its card shows a local explanation while retaining settings. Enabling the dependency and registering the provider restores rendering. Author and version information comes from the installed plugin manifest. Installation, updates and removal stay in Obsidian's plugin manager; Noria does not download or execute a separate card-package format.

The bundled Dataview adapter renders a selected query note using Obsidian's Markdown renderer. It has been exercised with separate query notes and dependency disable / restore. Other plugins need a registered provider or an embeddable Markdown block that respects the render context and lifecycle. The presence of a code block alone does not establish compatibility.

中文：卡片设置属于实例，原始记录仍由源文件及其插件管理。第三方卡片通过 Obsidian 插件安装；`noria:cards-ready` 用于重载后重新注册。请将事件和资源登记到传入的 `component`，不要依赖当前活动笔记来判断卡片数据来源，也不要在预览时自动写入内容。
