(() => {
  const root = globalThis.dashboardCore || (globalThis.dashboardCore = {});
  root.adapters = root.adapters || {};

  async function ensureParentFolder(app, filePath) {
    const normalized = String(filePath || "").replace(/[\\]+/g, "/");
    const slash = normalized.lastIndexOf("/");
    if (slash <= 0) return;
    const folderPath = normalized.slice(0, slash);
    const parts = folderPath.split("/").filter(Boolean);
    let cursor = "";
    for (let i = 0; i < parts.length; i++) {
      cursor = cursor ? `${cursor}/${parts[i]}` : parts[i];
      if (!app.vault.getAbstractFileByPath(cursor)) {
        try {
          await app.vault.createFolder(cursor);
        } catch (_) {}
      }
    }
  }

  async function processExistingFile(app, file, transform) {
    let outcome = null;
    const apply = (current) => {
      const source = String(current || "");
      outcome = transform(source) || { changed: false, text: source };
      return outcome.changed === false ? source : String(outcome.text ?? source);
    };
    if (typeof app?.vault?.process === "function") {
      await app.vault.process(file, apply);
      return outcome;
    }
    const current = await app.vault.cachedRead(file);
    const next = apply(current);
    if (outcome?.changed !== false && next !== String(current || "")) {
      await app.vault.modify(file, next);
    }
    return outcome;
  }

  async function appendTaskLineToDaily({
    app,
    buildDailyNotePath,
    dateStr,
    lineText,
    sectionHeading = "### 今日任务",
    filePathOverride = ""
  }) {
    const override = String(filePathOverride || "").replace(/[\\]+/g, "/").trim();
    const filePath = override || buildDailyNotePath(dateStr);
    const normalizedPath = String(filePath || "").replace(/[\\]+/g, "/");
    const file = app.vault.getAbstractFileByPath(normalizedPath);
    if (!file) {
      await ensureParentFolder(app, normalizedPath);
      const init = `${sectionHeading}\n\n${lineText}\n`;
      await app.vault.create(normalizedPath, init);
      return true;
    }
    const outcome = await processExistingFile(app, file, (oldContent) => {
      if (oldContent.includes(lineText)) return { changed: false, text: oldContent };
      const content = String(oldContent || "");
      const lines = content.split(/\r?\n/);
      let sectionIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (new RegExp(`^\\s*###\\s*${sectionHeading.replace(/^###\s*/, "").trim()}\\s*$`).test(lines[i])) {
          sectionIndex = i;
          break;
        }
      }
      let newContent = "";
      if (sectionIndex >= 0) {
        /** 插入到区块顶部（标题后首个非空行之前），新任务排在列表最上，与阅读顺序一致 */
        let insertAt = sectionIndex + 1;
        while (insertAt < lines.length && lines[insertAt].trim() === "") {
          insertAt++;
        }
        lines.splice(insertAt, 0, lineText);
        newContent = lines.join("\n").replace(/\n{3,}/g, "\n\n");
      } else {
        const tail = content.trimEnd();
        newContent = tail
          ? `${tail}\n\n${sectionHeading}\n\n${lineText}\n`
          : `${sectionHeading}\n\n${lineText}\n`;
      }
      return { changed: true, text: newContent };
    });
    return outcome?.changed === true;
  }

  async function removeExactTaskLineFromDaily({ app, filePath, lineText }) {
    const normalizedPath = String(filePath || "").replace(/[\\]+/g, "/").trim();
    const needle = String(lineText || "");
    if (!normalizedPath || !needle) return false;
    const file = app.vault.getAbstractFileByPath(normalizedPath);
    if (!file) return false;
    const outcome = await processExistingFile(app, file, (oldContent) => {
      const lines = String(oldContent || "").split(/\r?\n/);
      const matches = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i] === needle) matches.push(i);
      }
      if (matches.length !== 1) {
        return { changed: false, removed: false, text: oldContent };
      }
      lines.splice(matches[0], 1);
      return {
        changed: true,
        removed: true,
        text: lines.join("\n").replace(/\n{3,}/g, "\n\n")
      };
    });
    return outcome?.removed === true;
  }

  async function appendTemplateToLibrary({
    app,
    libPath,
    line,
    uniqueNeedle,
    initialSeed = ""
  }) {
    const file = app.vault.getAbstractFileByPath(libPath);
    if (!file) {
      await ensureParentFolder(app, libPath);
      const init = String(initialSeed || "").trimEnd();
      const content = init ? `${init}\n${line}\n` : `${line}\n`;
      await app.vault.create(libPath, content);
      return;
    }
    await processExistingFile(app, file, (oldContent) => {
      if (uniqueNeedle && oldContent.includes(uniqueNeedle)) {
        return { changed: false, text: oldContent };
      }
      return { changed: true, text: `${String(oldContent || "").trimEnd()}\n${line}\n` };
    });
  }

  function upsertFrontmatterLine(lines, key, value) {
    const k = String(key || "").trim();
    const v = String(value || "").trim();
    if (!k) return lines;
    const out = Array.isArray(lines) ? [...lines] : [];
    const hasFm = out.length > 0 && out[0].trim() === "---";
    if (!hasFm) {
      return ["---", `${k}: ${v}`, "---", ""].concat(out);
    }
    let end = -1;
    for (let i = 1; i < out.length; i++) {
      if (out[i].trim() === "---") {
        end = i;
        break;
      }
    }
    if (end < 0) {
      return ["---", `${k}: ${v}`, "---", ""].concat(out);
    }
    const re = new RegExp(`^${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`);
    for (let j = 1; j < end; j++) {
      if (re.test(out[j].trim())) {
        out[j] = `${k}: ${v}`;
        return out;
      }
    }
    out.splice(end, 0, `${k}: ${v}`);
    return out;
  }

  async function appendHealthMetricsToDaily({
    app,
    buildDailyNotePath,
    dateStr,
    metricsObj
  }) {
    const filePath = buildDailyNotePath(dateStr);
    const normalized = String(filePath || "").replace(/[\\]+/g, "/");
    const file = app.vault.getAbstractFileByPath(normalized);
    if (!file) {
      await ensureParentFolder(app, normalized);
      const fmNew = ["---"];
      Object.keys(metricsObj || {}).forEach((k) => {
        fmNew.push(`${k}: ${String(metricsObj[k])}`);
      });
      fmNew.push("---", "");
      await app.vault.create(normalized, fmNew.join("\n"));
      return;
    }
    await processExistingFile(app, file, (content) => {
      let lines = String(content || "").split(/\r?\n/);
      Object.keys(metricsObj || {}).forEach((k) => {
        lines = upsertFrontmatterLine(lines, k, metricsObj[k]);
      });
      const next = lines.join("\n");
      return { changed: next !== String(content || ""), text: next };
    });
  }

  root.adapters.timelineIoAdapter = {
    ensureParentFolder,
    appendTaskLineToDaily,
    removeExactTaskLineFromDaily,
    appendTemplateToLibrary,
    upsertFrontmatterLine,
    appendHealthMetricsToDaily
  };
})();
