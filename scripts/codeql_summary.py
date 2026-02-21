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
    
    print(f"
{C.BLD}=== Local CodeQL Findings Summary ==={C.RST}")

    for path in sarifs:
        filename = path.split('/')[-1]
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        file_errors = 0
        file_warnings = 0
        
        for run in data.get("runs", []):
            for result in (run.get("results") or []):
                level = (result.get("level") or "warning").lower()
                if level == "error":
                    file_errors += 1
                else:
                    file_warnings += 1
        
        if file_errors > 0 or file_warnings > 0:
            print(f"📄 {C.CYA}{filename}{C.RST}: {C.RED}{file_errors} Errors{C.RST}, {C.YEL}{file_warnings} Warnings{C.RST}")
        
        total_errors += file_errors
        total_warnings += file_warnings

    if total_errors > 0:
        print(f"
{C.RED}❌ CodeQL gate failed: {total_errors} blocking error(s) found.{C.RST}")
        sys.exit(1)
    
    if total_warnings > 0:
         print(f"
{C.YEL}⚠️ CodeQL passed with {total_warnings} warnings (non-blocking).{C.RST}")
    else:
         print(f"
{C.GRN}✅ CodeQL passed: no findings found.{C.RST}")

if __name__ == "__main__":
    summarize()
