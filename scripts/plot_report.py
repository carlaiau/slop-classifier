"""Render an exported evaluation's reliability diagram; no inference."""
import argparse, json, pathlib

def main():
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    p = argparse.ArgumentParser(); p.add_argument('--report', required=True); p.add_argument('--out', required=True)
    args = p.parse_args(); report = json.loads(pathlib.Path(args.report).read_text())
    summary = report['reports']['overall']; bins = summary['reliability']
    fig, (ax, hist) = plt.subplots(2, 1, figsize=(6, 6.5), sharex=True, gridspec_kw={'height_ratios': [3, 1]}, layout='constrained')
    ax.plot([0, 1], [0, 1], color='#616d77', linestyle='--', linewidth=1, label='Perfect calibration')
    if bins:
        ax.plot([b['score'] for b in bins], [b['rate'] for b in bins], marker='o', color='#914528', label='Observed bins')
        hist.bar([b['score'] for b in bins], [b['n'] for b in bins], width=0.05, color='#914528')
    ax.set(xlim=(0, 1), ylim=(0, 1), ylabel='Observed AI-involved fraction', title='Reliability on answered sentences')
    hist.set(xlabel='Calibrated model score', ylabel='Count'); ax.legend(loc='upper left'); ax.grid(alpha=.15)
    fig.suptitle('SYNTHETIC SOFTWARE CHECK — not research evidence' if report.get('synthetic') else 'Locked evaluation · dataset-conditional calibration', fontsize=10)
    path = pathlib.Path(args.out); path.parent.mkdir(parents=True, exist_ok=True); fig.savefig(path, dpi=180); plt.close(fig)

if __name__ == '__main__': main()
