// Count JSON encoding without materializing an oversized string or UTF-8 buffer.
export function boundedJsonByteLength(value: unknown, limit: number): number | null {
    let remaining = limit;
    let nodes = 0;
    const consume = (bytes: number): boolean => (remaining -= bytes) >= 0;
    function string(text: string): boolean {
        if (!consume(2)) return false;
        for (let index = 0; index < text.length; index++) {
            const code = text.charCodeAt(index);
            let bytes: number;
            if (code === 34 || code === 92 || [8, 9, 10, 12, 13].includes(code)) bytes = 2;
            else if (code < 32) bytes = 6;
            else if (code < 128) bytes = 1;
            else if (code < 2048) bytes = 2;
            else if (code >= 0xd800 && code <= 0xdbff && text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) {
                bytes = 4;
                index++;
            } else bytes = code >= 0xd800 && code <= 0xdfff ? 6 : 3;
            if (!consume(bytes)) return false;
        }
        return true;
    }
    function visit(input: unknown, depth: number): boolean {
        if (++nodes > 50_000 || depth > 64) return false;
        if (typeof input === "string") return string(input);
        if (input === null || input === undefined) return consume(4);
        if (typeof input === "boolean") return consume(input ? 4 : 5);
        if (typeof input === "number") return consume(JSON.stringify(input).length);
        if (typeof input !== "object" || !consume(2)) return false;
        let first = true;
        if (Array.isArray(input)) {
            for (const item of input) {
                if ((!first && !consume(1)) || !visit(item, depth + 1)) return false;
                first = false;
            }
        } else {
            for (const key in input) {
                if (!Object.hasOwn(input, key)) continue;
                const item: unknown = Reflect.get(input, key);
                if (item === undefined) continue;
                if ((!first && !consume(1)) || !string(key) || !consume(1) || !visit(item, depth + 1)) return false;
                first = false;
            }
        }
        return true;
    }
    return visit(value, 0) ? limit - remaining : null;
}
