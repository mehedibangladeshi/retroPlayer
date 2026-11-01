import AlbumView from './views/AlbumView'
import CassettePlayer from './views/CassettePlayer'
import DebugPlayer from './views/DebugPlayer'
import PlaylistView from './views/PlaylistView'

export default function App() {
  if (location.hash === '#debug') return <DebugPlayer />
  if (location.hash === '#playlist') return <PlaylistView />
  if (location.hash === '#album') return <AlbumView />
  return <CassettePlayer />
}
