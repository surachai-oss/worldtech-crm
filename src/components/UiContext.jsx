import { createContext, useCallback, useContext, useRef, useState } from 'react'

const UiCtx = createContext(null)

export function UiProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [confirmState, setConfirmState] = useState(null)
  const resolveRef = useRef(null)

  const toast = useCallback((msg, type = 'info') => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500)
  }, [])

  const confirm = useCallback((msg) => {
    setConfirmState(msg)
    return new Promise(resolve => { resolveRef.current = resolve })
  }, [])

  const resolveConfirm = (val) => {
    setConfirmState(null)
    if (resolveRef.current) { resolveRef.current(val); resolveRef.current = null }
  }

  return (
    <UiCtx.Provider value={{ toast, confirm }}>
      {children}
      <div id="toast">
        {toasts.map(t => (
          <div key={t.id} className={`toast-msg ${t.type}`}>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
      {confirmState && (
        <div id="confirm-overlay">
          <div className="confirm-box">
            <div className="confirm-msg">{confirmState}</div>
            <div className="confirm-btns">
              <button className="btn btn-outline" onClick={() => resolveConfirm(false)}>ยกเลิก</button>
              <button className="btn btn-danger" onClick={() => resolveConfirm(true)}>ยืนยัน</button>
            </div>
          </div>
        </div>
      )}
    </UiCtx.Provider>
  )
}

export function useUi() {
  return useContext(UiCtx)
}
