#!/usr/bin/env python3
import json
import os
import signal
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(os.environ.get("FACTORYGRID_ROOT", "/home/revelation/factorygrid")).resolve()
HOST = os.environ.get("FACTORY_HOST_CONTROL_HOST", "0.0.0.0")
PORT = int(os.environ.get("FACTORY_HOST_CONTROL_PORT", "28601"))
TOKEN = os.environ.get("FACTORY_HOST_CONTROL_TOKEN", "factory-local-control")
DEFAULT_MODEL = os.environ.get("VLLM_MODEL", "Qwen/Qwen2.5-Coder-14B-Instruct-AWQ")
LOG_PATH = ROOT / "logs" / "vllm-factory.log"
PID_PATH = ROOT / "logs" / "vllm-factory.pid"


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def run(cmd, timeout=30, env=None):
    try:
      proc = subprocess.run(
          cmd,
          cwd=str(ROOT),
          env={**os.environ, **(env or {})},
          text=True,
          stdout=subprocess.PIPE,
          stderr=subprocess.STDOUT,
          timeout=timeout,
      )
      return {"code": proc.returncode, "output": proc.stdout[-12000:]}
    except Exception as exc:
      return {"code": 124, "output": str(exc)}


def read_pid():
    try:
        return int(PID_PATH.read_text().strip())
    except Exception:
        return None


def pid_alive(pid):
    if not pid:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def probe(url):
    return run(["bash", "-lc", f"curl -sS --max-time 3 {url}"], timeout=5)


def post_json(url, payload, timeout=300):
    started = time.time()
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                parsed = {"raw": raw}
            return {
                "ok": 200 <= response.status < 300,
                "status": response.status,
                "elapsedSeconds": round(time.time() - started, 3),
                "payload": parsed,
            }
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        return {
            "ok": False,
            "status": exc.code,
            "elapsedSeconds": round(time.time() - started, 3),
            "error": raw or str(exc),
        }
    except (URLError, TimeoutError, Exception) as exc:
        return {
            "ok": False,
            "status": 0,
            "elapsedSeconds": round(time.time() - started, 3),
            "error": str(exc),
        }


def gpu_snapshot():
    return {
        "summary": run(["bash", "-lc", "nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu --format=csv,noheader,nounits || true"], timeout=10)["output"].strip(),
        "computeApps": run(["bash", "-lc", "nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader,nounits 2>/dev/null || true"], timeout=10)["output"].strip(),
    }


def warmup_vllm(model=None, write_report=True, report_kind="vllm-warmup"):
    selected = model or DEFAULT_MODEL
    before = gpu_snapshot()
    payload = {
        "model": selected,
        "messages": [{"role": "user", "content": "Reply exactly WARM_OK"}],
        "temperature": 0,
        "max_tokens": 8,
    }
    result = post_json("http://127.0.0.1:8000/v1/chat/completions", payload, timeout=300)
    after = gpu_snapshot()
    text = ""
    try:
        text = result.get("payload", {}).get("choices", [{}])[0].get("message", {}).get("content", "").strip()
    except Exception:
        text = ""

    ok = bool(result.get("ok")) and bool(text)
    summary = (
        f"vLLM warm-up completion OK in {result.get('elapsedSeconds')}s; response={text!r}"
        if ok
        else f"vLLM warm-up failed after {result.get('elapsedSeconds')}s: {result.get('error') or result.get('payload')}"
    )
    report_path = ""
    if write_report:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        out_dir = ROOT / "workspace" / "reports" / report_kind
        out_dir.mkdir(parents=True, exist_ok=True)
        report = out_dir / f"{stamp}-{report_kind}.md"
        report.write_text(
            "\n".join([
                f"# {report_kind}",
                "",
                f"Generated: {now_iso()}",
                f"Model: `{selected}`",
                f"Summary: {summary}",
                "",
                "## GPU Before",
                "```json",
                json.dumps(before, indent=2),
                "```",
                "",
                "## Inference Probe",
                "```json",
                json.dumps(result, indent=2),
                "```",
                "",
                "## GPU After",
                "```json",
                json.dumps(after, indent=2),
                "```",
                "",
            ]),
            encoding="utf-8",
        )
        report_path = str(report)

    return {
        "ok": ok,
        "model": selected,
        "summary": summary,
        "path": report_path,
        "elapsedSeconds": result.get("elapsedSeconds"),
        "responseText": text,
        "gpuBefore": before,
        "gpuAfter": after,
        "probe": result,
    }


def discover_models():
    models = [DEFAULT_MODEL]
    env_models = os.environ.get("FACTORY_VLLM_MODELS", "")
    for item in env_models.split(","):
        item = item.strip()
        if item and item not in models:
            models.append(item)

    hf = Path.home() / ".cache" / "huggingface" / "hub"
    if hf.exists():
        for path in sorted(hf.glob("models--*")):
            model = path.name.replace("models--", "").replace("--", "/")
            if model and model not in models:
                models.append(model)

    return [{"id": item, "path": "native WSL vLLM", "source": "host-control"} for item in models]


def stop_vllm():
    return run(["bash", "-lc", "./bin/stop-vllm-factory.sh"], timeout=30)


def start_vllm(model):
    (ROOT / "logs").mkdir(parents=True, exist_ok=True)
    result = run(["bash", "-lc", "./bin/restart-vllm-factory.sh"], timeout=20, env={"MODEL": model or DEFAULT_MODEL})
    time.sleep(1)
    return {
        "command": "MODEL=%s ./bin/restart-vllm-factory.sh" % (model or DEFAULT_MODEL),
        "result": result,
        "pid": read_pid(),
        "alive": pid_alive(read_pid()),
    }


def build_rca():
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = ROOT / "workspace" / "reports" / "vllm-rca"
    out_dir.mkdir(parents=True, exist_ok=True)
    report = out_dir / f"{stamp}-vllm-rca.md"

    pid = read_pid()
    sections = []
    sections.append(("# vLLM RCA", f"Generated: {now_iso()}\nRoot: `{ROOT}`\nPID file: `{PID_PATH}`\nRecorded PID: `{pid}`\nPID alive: `{pid_alive(pid)}`"))
    sections.append(("## Endpoint Probes", json.dumps({
        "vllm": probe("http://127.0.0.1:8000/v1/models"),
        "litellm_host": probe("http://127.0.0.1:4000/v1/models"),
        "litellm_published": probe("http://127.0.0.1:4001/v1/models"),
    }, indent=2)))
    warmup = warmup_vllm(DEFAULT_MODEL, write_report=False)
    sections.append(("## Inference Warm-up Probe", json.dumps(warmup, indent=2)))
    sections.append(("## GPU", run(["bash", "-lc", "nvidia-smi || true"], timeout=10)["output"]))
    sections.append(("## Listening Ports", run(["bash", "-lc", "ss -ltnp | grep -E ':(8000|4000|4001)' || true"], timeout=10)["output"]))
    sections.append(("## vLLM Processes", run(["bash", "-lc", "ps -ef | grep -i '[v]llm' || true"], timeout=10)["output"]))
    sections.append(("## Recent vLLM Log", run(["bash", "-lc", "tail -240 logs/vllm-factory.log 2>/dev/null || true"], timeout=10)["output"]))
    sections.append(("## Recent LiteLLM Log", run(["bash", "-lc", "docker logs --tail 180 factory_litellm 2>&1 || true"], timeout=20)["output"]))
    sections.append(("## LiteLLM Config", run(["bash", "-lc", "sed -n '1,120p' litellm_config.yaml"], timeout=10)["output"]))
    sections.append(("## Kernel OOM / NVIDIA Messages", run(["bash", "-lc", "dmesg -T 2>/dev/null | grep -Ei 'oom|killed process|nvrm|cuda|gpu' | tail -120 || true"], timeout=10)["output"]))
    sections.append(("## Disk And Memory", run(["bash", "-lc", "df -h . /tmp; echo; free -h"], timeout=10)["output"]))

    body = []
    for title, content in sections:
        body.append(title)
        body.append("")
        body.append("```")
        body.append(str(content).strip())
        body.append("```")
        body.append("")
    report.write_text("\n".join(body), encoding="utf-8")

    if warmup.get("ok"):
        summary = warmup.get("summary", "vLLM warm-up completion OK")
    elif pid_alive(pid):
        summary = "vLLM process is alive, but inference warm-up failed"
    else:
        summary = "vLLM process is not alive or PID file is stale"
    return {"path": str(report), "summary": summary}


class Handler(BaseHTTPRequestHandler):
    def _json(self, status, payload):
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _authorized(self):
        return self.headers.get("X-Factory-Token") == TOKEN

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self._json(200, {"ok": True, "host": socket.gethostname(), "time": now_iso(), "pid": os.getpid()})
            return
        if not self._authorized():
            self._json(401, {"error": "unauthorized"})
            return
        if parsed.path == "/vllm/models":
            self._json(200, {"current": DEFAULT_MODEL if probe("http://127.0.0.1:8000/v1/models")["code"] == 0 else "", "requested": DEFAULT_MODEL, "models": discover_models()})
            return
        self._json(404, {"error": "not found"})

    def do_POST(self):
        if not self._authorized():
            self._json(401, {"error": "unauthorized"})
            return
        length = int(self.headers.get("Content-Length", "0") or "0")
        body = json.loads(self.rfile.read(length).decode("utf-8") or "{}") if length else {}
        parsed = urlparse(self.path)
        if parsed.path == "/vllm/start":
            model = str(body.get("model") or DEFAULT_MODEL)
            self._json(200, {"ok": True, "model": model, **start_vllm(model)})
            return
        if parsed.path == "/vllm/stop":
            self._json(200, {"ok": True, "result": stop_vllm()})
            return
        if parsed.path == "/vllm/restart":
            model = str(body.get("model") or DEFAULT_MODEL)
            self._json(200, {"ok": True, "model": model, **start_vllm(model)})
            return
        if parsed.path == "/vllm/warmup":
            model = str(body.get("model") or DEFAULT_MODEL)
            self._json(200, warmup_vllm(model))
            return
        if parsed.path == "/vllm/rca":
            self._json(200, {"ok": True, **build_rca()})
            return
        self._json(404, {"error": "not found"})

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (now_iso(), fmt % args))


if __name__ == "__main__":
    os.chdir(ROOT)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Factory host control listening on {HOST}:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
