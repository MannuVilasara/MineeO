"use client";

import { useEffect, useRef, useState } from "react";
import {
  Play,
  Square,
  Trash2,
  TerminalSquare,
  Settings,
  RefreshCw,
} from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

const API_URL = "http://localhost:3000/api/servers";
const WS_URL = "ws://localhost:3000/api/logs";

export default function Dashboard() {
  const [serverName, setServerName] = useState("my-mineeo-server");
  const [version, setVersion] = useState("1.21.11");
  const [status, setStatus] = useState<
    "Offline" | "Starting" | "Running" | "Stopping"
  >("Offline");

  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#0d1117",
        foreground: "#e5e7eb",
        cursor: "#3b82f6",
      },
      fontFamily: '"Fira Code", "Courier New", monospace',
      fontSize: 14,
      convertEol: true,
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    term.writeln(
      "\x1b[36m[MineeO Panel]\x1b[0m Welcome to your beautiful new terminal!\r\n",
    );
    xtermRef.current = term;

    const handleResize = () => fitAddon.fit();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      term.dispose();
      closeWebSocket();
    };
  }, []);

  const closeWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const connectWebSocket = () => {
    closeWebSocket();

    const ws = new WebSocket(`${WS_URL}/${serverName}`);
    wsRef.current = ws;

    ws.onmessage = async (event) => {
      if (xtermRef.current) {
        let text =
          typeof event.data === "string"
            ? event.data
            : (await event.data.text?.()) || event.data.toString();
        // xterm.js operates on \r\n, some standard console outputs only use \n
        text = text.replace(/(?<!\r)\n/g, "\r\n");
        xtermRef.current.write(text);
      }
    };

    ws.onclose = () => {
      if (xtermRef.current) {
        xtermRef.current.writeln(
          "\r\n\x1b[31m[WebSocket]\x1b[0m Disconnected.\r\n",
        );
      }
    };
  };

  const actionPost = async (action: "start" | "stop") => {
    try {
      if (action === "start") {
        setStatus("Starting");
        if (xtermRef.current) {
          xtermRef.current.clear();
          xtermRef.current.writeln(
            "\x1b[33m[MineeO]\x1b[0m Booting up the engines...\r\n",
          );
        }
        connectWebSocket();
      } else {
        setStatus("Stopping");
      }

      const payload =
        action === "start"
          ? { name: serverName, version }
          : { name: serverName };

      const res = await fetch(`${API_URL}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await res.text());

      if (action === "stop") {
        setStatus("Offline");
      } else {
        setStatus("Running");
      }
    } catch (err: any) {
      if (xtermRef.current) {
        xtermRef.current.writeln(`\x1b[31m[Error]\x1b[0m ${err.message}\r\n`);
      }
      setStatus("Offline");
    }
  };

  const deleteServer = async () => {
    try {
      const res = await fetch(`${API_URL}/delete`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: serverName }),
      });
      if (!res.ok) throw new Error(await res.text());
      if (xtermRef.current) {
        xtermRef.current.clear();
        xtermRef.current.writeln(
          `\x1b[32m[Success]\x1b[0m Server destroyed permanently.\r\n`,
        );
      }
      setStatus("Offline");
      closeWebSocket();
    } catch (err: any) {
      if (xtermRef.current) {
        xtermRef.current.writeln(`\x1b[31m[Error]\x1b[0m ${err.message}\r\n`);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-panel-bg)] font-sans selection:bg-panel-accent selection:text-white">
      {/* Navbar */}
      <nav className="bg-[#182133] border-b border-[var(--color-panel-border)] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-2 rounded-xl">
            <TerminalSquare size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow-md">
            Minee<span className="text-blue-400">O</span>
          </h1>
        </div>

        <div className="flex items-center space-x-4">
          {/* Current status pill */}
          <div
            className={`px-4 py-1.5 rounded-full flex items-center gap-2 font-medium text-sm
            ${status === "Offline" ? "bg-gray-800 text-gray-400" : ""}
            ${status === "Starting" ? "bg-yellow-500/20 text-yellow-400 animate-pulse" : ""}
            ${status === "Running" ? "bg-green-500/20 text-green-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]" : ""}
            ${status === "Stopping" ? "bg-red-500/20 text-red-400 animate-pulse" : ""}
           `}
          >
            <div
              className={`w-2 h-2 rounded-full ${status === "Running" ? "bg-green-500 shadow-[0_0_8px_#10b981]" : status === "Offline" ? "bg-gray-500" : "bg-current"}`}
            />
            {status}
          </div>
        </div>
      </nav>

      {/* Main Layout */}
      <main className="p-6 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column Controls */}
        <aside className="col-span-1 flex flex-col gap-6">
          <div className="bg-[#1f2937] rounded-2xl border border-[var(--color-panel-border)] p-5 shadow-lg relative overflow-hidden group">
            {/* Soft decorative background glow */}
            <div className="absolute top-0 right-0 p-12 bg-blue-500/5 rounded-full blur-3xl group-hover:bg-blue-500/10 transition duration-700"></div>

            <div className="flex items-center gap-2 mb-5">
              <Settings className="text-blue-400" size={20} />
              <h2 className="text-lg font-semibold text-white">
                Server Config
              </h2>
            </div>

            <div className="space-y-4 relative z-10">
              <div>
                <label className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-2 block">
                  Identifier
                </label>
                <input
                  type="text"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  className="w-full bg-[#111827] border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                  placeholder="e.g., survival-1"
                />
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-2 block">
                  Paper Version
                </label>
                <select
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="w-full bg-[#111827] border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition appearance-none"
                  style={{
                    backgroundImage:
                      'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%239CA3AF%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")',
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 1rem top 50%",
                    backgroundSize: "0.65rem auto",
                  }}
                >
                  <option value="1.21.11">1.21.11 (Recommended)</option>
                  <option value="LATEST">Latest</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-[#1f2937] rounded-2xl border border-[var(--color-panel-border)] p-5 shadow-lg">
            <h2 className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-4 block">
              Power Actions
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => actionPost("start")}
                disabled={status === "Running" || status === "Starting"}
                className="col-span-2 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-semibold transition shadow-[0_4px_14px_rgba(22,163,74,0.3)] hover:shadow-[0_6px_20px_rgba(22,163,74,0.4)]"
              >
                <Play size={18} fill="currentColor" /> Start Server
              </button>

              <button
                onClick={() => actionPost("stop")}
                disabled={status === "Offline" || status === "Stopping"}
                className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-medium transition"
              >
                <Square size={16} fill="currentColor" /> Stop
              </button>

              <button
                onClick={deleteServer}
                className="flex items-center justify-center gap-2 bg-gray-700 hover:bg-red-900/80 hover:text-red-300 text-gray-300 py-2.5 rounded-lg font-medium transition group"
              >
                <Trash2 size={16} className="group-hover:animate-bounce" />{" "}
                Destroy
              </button>
            </div>
          </div>
        </aside>

        {/* Right Column Terminal */}
        <section className="col-span-1 lg:col-span-3">
          <div className="bg-[#0d1117] rounded-2xl border border-gray-800 shadow-2xl overflow-hidden h-[calc(100vh-140px)] flex flex-col relative">
            <div className="bg-[#010409] border-b border-gray-800 px-4 py-3 flex items-center justify-between z-10 shadow-sm">
              <div className="flex items-center gap-2 text-gray-400">
                <TerminalSquare size={16} />
                <span className="text-sm font-mono tracking-tight">
                  root@mineeo-daemon:~
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    xtermRef.current?.clear();
                    connectWebSocket();
                  }}
                  className="text-gray-500 hover:text-blue-400 transition"
                  title="Reconnect Stream"
                >
                  <RefreshCw size={14} />
                </button>
                <div className="flex space-x-1.5 ml-3">
                  <div className="w-3 h-3 rounded-full bg-red-500/80 cursor-pointer hover:bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80 cursor-pointer hover:bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80 cursor-pointer hover:bg-green-500" />
                </div>
              </div>
            </div>

            {/* The actual terminal wrapper */}
            <div className="p-3 flex-1 w-full bg-transparent overflow-hidden">
              <div
                ref={terminalRef}
                className="h-full w-full custom-scrollbar"
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
