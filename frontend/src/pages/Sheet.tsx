// src/pages/Sheet.tsx
import { useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets'
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core'
import UniverPresetSheetsCoreJaJP from '@univerjs/preset-sheets-core/locales/ja-JP'
import '@univerjs/preset-sheets-core/lib/index.css'

// Facade API imports
import '@univerjs/sheets/facade'
import '@univerjs/engine-formula/facade'
import '@univerjs/sheets-formula/facade'
import '@univerjs/ui/facade'

export default function Sheet() {
  const { name } = useParams<{ name: string }>()
  const notebookName = name ?? 'default'
  const navigate = useNavigate()
  const initialized = useRef(false)
  const univerAPIRef = useRef<any>(null)

  useEffect(() => {
    document.title = `${notebookName} - SUMIRE Notebook`
    return () => { document.title = 'SUMIRE Notebook' }
  }, [notebookName])

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    let cleanupFn: (() => void) | undefined
    initUniver(notebookName).then((result) => {
      cleanupFn = result?.cleanup
      univerAPIRef.current = result?.univerAPI
    })

    return () => {
      cleanupFn?.()
    }
  }, [])

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '4px 12px', background: '#f5f5f5', borderBottom: '1px solid #ddd', flexShrink: 0 }}>
        <a
          href="/"
          onClick={async (e) => {
            e.preventDefault()
            if (univerAPIRef.current) {
              await saveNotebook(univerAPIRef.current, notebookName)
            }
            navigate('/')
          }}
          style={{ cursor: 'pointer' }}
        >← デスクトップ</a>
        <span style={{ marginLeft: 16, fontWeight: 'bold' }}>{notebookName}</span>
      </div>
      <div id="univer-container" style={{ flex: 1 }} />
    </div>
  )
}

async function initUniver(notebookName: string) {
  // --- 1. Univer初期化 ---
  const { univerAPI } = createUniver({
    locale: LocaleType.JA_JP,
    locales: {
      [LocaleType.JA_JP]: mergeLocales(UniverPresetSheetsCoreJaJP),
    },
    presets: [
      UniverSheetsCorePreset({
        container: 'univer-container',
      }),
    ],
  })

  // デバッグ用: コンソールからアクセスできるようにする
  ;(window as any).__univerAPI = univerAPI

  // --- 2. 保存済みノートブックの復元 or 新規ワークブック ---
  let workbookData: any = null
  let notebookMeta: any = null
  try {
    const resp = await fetch(`/api/load?name=${encodeURIComponent(notebookName)}`)
    if (resp.ok) {
      const { meta, snapshot } = await resp.json()
      workbookData = snapshot
      notebookMeta = meta
      if (meta) {
        console.log('Loaded notebook:', meta)
      }
    }
  } catch (e) {
    console.log('No saved notebook, creating new workbook')
  }

  if (workbookData) {
    univerAPI.createWorkbook(workbookData)
  } else {
    univerAPI.createWorkbook({})
  }

  // --- 3. ダミー関数登録（参照追従用） ---
  const formulaEngine = univerAPI.getFormula()
  const dummyFn = (..._args: any[]) => ''
  formulaEngine.registerFunction('LLM', dummyFn, 'LLM: =LLM(input, prompt, output)')
  formulaEngine.registerFunction('XLLM', dummyFn, 'xLLM: =xLLM(input, prompt, output)')

  // --- 4. ▶ ボタン（Ribbon）追加 ---
  univerAPI.createMenu({
    id: 'sumiren.run-llm',
    title: '▶ LLM実行',
    tooltip: '選択セルの =LLM() 式を実行します',
    action: () => executeLLM(univerAPI, notebookMeta),
  }).appendTo('ribbon.start.others')

  // --- 5. Ctrl+S で保存 ---
  const handleKeydown = async (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      await saveNotebook(univerAPI, notebookName)
    }
  }
  document.addEventListener('keydown', handleKeydown)

  console.log(`SUMIRE'n initialized: ${notebookName} 🦊`)

  return {
    univerAPI,
    cleanup: () => document.removeEventListener('keydown', handleKeydown),
  }
}

// ============================================
// セル値取得ヘルパー（Univer リッチテキスト対応）
// ============================================
function getCellValue(sheet: any, cellRef: string): string {
  const range = sheet.getRange(cellRef)
  const val = range.getValue()
  if (val != null) return String(val)

  // getValue() が null の場合、リッチテキスト（p.body.dataStream）から取得
  const cellData = range.getCellData()
  const dataStream = cellData?.p?.body?.dataStream
  if (dataStream) {
    // dataStream は末尾に \r\n が付くので trim
    return dataStream.replace(/\r?\n$/, '')
  }

  return ''
}

// ============================================
// LLM実行ロジック
// ============================================
async function executeLLM(univerAPI: any, notebookMeta: any) {
  const sheet = univerAPI.getActiveWorkbook().getActiveSheet()
  const range = sheet.getActiveRange()
  if (!range) return

  const cellData = range.getCellData()
  const formula = cellData?.f || ''

  // LLM / xLLM の判定
  const funcMatch = formula.match(/^=(x?LLM)\(/i)
  if (!funcMatch) {
    console.warn('Selected cell is not an LLM/xLLM formula:', formula)
    return
  }
  const funcName = funcMatch[1].toUpperCase() // "LLM" or "XLLM"

  const parsed = parseLLMFormula(formula)
  if (!parsed) {
    console.warn('Failed to parse LLM formula:', formula)
    return
  }

  // 出力先セル
  const outputRange = sheet.getRange(parsed.output)

  // 実行中表示
  outputRange.setValue('⏳ 実行中...')

  try {
    // --- プロンプト取得 ---
    let prompt = parsed.prompt
    if (parsed.promptRef) {
      prompt = getCellValue(sheet, parsed.promptRef)
    }
    if (!prompt) {
      outputRange.setValue('#ERROR: Empty prompt')
      return
    }

    // --- 複数入力の取得と展開 ---
    const contextParts: string[] = []

    for (const inputRef of parsed.inputs) {
      let rawValue = getCellValue(sheet, inputRef)
      console.log(`[LLM] input ${inputRef}:`, rawValue ? rawValue.substring(0, 80) : '(empty)')

      // file:/// URI ならファイル内容に展開
      if (rawValue.startsWith('file:///') || rawValue.startsWith('/')) {
        const uri = rawValue.startsWith('/') ? `file://${rawValue}` : rawValue
        try {
          const readResp = await fetch('/api/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uri }),
          })
          if (readResp.ok) {
            const readResult = await readResp.json()
            if (readResult.content) {
              rawValue = readResult.content
              if (readResult.truncated) {
                console.warn(`File truncated (100KB limit): ${uri}`)
              }
            } else if (readResult.error) {
              rawValue = `#FILE_ERROR: ${readResult.error}`
            }
          }
        } catch (e: any) {
          rawValue = `#FILE_ERROR: ${e.message}`
        }
      }

      contextParts.push(`【入力: ${inputRef}】\n${rawValue}`)
    }

    const context = contextParts.join('\n\n')

    // --- LLM/xLLM 実行 ---
    const endpoint = funcName === 'XLLM' ? '/api/xllm' : '/api/llm'
    const body: any = { prompt, context }
    if (funcName !== 'XLLM' && notebookMeta?.llm_model) {
      body.model = notebookMeta.llm_model
    }
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!resp.ok) throw new Error(`API error: ${resp.status}`)
    const result = await resp.json()

    outputRange.setValue(result.text || 'No result')
  } catch (e: any) {
    outputRange.setValue(`#ERROR: ${e.message}`)
    console.error('LLM execution failed:', e)
  }
}

// ============================================
// LLM式パーサー
// =LLM([input1, input2, ...], prompt, output)
// 最低2引数必須: prompt, output
// ============================================
interface ParsedLLM {
  inputs: string[]         // 入力セル参照のリスト
  prompt: string           // プロンプト文字列（直値）
  promptRef: string | null // プロンプトがセル参照の場合
  output: string           // 出力先セル参照（必須）
}

function parseLLMFormula(formula: string): ParsedLLM | null {
  // =LLM(...) or =xLLM(...) の中身を取り出す
  const outer = formula.match(/^=x?LLM\(\s*(.*)\s*\)$/i)
  if (!outer) return null

  const inner = outer[1].trim()
  if (!inner) return null

  // 引数を分割（ダブルクォーテーション内のカンマは無視）
  const args = splitArgs(inner)

  // 最低2引数必須（prompt, output）
  if (args.length < 2) return null

  // 最後 = output、最後から2番目 = prompt、それ以外 = inputs
  const outputArg = args[args.length - 1].trim()
  const promptArg = parseArg(args[args.length - 2])
  const inputArgs = args.length >= 3 ? args.slice(0, -2).map(a => a.trim()) : []

  return {
    inputs: inputArgs,
    prompt: promptArg.isLiteral ? promptArg.value : '',
    promptRef: promptArg.isLiteral ? null : promptArg.value,
    output: outputArg,
  }
}

// ダブルクォーテーション内のカンマを無視して分割
function splitArgs(str: string): string[] {
  const args: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]
    if (ch === '"') {
      inQuotes = !inQuotes
      current += ch
    } else if (ch === ',' && !inQuotes) {
      args.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) {
    args.push(current.trim())
  }
  return args
}

// 引数が文字列リテラルかセル参照かを判定
function parseArg(arg: string): { value: string; isLiteral: boolean } {
  const trimmed = arg.trim()
  const literalMatch = trimmed.match(/^"([^"]*)"$/)
  if (literalMatch) {
    return { value: literalMatch[1], isLiteral: true }
  }
  return { value: trimmed, isLiteral: false }
}

// ============================================
// ノートブック保存・復元
// ============================================
async function saveNotebook(univerAPI: any, notebookName: string) {
  try {
    const snapshot = univerAPI.getActiveWorkbook().save()
    const resp = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: notebookName, snapshot }),
    })
    if (resp.ok) {
      console.log(`Saved: ${notebookName} ✅`)
    } else {
      console.error('Save failed:', resp.status)
    }
  } catch (e) {
    console.error('Save error:', e)
  }
}
