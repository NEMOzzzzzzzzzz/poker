import { useEffect, useRef, useState, useCallback } from "react";

export type WSMessage<T> = {
  type: "state_update" | "upgrade_success" | "upgrade_failed" | "pong";
  state?: T;
  error?: string;
};

export function useReliableWebSocket<T>(
  url: string,
  onMessage: (msg: WSMessage<T>) => void,
  options?: {
    heartbeatInterval?: number;
    reconnectMinDelay?: number;
    reconnectMaxDelay?: number;
  }
) {
  const {
    heartbeatInterval = 10000,
    reconnectMinDelay = 500,
    reconnectMaxDelay = 5000,
  } = options || {};

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimer = useRef<NodeJS.Timeout | null>(null);
  const backoffAttempt = useRef(0);
  const isConnecting = useRef(false);

  const [isConnected, setIsConnected] = useState(false);

  const clearAllTimers = () => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    reconnectTimer.current = null;
    heartbeatTimer.current = null;
  };

  const closeCurrentSocket = () => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
    }
    wsRef.current = null;
    isConnecting.current = false;
    setIsConnected(false);
  };

  const scheduleReconnect = useCallback(() => {
    clearAllTimers();
    const delay = Math.min(
      reconnectMaxDelay,
      reconnectMinDelay * 2 ** backoffAttempt.current
    );
    reconnectTimer.current = setTimeout(() => {
      backoffAttempt.current += 1;
      connect();
    }, delay);
    //eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconnectMinDelay, reconnectMaxDelay]);

  const connect = useCallback(() => {
    if (!url || !url.startsWith("ws")) {
      console.warn("[WS] Skipping connect – Invalid URL:", url);
      return;
    }

    if (wsRef.current || isConnecting.current) return;

    isConnecting.current = true;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WS] Connected:", url);
      isConnecting.current = false;
      setIsConnected(true);
      backoffAttempt.current = 0;

      clearAllTimers();

      heartbeatTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, heartbeatInterval);
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as WSMessage<T>;
        
        // Handle different message types
        if (parsed?.type === "state_update" || 
            parsed?.type === "upgrade_success" || 
            parsed?.type === "upgrade_failed" ||
            parsed?.type === "pong") {
          onMessage(parsed);
        }
      } catch (err) {
        console.error("[WS] JSON parse error:", err);
      }
    };

    ws.onerror = () => {
      console.warn("[WS] Socket error");
    };

    ws.onclose = () => {
      console.log("[WS] Disconnected:", url);
      closeCurrentSocket();
      scheduleReconnect();
    };
  }, [url, onMessage, heartbeatInterval, scheduleReconnect]);

  useEffect(() => {
    connect();

    return () => {
      clearAllTimers();
      closeCurrentSocket();
    };
  }, [url, connect]);

  // Expose method to send messages
  const sendMessage = useCallback((message: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);


  return { isConnected, sendMessage };
}