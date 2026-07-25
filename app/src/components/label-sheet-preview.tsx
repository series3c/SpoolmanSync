'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { LabelCell } from '@/components/label-cell';
import {
  getPaperDimensions,
  calculateCellSize,
  type LabelSheetConfig,
  type Page,
} from '@/lib/label-sheet-config';

// mm to px conversion factor (CSS reference pixel at 96dpi)
const MM_TO_PX = 3.7795;

interface LabelSheetPreviewProps {
  pages: Page[];
  config: LabelSheetConfig;
}

/** Renders the grid of label pages (used by both preview and print portal) */
function LabelPages({ pages, config, cellSize, paper }: {
  pages: Page[];
  config: LabelSheetConfig;
  cellSize: { widthMm: number; heightMm: number };
  paper: { widthMm: number; heightMm: number };
}) {
  return (
    <>
      {pages.map((page, pageIdx) => (
        <div
          key={pageIdx}
          className="label-sheet-page bg-white"
          style={{
            width: `${paper.widthMm}mm`,
            height: `${paper.heightMm}mm`,
            padding: `${config.layout.marginTopMm}mm ${config.layout.marginRightMm}mm ${config.layout.marginBottomMm}mm ${config.layout.marginLeftMm}mm`,
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${config.sheet.columns}, 1fr)`,
              gridTemplateRows: `repeat(${config.sheet.rows}, 1fr)`,
              columnGap: `${config.layout.spacingHorizontalMm}mm`,
              rowGap: `${config.layout.spacingVerticalMm}mm`,
              width: '100%',
              height: '100%',
            }}
          >
            {page.items.map((item, slotIdx) => {
              const hasBorder =
                config.sheet.borderMode === 'grid' ||
                (config.sheet.borderMode === 'border' && item !== null);

              return (
                <div
                  key={slotIdx}
                  style={{
                    border: hasBorder ? '0.3mm solid #ccc' : 'none',
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                  }}
                >
                  {item && (
                    <LabelCell
                      spool={item.spool}
                      url={item.url}
                      widthMm={cellSize.widthMm}
                      heightMm={cellSize.heightMm}
                      content={config.content}
                      layout={config.layout}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

export function LabelSheetPreview({ pages, config }: LabelSheetPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  const paper = getPaperDimensions(config.sheet);
  const cellSize = calculateCellSize(config);
  const paperWidthPx = paper.widthMm * MM_TO_PX;
  const paperHeightPx = paper.heightMm * MM_TO_PX;
  const scale = containerWidth > 0 ? containerWidth / paperWidthPx : 0.5;
  const scaledPageHeight = paperHeightPx * scale;

  const tooSmall = cellSize.widthMm < 20 || cellSize.heightMm < 20;

  // Create portal target element as direct child of body
  useEffect(() => {
    const el = document.createElement('div');
    el.className = 'label-sheet-print-portal';
    document.body.appendChild(el);
    setPortalTarget(el);
    return () => {
      el.remove();
    };
  }, []);

  // Observe container width for responsive scaling
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Inject dynamic @page size style
  useEffect(() => {
    const id = 'label-sheet-page-size';
    let style = document.getElementById(id) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = id;
      document.head.appendChild(style);
    }
    const orientation = paper.heightMm >= paper.widthMm ? 'portrait' : 'landscape';
    style.textContent = `@media print { @page { size: ${paper.widthMm}mm ${paper.heightMm}mm ${orientation}; margin: 0; } }`;
    return () => {
      style?.remove();
    };
  }, [paper.widthMm, paper.heightMm]);

  // Blank the page title during print to suppress browser headers/footers
  const handleBeforePrint = useCallback(() => {
    document.title = ' ';
  }, []);

  const handleAfterPrint = useCallback(() => {
    document.title = 'SpoolmanSync';
  }, []);

  useEffect(() => {
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [handleBeforePrint, handleAfterPrint]);

  return (
    <div className="space-y-2">
      {tooSmall && (
        <div className="flex items-center gap-2 text-amber-600 text-xs bg-amber-50 dark:bg-amber-950/30 rounded px-3 py-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Labels may be too small to scan reliably ({cellSize.widthMm.toFixed(1)} x {cellSize.heightMm.toFixed(1)} mm)
        </div>
      )}

      {/* On-screen preview (scaled, hidden during print) */}
      <div
        ref={containerRef}
        className="overflow-y-auto max-h-[500px] bg-muted/30 rounded-lg p-2 no-print"
      >
        {pages.map((page, pageIdx) => (
          <div key={pageIdx}>
            {pages.length > 1 && pageIdx > 0 && (
              <div className="flex justify-center py-1">
                <Badge variant="secondary" className="text-xs">Page {pageIdx + 1}</Badge>
              </div>
            )}

            {/* Scaling wrapper */}
            <div
              style={{
                width: `${containerWidth}px`,
                height: `${scaledPageHeight}px`,
                overflow: 'hidden',
                marginBottom: pageIdx < pages.length - 1 ? '8px' : 0,
              }}
            >
              <div
                className="bg-white shadow-sm"
                style={{
                  width: `${paper.widthMm}mm`,
                  height: `${paper.heightMm}mm`,
                  padding: `${config.layout.marginTopMm}mm ${config.layout.marginRightMm}mm ${config.layout.marginBottomMm}mm ${config.layout.marginLeftMm}mm`,
                  boxSizing: 'border-box',
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${config.sheet.columns}, 1fr)`,
                    gridTemplateRows: `repeat(${config.sheet.rows}, 1fr)`,
                    columnGap: `${config.layout.spacingHorizontalMm}mm`,
                    rowGap: `${config.layout.spacingVerticalMm}mm`,
                    width: '100%',
                    height: '100%',
                  }}
                >
                  {page.items.map((item, slotIdx) => {
                    const hasBorder =
                      config.sheet.borderMode === 'grid' ||
                      (config.sheet.borderMode === 'border' && item !== null);

                    return (
                      <div
                        key={slotIdx}
                        style={{
                          border: hasBorder ? '0.3mm solid #ccc' : 'none',
                          overflow: 'hidden',
                          boxSizing: 'border-box',
                        }}
                      >
                        {item && (
                          <LabelCell
                            spool={item.spool}
                            url={item.url}
                            widthMm={cellSize.widthMm}
                            heightMm={cellSize.heightMm}
                            content={config.content}
                            layout={config.layout}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Print-only portal: rendered directly under <body> to avoid phantom pages */}
      {portalTarget && createPortal(
        <LabelPages pages={pages} config={config} cellSize={cellSize} paper={paper} />,
        portalTarget,
      )}
    </div>
  );
}
