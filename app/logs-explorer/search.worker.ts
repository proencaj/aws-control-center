export type Match = { row: number; cell: number; start: number; end: number };
self.onmessage = (
  event: MessageEvent<{
    cells: string[][];
    term: string;
    regex: boolean;
    sensitive: boolean;
  }>,
) => {
  const { cells, term, regex, sensitive } = event.data;
  try {
    const pattern = regex ? term : term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expression = new RegExp(pattern, sensitive ? "g" : "gi");
    const matches: Match[] = [];
    outer: for (let row = 0; row < cells.length; row++) {
      for (let cell = 0; cell < cells[row].length; cell++) {
        expression.lastIndex = 0;
        for (const match of cells[row][cell].matchAll(expression)) {
          if (!match[0].length) continue;
          matches.push({
            row,
            cell,
            start: match.index!,
            end: match.index! + match[0].length,
          });
          if (matches.length >= 2000) break outer;
        }
      }
    }
    self.postMessage({ matches });
  } catch {
    self.postMessage({ matches: [], error: "Invalid regular expression." });
  }
};
