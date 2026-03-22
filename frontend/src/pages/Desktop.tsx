// src/pages/Desktop.tsx
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ReactFlow,
  Background,
  type Node,
  type NodeTypes,
  useNodesState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import NotebookNode from '../components/NotebookNode'

const nodeTypes: NodeTypes = {
  notebook: NotebookNode,
}

const INVALID_CHARS = /[\/\\:*?"<>|]/

export default function Desktop() {
  const navigate = useNavigate()
  const [nodes, setNodes, onNodesChange] = useNodesState([])

  useEffect(() => {
    document.title = 'SUMIRE Notebook'
  }, [])

  // --- コンテキストメニュー状態 ---
  const [menu, setMenu] = useState<{
    x: number
    y: number
    type: 'desktop' | 'node'
    nodeName?: string
  } | null>(null)

  // --- ノートブック一覧の取得 ---
  const loadNotebooks = useCallback(async () => {
    try {
      const res = await fetch('/api/notebooks')
      const { notebooks } = await res.json()

      const newNodes: Node[] = notebooks.map((nb: any, i: number) => ({
        id: nb.name,
        type: 'notebook',
        position: { x: 50 + (i % 4) * 240, y: 50 + Math.floor(i / 4) * 120 },
        data: {
          name: nb.name,
          llmModel: nb.llm_model,
          updatedAt: nb.updated_at,
        },
      }))

      setNodes(newNodes)
    } catch (e) {
      console.error('Failed to load notebooks:', e)
    }
  }, [setNodes])

  useEffect(() => {
    loadNotebooks()
  }, [loadNotebooks])

  // --- ダブルクリックでノートブックを開く ---
  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (_event.ctrlKey || _event.metaKey) {
        window.open(`/notebook/${node.id}`, '_blank')
      } else {
        navigate(`/notebook/${node.id}`)
      }
    },
    [navigate]
  )

  // --- コンテキストメニュー ---
  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY, type: 'desktop' })
  }, [])

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault()
      setMenu({ x: event.clientX, y: event.clientY, type: 'node', nodeName: node.id })
    },
    []
  )

  const onPaneClick = useCallback(() => setMenu(null), [])

  // --- 新規ノートブック作成 ---
  const handleCreate = useCallback(async () => {
    setMenu(null)
    const name = prompt('ノートブック名を入力:')
    if (!name || !name.trim()) return

    const safeName = name.trim()
    if (INVALID_CHARS.test(safeName)) {
      alert('ノートブック名に使えない文字が含まれています')
      return
    }

    await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: safeName, snapshot: {} }),
    })

    await loadNotebooks()
  }, [loadNotebooks])

  // --- 名前変更 ---
  const handleRename = useCallback(
    async (oldName: string) => {
      setMenu(null)
      const newName = prompt('新しい名前:', oldName)
      if (!newName || !newName.trim() || newName.trim() === oldName) return

      const safeName = newName.trim()
      if (INVALID_CHARS.test(safeName)) {
        alert('ノートブック名に使えない文字が含まれています')
        return
      }

      await fetch('/api/notebooks/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_name: oldName, new_name: safeName }),
      })

      await loadNotebooks()
    },
    [loadNotebooks]
  )

  // --- LLMモデル設定 ---
  const handleSetModel = useCallback(
    async (name: string) => {
      setMenu(null)

      const node = nodes.find((n) => n.id === name)
      const currentModel = (node?.data as any)?.llmModel ?? 'gemma3:27b'

      const newModel = prompt('LLMモデル名:', currentModel)
      if (!newModel || !newModel.trim() || newModel.trim() === currentModel) return

      await fetch('/api/notebooks/update_meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, llm_model: newModel.trim() }),
      })

      await loadNotebooks()
    },
    [loadNotebooks, nodes]
  )

  // --- 削除 ---
  const handleDelete = useCallback(
    async (name: string) => {
      setMenu(null)
      if (!confirm(`「${name}」を削除しますか？この操作は取り消せません。`)) return

      await fetch(`/api/notebooks/${name}`, { method: 'DELETE' })

      await loadNotebooks()
    },
    [loadNotebooks]
  )

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
      </ReactFlow>

      {/* コンテキストメニュー */}
      {menu && (
        <div
          style={{
            position: 'fixed',
            left: menu.x,
            top: menu.y,
            background: '#fff',
            border: '1px solid #ccc',
            borderRadius: 6,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            padding: '4px 0',
            zIndex: 1000,
            minWidth: 160,
          }}
        >
          {menu.type === 'desktop' && (
            <MenuItem label="新規ノートブック" onClick={handleCreate} />
          )}
          {menu.type === 'node' && (
            <>
              <MenuItem label="名前変更" onClick={() => handleRename(menu.nodeName!)} />
              <MenuItem label="LLMモデル設定" onClick={() => handleSetModel(menu.nodeName!)} />
              <MenuDivider />
              <MenuItem label="削除" onClick={() => handleDelete(menu.nodeName!)} danger />
            </>
          )}
        </div>
      )}
    </div>
  )
}

// --- メニューヘルパー ---
function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '6px 16px',
        cursor: 'pointer',
        fontSize: 13,
        color: danger ? '#e55' : '#333',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </div>
  )
}

function MenuDivider() {
  return <div style={{ height: 1, background: '#eee', margin: '4px 0' }} />
}
