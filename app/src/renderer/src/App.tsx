import AlbumView from './views/AlbumView'
import CassettePlayer from './views/CassettePlayer'
import DebugPlayer from './views/DebugPlayer'
import PlaylistView from './views/PlaylistView'
import RackView from './views/RackView'
import EditView from './views/EditView'
import PowerView from './views/PowerView'

export default function App() {
  if (location.hash === '#debug') return <DebugPlayer />
  if (location.hash === '#playlist') return <PlaylistView />
  if (location.hash === '#album') return <AlbumView />
  if (location.hash === '#rack') return <RackView />
  if (location.hash === '#power') return <PowerView />
  if (location.hash === '#edit') return <EditView />
  return <CassettePlayer />
}
