import type { Album } from '@shared/protocol'
import { formatDuration, trackRowName } from './trackRowName'
import './TrackRows.css'

// The album's track rows (styles: TrackRows.css). Without onRowClick they are inert.
export default function TrackRows({ album, currentPath, selected = -1, pitch, rowFont, padLeft, onRowClick }: {
  album: Album
  currentPath?: string | null
  selected?: number
  pitch: number
  rowFont: number
  padLeft: number
  onRowClick?: (e: React.MouseEvent, i: number) => void
}) {
  return (
    <>
      {album.tracks.map((t, i) => {
        const name = trackRowName(t, i)
        const className = `pl-row${t.path === currentPath ? ' current' : ''}${i === selected ? ' selected' : ''}`
        const style = { height: pitch, lineHeight: `${pitch}px`, fontSize: rowFont, paddingLeft: padLeft }
        const body = (
          <>
            <span className="pl-name">
              <span className="pl-text">{name}</span>
            </span>
            <span className="pl-dur">{formatDuration(t.durationMs)}</span>
          </>
        )
        // Inert rows are plain divs: not focusable, no hover highlight (CSS .pl-row.inert).
        return onRowClick ? (
          <button
            key={t.path}
            type="button"
            title={name}
            className={className}
            style={style}
            onClick={onRowClick && ((e) => onRowClick(e, i))}
          >
            {body}
          </button>
        ) : (
          <div key={t.path} title={name} className={`${className} inert`} style={style}>
            {body}
          </div>
        )
      })}
    </>
  )
}
