// 실행: npx tsx scripts/nlu-calibrate.ts data/nlu-calibration/golden-set-30.jsonl
// 비용: 30건 ≈ $0.005 Claude Haiku (claude-haiku-4-5-20251001)

import * as fs from 'fs'
import * as readline from 'readline'
import * as path from 'path'
import { parseFreeformUtterance, type NluParseResult } from '../lib/triggers/nlu-parse'

interface GoldenLabel {
  event: string
  action: string
  when: string
  target: string | null
}

interface GoldenEntry {
  input: string
  label: GoldenLabel
}

interface EvalResult {
  input: string
  label: GoldenLabel
  prediction: NluParseResult
  eventMatch: boolean
  actionMatch: boolean
  whenMatch: boolean
  targetMatch: boolean
  allMatch: boolean
}

function computeECE(results: EvalResult[], numBins = 10): number {
  const bins: Array<{ total: number; correct: number; confSum: number }> = Array.from(
    { length: numBins },
    () => ({ total: 0, correct: 0, confSum: 0 }),
  )

  for (const r of results) {
    const binIdx = Math.min(Math.floor(r.prediction.confidence * numBins), numBins - 1)
    bins[binIdx].total += 1
    bins[binIdx].confSum += r.prediction.confidence
    if (r.allMatch) bins[binIdx].correct += 1
  }

  const n = results.length
  let ece = 0
  for (const bin of bins) {
    if (bin.total === 0) continue
    const binAccuracy = bin.correct / bin.total
    const binConfidence = bin.confSum / bin.total
    ece += (bin.total / n) * Math.abs(binAccuracy - binConfidence)
  }
  return ece
}

function confidenceHistogram(results: EvalResult[], numBins = 10): void {
  const bins = Array.from({ length: numBins }, (_, i) => ({
    range: `${(i / numBins).toFixed(1)}-${((i + 1) / numBins).toFixed(1)}`,
    count: 0,
  }))

  for (const r of results) {
    const binIdx = Math.min(Math.floor(r.prediction.confidence * numBins), numBins - 1)
    bins[binIdx].count += 1
  }

  console.log('\n=== Confidence Histogram ===')
  console.table(bins)
}

function precisionAtThresholdSweep(results: EvalResult[]): void {
  const thresholds = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]
  const rows = thresholds.map((t) => {
    const filtered = results.filter((r) => r.prediction.confidence >= t)
    const precision = filtered.length > 0 ? filtered.filter((r) => r.allMatch).length / filtered.length : null
    return {
      threshold: t,
      samples: filtered.length,
      precision: precision !== null ? precision.toFixed(3) : 'N/A',
    }
  })

  console.log('\n=== Precision @ Threshold Sweep ===')
  console.table(rows)
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Set ANTHROPIC_API_KEY env')
    process.exit(1)
  }

  const filePath = process.argv[2] ?? path.join('.', 'data', 'nlu-calibration', 'golden-set-30.jsonl')
  const absPath = path.resolve(filePath)

  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`)
    process.exit(1)
  }

  const entries: GoldenEntry[] = []
  const rl = readline.createInterface({ input: fs.createReadStream(absPath) })
  for await (const line of rl) {
    const trimmed = line.trim()
    if (trimmed) entries.push(JSON.parse(trimmed) as GoldenEntry)
  }

  console.log(`Loaded ${entries.length} golden entries. Running NLU parse...`)

  const results: EvalResult[] = []
  for (const entry of entries) {
    try {
      const prediction = await parseFreeformUtterance(entry.input)
      const eventMatch = prediction.event === entry.label.event
      const actionMatch = prediction.action === entry.label.action
      const whenMatch = prediction.when === entry.label.when
      const targetMatch = prediction.target === entry.label.target
      const allMatch = eventMatch && actionMatch && whenMatch && targetMatch
      results.push({ input: entry.input, label: entry.label, prediction, eventMatch, actionMatch, whenMatch, targetMatch, allMatch })
    } catch (err) {
      console.error(`Error parsing: "${entry.input}" —`, err)
    }
  }

  const n = results.length
  const fieldAccuracy = {
    event: results.filter((r) => r.eventMatch).length / n,
    action: results.filter((r) => r.actionMatch).length / n,
    when: results.filter((r) => r.whenMatch).length / n,
    target: results.filter((r) => r.targetMatch).length / n,
    all: results.filter((r) => r.allMatch).length / n,
  }

  console.log('\n=== Field-level Accuracy ===')
  console.table(
    Object.entries(fieldAccuracy).map(([field, acc]) => ({
      field,
      accuracy: acc.toFixed(3),
      correct: Math.round(acc * n),
      total: n,
    })),
  )

  confidenceHistogram(results)

  const ece = computeECE(results)
  console.log(`\nECE (Expected Calibration Error): ${ece.toFixed(4)}`)

  precisionAtThresholdSweep(results)
}

main()
