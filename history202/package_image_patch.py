#!/usr/bin/env python3
"""Build upload-only ZIP containing newly downloaded historical-source files."""
import csv
import json
import pathlib
import subprocess
import zipfile

ROOT=pathlib.Path(__file__).resolve().parent
REPO=ROOT.parent
OUTPUT=REPO/'history202_images_patch.zip'

def git_names(*args):
    p=subprocess.run(['git',*args],cwd=REPO,check=True,stdout=subprocess.PIPE,encoding='utf-8')
    return [line for line in p.stdout.splitlines() if line]

tracked=set(git_names('diff','--name-only'))
untracked=set(git_names('ls-files','--others','--exclude-standard'))
files=sorted(name for name in tracked|untracked if name.startswith('history202/') and
    (name.startswith('history202/authentic_images/') or name in {
        'history202/local-images.json',
        'history202/image-download-report.json',
        'history202/image-audit-20261109.csv',
        'history202/image-audit-summary-20261109.json',
    }))
with zipfile.ZipFile(OUTPUT,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as zipf:
    for file in files:
        if (REPO/file).is_file():
            zipf.write(REPO/file,arcname=file)
print(f'{OUTPUT} contains {len(files)} modified/new files')
