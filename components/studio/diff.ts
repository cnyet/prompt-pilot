export type DiffLineKind = 'same' | 'add' | 'remove'

export interface DiffLine {
  kind: DiffLineKind
  text: string
}

/**
 * 行级 LCS diff。只服务于字段建议的「查看差异」，
 * 输入是两段纯文本，无依赖、无 IO，可以在浏览器与测试里直接跑。
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const left = before.split('\n')
  const right = after.split('\n')
  const table: number[][] = Array.from({ length: left.length + 1 }, () =>
    new Array<number>(right.length + 1).fill(0),
  )

  const at = (row: number, column: number): number =>
    table[row]?.[column] ?? 0

  for (let row = left.length - 1; row >= 0; row -= 1) {
    const current = table[row]
    if (!current) {
      continue
    }
    for (let column = right.length - 1; column >= 0; column -= 1) {
      current[column] =
        left[row] === right[column]
          ? at(row + 1, column + 1) + 1
          : Math.max(at(row + 1, column), at(row, column + 1))
    }
  }

  const lines: DiffLine[] = []
  let row = 0
  let column = 0
  while (row < left.length && column < right.length) {
    if (left[row] === right[column]) {
      lines.push({ kind: 'same', text: left[row] ?? '' })
      row += 1
      column += 1
    } else if (at(row + 1, column) >= at(row, column + 1)) {
      lines.push({ kind: 'remove', text: left[row] ?? '' })
      row += 1
    } else {
      lines.push({ kind: 'add', text: right[column] ?? '' })
      column += 1
    }
  }
  while (row < left.length) {
    lines.push({ kind: 'remove', text: left[row] ?? '' })
    row += 1
  }
  while (column < right.length) {
    lines.push({ kind: 'add', text: right[column] ?? '' })
    column += 1
  }

  return lines
}
