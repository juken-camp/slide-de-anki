#!/usr/bin/env python3
"""Non-destructive, repeatable history202 image quality fixes.

No external downloads, no AI images, no dialogue/UI edits.  Existing photos are
cropped only to remove non-content margins.  Retains the complete original
source URL and rights metadata.  Generates a machine-auditable 256-item report.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
BASE = ROOT.parent
MANIFEST = ROOT / 'real-materials.json'
INDEX = ROOT / 'local-images.json'
REPORT = ROOT / 'quality-review.json'

# Crop boxes are in pixels of the CURRENT repository WebP files.
# Each box was examined against the stored source image; the scale/ruler,
# color card or surrounding page margin is removed, never historical text.
CROPS = {
    'law-katanagari': (0, 112, 1280, 780),
    'period-1879-conscription-cartoon': (235, 25, 670, 760),
    'verified-haihan-context': (385, 55, 895, 795),
    'law-gakusei': (55, 32, 790, 1080),
}

EDITS = {
    'law-katanagari': {
        'caption': '豊臣秀吉の刀狩条書（1588年・実際の文書の一部）',
        'explanation': '1588年、豊臣秀吉は農民から刀や鉄砲などの武器を集めるよう命じました。農民と武士の役割を分ける「兵農分離」を進める政策です。これは1588年の本物の命令文書を写した画像の一部です。全文が一度に写っているわけではありません。',
        'type': '1588年の刀狩条書（原文書の一部）',
    },
    'period-1879-conscription-cartoon': {
        'caption': '1879年の『徴兵事務条例』の表紙（当時の資料）',
        'explanation': '1873年、明治政府は徴兵令を出して、武士だけでなく一般の国民からも兵士を集める制度を始めました。これはその6年後の1879年に出された『徴兵事務条例』の表紙です。1873年の徴兵令そのものの本文でも、人々の不満を描いた風刺画でもありません。',
        'type': '1879年刊行の徴兵事務条例（表紙）',
    },
    'verified-conscription-1879': {
        'caption': '1873年の徴兵に関する当時の記録（風刺画ではない）',
        'explanation': '1873年、明治政府は徴兵令を出し、国民から兵士を集める制度を始めました。これは当時の徴兵について記した印刷資料です。徴兵に反対する人を描いた風刺画ではなく、1879年の『徴兵事務条例』とも別の資料です。',
        'type': '1873年の徴兵に関する印刷記録',
    },
    'verified-haihan-context': {
        'caption': '廃藩置県を知らせる1871年の文書（旧藩知事の通達）',
        'explanation': '1871年、明治政府は藩をなくして府や県を置きました。各地の藩が別々に政治をする仕組みから、国が全国をまとめて治める仕組みへ変わったのです。これは政府の命令を受けて旧藩知事が人々に知らせた当時の文書で、政府が出した詔そのものではありません。',
    },
    'law-gakusei': {
        'caption': '1872年『学制』の表紙（当時の本物の資料）',
        'explanation': '1872年、明治政府は「学制」を出し、全国に学校を広める仕組みを整えました。これはその当時の『学制』という文書の表紙です。中の条文が写ったページではありません。',
    },
    'authentic-2026-continued-056': {
        'caption': '山城の国一揆で国人が1486年に集まった平等院（現在の写真）',
        'explanation': '1485年、山城の国人や農民たちは、戦っていた二つの軍を山城から退かせようと立ち上がりました。翌1486年には宇治の平等院で、国の決まりを話し合ったことが当時の日記『大乗院寺社雑事記』に残っています。この写真は現在の平等院です。一揆の会議を写したものではありません。',
    },
    'verified-konden-743': {
        'caption': '『令義解』という古い法律の解説書（墾田法の原文ではない）',
        'explanation': '723年の三世一身法では、新しく開いた田を自分のものにできる期間が限られていました。743年の墾田永年私財法では、決められた条件のもとで、その田をずっと私有できるようになりました。この画像の『令義解』は別の法律の解説書で、743年の法令の文章ではありません。',
        'educationalReviewStatus': 'needs_source_replacement',
    },
    'verified-konden-ch15': {
        'caption': '律令の解説書『令義解』（743年の墾田法とは別資料）',
        'explanation': '743年の墾田永年私財法では、新しく開いた田を、国の許可を受けてずっと自分のものにできるようになりました。これが後の荘園の広がりにつながります。この写真は『令義解』で、墾田永年私財法を記した『続日本紀』とは別の本です。',
        'educationalReviewStatus': 'needs_source_replacement',
    },
    'term-cover-ch12-04': {
        'caption': '1837年に来航したモリソン号を描いた絵（1825年の命令の関連資料）',
        'explanation': '1825年、江戸幕府は外国船を追い払うよう命じました。12年後の1837年には、日本人の漂流民を送り返そうとしたモリソン号が砲撃されました。この絵は船の姿を伝えるもので、砲撃の瞬間を描いた絵ではありません。1842年には幕府の対応が少しゆるめられました。',
    },
}

# An image related to a subject is not necessarily a picture of the event.
HIGH_PRIORITY = {
    'authentic-2026-continued-056': '1485年12月11日または1486年2月13日を記した大乗院寺社雑事記の該当頁の確認が必要',
    'verified-konden-743': '743年5月条を載せる続日本紀巻15の該当頁へ差し替えたい。令義解は法令の原文ではない',
    'verified-konden-ch15': '同じ令義解の画像を再利用。743年の条文が確認できる別の頁が必要',
    'period-1879-conscription-cartoon': '1879年の表紙は確認。1873年徴兵令そのものの条文画像がより望ましい',
}


def write_json(path: Path, value: object) -> None:
    data = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    if not path.exists() or path.read_bytes() != data:
        path.write_bytes(data)


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    local = json.loads(INDEX.read_text(encoding='utf-8'))
    items = manifest['items']
    ids = [x['id'] for x in items]
    assert len(ids) == len(set(ids)) == len(local) == 256
    assert set(ids) == set(local)
    corrections = 0
    cropped = []
    links = 0
    for item in items:
        item_id = item['id']
        before = {k: item.get(k) for k in EDITS.get(item_id, {})}
        if item_id in EDITS:
            item.update(EDITS[item_id])
            if any(item.get(k) != v for k, v in before.items()):
                corrections += 1
        source = item.get('sourceUrl', '')
        if item.get('attributionUrl') and item['attributionUrl'] != source:
            # A stale pre-replacement source link must never point to another image.
            if source.startswith('https://'):
                item['attributionUrl'] = source
                links += 1
        if item_id in CROPS and item.get('qualityCropVersion', 0) < 1:
            path = BASE / local[item_id]
            with Image.open(path) as im:
                im = im.convert('RGB')
                box = CROPS[item_id]
                assert im.size[0] >= box[2] and im.size[1] >= box[3], (item_id, im.size)
                cut = im.crop(box)
                bio = BytesIO()
                cut.save(bio, format='WEBP', quality=90, method=6)
            path.write_bytes(bio.getvalue())
            item['qualityCropVersion'] = 1
            item['imageProcessing'] = '原画像から周囲の定規・色見本・余白のみをトリミング（史料本文を保持）'
            cropped.append(item_id)
    # Technical checks cover the complete set; historical verification is separate.
    hashes = defaultdict(list)
    source_uses = defaultdict(list)
    for x in items:
        asset = BASE / local[x['id']]
        assert asset.is_file(), (x['id'], str(asset))
        with Image.open(asset) as im:
            im.verify()
        digest = sha256(asset.read_bytes()).hexdigest()
        hashes[digest].append(x['id'])
        source_uses[x['sourceUrl']].append(x['id'])

    audits = []
    for x in items:
        asset = BASE / local[x['id']]
        payload = asset.read_bytes()
        digest = sha256(payload).hexdigest()
        with Image.open(asset) as im:
            width, height = im.size
            mime = im.format
        flags = []
        if x['licenseStatus'] in ('permission_review_required', 'source_page_review_needed'):
            flags.append('source_reuse_terms_not_finally_verified')
        if len(hashes[digest]) > 1:
            flags.append('identical_image_reused')
        if len(source_uses[x['sourceUrl']]) > 1:
            flags.append('same_source_reused')
        if x.get('educationalReviewStatus') == 'needs_source_replacement':
            flags.append('related_but_not_direct_source')
        if x['id'] in HIGH_PRIORITY:
            flags.append('editorial_priority')
        if width < 400 or height < 250:
            flags.append('low_pixel_dimensions')
        audits.append({
            'id': x['id'], 'chapter': x['chapter'], 'caption': x['caption'],
            'sourceUrl': x['sourceUrl'], 'localFile': local[x['id']],
            'validWebp': mime == 'WEBP', 'width': width, 'height': height,
            'bytes': len(payload), 'sha256': digest,
            'reuseStatus': x['licenseStatus'],
            'historicalContentReview': 'not_individually_authenticated',
            'identicalImageIds': [i for i in hashes[digest] if i != x['id']],
            'flags': flags,
            'priorityNote': HIGH_PRIORITY.get(x['id'], ''),
        })
    report = {
        'schemaVersion': 1, 'baseManifestItems': 256, 'baseLocalImages': 256,
        'technicalValidation': {'filesOpened': 256, 'validWebp': sum(x['validWebp'] for x in audits),
            'fileMissing': 0, 'sha256DuplicatesExtraUses': sum(len(z) - 1 for z in hashes.values()),
            'sourceUrlExtraUses': sum(len(z) - 1 for z in source_uses.values()),
            'totalImageBytes': sum(x['bytes'] for x in audits)},
        'rightsReview': dict(Counter(x['reuseStatus'] for x in audits)),
        'historicalVisualContentAuthenticated': 0,
        'caution': 'ファイルの正常性・文言・出典設定は点検したが、全画像の史料内容・利用条件を証明したものではありません。historicalContentReview を独立して管理します。',
        'items': audits,
    }
    write_json(MANIFEST, manifest)
    write_json(REPORT, report)
    print(json.dumps({'captionsExplanationsOrStatusUpdated': corrections,
        'staleAttributionUrlsUpdated': links, 'imagesCropped': cropped,
        'filesOpened': 256,'unverifiedRights': report['rightsReview'].get('source_page_review_needed',0) + report['rightsReview'].get('permission_review_required',0)},ensure_ascii=False))


if __name__ == '__main__':
    main()
