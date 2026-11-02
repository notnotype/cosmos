export function withoutFences(markdown: string): string {
    let marker: string | undefined;
    return markdown.split(/(?<=\n)/u).map((line) => {
        const fence = /^ {0,3}(`{3,}|~{3,})(.*)/u.exec(line);
        if (marker) {
            if (fence && fence[1][0] === marker[0] && fence[1].length >= marker.length && !fence[2].trim()) marker = undefined;
            return line.endsWith("\n") ? "\n" : "";
        }
        if (fence && !(fence[1][0] === "`" && fence[2].includes("`"))) {
            marker = fence[1];
            return line.endsWith("\n") ? "\n" : "";
        }
        return line;
    }).join("");
}

export function stripInlineCode(line: string): string {
    let result = "";
    let index = 0;
    while (index < line.length) {
        if (line[index] !== "`") {
            result += line[index++];
            continue;
        }
        let length = 1;
        while (line[index + length] === "`") length++;
        const closing = line.indexOf("`".repeat(length), index + length);
        if (closing === -1) {
            result += "`".repeat(length);
            index += length;
        } else {
            result += " ".repeat(closing + length - index);
            index = closing + length;
        }
    }
    return result;
}

export function collectRelativeLinkTargets(markdown: string): string[] {
    const text = withoutFences(markdown).split("\n").map(stripInlineCode).join("\n");
    const targets: string[] = [];
    // Keep balanced route-group parentheses while preserving the established link grammar.
    const inline = /!?\[[^\]\n]*\]\(\s*(?:<(?<angle>[^>\n]+)>|(?<bare>[^\s()]*(?:\([^\s()]*\)[^\s()]*)*))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/gu;
    const definitions = /^ {0,3}\[[^\]\n]+\]:\s*(?:<(?<angle>[^>\n]+)>|(?<bare>[^\s]+))/gmu;
    for (const pattern of [inline, definitions]) {
        for (const match of text.matchAll(pattern)) {
            const target = match.groups?.angle ?? match.groups?.bare;
            if (target) targets.push(target);
        }
    }
    return targets;
}
