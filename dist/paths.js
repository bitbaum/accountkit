/** Browser-safe local return path; never accepts an external redirect. */
export function returnPath(from, fallback = "/") {
    if (typeof from !== "string" || !from.startsWith("/"))
        return fallback;
    if (from.startsWith("//") || from.includes("\\"))
        return fallback;
    if ([...from].some((c) => c.charCodeAt(0) < 0x20))
        return fallback;
    return from;
}
//# sourceMappingURL=paths.js.map