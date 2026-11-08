#!/usr/bin/env python3
"""Patch the user's own current himiko.html without replacing it with an older copy."""
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parent
if len(sys.argv)!=2:
  raise SystemExit('使い方: python3 install_history202.py <GitHubからダウンロードした最新版himiko.htmlのパス>')
p=Path(sys.argv[1])
if not p.exists():raise SystemExit('指定したhimiko.htmlが見つかりません')
s=p.read_text(encoding='utf-8-sig')
if '<html' not in s or 'id="list-view"' not in s or 'sengoku-panel' not in s:raise SystemExit('最新のhimiko.htmlとは構造が違います。変更せず終了しました。')
needle='<script src="history202/launcher.js?v=20261108-1" defer></script>'
if needle in s:print('すでに導入済みです。');raise SystemExit(0)
if '</body>' not in s:raise SystemExit('bodyタグが見つからないため変更しません')
s=s.replace('</body>',needle+'\n</body>',1)
backup=p.with_suffix('.html.history202-backup')
if not backup.exists():backup.write_text(p.read_text(encoding='utf-8-sig'),encoding='utf-8')
p.write_text(s,encoding='utf-8')
print('追加しました:',p)
print('バックアップ:',backup)
