import CassettePlayer from './views/CassettePlayer'
import DebugPlayer from './views/DebugPlayer'

export default function App() {
  return location.hash === '#debug' ? <DebugPlayer /> : <CassettePlayer />
}
