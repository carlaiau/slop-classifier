"""Download pinned, public OpAI-Bench shards; no inference. Defaults to a dry run."""
import argparse, hashlib, json, pathlib, urllib.request

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--execute', action='store_true')
    p.add_argument('--split', choices=['train', 'dev', 'test'], default='train')
    p.add_argument('--domain', choices=['abstracts', 'essays', 'news', 'reports'], default='news')
    p.add_argument('--generator', choices=['gpt-5.4', 'gpt-5.4-nano', 'gemini-2.5-flash', 'qwen3-8b'], default='gpt-5.4-nano')
    args = p.parse_args()
    if args.generator == 'qwen3-8b' and args.split != 'test': p.error('Qwen3-8B is test-only')
    protocol = json.loads(pathlib.Path('research/protocol.json').read_text())
    rev = protocol['dataset']['revision']
    path = f'default/{args.split}/{args.domain}_{args.generator}.csv'
    url = f'https://huggingface.co/datasets/OpAI-Bench1/OpAI-Bench/resolve/{rev}/{path}'
    target = pathlib.Path('data/raw') / path
    print(json.dumps({'url': url, 'target': str(target), 'execute': args.execute}))
    if not args.execute: return
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists(): raise SystemExit('Refusing to overwrite existing shard')
    temp = target.with_suffix('.part')
    with urllib.request.urlopen(url, timeout=60) as src, open(temp, 'wb') as dst:
        while block := src.read(1024 * 1024): dst.write(block)
    temp.rename(target)
    metadata = {'url': url, 'revision': rev, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'license': 'Apache-2.0 (dataset card; source provenance must also be retained)'}
    target.with_suffix('.provenance.json').write_text(json.dumps(metadata, indent=2) + '\n')

if __name__ == '__main__': main()
