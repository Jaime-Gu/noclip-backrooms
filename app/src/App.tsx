import { Routes, Route } from 'react-router'
import Corporate from './pages/Corporate'
import Fall from './pages/Fall'
import Wander from './pages/Wander'
import Archive from './pages/Archive'
import Logbook from './pages/Logbook'
import { useAudioBootstrap } from './components/Chrome'

export default function App() {
  useAudioBootstrap()
  return (
    <Routes>
      <Route path="/" element={<Corporate />} />
      <Route path="/fall" element={<Fall />} />
      <Route path="/level" element={<Wander />} />
      <Route path="/archive" element={<Archive />} />
      <Route path="/logbook" element={<Logbook />} />
    </Routes>
  )
}
