// Este programa é um software livre (Licença AGPLv3)
'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function GlobalHighlighter() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';

  useEffect(() => {
    // Verificar suporte à API CSS Custom Highlight
    if (!CSS.highlights) return;

    CSS.highlights.clear();

    if (!query.trim()) return;

    // Não buscar dentro de scripts, styles ou da própria navbar/search bar
    const treeWalker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (!node.parentElement) return NodeFilter.FILTER_REJECT;
          const tag = node.parentElement.tagName.toLowerCase();
          if (['script', 'style', 'noscript', 'input', 'textarea'].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const ranges: Range[] = [];
    const lowerQuery = query.toLowerCase();

    let currentNode = treeWalker.nextNode();
    while (currentNode) {
      const text = currentNode.nodeValue;
      if (text) {
        const lowerText = text.toLowerCase();
        let index = lowerText.indexOf(lowerQuery);

        while (index !== -1) {
          const range = new Range();
          range.setStart(currentNode, index);
          range.setEnd(currentNode, index + query.length);
          ranges.push(range);
          index = lowerText.indexOf(lowerQuery, index + query.length);
        }
      }
      currentNode = treeWalker.nextNode();
    }

    if (ranges.length > 0) {
      const highlight = new Highlight(...ranges);
      CSS.highlights.set("search-results", highlight);
    }

  }, [query]);

  return null;
}
