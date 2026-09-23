"""Collect metadata candidates, not verified human labels or an evaluation corpus."""
import hashlib, json, pathlib, subprocess, xml.etree.ElementTree as ET

ROOT = pathlib.Path('data/transfer')
NS = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
def stable(value): return hashlib.sha256(value.encode()).hexdigest()
def base(genre, uri, title, evidence):
    return {'id': 'candidate-' + stable(uri)[:16], 'genre': genre, 'uri': uri, 'title': title,
            'status': 'candidate-not-validated', 'discoveryEvidence': evidence,
            'requiredChecks': ['Verify original publication and archived text version', 'Verify author/editor attribution and human provenance', 'Check item-specific reuse terms and third-party excerpts', 'Extract continuous prose and verify offsets', 'Check source/author/near-duplicate overlap with benchmark', 'Write topic-only brief before generation'],
            'humanLabel': None, 'eligibleForEvaluation': False}

def main():
    candidates = []
    edges = json.loads((ROOT / 'indexes/pdr-essays.json').read_text())['result']['data']['allAirtable']['edges']
    essays = [e['node']['data'] for e in edges if '2015' <= e['node']['data']['Published_Date'] < '2020']
    authors = set()
    for e in sorted(essays, key=lambda e: stable(e['Slug'])):
        names = [a['data']['Name'] for a in e['Contributors'] or []]
        if not names or any(n in authors for n in names): continue
        authors.update(names)
        row = base('essays', 'https://publicdomainreview.org/essay/' + e['Slug'] + '/', e['Title'], 'Publisher archive metadata; dated before 2020, not yet archived-text verification')
        row.update({'publicationDateClaim': e['Published_Date'], 'authors': names, 'reusePolicy': 'https://publicdomainreview.org/reusing-material/'})
        candidates.append(row)
        if sum(r['genre'] == 'essays' for r in candidates) == 33: break
    government = json.loads((ROOT / 'indexes/govuk-candidates.json').read_text())['results']
    for e in sorted(government, key=lambda e: stable(e['link']))[:33]:
        row = base('informational', 'https://www.gov.uk' + e['link'], e['title'], 'Government search index with 2018–2019 timestamp filter; latest text may have changed')
        row.update({'publicationDateClaim': e['public_timestamp'], 'organisations': [o['title'] for o in e.get('organisations', [])], 'reusePolicy': 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'})
        candidates.append(row)
    root = ET.parse(ROOT / 'indexes/propublica-index.xml')
    indexes = sorted([n.text for n in root.findall('.//s:loc', NS) if 'yyyy=2019' in n.text], key=stable)
    article_uris = set()
    for url in indexes:
        path = ROOT / 'indexes' / (stable(url)[:16] + '.xml')
        if not path.exists(): subprocess.run(['curl', '-fsSL', '--max-time', '30', url, '-o', str(path)], check=True)
        for item in ET.parse(path).findall('.//s:url', NS):
            uri = item.find('s:loc', NS).text
            if '/article/' not in uri or uri in article_uris: continue
            article_uris.add(uri)
            row = base('articles', uri, uri.rsplit('/', 1)[-1].replace('-', ' '), url)
            row.update({'titleNeedsVerification': True, 'publicationDateClaim': None, 'lastModified': item.findtext('s:lastmod', namespaces=NS), 'reusePolicy': 'https://www.propublica.org/steal-our-stories'})
            candidates.append(row)
            if len(article_uris) == 34: break
        if len(article_uris) == 34: break
    counts = {genre: sum(r['genre'] == genre for r in candidates) for genre in ['articles', 'essays', 'informational']}
    if counts != {'articles': 34, 'essays': 33, 'informational': 33}: raise ValueError(f'Candidate shortfall: {counts}')
    out = ROOT / 'candidates.json'
    with out.open('x') as f: json.dump({'kind': 'public-source-candidates-only', 'counts': counts, 'documents': candidates, 'limitations': ['Three publisher families are not representative of all English prose', 'Pre-2020 dates strengthen provenance but do not prove the current page text is unchanged', 'Institutional authorship cannot establish individual-author independence', 'No candidate is an approved gold label; no text sent for generation']}, f, indent=2)
    print(json.dumps({'out': str(out), 'counts': counts, 'eligibleForEvaluation': 0}))

if __name__ == '__main__': main()
