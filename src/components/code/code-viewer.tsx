'use client';

import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import cpp from 'highlight.js/lib/languages/cpp';
import ini from 'highlight.js/lib/languages/ini';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import yaml from 'highlight.js/lib/languages/yaml';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import './code-viewer.css';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('ini', ini);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('python', python);
hljs.registerLanguage('yaml', yaml);

/**
 * Lab code viewer: /sims/code/?path=<file or folder in the lab repo>.
 *
 * LMS lessons embed it under their "Code:" line, so a learner reads the code in place, with a
 * link to the repository beside it. It reads the repository live from GitHub, so a lab pushed
 * later appears without re-importing the course. Only the one repository below is served.
 */
const REPO = 'AfriOrbit/edgeai-labs';
const BRANCH = 'main';
const GITHUB = `https://github.com/${REPO}`;
const RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;
const ZIP = `${GITHUB}/archive/refs/heads/${BRANCH}.zip`;
const TREE_KEY = `lab-tree:${REPO}`;
const TREE_TTL_MS = 10 * 60 * 1000;

type Entry = { path: string; type: 'blob' | 'tree' };
type Loaded = { path: string; text: string };

function cleanPath(raw: string | null): string {
  return (raw ?? '')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}

function language(path: string): string | null {
  const name = path.split('/').pop()!.replace(/\.example$/, '');
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : name.toLowerCase();
  const map: Record<string, string> = {
    c: 'cpp', cc: 'cpp', cpp: 'cpp', h: 'cpp', hpp: 'cpp', ino: 'cpp',
    py: 'python', yml: 'yaml', yaml: 'yaml', ini: 'ini', conf: 'ini', toml: 'ini', env: 'bash',
    json: 'json', md: 'markdown', sh: 'bash',
  };
  return map[ext] ?? null;
}

/** Source files first, then headers and config, then READMEs. */
function rank(path: string): number {
  const name = path.split('/').pop()!.toLowerCase();
  if (name.startsWith('readme')) return 3;
  if (/^main\.|\.py$/.test(name)) return 0;
  if (/\.(cpp|c|ino)$/.test(name)) return 1;
  return 2;
}

async function loadTree(): Promise<Entry[]> {
  try {
    const cached = JSON.parse(sessionStorage.getItem(TREE_KEY) ?? 'null');
    if (cached && Date.now() - cached.at < TREE_TTL_MS) return cached.tree;
  } catch {
    // storage unavailable (private mode, sandboxed frame): fetch every time
  }
  const res = await fetch(`https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`);
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const tree: Entry[] = (await res.json()).tree.map((e: Entry) => ({ path: e.path, type: e.type }));
  try {
    sessionStorage.setItem(TREE_KEY, JSON.stringify({ at: Date.now(), tree }));
  } catch {
    // ignore
  }
  return tree;
}

export function CodeViewer() {
  const params = useSearchParams();
  const path = cleanPath(params.get('path'));
  const [files, setFiles] = useState<string[] | null>(null);
  const [active, setActive] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [framed, setFramed] = useState(false);

  useEffect(() => setFramed(window.self !== window.top), []);

  // Which files does `path` cover?
  useEffect(() => {
    let cancelled = false;
    setFiles(null);
    setError(null);
    setActive(0);
    if (!path) {
      setError('No file or folder given.');
      return;
    }
    const looksLikeFile = /\.[A-Za-z0-9]+$/.test(path.split('/').pop()!);
    loadTree()
      .then((tree) => {
        if (cancelled) return;
        if (tree.some((e) => e.type === 'blob' && e.path === path)) return setFiles([path]);
        const inside = tree
          .filter((e) => e.type === 'blob' && e.path.startsWith(`${path}/`))
          .map((e) => e.path)
          .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
        if (inside.length) setFiles(inside);
        else setError(`${path} is not in the lab repository yet.`);
      })
      .catch(() => {
        // GitHub API unavailable or rate-limited: a single file can still be read directly.
        if (cancelled) return;
        if (looksLikeFile) setFiles([path]);
        else setError('Could not list this folder from GitHub just now. Open it on GitHub instead.');
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const current = files?.[active] ?? null;

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    setLoaded(null);
    fetch(`${RAW}/${current}`)
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
      .then((text) => !cancelled && setLoaded({ path: current, text }))
      .catch(() => !cancelled && setError(`Could not load ${current} from GitHub.`));
    return () => {
      cancelled = true;
    };
  }, [current]);

  const highlighted = useMemo(() => {
    if (!loaded) return null;
    const lang = language(loaded.path);
    const html = lang
      ? hljs.highlight(loaded.text, { language: lang, ignoreIllegals: true }).value
      : loaded.text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
    return { html, lines: loaded.text.replace(/\n$/, '').split('\n').length };
  }, [loaded]);

  const isFile = files?.length === 1 && files[0] === path;
  const githubUrl = `${GITHUB}/${isFile ? 'blob' : 'tree'}/${BRANCH}/${path}`;
  const placeholder = files?.length === 1 && /readme\.md$/i.test(files[0]) && !isFile;
  const rel = (p: string) => (isFile ? p.split('/').pop()! : p.slice(path.length + 1));

  async function copy() {
    if (!loaded) return;
    try {
      await navigator.clipboard.writeText(loaded.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: the code is still selectable
    }
  }

  return (
    <div className="cv">
      <header className="cv-bar">
        <div className="cv-crumbs" title={path}>
          <span className="cv-repo">edgeai-labs</span>
          {path.split('/').map((part, i) => (
            <span key={i}>
              <span className="cv-sep">/</span>
              {part}
            </span>
          ))}
        </div>
        <div className="cv-actions">
          {loaded && !placeholder ? (
            <button type="button" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          ) : null}
          <a href={ZIP} rel="noopener">
            Download labs
          </a>
          <a href={githubUrl} target="_blank" rel="noopener">
            GitHub ↗
          </a>
          {framed ? (
            <a href={`?path=${encodeURIComponent(path)}`} target="_blank" rel="noopener">
              Full screen ↗
            </a>
          ) : null}
        </div>
      </header>

      {error ? (
        <p className="cv-note">{error}</p>
      ) : !files ? (
        <p className="cv-note">Loading…</p>
      ) : (
        <div className={files.length > 1 ? 'cv-body cv-split' : 'cv-body'}>
          {files.length > 1 ? (
            <nav className="cv-tree" aria-label="Files">
              <div className="cv-tree-root">{path.split('/').pop()}/</div>
              {files.map((f, i) => (
                <button
                  key={f}
                  type="button"
                  className={i === active ? 'on' : ''}
                  aria-current={i === active ? 'true' : undefined}
                  onClick={() => setActive(i)}
                >
                  <span className="cv-branch">{i === files.length - 1 ? '└──' : '├──'}</span> {rel(f)}
                </button>
              ))}
            </nav>
          ) : null}
          <div className="cv-code">
            {placeholder ? (
              <p className="cv-note">
                The code for this lab has not been published yet. It will appear here, and on GitHub,
                as soon as it is.
              </p>
            ) : !highlighted ? (
              <p className="cv-note">Loading {current}…</p>
            ) : (
              <>
                <div className="cv-file">
                  {rel(current!)} <span>· {highlighted.lines} lines</span>
                </div>
                <div className="cv-scroll">
                  <pre className="cv-gutter" aria-hidden="true">
                    {Array.from({ length: highlighted.lines }, (_, i) => i + 1).join('\n')}
                  </pre>
                  <pre className="cv-src hljs">
                    <code dangerouslySetInnerHTML={{ __html: highlighted.html }} />
                  </pre>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
