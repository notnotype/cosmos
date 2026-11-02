import { withoutFences } from "./markdown.js";
import type { Snapshot } from "./scope.js";

export function checkWhitespace(snapshot: Snapshot, added: readonly string[], failures: string[]): string[] {
    const checked = added.filter((path) => path.endsWith(".md") && snapshot.files.includes(path));
    for (const path of checked) {
        const text = snapshot.read(path);
        if (!text.endsWith("\n")) failures.push(`新增 Markdown 空白错误：${path}（缺少文件末尾换行）`);
        if (/(?:\r?\n){2,}$/u.test(text)) failures.push(`新增 Markdown 空白错误：${path}（末尾多余空行）`);
        const body = withoutFences(text).split(/\r?\n/u);
        for (const [index, line] of text.split(/\r?\n/u).entries()) {
            const tail = /[\t ]+$/u.exec(line)?.[0];
            if (!tail) continue;
            const hardbreak = tail === "  " && body[index]?.trim() && !/^\s*(?:#{1,6}\s|[-=]+\s*$|\|)/u.test(line);
            if (!hardbreak) failures.push(`新增 Markdown 空白错误：${path}:${index + 1}（尾随空白）`);
        }
    }
    return checked;
}
