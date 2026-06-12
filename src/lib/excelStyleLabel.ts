/**
 * Generate an Excel-style column label from a 0-based index.
 *
 *   0 → A, 25 → Z, 26 → AA, 27 → AB, 51 → AZ, 52 → BA, 701 → ZZ, 702 → AAA
 *
 * Used for auto-generated cargo labels when the user has not mapped a label column.
 */
export function excelStyleLabel(index: number): string {
  let result = ''
  let n = index
  do {
    result = String.fromCharCode(65 + (n % 26)) + result
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return result
}
