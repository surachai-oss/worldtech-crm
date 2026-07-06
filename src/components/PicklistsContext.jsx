import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getAllPicklists } from '../lib/api'

const PicklistsCtx = createContext(null)

export function PicklistsProvider({ children }) {
  const [picklists, setPicklists] = useState({})

  const reload = useCallback(async () => {
    try { setPicklists(await getAllPicklists()) } catch { /* เก็บค่าเดิมไว้ถ้าโหลดไม่สำเร็จ */ }
  }, [])

  useEffect(() => { reload() }, [reload])

  // คืนค่าเฉพาะ value เรียงตามลำดับ ใช้กับ <option>
  const list = useCallback((key) => (picklists[key] || []).map(r => r.value), [picklists])

  return (
    <PicklistsCtx.Provider value={{ picklists, list, reload }}>
      {children}
    </PicklistsCtx.Provider>
  )
}

export function usePicklists() {
  return useContext(PicklistsCtx)
}
