"""Strict CSV → JSONL adapter. Gold sentence boundaries are never silently resegmented."""
import argparse, ast, csv, hashlib, json, pathlib, sys
csv.field_size_limit(sys.maxsize)

def parse_list(value):
    try: result = json.loads(value)
    except json.JSONDecodeError: result = ast.literal_eval(value)
    if not isinstance(result, list): raise ValueError('Expected an annotation list')
    return result

def utf16(text): return len(text.encode('utf-16-le')) // 2
def checksum(text): return hashlib.sha256(text.encode()).hexdigest()

def convert(rows, provenance):
    seeds, result = {}, []
    for r in rows:
        if r['version'] == 'v0':
            key = f"{r['domain']}:{r['id']}"
            h = checksum(' '.join(r['text'].lower().split()))
            if key in seeds and seeds[key] != h: raise ValueError('Inconsistent human seed')
            seeds[key] = h
    for r in rows:
        if r['subset'] != 'main': raise ValueError('Ablations require a separate adapter')
        key = f"{r['domain']}:{r['id']}"
        if key not in seeds: raise ValueError('Missing v0 for source')
        if r['split'] not in ('train', 'dev', 'test'): raise ValueError('Unknown split')
        if r['generator'] == 'qwen3-8b' and r['split'] != 'test': raise ValueError('Held-out generator outside test')
        sentences, labels = parse_list(r['sentences']), parse_list(r['sentence_labels'])
        if len(sentences) != len(labels) or not sentences: raise ValueError('Sentence/label mismatch')
        cursor = 0
        for i, (sentence, label) in enumerate(zip(sentences, labels)):
            if type(label) is not int or label not in (0, 1): raise ValueError('Non-binary gold label')
            if r['version'] == 'v0' and label != 0: raise ValueError('Positive human seed label')
            start = r['text'].find(sentence, cursor)
            if start < 0 or r['text'][cursor:start].strip(): raise ValueError('Gold sentence fails exact source alignment')
            end = start + len(sentence)
            result.append({'id': f"{r['record_id']}:s{i}", 'recordId': r['record_id'], 'sourceId': key,
                'sourceHash': seeds[key], 'officialSplit': r['split'], 'domain': r['domain'],
                'generator': r['generator'], 'version': r['version'], 'operation': r['edit_operation'],
                'text': sentence, 'start': utf16(r['text'][:start]), 'end': utf16(r['text'][:end]),
                'preceding': r['text'][:start], 'gapBefore': r['text'][cursor:start], 'trailing': r['text'][end:] if i == len(sentences) - 1 else '', 'label': label,
                'provenance': provenance, 'synthetic': False,
                'lengthBand': 'short' if len(sentence.split()) < 8 else 'medium' if len(sentence.split()) < 30 else 'long'})
            cursor = end
        if r['text'][cursor:].strip(): raise ValueError('Gold sentence coverage is incomplete')
    return result

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--input', required=True, nargs='+')
    p.add_argument('--out', default='data/imported/opai.jsonl')
    args = p.parse_args()
    output, errors, manifests = [], [], []
    for filename in args.input:
        path = pathlib.Path(filename)
        meta = json.loads(path.with_suffix('.provenance.json').read_text())
        if hashlib.sha256(path.read_bytes()).hexdigest() != meta['sha256']: raise SystemExit('Shard checksum mismatch')
        revision = json.loads(pathlib.Path('research/protocol.json').read_text())['dataset']['revision']
        if meta['revision'] != revision: raise SystemExit('Dataset revision mismatch')
        with path.open() as f: rows = list(csv.DictReader(f))
        # Quarantine entire source groups rather than selectively dropping hard sentences.
        groups = {}
        for row in rows: groups.setdefault((row['domain'], row['id']), []).append(row)
        for key, group in groups.items():
            try: output.extend(convert(group, meta['url']))
            except (ValueError, SyntaxError, KeyError, TypeError) as error: errors.append({'sourceId': ':'.join(key), 'file': str(path), 'reason': str(error)})
        manifests.append(meta)
    out = pathlib.Path(args.out); out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists(): raise SystemExit('Refusing to overwrite imported data')
    out.write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in output))
    audit = {'examples': len(output), 'quarantinedSourceShards': errors, 'shards': manifests, 'authorIdsAvailable': False,
             'caveat': 'Quarantined source IDs must be removed from every generator before sampling; full source licensing audit remains required.'}
    out.with_suffix('.audit.json').write_text(json.dumps(audit, indent=2) + '\n')
    print(json.dumps({'examples': len(output), 'quarantined': len(errors), 'audit': str(out.with_suffix('.audit.json'))}))

if __name__ == '__main__': main()
