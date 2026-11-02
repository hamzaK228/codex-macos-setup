#!/usr/bin/env python3
"""Search installed role metadata without loading the full catalog into model context."""
import argparse
from collections import Counter
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--query', default='', help='Case-insensitive words; all must occur in an entry')
    parser.add_argument('--category', default='')
    parser.add_argument('--limit', type=int, default=8)
    parser.add_argument('--categories', action='store_true')
    args = parser.parse_args()
    roles = json.loads((Path(__file__).resolve().parents[1] / 'references/catalog.json').read_text())
    if args.categories:
        counts = Counter(r['category'] for r in roles)
        labels = {r['category']: r['categoryLabel'] for r in roles}
        print(json.dumps([{'category': k, 'categoryLabel': labels[k], 'count': counts[k]} for k in sorted(counts)], ensure_ascii=False))
        return
    words = args.query.casefold().split()
    matches = []
    for role in roles:
        if args.category and role['category'] != args.category:
            continue
        haystack = ' '.join([role['id'], role['name'], role['description'], role['category'], *role.get('keywords', [])]).casefold()
        if not all(word in haystack for word in words):
            continue
        name = role['name'].casefold()
        # Russian inflections such as аналитика/аналитик share a useful six-letter stem.
        score = sum(3 if word in name or (len(word) >= 6 and any('а' <= c <= 'я' for c in word) and word[:6] in name) else 1 for word in words)
        matches.append((score, role))
    matches.sort(key=lambda item: (-item[0], item[1]['id']))
    print(json.dumps({'total': len(matches), 'matches': [dict(id=r['id'], name=r['name'], description=r['description'], category=r['category']) for _, r in matches[:max(0, args.limit)]]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
