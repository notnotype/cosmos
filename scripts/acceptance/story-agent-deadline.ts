export function abortable<T>(signal: AbortSignal, use: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const aborted = () => {
            signal.removeEventListener("abort", aborted);
            reject(new DOMException("Generation deadline exceeded.", "AbortError"));
        };
        if (signal.aborted) { aborted(); return; }
        signal.addEventListener("abort", aborted, { once: true });
        Promise.resolve().then(() => {
            signal.throwIfAborted();
            return use();
        }).then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
    });
}
