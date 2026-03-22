// src/App.tsx
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom'
import Desktop from './pages/Desktop'
import Sheet from './pages/Sheet'

function SheetWrapper() {
  const { name } = useParams<{ name: string }>()
  return <Sheet key={name} />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Desktop />} />
        <Route path="/notebook/:name" element={<SheetWrapper />} />
      </Routes>
    </BrowserRouter>
  )
}
