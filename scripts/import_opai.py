"""Strict CSV → JSONL adapter. Gold sentence boundaries are never silently resegmented."""
import argparse, ast, csv, hashlib, itertools, json, pathlib, re, sys
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
            annotation = sentence
            start = r['text'].find(sentence, cursor)
            aligned_whitespace = False
            if start < 0 or r['text'][cursor:start].strip():
                # Released abstracts flatten line breaks in sentence annotations.
                # Map whitespace only, without changing a single non-whitespace character.
                tokens = sentence.split()
                if not tokens: raise ValueError('Empty gold sentence')
                match = re.compile(r'\s+'.join(re.escape(t) for t in tokens)).match(r['text'], cursor + len(r['text'][cursor:]) - len(r['text'][cursor:].lstrip()))
                if not match: raise ValueError('Gold sentence fails exact source alignment')
                start, end = match.span(); sentence = r['text'][start:end]; aligned_whitespace = True
            else: end = start + len(sentence)
            result.append({'id': f"{r['record_id']}:s{i}", 'recordId': r['record_id'], 'sourceId': key,
                'sourceHash': seeds[key], 'officialSplit': r['split'], 'domain': r['domain'],
                'generator': r['generator'], 'version': r['version'], 'operation': r['edit_operation'],
                'text': sentence, 'annotationText': annotation, 'whitespaceMapped': aligned_whitespace, 'start': utf16(r['text'][:start]), 'end': utf16(r['text'][:end]),
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
    p.add_argument('--audit-only', action='store_true', help='Validate all rows, emit compact human-source units only; never score these units')
    p.add_argument('--source-manifest', help='Expand only sources in this audited selection manifest')
    args = p.parse_args()
    errors, manifests, count, raw_count, sentence_count = [], [], 0, 0, 0
    selected = {r[0] for r in json.loads(pathlib.Path(args.source_manifest).read_text())['ids']} if args.source_manifest else None
    out = pathlib.Path(args.out); out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists(): raise SystemExit('Refusing to overwrite imported data')
    temp = out.with_suffix('.partial')
    dst = temp.open('w')
    for filename in args.input:
        path = pathlib.Path(filename)
        meta = json.loads(path.with_suffix('.provenance.json').read_text())
        with path.open('rb') as f: checksum = hashlib.file_digest(f, 'sha256').hexdigest()
        if checksum != meta['sha256']: raise SystemExit('Shard checksum mismatch')
        revision = json.loads(pathlib.Path('research/protocol.json').read_text())['dataset']['revision']
        if meta['revision'] != revision: raise SystemExit('Dataset revision mismatch')
        seen = set()
        with path.open() as f:
            for key, it in itertools.groupby(csv.DictReader(f), lambda r: (r['domain'], r['id'])):
                if key in seen: raise ValueError('Noncontiguous source groups; refusing partial source validation')
                seen.add(key); group = list(it); raw_count += len(group)
                if selected is not None and ':'.join(key) not in selected: continue
                try:
                    converted = convert(group, meta['url']); sentence_count += len(converted)
                    if args.audit_only:
                        seed = next(r for r in group if r['version'] == 'v0')
                        converted = [{**converted[0], 'id': seed['record_id'] + ':source-audit', 'recordId': seed['record_id'], 'version': 'v0', 'label': 0,
                                      'text': seed['text'], 'start': 0, 'end': utf16(seed['text']), 'preceding': '', 'gapBefore': '', 'trailing': '', 'auditOnly': True}]
                    for row in converted: dst.write(json.dumps(row, ensure_ascii=False) + '\n'); count += 1
                except (ValueError, SyntaxError, KeyError, TypeError) as error: errors.append({'sourceId': ':'.join(key), 'file': str(path), 'reason': str(error)})
        manifests.append(meta)
        print(json.dumps({'auditedShard': str(path), 'rawRowsSoFar': raw_count, 'alignedSentencesSoFar': sentence_count, 'quarantinedSoFar': len(errors)}), flush=True)
    dst.close(); temp.rename(out)
    audit = {'examples': count, 'rawRows': raw_count, 'alignedSentences': sentence_count, 'auditOnly': args.audit_only, 'quarantinedSourceShards': errors, 'shards': manifests, 'authorIdsAvailable': False,
             'caveat': 'Quarantined source IDs must be removed from every generator before sampling; full source licensing audit remains required.'}
    out.with_suffix('.audit.json').write_text(json.dumps(audit, indent=2) + '\n')
    print(json.dumps({'examples': count, 'quarantined': len(errors), 'audit': str(out.with_suffix('.audit.json'))}))

if __name__ == '__main__': main()
