import { useEffect, useState } from 'react'
import { SUPPORTED_EXTENSIONS } from '@shared/protocol'
import { loadAlbum, loadAndPlay } from '../engine/commands'
import { setError } from '../engine/store'

const hasFiles = (e: DragEvent): boolean => e.dataTransfer?.types.includes('Files') ?? false

/** Window-level drag-and-drop; returns whether a file is being dragged over. */
export function useFileDrop(): boolean {
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    let depth = 0
    const enter = (e: DragEvent): void => {
      e.preventDefault()
      if (hasFiles(e)) {
        depth++
        setDragging(true)
      }
    }
    const over = (e: DragEvent): void => e.preventDefault()
    const leave = (e: DragEvent): void => {
      e.preventDefault()
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const drop = (e: DragEvent): void => {
      e.preventDefault()
      depth = 0
      setDragging(false)
      const file = e.dataTransfer?.files[0]
      if (!file) return
      // Check the entry before reading the file: a folder has no usable extension.
      if (e.dataTransfer?.items[0]?.webkitGetAsEntry()?.isDirectory) {
        const dir = window.retro.pathForFile(file)
        if (dir) loadAlbum(dir)
        else setError('internal', "Couldn't read the dropped folder's location.")
        return
      }
      const dot = file.name.lastIndexOf('.')
      const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : ''
      if (!ext) {
        setError('unsupported_format', "This file type isn't supported.")
        return
      }
      if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
        setError('unsupported_format', `".${ext}" files are not supported. Try ${SUPPORTED_EXTENSIONS.join(', ')}.`)
        return
      }
      const path = window.retro.pathForFile(file)
      if (!path) {
        setError('internal', "Couldn't read the dropped file's location.")
        return
      }
      loadAndPlay(path)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [])

  return dragging
}
