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
MODEL_ENV_PATH = ROOT / "runtime" / "vllm-model.env"
PROFILE_DIR = ROOT / "runtime" / "model-profiles"
VLLM_PORT = int(os.environ.get("VLLM_PORT", "18000"))
VLLM_BASE_URL = f"http://127.0.0.1:{VLLM_PORT}"


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


def gpu_total_mb():
    output = run(["bash", "-lc", "nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -n 1"], timeout=10)["output"].strip()
    try:
        return int(float(output.splitlines()[0].strip()))
    except Exception:
        return 0


def model_size_hint(model):
    lower = model.lower()
    for size in (110, 72, 70, 65, 34, 32, 30, 22, 20, 14, 13, 12, 8, 7, 4, 3, 1):
        if f"{size}b" in lower or f"-{size}-" in lower:
            return size
    return 14


def model_safe_settings(model):
    lower = model.lower()
    size_b = model_size_hint(model)
    quantization = "awq_marlin" if "awq" in lower else ""
    quantized = bool(quantization or any(tag in lower for tag in ("gptq", "gguf", "bnb", "4bit", "int4", "fp8")))

    if size_b >= 70:
        settings = {"gpuMem": "0.62", "maxModelLen": 4096, "maxNumSeqs": 1, "maxBatchedTokens": 4096, "swapSpaceGb": 12}
    elif size_b >= 30:
        settings = {"gpuMem": "0.70", "maxModelLen": 8192, "maxNumSeqs": 1, "maxBatchedTokens": 8192, "swapSpaceGb": 8}
    elif size_b >= 13:
        settings = {"gpuMem": "0.50" if quantized else "0.62", "maxModelLen": 8192, "maxNumSeqs": 1, "maxBatchedTokens": 8192, "swapSpaceGb": 4}
    else:
        settings = {"gpuMem": "0.58", "maxModelLen": 8192, "maxNumSeqs": 1, "maxBatchedTokens": 8192, "swapSpaceGb": 4}

    settings["quantization"] = quantization
    settings["estimatedSizeB"] = size_b
    settings["policy"] = "blocked" if size_b >= 70 and not quantized else "allowed"
    settings["reason"] = (
        "Blocked on 24GB GPU unless the model is explicitly quantized."
        if settings["policy"] == "blocked"
        else "Safe preset selected for RTX 4090 24GB to reduce OOM risk."
    )
    return settings


def current_vllm_model():
    result = probe(f"{VLLM_BASE_URL}/v1/models")
    if result.get("code") != 0:
        return ""
    try:
        parsed = json.loads(result.get("output") or "{}")
        data = parsed.get("data") or []
        if data and isinstance(data[0], dict):
            return str(data[0].get("id") or "")
    except Exception:
        return ""
    return ""


def resolve_profile_value(value):
    raw = str(value or "").strip().strip('"').strip("'")
    if raw.startswith("${") and raw.endswith("}") and ":-" in raw:
        name, default = raw[2:-1].split(":-", 1)
        return os.environ.get(name, default)
    return os.path.expandvars(raw)


def shell_quote(value):
    return str(value or "").replace("'", "'\"'\"'")


def read_profile_file(path):
    profile = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        profile[key.strip()] = resolve_profile_value(value)
    profile.setdefault("PROFILE_NAME", path.stem)
    return profile


def profile_safe_settings(profile):
    model = profile.get("MODEL") or DEFAULT_MODEL
    settings = model_safe_settings(model)
    mapping = {
        "GPU_MEM": "gpuMem",
        "MAX_MODEL_LEN": "maxModelLen",
        "MAX_NUM_SEQS": "maxNumSeqs",
        "MAX_BATCHED_TOKENS": "maxBatchedTokens",
        "SWAP_SPACE_GB": "swapSpaceGb",
        "QUANTIZATION": "quantization",
    }
    for env_key, setting_key in mapping.items():
        if env_key in profile and str(profile[env_key]).strip():
            settings[setting_key] = profile[env_key]
    for numeric_key in ("maxModelLen", "maxNumSeqs", "maxBatchedTokens", "swapSpaceGb"):
        try:
            settings[numeric_key] = int(str(settings[numeric_key]))
        except Exception:
            pass
    settings["profileName"] = profile.get("PROFILE_NAME")
    settings["model"] = model
    settings["servedModelName"] = profile.get("SERVED_MODEL_NAME", "factory-active")
    settings["engine"] = profile.get("ENGINE", "vllm")
    settings["role"] = profile.get("ROLE", "coding")
    settings["enforceEager"] = profile.get("ENFORCE_EAGER", "true")
    if settings["engine"] != "vllm":
        settings["policy"] = "blocked"
        settings["reason"] = f"Profile engine is {settings['engine']}; configure provider routing before vLLM start."
    else:
        settings["policy"] = "allowed"
        settings["reason"] = "Curated FactoryGrid profile settings selected for RTX 4090 stability."
    return settings


def discover_profile_entries():
    entries = []
    if not PROFILE_DIR.exists():
        return entries
    for path in sorted(PROFILE_DIR.glob("*.env")):
        profile = read_profile_file(path)
        profile_name = profile.get("PROFILE_NAME") or path.stem
        model = profile.get("MODEL") or DEFAULT_MODEL
        entries.append({
            "id": profile_name,
            "profile": profile_name,
            "model": model,
            "path": str(path),
            "source": "model-profile",
            "safeSettings": profile_safe_settings(profile),
        })
    return entries


def resolve_model_selection(selection):
    selected = selection or DEFAULT_MODEL
    for entry in discover_profile_entries():
        if selected in {entry.get("id"), entry.get("profile"), entry.get("model")}:
            settings = entry["safeSettings"]
            return {
                "selection": selected,
                "profile": entry.get("profile"),
                "model": entry.get("model"),
                "settings": settings,
                "source": entry.get("source"),
                "path": entry.get("path"),
            }
    settings = model_safe_settings(selected)
    settings["profileName"] = ""
    settings["model"] = selected
    settings["servedModelName"] = "factory-active"
    settings["engine"] = "vllm"
    return {"selection": selected, "profile": "", "model": selected, "settings": settings, "source": "direct-model", "path": ""}


def requested_vllm_profile():
    if MODEL_ENV_PATH.exists():
        try:
            profile = read_profile_file(MODEL_ENV_PATH)
            profile_name = profile.get("PROFILE_NAME")
            if profile_name and profile_name != MODEL_ENV_PATH.stem:
                return profile_name
            for entry in discover_profile_entries():
                settings = entry.get("safeSettings", {})
                if (
                    entry.get("model") == profile.get("MODEL")
                    and str(settings.get("gpuMem")) == str(profile.get("GPU_MEM"))
                    and str(settings.get("maxModelLen")) == str(profile.get("MAX_MODEL_LEN"))
                    and str(settings.get("maxNumSeqs")) == str(profile.get("MAX_NUM_SEQS"))
                ):
                    return entry.get("id") or profile.get("MODEL") or DEFAULT_MODEL
            return profile.get("MODEL") or DEFAULT_MODEL
        except Exception:
            return DEFAULT_MODEL
    return DEFAULT_MODEL


def persist_model_selection(selection):
    resolved = resolve_model_selection(selection)
    selected = resolved["model"] or DEFAULT_MODEL
    settings = resolved["settings"]
    MODEL_ENV_PATH.parent.mkdir(parents=True, exist_ok=True)
    profile_name = resolved.get("profile") or resolved.get("selection") or selected
    lines = [
        f"PROFILE_NAME='{shell_quote(profile_name)}'",
        f"MODEL='{shell_quote(selected)}'",
        f"SERVED_MODEL_NAME='{shell_quote(settings.get('servedModelName', 'factory-active'))}'",
        f"GPU_MEM='{settings['gpuMem']}'",
        f"MAX_MODEL_LEN='{settings['maxModelLen']}'",
        f"MAX_NUM_SEQS='{settings['maxNumSeqs']}'",
        f"MAX_BATCHED_TOKENS='{settings['maxBatchedTokens']}'",
        f"SWAP_SPACE_GB='{settings['swapSpaceGb']}'",
        f"QUANTIZATION='{settings['quantization']}'",
        f"ENFORCE_EAGER='{str(settings.get('enforceEager', 'true')).lower()}'",
    ]
    MODEL_ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return resolved


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
    result = post_json(f"{VLLM_BASE_URL}/v1/chat/completions", payload, timeout=300)
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
    entries = discover_profile_entries()
    known = {entry["id"] for entry in entries} | {entry.get("model") for entry in entries}
    models = []
    if DEFAULT_MODEL not in known:
        models.append(DEFAULT_MODEL)
    env_models = os.environ.get("FACTORY_VLLM_MODELS", "")
    for item in env_models.split(","):
        item = item.strip()
        if item and item not in known and item not in models:
            models.append(item)

    hf = Path.home() / ".cache" / "huggingface" / "hub"
    if hf.exists():
        for path in sorted(hf.glob("models--*")):
            model = path.name.replace("models--", "").replace("--", "/")
            if model and model not in known and model not in models:
                models.append(model)

    entries.extend([
        {
            "id": item,
            "profile": "",
            "model": item,
            "path": "native WSL vLLM",
            "source": "host-control",
            "safeSettings": model_safe_settings(item),
        }
        for item in models
    ])
    return entries


def stop_vllm():
    return run(["bash", "-lc", "./bin/stop-vllm-factory.sh"], timeout=30)


def start_vllm(model):
    (ROOT / "logs").mkdir(parents=True, exist_ok=True)
    resolved = resolve_model_selection(model)
    selected = resolved["model"] or DEFAULT_MODEL
    settings = resolved["settings"]
    total_mb = gpu_total_mb()
    if settings["policy"] != "allowed":
        return {
            "command": "",
            "result": {"code": 2, "output": settings["reason"]},
            "pid": read_pid(),
            "alive": pid_alive(read_pid()),
            "blocked": True,
            "selection": resolved["selection"],
            "profile": resolved["profile"],
            "safeSettings": settings,
            "gpuTotalMb": total_mb,
        }
    persist_model_selection(resolved["selection"])
    env = {
        "MODEL": selected,
        "SERVED_MODEL_NAME": str(settings.get("servedModelName") or "factory-active"),
        "GPU_MEM": str(settings["gpuMem"]),
        "MAX_MODEL_LEN": str(settings["maxModelLen"]),
        "MAX_NUM_SEQS": str(settings["maxNumSeqs"]),
        "MAX_BATCHED_TOKENS": str(settings["maxBatchedTokens"]),
        "SWAP_SPACE_GB": str(settings["swapSpaceGb"]),
        "QUANTIZATION": str(settings["quantization"]),
        "PORT": str(VLLM_PORT),
    }
    result = run(["bash", "-lc", "./bin/restart-vllm-factory.sh"], timeout=20, env=env)
    time.sleep(1)
    return {
        "command": "PROFILE=%s MODEL=%s ./bin/restart-vllm-factory.sh" % (resolved.get("profile") or "", selected),
        "result": result,
        "pid": read_pid(),
        "alive": pid_alive(read_pid()),
        "selection": resolved["selection"],
        "profile": resolved["profile"],
        "modelEnv": str(MODEL_ENV_PATH),
        "safeSettings": settings,
        "gpuTotalMb": total_mb,
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
        "vllm": probe(f"{VLLM_BASE_URL}/v1/models"),
        "litellm_host": probe("http://127.0.0.1:4000/v1/models"),
        "litellm_published": probe("http://127.0.0.1:4001/v1/models"),
    }, indent=2)))
    warmup = warmup_vllm(DEFAULT_MODEL, write_report=False)
    sections.append(("## Inference Warm-up Probe", json.dumps(warmup, indent=2)))
    sections.append(("## GPU", run(["bash", "-lc", "nvidia-smi || true"], timeout=10)["output"]))
    sections.append(("## Listening Ports", run(["bash", "-lc", "ss -ltnp | grep -E ':(18000|8000|4000|4001)' || true"], timeout=10)["output"]))
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
            self._json(200, {"current": current_vllm_model(), "requested": requested_vllm_profile(), "models": discover_models()})
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
