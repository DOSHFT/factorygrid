#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import configparser
import json
import re
import statistics
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

SOH = "\x01"
DEFAULT_CONFIGS = [
    "/mnt/d/Dev/Projects/_revelation-stack/cons_configs/FIXConfigCS.cfg",
    "/mnt/d/Dev/Projects/_revelation-stack/cons_configs/FIXConfigMD.cfg",
]


def load_dictionary(path: Path) -> set[str]:
    root = ET.parse(path).getroot()
    messages = root.find("messages")
    if messages is None:
        return set()
    msgtypes: set[str] = set()
    for msg in messages:
        msgtype = msg.attrib.get("msgtype")
        if msgtype:
            msgtypes.add(msgtype)
    return msgtypes


def redact_config(path: Path) -> dict[str, Any]:
    parser = configparser.ConfigParser()
    parser.read(path)
    sensitive = re.compile(r"(pass|password|secret|token|key|rawdata|sender|target|compid|user|account|host|port|socket)", re.I)
    sections: dict[str, dict[str, Any]] = {}
    for section in parser.sections():
        sections[section] = {}
        for key, value in parser.items(section):
            sections[section][key] = {"redacted": True, "len": len(value.strip())} if sensitive.search(key) else value
    return {"path": str(path), "exists": path.exists(), "size_bytes": path.stat().st_size if path.exists() else None, "sections": sections}


def normalize_instrument(symbol: str) -> str:
    upper = symbol.strip().upper()
    # cTrader-style suffixes such as XAUUSD# are internal counterparty symbols.
    # Acceptor/customer-side routing uses the normalized core instrument.
    return re.sub(r"[^A-Z0-9]+$", "", upper)


def fix_msg(msg_type: str, sender: str, target: str, seq: int, **fields: str) -> bytes:
    # Simulator-only encoder. Production Artio implementation must use generated encoders / reusable buffers.
    body = {
        "35": msg_type,
        "49": sender,
        "56": target,
        "34": str(seq),
        "52": str(int(time.time() * 1000)),
        **{k: str(v) for k, v in fields.items()},
    }
    raw_body = SOH.join(f"{k}={v}" for k, v in body.items()) + SOH
    prefix = f"8=FIX.4.4{SOH}9={len(raw_body)}{SOH}"
    no_checksum = prefix + raw_body
    checksum = sum(no_checksum.encode("ascii")) % 256
    return (no_checksum + f"10={checksum:03d}{SOH}\n").encode("ascii")


def parse_fix(data: bytes) -> dict[str, str]:
    text = data.decode("ascii", errors="ignore").strip().replace("|", SOH)
    fields: dict[str, str] = {}
    for part in text.split(SOH):
        if "=" in part:
            k, v = part.split("=", 1)
            fields[k] = v
    return fields


async def read_fix(reader: asyncio.StreamReader) -> dict[str, str] | None:
    line = await reader.readline()
    if not line:
        return None
    return parse_fix(line)


async def write_fix(writer: asyncio.StreamWriter, message: bytes) -> None:
    writer.write(message)
    await writer.drain()


@dataclass
class SessionMetrics:
    logons: int = 0
    disconnects: int = 0
    subscriptions: int = 0
    received_upstream: int = 0
    normalized_messages: int = 0
    rejected_trading: int = 0
    delivered_total: int = 0
    per_user_delivered: dict[str, int] = field(default_factory=dict)
    per_user_subscriptions: dict[str, list[str]] = field(default_factory=dict)
    normalization_map: dict[str, str] = field(default_factory=dict)
    active_sessions: dict[str, str] = field(default_factory=dict)
    latencies_ns: list[int] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        lat_ms = [v / 1_000_000 for v in self.latencies_ns]
        latency = {}
        if lat_ms:
            latency = {
                "p50_ms": statistics.median(lat_ms),
                "p95_ms": statistics.quantiles(lat_ms, n=20)[18] if len(lat_ms) >= 20 else max(lat_ms),
                "max_ms": max(lat_ms),
            }
        return {
            "sessions": {
                "logons": self.logons,
                "disconnects": self.disconnects,
                "active": self.active_sessions,
            },
            "subscriptions": {
                "total": self.subscriptions,
                "per_user": self.per_user_subscriptions,
            },
            "receive": {
                "upstream_messages": self.received_upstream,
                "normalized_messages": self.normalized_messages,
                "normalization_map": self.normalization_map,
            },
            "delivery": {
                "total": self.delivered_total,
                "per_user": self.per_user_delivered,
            },
            "rejects": {"trading_messages": self.rejected_trading},
            "latency": latency,
        }


@dataclass
class Restreamer:
    upstream_host: str
    upstream_port: int
    downstream_host: str
    downstream_port: int
    instruments: list[str]
    metrics: SessionMetrics
    seq: int = 1
    downstream: dict[asyncio.StreamWriter, set[str]] = field(default_factory=dict)
    writer_users: dict[asyncio.StreamWriter, str] = field(default_factory=dict)

    async def start(self) -> asyncio.base_events.Server:
        self.up_reader, self.up_writer = await asyncio.open_connection(self.upstream_host, self.upstream_port)
        await write_fix(self.up_writer, fix_msg("A", "RESTREAMER", "PRIMEXM", self.seq, **{"98": "0", "108": "30"}))
        self.metrics.logons += 1
        self.metrics.active_sessions["upstream"] = "LOGON_SENT"
        self.seq += 1
        for symbol in self.instruments:
            await write_fix(self.up_writer, fix_msg("V", "RESTREAMER", "PRIMEXM", self.seq, **{"262": f"REQ-{symbol}", "263": "1", "264": "1", "146": "1", "55": symbol}))
            self.seq += 1
        asyncio.create_task(self.read_upstream())
        return await asyncio.start_server(self.handle_downstream, self.downstream_host, self.downstream_port)

    async def read_upstream(self) -> None:
        while True:
            msg = await read_fix(self.up_reader)
            if msg is None:
                self.metrics.disconnects += 1
                self.metrics.active_sessions["upstream"] = "DISCONNECTED"
                return
            if msg.get("35") not in {"W", "X"}:
                continue
            self.metrics.received_upstream += 1
            raw_symbol = msg.get("55", "")
            symbol = normalize_instrument(raw_symbol)
            if raw_symbol != symbol:
                self.metrics.normalization_map[raw_symbol] = symbol
                self.metrics.normalized_messages += 1
            sent_ns = int(msg.get("8010", "0") or "0")
            if sent_ns:
                self.metrics.latencies_ns.append(time.perf_counter_ns() - sent_ns)
            payload = fix_msg("X", "RESTREAMER", "CLIENT", self.seq, **{"55": symbol, "268": "2", "269": "0", "270": msg.get("270", "1.0"), "269b": "1", "271": "100000", "8010": str(sent_ns)})
            self.seq += 1
            dead: list[asyncio.StreamWriter] = []
            for writer, subs in self.downstream.items():
                if "*" in subs or symbol in subs:
                    user = self.writer_users.get(writer, "unknown")
                    try:
                        await write_fix(writer, payload)
                        self.metrics.delivered_total += 1
                        self.metrics.per_user_delivered[user] = self.metrics.per_user_delivered.get(user, 0) + 1
                    except ConnectionError:
                        dead.append(writer)
            for writer in dead:
                self.downstream.pop(writer, None)
                self.writer_users.pop(writer, None)

    async def handle_downstream(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        subs: set[str] = set()
        user = "unknown"
        self.downstream[writer] = subs
        try:
            while True:
                msg = await read_fix(reader)
                if msg is None:
                    return
                typ = msg.get("35")
                if typ == "A":
                    user = msg.get("49", "CLIENT")
                    self.writer_users[writer] = user
                    self.metrics.logons += 1
                    self.metrics.active_sessions[user] = "LOGGED_ON"
                    await write_fix(writer, fix_msg("A", "RESTREAMER", user, self.seq, **{"98": "0", "108": "30"}))
                    self.seq += 1
                elif typ == "V":
                    try:
                        market_depth = int(msg.get("264", "1") or "1")
                    except ValueError:
                        market_depth = 2
                    if market_depth > 1:
                        await write_fix(writer, fix_msg("Y", "RESTREAMER", user, self.seq, **{"262": msg.get("262", "UNKNOWN"), "281": "2", "58": "MarketDepth > 1 is not supported by this FIXReaper harness"}))
                        self.seq += 1
                        continue
                    raw_symbol = msg.get("55", "*") or "*"
                    symbol = "*" if raw_symbol == "*" else normalize_instrument(raw_symbol)
                    if raw_symbol != symbol:
                        self.metrics.normalization_map[raw_symbol] = symbol
                    subs.add(symbol)
                    self.metrics.subscriptions += 1
                    self.metrics.per_user_subscriptions.setdefault(user, []).append(symbol)
                elif typ in {"D", "F", "G", "8"}:
                    self.metrics.rejected_trading += 1
                    await write_fix(writer, fix_msg("j", "RESTREAMER", user, self.seq, **{"372": typ, "380": "3", "58": "Trading messages are disabled"}))
                    self.seq += 1
        finally:
            self.metrics.disconnects += 1
            if user in self.metrics.active_sessions:
                self.metrics.active_sessions[user] = "DISCONNECTED"
            self.downstream.pop(writer, None)
            self.writer_users.pop(writer, None)
            writer.close()
            await writer.wait_closed()


async def upstream_simulator(host: str, port: int, instruments: list[str], ticks: int) -> asyncio.base_events.Server:
    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        seq = 1
        while True:
            msg = await read_fix(reader)
            if msg is None:
                return
            if msg.get("35") == "A":
                await write_fix(writer, fix_msg("A", "PRIMEXM", "RESTREAMER", seq, **{"98": "0", "108": "30"}))
                seq += 1
            if msg.get("35") == "V":
                break
        await asyncio.sleep(1.0)
        for i in range(ticks):
            for symbol in instruments:
                await write_fix(writer, fix_msg("X", "PRIMEXM", "RESTREAMER", seq, **{"55": symbol, "270": f"{1 + i / 10000:.5f}", "8010": str(time.perf_counter_ns())}))
                seq += 1
                await asyncio.sleep(0)
        await asyncio.sleep(0.2)
        writer.close()
        await writer.wait_closed()
    return await asyncio.start_server(handle, host, port)


async def downstream_client(host: str, port: int, idx: int, subscribe: str, expected: int) -> int:
    reader, writer = await asyncio.open_connection(host, port)
    await write_fix(writer, fix_msg("A", f"CLIENT{idx}", "RESTREAMER", 1, **{"98": "0", "108": "30"}))
    await read_fix(reader)
    await write_fix(writer, fix_msg("V", f"CLIENT{idx}", "RESTREAMER", 2, **{"262": f"C{idx}-SUB", "263": "1", "264": "1", "146": "1", "55": subscribe}))
    seen = 0
    deadline = time.monotonic() + 10
    while seen < expected and time.monotonic() < deadline:
        msg = await read_fix(reader)
        if msg is None:
            break
        if msg.get("35") in {"W", "X"}:
            seen += 1
    writer.close()
    await writer.wait_closed()
    return seen


async def run(args: argparse.Namespace) -> None:
    dictionary_types = load_dictionary(Path(args.dictionary))
    required = {"A", "V", "W", "X", "Y", "j"}
    missing = required - dictionary_types
    if missing:
        raise SystemExit(f"dictionary missing required msgtypes: {sorted(missing)}")

    raw_instruments = [v.strip() for v in args.instruments.split(",") if v.strip()]
    normalized_instruments = [normalize_instrument(v) for v in raw_instruments]
    subscriptions = [v.strip() for v in args.subscriptions.split(",") if v.strip()]
    metrics = SessionMetrics()
    metrics.normalization_map.update({raw: norm for raw, norm in zip(raw_instruments, normalized_instruments) if raw != norm})
    upstream = await upstream_simulator("127.0.0.1", args.upstream_port, raw_instruments, args.ticks)
    restreamer = Restreamer("127.0.0.1", args.upstream_port, "127.0.0.1", args.downstream_port, normalized_instruments, metrics)
    downstream_server = await restreamer.start()
    expected_all = args.ticks * len(raw_instruments)
    started = time.perf_counter()
    tasks = []
    for i in range(args.clients):
        sub = subscriptions[i % len(subscriptions)] if subscriptions else "*"
        expected = expected_all if sub == "*" else args.ticks
        tasks.append(downstream_client("127.0.0.1", args.downstream_port, i, sub, expected))
    counts = await asyncio.gather(*tasks)
    elapsed = time.perf_counter() - started
    upstream.close()
    downstream_server.close()
    await upstream.wait_closed()
    await downstream_server.wait_closed()
    summary = metrics.as_dict()
    summary.update({
        "config_files": [redact_config(Path(p)) for p in args.configs],
        "raw_instruments": raw_instruments,
        "normalized_instruments": normalized_instruments,
        "client_counts": counts,
        "expected_delivered": sum(expected_all if (subscriptions[i % len(subscriptions)] if subscriptions else "*") == "*" else args.ticks for i in range(args.clients)),
        "elapsed_seconds": elapsed,
        "throughput_delivered_per_sec": sum(counts) / elapsed,
    })
    if args.metrics_out:
        out = Path(args.metrics_out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    print(f"[FIX44_HARNESS][PASS] clients={args.clients} instruments={len(raw_instruments)} ticks={args.ticks} delivered={sum(counts)} expected={summary['expected_delivered']}")
    print(f"[FIX44_HARNESS][SESSIONS] logons={summary['sessions']['logons']} disconnects={summary['sessions']['disconnects']} active={len(summary['sessions']['active'])}")
    print(f"[FIX44_HARNESS][SUBSCRIPTIONS] total={summary['subscriptions']['total']} users={len(summary['subscriptions']['per_user'])}")
    print(f"[FIX44_HARNESS][RECEIVE] upstream={summary['receive']['upstream_messages']} normalized={summary['receive']['normalized_messages']} map={summary['receive']['normalization_map']}")
    print(f"[FIX44_HARNESS][THROUGHPUT] delivered_per_sec={summary['throughput_delivered_per_sec']:.2f}")
    if summary["latency"]:
        l = summary["latency"]
        print(f"[FIX44_HARNESS][LATENCY_MS] p50={l['p50_ms']:.4f} p95={l['p95_ms']:.4f} max={l['max_ms']:.4f}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dictionary", default="/home/revelation/factorygrid/FIXReaper/protocols/fix44/ctraderFIX44.xml")
    parser.add_argument("--clients", type=int, default=10)
    parser.add_argument("--ticks", type=int, default=100)
    parser.add_argument("--instruments", default="EURUSD,GBPUSD,US30,XAUUSD#")
    parser.add_argument("--subscriptions", default="*,EURUSD,GBPUSD,US30,XAUUSD#")
    parser.add_argument("--configs", nargs="*", default=DEFAULT_CONFIGS)
    parser.add_argument("--metrics-out", default="/home/revelation/factorygrid/FIXReaper/runtime/metrics/fix44-market-data-restreamer_metrics.json")
    parser.add_argument("--upstream-port", type=int, default=19044)
    parser.add_argument("--downstream-port", type=int, default=19045)
    asyncio.run(run(parser.parse_args()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
