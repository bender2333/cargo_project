import { useState, useEffect } from 'react'
import { fetchWithAuth } from '../lib/auth'
import type { ContainerSpec } from '../types'

interface CustomContainerDialogProps {
  onClose: () => void
  onSelect: (container: ContainerSpec) => void
  currentSelectedId: string
}

interface CustomDbContainer {
  id: string
  name: string
  length: number
  width: number
  height: number
  max_weight: number
  door_gap: number
  top_gap: number
  side_gap: number
}

export function CustomContainerDialog({ onClose, onSelect, currentSelectedId }: CustomContainerDialogProps) {
  const [containers, setContainers] = useState<ContainerSpec[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Form states
  const [name, setName] = useState('')
  const [length, setLength] = useState<number | ''>(12000)
  const [width, setWidth] = useState<number | ''>(2350)
  const [height, setHeight] = useState<number | ''>(2600)
  const [maxWeight, setMaxWeight] = useState<number | ''>(26000)
  const [doorGap, setDoorGap] = useState<number | ''>(0)
  const [topGap, setTopGap] = useState<number | ''>(0)
  const [sideGap, setSideGap] = useState<number | ''>(0)

  const fetchCustomContainers = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetchWithAuth('/api/containers/custom')
      if (!res.ok) {
        throw new Error('获取自定义柜型失败')
      }
      const data: CustomDbContainer[] = await res.json()
      const mapped: ContainerSpec[] = data.map((item) => ({
        id: item.id,
        label: item.name,
        description: `自定义柜型: ${item.name} (${item.length}x${item.width}x${item.height}mm)`,
        length: item.length,
        width: item.width,
        height: item.height,
        maxWeight: item.max_weight,
        doorGap: item.door_gap,
        topGap: item.top_gap,
        sideGap: item.side_gap,
      }))
      setContainers(mapped)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCustomContainers()
  }, [])

  const resetForm = () => {
    setName('')
    setLength(12000)
    setWidth(2350)
    setHeight(2600)
    setMaxWeight(26000)
    setDoorGap(0)
    setTopGap(0)
    setSideGap(0)
    setIsEditing(false)
    setEditingId(null)
  }

  const handleStartAdd = () => {
    resetForm()
    setIsEditing(true)
  }

  const handleStartEdit = (container: ContainerSpec) => {
    setName(container.label)
    setLength(container.length)
    setWidth(container.width)
    setHeight(container.height)
    setMaxWeight(container.maxWeight)
    setDoorGap(container.doorGap)
    setTopGap(container.topGap)
    setSideGap(container.sideGap)
    setEditingId(container.id)
    setIsEditing(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      alert('请输入柜型名称')
      return
    }
    if (!length || !width || !height || !maxWeight) {
      alert('请完整填写必填数值')
      return
    }

    const payload = {
      name: name.trim(),
      length: Number(length),
      width: Number(width),
      height: Number(height),
      maxWeight: Number(maxWeight),
      doorGap: Number(doorGap || 0),
      topGap: Number(topGap || 0),
      sideGap: Number(sideGap || 0),
    }

    try {
      let res
      if (editingId) {
        res = await fetchWithAuth(`/api/containers/custom/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetchWithAuth('/api/containers/custom', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '保存失败')
      }

      resetForm()
      await fetchCustomContainers()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个自定义柜型吗？')) {
      return
    }
    try {
      const res = await fetchWithAuth(`/api/containers/custom/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        throw new Error('删除失败')
      }
      await fetchCustomContainers()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-purple-700 to-indigo-700 text-white flex items-center justify-between">
          <h3 className="text-lg font-bold">自定义柜型管理</h3>
          <button
            onClick={onClose}
            className="text-white hover:text-slate-200 focus:outline-none text-2xl"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-6">
          {/* Left panel: List */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-slate-700">自定义柜型列表</span>
              {!isEditing && (
                <button
                  onClick={handleStartAdd}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg shadow transition"
                >
                  + 新增柜型
                </button>
              )}
            </div>

            {loading ? (
              <div className="flex-1 flex items-center justify-center min-h-[300px]">
                <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : error ? (
              <div className="p-4 bg-red-50 text-red-700 border border-red-150 rounded-lg text-sm mb-4">
                {error}
              </div>
            ) : containers.length === 0 ? (
              <div className="flex-1 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center p-8 text-center text-slate-500 min-h-[300px]">
                <span className="text-3xl mb-2">📦</span>
                <span className="text-sm">暂无自定义柜型，点击右上角按钮添加。</span>
              </div>
            ) : (
              <div className="flex-1 space-y-3 overflow-y-auto max-h-[450px] pr-2">
                {containers.map((container) => (
                  <div
                    key={container.id}
                    className={`p-4 rounded-xl border transition-all duration-200 ${
                      currentSelectedId === container.id
                        ? 'border-purple-600 bg-purple-50/50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-350 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 truncate">{container.label}</span>
                          {currentSelectedId === container.id && (
                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 text-[10px] font-bold rounded">
                              当前选用
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
                          <div>
                            长宽高: {container.length} x {container.width} x {container.height} mm
                          </div>
                          <div>载重: {container.maxWeight} kg</div>
                          {Boolean(container.doorGap || container.topGap || container.sideGap) && (
                            <div className="col-span-2 text-purple-600/80">
                              预留: 门 {container.doorGap} | 顶 {container.topGap} | 侧 {container.sideGap} mm
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => onSelect(container)}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded transition"
                        >
                          选用
                        </button>
                        <button
                          onClick={() => handleStartEdit(container)}
                          className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded transition"
                          title="编辑"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(container.id)}
                          className="p-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded transition"
                          title="删除"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right panel: Edit Form */}
          {isEditing && (
            <form
              onSubmit={handleSubmit}
              className="w-full md:w-80 bg-slate-50 rounded-xl p-5 border border-slate-200 flex flex-col space-y-4 shadow-inner"
            >
              <h4 className="font-bold text-slate-800 text-sm border-b border-slate-250 pb-2">
                {editingId ? '编辑柜型参数' : '添加新柜型'}
              </h4>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">柜型名称 *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-purple-500 focus:border-purple-500 bg-white"
                  placeholder="例如: 特制小货柜"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">长 mm *</label>
                  <input
                    type="number"
                    required
                    value={length}
                    onChange={(e) => setLength(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-purple-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">宽 mm *</label>
                  <input
                    type="number"
                    required
                    value={width}
                    onChange={(e) => setWidth(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-purple-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">高 mm *</label>
                  <input
                    type="number"
                    required
                    value={height}
                    onChange={(e) => setHeight(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full text-sm border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-purple-500 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">最大载重 kg *</label>
                <input
                  type="number"
                  required
                  value={maxWeight}
                  onChange={(e) => setMaxWeight(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-purple-500 bg-white"
                />
              </div>

              <div className="border-t border-slate-200 pt-3">
                <span className="block text-xs font-bold text-purple-700 mb-2">预留装载空隙 (mm)</span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">门口预留</label>
                    <input
                      type="number"
                      value={doorGap}
                      onChange={(e) => setDoorGap(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full text-sm border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-purple-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">顶部余量</label>
                    <input
                      type="number"
                      value={topGap}
                      onChange={(e) => setTopGap(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full text-sm border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-purple-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">侧向预留</label>
                    <input
                      type="number"
                      value={sideGap}
                      onChange={(e) => setSideGap(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full text-sm border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-purple-500 bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3 py-2 border border-slate-350 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition bg-white"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold shadow transition"
                >
                  保存
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
