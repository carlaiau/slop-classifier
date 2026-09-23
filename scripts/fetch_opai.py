"""Download pinned, public OpAI-Bench shards; no inference. Defaults to a dry run."""
import argparse, concurrent.futures, hashlib, json, pathlib, subprocess

def fetch(path, revision, execute):
    url = f'https://huggingface.co/datasets/OpAI-Bench1/OpAI-Bench/resolve/{revision}/{path}'
    target = pathlib.Path('data/raw') / path
    if not execute:
        print(json.dumps({'url': url, 'target': str(target), 'execute': False}), flush=True)
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        meta = json.loads(target.with_suffix('.provenance.json').read_text())
        with target.open('rb') as f: checksum = hashlib.file_digest(f, 'sha256').hexdigest()
        if meta['revision'] != revision or meta['sha256'] != checksum: raise ValueError('Existing shard verification failed')
        print(json.dumps({'verifiedExisting': str(target)}), flush=True)
        return
    temp = target.with_suffix('.part')
    # Use the operating system certificate store; never disable TLS validation.
    subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location', '--retry', '2', '--connect-timeout', '30', '--max-time', '900', url, '--output', str(temp)], check=True)
    with temp.open('rb') as f: checksum = hashlib.file_digest(f, 'sha256').hexdigest()
    metadata = {'url': url, 'revision': revision, 'sha256': checksum, 'license': 'Apache-2.0 (dataset card; source provenance must also be retained)'}
    target.with_suffix('.provenance.json').write_text(json.dumps(metadata, indent=2) + '\n')
    temp.rename(target)
    print(json.dumps({'downloaded': str(target), 'bytes': target.stat().st_size}), flush=True)

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--execute', action='store_true')
    p.add_argument('--all', action='store_true', help='Fetch all 40 main shards with three bounded workers')
    p.add_argument('--split', choices=['train', 'dev', 'test'], default='train')
    p.add_argument('--domain', choices=['abstracts', 'essays', 'news', 'reports'], default='news')
    p.add_argument('--generator', choices=['gpt-5.4', 'gpt-5.4-nano', 'gemini-2.5-flash', 'qwen3-8b'], default='gpt-5.4-nano')
    args = p.parse_args()
    if args.generator == 'qwen3-8b' and args.split != 'test': p.error('Qwen3-8B is test-only')
    protocol = json.loads(pathlib.Path('research/protocol.json').read_text())
    rev = protocol['dataset']['revision']
    if args.all:
        paths = [f'default/{split}/{domain}_{generator}.csv' for split in ['train', 'dev', 'test']
                 for domain in protocol['dataset']['domains']
                 for generator in ['gpt-5.4', 'gpt-5.4-nano', 'gemini-2.5-flash'] + (['qwen3-8b'] if split == 'test' else [])]
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            list(pool.map(lambda path: fetch(path, rev, args.execute), paths))
        return
    path = f'default/{args.split}/{args.domain}_{args.generator}.csv'
    fetch(path, rev, args.execute)

if __name__ == '__main__': main()
