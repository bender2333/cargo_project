export default class NoSkippedE2EReporter {
  skipped = []

  onTestEnd(test, result) {
    if (result.status === 'skipped') {
      this.skipped.push(test.titlePath().join(' › '))
    }
  }

  onEnd() {
    if (this.skipped.length === 0) return
    console.error(`E2E runtime skip gate failed: ${this.skipped.length} skipped test(s).`)
    this.skipped.forEach((title) => console.error(`- ${title}`))
    return { status: 'failed' }
  }
}
