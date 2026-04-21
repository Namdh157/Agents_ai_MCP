import { useEffect, useRef, useCallback } from 'react'
import { APP_CONSTANTS } from '../constants'

export function useWebSocket(onMessage) {
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    console.log('[WS] Connecting...')
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null
    }
    if (wsRef.current) {
      try {
        wsRef.current.onopen = null
        wsRef.current.onmessage = null
        wsRef.current.onclose = null
        wsRef.current.onerror = null
        wsRef.current.close()
      } catch {}
    }

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('[WS] Open')
      onMessageRef.current({ type: 'ws_open' })
    }
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        onMessageRef.current(msg)
      } catch {}
    }
    ws.onclose = (e) => {
      console.log('[WS] Close', e.code, e.reason)
      onMessageRef.current({ type: 'ws_close' })
      if (!reconnectTimer.current) {
        reconnectTimer.current = setTimeout(connect, APP_CONSTANTS.WS_RECONNECT_DELAY_MS)
      }
    }
    ws.onerror = (err) => {
      console.error('[WS] Error', err)
      ws.close()
    }
  }, [])

  const send = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  return send
}
