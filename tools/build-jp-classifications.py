#!/usr/bin/env python3
"""Restore source-backed JP collection names and groups without inferring release versions.
Usage: python tools/build-jp-classifications.py /path/to/maimai-asset-browser
Input must be the snapshot pinned in data/regions/jp.json. Images are untouched.
"""
import collections
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1])
path = root / 'data/regions/jp.json'
catalog = json.loads(path.read_text())
manifest = json.loads((source / 'manifest.json').read_text())
genres = json.loads((source / 'chara_genre_map.json').read_text())
manifest_index = {(x['category'], x['id']): x for x in manifest['assets']}
xml_names = {}
for category, xml in [('frame', 'Frame'), ('plate', 'Plate'), ('icon', 'Icon'), ('chara', 'Chara')]:
    xml_names[category] = {x.findtext('id').zfill(6): x.findtext('str') for x in ET.parse(source / f'xml/{xml}Sort.xml').findall('.//StringID')}
by_genre_name = collections.defaultdict(list)
for genre in genres['genres']:
    by_genre_name[genre['genre_name']].append(genre)
# Exact character-name joins are useful for icon art, but only if the group is unique.
by_chara_name = collections.defaultdict(dict)
for chara_id, genre in genres['chara_map'].items():
    name = xml_names['chara'].get(chara_id)
    if name:
        by_chara_name[name][genre['genre_id']] = genre
labels = {'frame': '相框', 'plate': '姓名框', 'icon': '头像', 'chara': '旅行伙伴'}
stats = {}
for category, key in [('frame', 'frames'), ('plate', 'plates'), ('icon', 'icons'), ('chara', 'charas')]:
    for item in catalog[key]:
        for field in ['group', 'genreId', 'genreName', 'isCollabo', 'classification', 'type']:
            item.pop(field, None)
        item['type'] = category
        original = manifest_index.get((category, item['id']))
        name = xml_names[category].get(item['id'])
        if name:
            item['name'] = name
        name = item['name']
        genre = genres['chara_map'].get(item['id']) if category == 'chara' else None
        basis = 'chara_genre_map.json' if genre else None
        if not genre and len(by_genre_name.get(name, [])) == 1:
            genre = by_genre_name[name][0]
            basis = 'exact-genre-name-match'
        if not genre and category == 'icon' and len(by_chara_name.get(name, {})) == 1:
            genre = next(iter(by_chara_name[name].values()))
            basis = 'exact-character-name-match'
        if genre:
            item.update(genreId=genre['genre_id'], genreName=genre['genre_name'], isCollabo=genre['is_collabo'])
            item['group'] = ('联动地区 · ' if genre['is_collabo'] else '原创地区 · ') + genre['genre_name']
        elif name in ['DEFAULT', 'USER ICON', 'デフォルト']:
            item['group'] = labels[category] + ' · 默认'
            basis = 'source-name-type'
        elif 'ちほー' in name:
            item['group'] = labels[category] + ' · 地区奖励'
            basis = 'source-name-type'
        elif any(token in name for token in ['段', '皆伝', 'Jewel', 'スコアアタック', 'RANK', 'RATING', '舞舞', '覇者']):
            item['group'] = labels[category] + ' · 段位与实绩'
            basis = 'source-name-type'
        elif name.startswith('【') and '】' in name:
            item['group'] = labels[category] + ' · ' + name.split('】')[0][1:]
            basis = 'source-name-prefix'
        elif name.startswith('Thank you for playing'):
            item['group'] = labels[category] + ' · 版本纪念'
            basis = 'source-name-type'
        else:
            item['group'] = labels[category] + (' · 其他已命名素材' if item['id'] in xml_names[category] else ' · 来源未分类')
            basis = 'source-name-only' if item['id'] in xml_names[category] else 'unmatched-source-image'
        item['classification'] = {'basis': basis, 'source': 'maimai-asset-browser', 'version': None}
        if original and 'genreName' in original and category == 'chara':
            assert item['genreName'] == original['genreName']
    stats[key] = dict(collections.Counter(x['classification']['basis'] for x in catalog[key]))
for song in catalog['songs']:
    song['group'] = song.get('category') or '曲目 · 来源未分类'
catalog['classification'] = {
    'source': 'maimai-asset-browser',
    'manifestGeneratedAt': manifest['generated'],
    'note': '旅行伙伴采用来源 genreId/genreName/isCollabo。其他类型优先匹配完全相同的地区名或唯一角色名，其余仅按来源名称分类；名称匹配不代表游戏内官方分类。来源没有素材发行版本字段，版本保留未知，不按编号猜测。',
    'counts': stats,
}
path.write_text(json.dumps(catalog, ensure_ascii=False, separators=(',', ':')) + '\n')
print(json.dumps(stats, ensure_ascii=False, indent=2))
