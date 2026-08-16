import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { cn } from '@/lib/utils';

/**
 * Lesson and prompt renderer.
 *
 * Raw HTML is deliberately NOT enabled (no rehype-raw). react-markdown escapes
 * any HTML in the source, so even though authors are trusted staff roles, a
 * compromised instructor account cannot inject script into a learner's page.
 * Math is rendered with KaTeX from `$...$` and `$$...$$`.
 */
export function Markdown({
  children,
  variant = 'lesson',
  className,
}: {
  children: string;
  variant?: 'lesson' | 'compact';
  className?: string;
}) {
  return (
    <div className={cn(variant === 'lesson' ? 'prose-lesson' : 'prose-compact', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
        components={{
          a: ({ href, children: kids }) => {
            const external = href?.startsWith('http');
            return (
              <a
                href={href}
                {...(external ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}
              >
                {kids}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
