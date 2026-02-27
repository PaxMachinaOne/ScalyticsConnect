#!/usr/bin/env python3
import json
import glob
import sys
from collections import Counter

class C:
    RED = '\033[91m'
    YEL = '\033[93m'
    CYA = '\033[96m'
    GRN = '\033[92m'
    RST = '\033[0m'
    BLD = '\033[1m'
    DIM = '\033[2m'

def summarize():
    sarifs = sorted(glob.glob(".tmp/codeql/*.sarif"))
    if not sarifs:
        print(f"{C.YEL}No SARIF files found under .tmp/codeql/. Did local CodeQL run successfully?{C.RST}")
        return

    total_errors = 0
    total_warnings = 0
    all_findings = []
    rule_counter = Counter()
    file_counter = Counter()

    print(f"\n{C.BLD}=== Local CodeQL Findings Summary ==={C.RST}")

    for path in sarifs:
        filename = path.split('/')[-1]
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        file_errors = 0
        file_warnings = 0

        for run in data.get("runs", []):
            for result in (run.get("results") or []):
                level = (result.get("level") or "warning").lower()
                rule = result.get("ruleId")
                msg = result.get("message", {}).get("text")
                loc = result.get("locations", [{}])[0].get("physicalLocation", {}).get("artifactLocation", {}).get("uri")
                line = result.get("locations", [{}])[0].get("physicalLocation", {}).get("region", {}).get("startLine")

                # Skip findings in node_modules and .tmp directories
                if loc and ("node_modules" in loc or loc.startswith(".tmp")):
                    continue

                all_findings.append(f"[{level.upper()}] {rule} at {loc}:{line} - {msg[:100]}")
                rule_counter[rule] += 1
                if loc:
                    file_counter[loc] += 1

                if level == "error":
                    file_errors += 1
                else:
                    file_warnings += 1

        if file_errors > 0 or file_warnings > 0:
            print(f"📄 {C.CYA}{filename}{C.RST}: {C.RED}{file_errors} Errors{C.RST}, {C.YEL}{file_warnings} Warnings{C.RST}")

        total_errors += file_errors
        total_warnings += file_warnings

    if total_errors > 0 or total_warnings > 0:
        # --- By rule (most repeated first) ---
        print(f"\n{C.BLD}Findings by Rule (most repeated first):{C.RST}")
        for rule, count in rule_counter.most_common():
            print(f"  {C.YEL}{count:>4}x{C.RST}  {rule}")

        # --- By file (most findings first) ---
        print(f"\n{C.BLD}Findings by File (most findings first):{C.RST}")
        for filepath, count in file_counter.most_common(30):
            print(f"  {C.YEL}{count:>4}x{C.RST}  {filepath}")

        # --- Top 50 individual findings ---
        print(f"\n{C.BLD}Top 50 Findings:{C.RST}")
        for finding in all_findings[:50]:
            print(f"  {finding}")

        print(f"\n{C.RED}❌ CodeQL gate failed: {total_errors + total_warnings} finding(s) found.{C.RST}")
        sys.exit(1)

    print(f"\n{C.GRN}✅ CodeQL passed: no findings found.{C.RST}")

if __name__ == "__main__":
    summarize()
